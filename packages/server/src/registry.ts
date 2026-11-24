import { DurableObject } from "cloudflare:workers";
import {
	EmailChallenges,
	type EmailFlow,
	type EmailPurpose,
} from "./email-challenges.ts";
import { hashToken, hubOf, newToken, randomId } from "./stubs.ts";

/**
 * 密钥的权限：
 * - device：设备密钥，访问 /<密钥>/connect 和 /<密钥>/devices，给本机 CLI 用
 * - connector：连接器密钥，访问 /<密钥>/mcp，给网页版连接器用
 * 分开是为了让一台电脑上的配置文件泄露时，拿不到在其他电脑上执行命令的权限。
 */
export type Scope = "device" | "connector";

export interface User {
	id: string;
	/** 为空表示还没有设置登录账号（升级前创建的用户）。 */
	username: string | null;
	email: string | null;
	disabled: boolean;
	deleting: boolean;
	mustChangePassword: boolean;
	createdAt: number;
}

export interface KeyInfo {
	id: string;
	name: string;
	scopes: Scope[];
	/** 密钥的末 4 位；迁移的旧密钥没有。 */
	hint: string | null;
	createdAt: number;
	lastUsedAt: number | null;
}

export interface KeyAuth {
	userId: string;
	keyId: string;
	scopes: Scope[];
}

export type Outcome<T> = ({ ok: true } & T) | { ok: false; error: string };

export const LEGACY_KEY_NAME = "迁移的旧密钥";
export const MAX_KEYS_PER_USER = 50;
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** 登录失败次数按这个时间窗口统计。 */
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES_PER_ACCOUNT = 10;
const USERS_PER_PAGE = 10;
const EMAIL_IN_USE = "该邮箱已被使用，请使用其他邮箱";
const MAX_FAILURES_PER_IP = 20;
/** 密钥的最后使用时间最多每分钟写一次，避免每个 MCP 请求都写库。 */
const LAST_USED_RESOLUTION_MS = 60 * 1000;

const SCHEMA_VERSION = 4;

/** 用户名统一转为小写。 */
export function normalizeUsername(value: unknown): string {
	return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function usernameProblem(username: string): string | undefined {
	return /^[a-z0-9][a-z0-9_.-]{1,31}$/.test(username)
		? undefined
		: "用户名需要 2 到 32 位，只能包含字母、数字和 _ . -，并以字母或数字开头";
}

type UserRow = {
	id: string;
	username: string | null;
	email: string | null;
	disabled: number;
	deleting: number;
	must_change_password: number;
	created_at: number;
};

type KeyRow = {
	id: string;
	name: string;
	scopes: string;
	hint: string | null;
	created_at: number;
	last_used_at: number | null;
};

const USER_COLUMNS =
	"users.id, users.username, users.email, users.disabled, users.deleting, users.must_change_password, users.created_at";

/** 全局唯一的实例，保存用户、密钥哈希和登录状态。 */
export class Registry extends DurableObject<Env> {
	sql = this.ctx.storage.sql;
	private readonly emailChallenges = new EmailChallenges(this.sql);

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		this.migrate();
	}

	// 密钥

	/** 返回密钥所属的启用中的用户和密钥权限。 */
	authenticateKey(tokenHash: string): KeyAuth | null {
		const row = this.sql
			.exec<{ id: string; user_id: string; scopes: string }>(
				`SELECT keys.id, keys.user_id, keys.scopes FROM keys
				JOIN users ON users.id = keys.user_id
				WHERE keys.token_hash = ? AND users.disabled = 0`,
				tokenHash,
			)
			.toArray()[0];
		if (!row) {
			return null;
		}
		const now = Date.now();
		this.sql.exec(
			"UPDATE keys SET last_used_at = ? WHERE id = ? AND (last_used_at IS NULL OR last_used_at < ?)",
			now,
			row.id,
			now - LAST_USED_RESOLUTION_MS,
		);
		return {
			userId: row.user_id,
			keyId: row.id,
			scopes: parseScopes(row.scopes),
		};
	}

	listKeys(userId: string): KeyInfo[] {
		return this.sql
			.exec<KeyRow>(
				"SELECT id, name, scopes, hint, created_at, last_used_at FROM keys WHERE user_id = ? ORDER BY created_at",
				userId,
			)
			.toArray()
			.map((row) => ({
				id: row.id,
				name: row.name,
				scopes: parseScopes(row.scopes),
				hint: row.hint,
				createdAt: row.created_at,
				lastUsedAt: row.last_used_at,
			}));
	}

	async createKey(
		userId: string,
		name: string,
		scope: Scope,
		accessMode: unknown,
		deviceIds: unknown,
	): Promise<Outcome<{ key: KeyInfo; token: string }>> {
		const count = this.sql
			.exec<{ n: number }>(
				"SELECT count(*) AS n FROM keys WHERE user_id = ?",
				userId,
			)
			.one().n;
		if (count >= MAX_KEYS_PER_USER) {
			return {
				ok: false,
				error: `最多只能有 ${MAX_KEYS_PER_USER} 个密钥，请先吊销不用的密钥`,
			};
		}
		const token = newToken();
		const key: KeyInfo = {
			id: randomId(8),
			name,
			scopes: [scope],
			hint: token.slice(-4),
			createdAt: Date.now(),
			lastUsedAt: null,
		};
		const tokenHash = await hashToken(token);
		if (scope === "connector") {
			const access = await hubOf(this.env, userId).setConnectorAccess(
				key.id,
				accessMode,
				deviceIds,
			);
			if (!access.ok) {
				return access;
			}
		}
		this.sql.exec(
			"INSERT INTO keys (id, user_id, name, token_hash, scopes, hint, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
			key.id,
			userId,
			name,
			tokenHash,
			scope,
			key.hint,
			key.createdAt,
		);
		return { ok: true, key, token };
	}

	/** 吊销后立即失效，用这个密钥连接的电脑会断开。 */
	async revokeKey(userId: string, keyId: string): Promise<boolean> {
		const [key] = this.sql
			.exec<{ scopes: string }>(
				"DELETE FROM keys WHERE id = ? AND user_id = ? RETURNING scopes",
				keyId,
				userId,
			)
			.toArray();
		if (!key) return false;
		await hubOf(this.env, userId).revokeKey(
			keyId,
			parseScopes(key.scopes).includes("connector"),
		);
		return true;
	}

	// 用户

	listUsers(
		requestedPage: number,
		query: string,
	): {
		users: (User & { keyCount: number })[];
		total: number;
		page: number;
		pageCount: number;
		pageSize: number;
	} {
		const filter = query
			? "WHERE instr(users.username, ?) > 0 OR instr(users.email, ?) > 0"
			: "";
		const bindings = query ? [query, query] : [];
		const { total } = this.sql
			.exec<{ total: number }>(
				`SELECT count(*) AS total FROM users ${filter}`,
				...bindings,
			)
			.one();
		const pageCount = Math.max(1, Math.ceil(total / USERS_PER_PAGE));
		const page = Math.min(requestedPage, pageCount);
		const users = this.sql
			.exec<UserRow & { key_count: number }>(
				`SELECT ${USER_COLUMNS},
					(SELECT count(*) FROM keys WHERE keys.user_id = users.id) AS key_count
				FROM users ${filter} ORDER BY created_at, id LIMIT ? OFFSET ?`,
				...bindings,
				USERS_PER_PAGE,
				(page - 1) * USERS_PER_PAGE,
			)
			.toArray()
			.map((row) => ({ ...toUser(row), keyCount: row.key_count }));
		return { users, total, page, pageCount, pageSize: USERS_PER_PAGE };
	}

	getUser(id: string): User | null {
		const row = this.sql
			.exec<UserRow>(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`, id)
			.toArray()[0];
		return row ? toUser(row) : null;
	}

	createUser({
		username,
		email,
		passwordHash,
		mustChangePassword,
	}: {
		username: string;
		email: string | null;
		passwordHash: string;
		mustChangePassword: boolean;
	}): Outcome<{ user: User }> {
		if (this.usernameTaken(username)) {
			return { ok: false, error: `用户名「${username}」已被使用` };
		}
		if (email && this.userByEmail(email)) {
			return { ok: false, error: EMAIL_IN_USE };
		}
		const user: User = {
			id: randomId(8),
			username,
			email,
			disabled: false,
			deleting: false,
			mustChangePassword,
			createdAt: Date.now(),
		};
		this.sql.exec(
			`INSERT INTO users (id, username, email, password_hash, must_change_password, created_at)
			VALUES (?, ?, ?, ?, ?, ?)`,
			user.id,
			username,
			email,
			passwordHash,
			Number(user.mustChangePassword),
			user.createdAt,
		);
		return { ok: true, user };
	}

	isRetainedUser(id: string): boolean {
		return (
			this.sql
				.exec("SELECT 1 FROM users WHERE id = ? AND deleting = 0", id)
				.toArray().length > 0
		);
	}

	beginDeleteUser(id: string): boolean {
		return this.ctx.storage.transactionSync(() => {
			const { rowsWritten } = this.sql.exec(
				"UPDATE users SET disabled = 1, deleting = 1 WHERE id = ?",
				id,
			);
			if (rowsWritten)
				this.sql.exec("DELETE FROM sessions WHERE user_id = ?", id);
			return rowsWritten > 0;
		});
	}

	finishDeleteUser(id: string): void {
		this.ctx.storage.transactionSync(() => {
			const user = this.getUser(id);
			if (!user?.deleting) return;
			this.emailChallenges.deleteUser(id, user.email);
			this.sql.exec("DELETE FROM login_attempts WHERE key = ?", `user:${id}`);
			this.sql.exec("DELETE FROM keys WHERE user_id = ?", id);
			this.sql.exec("DELETE FROM app_usage WHERE user_id = ?", id);
			this.sql.exec("DELETE FROM users WHERE id = ?", id);
		});
	}

	private userByEmail(email: string): User | null {
		const row = this.sql
			.exec<UserRow>(`SELECT ${USER_COLUMNS} FROM users WHERE email = ?`, email)
			.toArray()[0];
		return row ? toUser(row) : null;
	}

	/** 为升级前创建、还没有登录账号的用户设置用户名和初始密码。 */
	setAccount(
		id: string,
		username: string,
		passwordHash: string,
	): Outcome<object> {
		const user = this.getUser(id);
		if (!user) {
			return { ok: false, error: "用户不存在" };
		}
		if (user.deleting) {
			return { ok: false, error: "此用户正在删除" };
		}
		if (user.username) {
			return { ok: false, error: "这位用户已经有登录账号" };
		}
		if (this.usernameTaken(username)) {
			return { ok: false, error: `用户名「${username}」已被使用` };
		}
		this.sql.exec(
			"UPDATE users SET username = ?, password_hash = ?, must_change_password = 1 WHERE id = ?",
			username,
			passwordHash,
			id,
		);
		return { ok: true };
	}

	/** 管理员变更邮箱会作废已有的网页登录会话和待验证请求。 */
	setEmail(id: string, email: string | null): Outcome<object> {
		return this.ctx.storage.transactionSync(() => {
			const user = this.getUser(id);
			if (!user || user.deleting)
				return { ok: false, error: "用户不存在或正在删除" };
			if (!user.username) return { ok: false, error: "请先为用户设置登录账号" };
			if (user.email === email) return { ok: true };
			const result = this.updateBoundEmail(id, email);
			if (result.ok)
				this.sql.exec("DELETE FROM sessions WHERE user_id = ?", id);
			return result;
		});
	}

	private updateBoundEmail(id: string, email: string | null): Outcome<object> {
		if (email && this.userByEmail(email))
			return { ok: false, error: EMAIL_IN_USE };
		this.sql.exec("UPDATE users SET email = ? WHERE id = ?", email, id);
		this.emailChallenges.clearSensitiveFlows(id);
		return { ok: true };
	}

	passwordHashOf(id: string): string | null {
		return (
			this.sql
				.exec<{ password_hash: string | null }>(
					"SELECT password_hash FROM users WHERE id = ?",
					id,
				)
				.toArray()[0]?.password_hash ?? null
		);
	}

	/**
	 * 设置新密码，并注销该用户的登录状态。
	 * 用户自己改密时重新核验会话和密码哈希，只保留当前会话。
	 */
	setPassword(
		id: string,
		passwordHash: string,
		mustChange: boolean,
		verified?: { sessionHash: string; passwordHash: string },
	): boolean {
		return this.ctx.storage.transactionSync(() => {
			if (
				verified &&
				(this.sessionUser(verified.sessionHash)?.id !== id ||
					this.passwordHashOf(id) !== verified.passwordHash)
			)
				return false;
			const { rowsWritten } = this.sql.exec(
				`UPDATE users SET password_hash = ?, must_change_password = ?
				WHERE id = ? AND username IS NOT NULL AND deleting = 0`,
				passwordHash,
				Number(mustChange),
				id,
			);
			if (!rowsWritten) return false;
			this.sql.exec(
				"DELETE FROM sessions WHERE user_id = ? AND token_hash != ?",
				id,
				verified?.sessionHash ?? "",
			);
			this.emailChallenges.clearSensitiveFlows(id);
			this.sql.exec("DELETE FROM login_attempts WHERE key = ?", `user:${id}`);
			return true;
		});
	}

	/** 禁用后该用户的设备立即断开，登录状态全部注销。 */
	async setDisabled(id: string, disabled: boolean): Promise<boolean> {
		const { rowsWritten } = this.sql.exec(
			"UPDATE users SET disabled = ? WHERE id = ? AND deleting = 0",
			disabled ? 1 : 0,
			id,
		);
		if (rowsWritten > 0 && disabled) {
			this.sql.exec("DELETE FROM sessions WHERE user_id = ?", id);
			await hubOf(this.env, id).revoke();
		}
		return rowsWritten > 0;
	}

	// 登录

	/** 用户名和邮箱解析到同一个账号后，共用登录失败次数。 */
	beginLogin(
		identifier: string,
		ip: string,
	):
		| { limited: "ip" }
		| { limited: "account"; attemptKey: string }
		| {
				limited: false;
				attemptKey: string;
				user: { id: string; passwordHash: string } | null;
		  } {
		const column = identifier.includes("@") ? "email" : "username";
		const row = this.sql
			.exec<{ id: string; password_hash: string; disabled: number }>(
				`SELECT id, password_hash, disabled FROM users WHERE ${column} = ?`,
				identifier,
			)
			.toArray()[0];
		const attemptKey = row ? `user:${row.id}` : `identifier:${identifier}`;
		if (this.failuresOf(`ip:${ip}`) >= MAX_FAILURES_PER_IP)
			return { limited: "ip" };
		if (this.failuresOf(attemptKey) >= MAX_FAILURES_PER_ACCOUNT) {
			return { limited: "account", attemptKey };
		}
		return {
			limited: false,
			attemptKey,
			user:
				row && !row.disabled
					? { id: row.id, passwordHash: row.password_hash }
					: null,
		};
	}

	recordLoginFailure(attemptKey: string, ip: string): void {
		const now = Date.now();
		this.sql.exec(
			"DELETE FROM login_attempts WHERE window_start <= ?",
			now - LOGIN_WINDOW_MS,
		);
		for (const key of [attemptKey, `ip:${ip}`]) {
			this.sql.exec(
				`INSERT INTO login_attempts (key, failures, window_start) VALUES (?, 1, ?)
				ON CONFLICT (key) DO UPDATE SET failures = failures + 1`,
				key,
				now,
			);
		}
	}

	/** 在验证密码后重新检查登录标识和账号是否仍有效。 */
	async createSession(
		userId: string,
		identifier: string,
		verifiedHash: string,
	): Promise<string | null> {
		const token = newToken();
		const tokenHash = await hashToken(token);
		const now = Date.now();
		const { rowsWritten } = this.sql.exec(
			`INSERT INTO sessions (token_hash, user_id, created_at, expires_at)
			SELECT ?, id, ?, ? FROM users
			WHERE id = ? AND password_hash = ? AND disabled = 0 AND (username = ? OR email = ?)`,
			tokenHash,
			now,
			now + SESSION_TTL_MS,
			userId,
			verifiedHash,
			identifier,
			identifier,
		);
		if (!rowsWritten) return null;
		this.sql.exec("DELETE FROM sessions WHERE expires_at < ?", now);
		this.sql.exec("DELETE FROM login_attempts WHERE key = ?", `user:${userId}`);
		return token;
	}

	/** 登录状态对应的启用中的用户。 */
	sessionUser(sessionHash: string): User | null {
		const row = this.sql
			.exec<UserRow>(
				`SELECT ${USER_COLUMNS} FROM sessions
				JOIN users ON users.id = sessions.user_id
				WHERE sessions.token_hash = ? AND sessions.expires_at > ? AND users.disabled = 0`,
				sessionHash,
				Date.now(),
			)
			.toArray()[0];
		return row ? toUser(row) : null;
	}

	deleteSession(sessionHash: string): void {
		this.sql.exec("DELETE FROM sessions WHERE token_hash = ?", sessionHash);
	}

	// 邮箱验证

	startEmailFlow(
		purpose: EmailPurpose,
		email: string,
		challenge: EmailFlow,
		ip: string,
		registration: { username: string; passwordHash: string } | null,
		binding: { sessionHash: string; passwordHash: string } | null,
	): EmailResult<{ send: boolean }> {
		return this.ctx.storage.transactionSync(() => {
			const existing = this.userByEmail(email);
			const bindingUser = binding
				? this.sessionUser(binding.sessionHash)
				: null;
			if (purpose === "bind") {
				if (
					!binding ||
					!bindingUser ||
					bindingUser.email ||
					bindingUser.mustChangePassword ||
					this.passwordHashOf(bindingUser.id) !== binding.passwordHash
				) {
					return {
						ok: false,
						error: "无法绑定邮箱，请重新登录后重试",
						status: 403,
					};
				}
				if (existing) {
					return {
						ok: false,
						error: EMAIL_IN_USE,
						status: 409,
					};
				}
			}
			const userId =
				bindingUser?.id ??
				(purpose === "reset" && existing && !existing.disabled
					? existing.id
					: null);
			const pending = {
				purpose,
				email,
				userId,
				sessionHash: binding?.sessionHash ?? null,
				username: registration?.username ?? null,
				passwordHash: registration?.passwordHash ?? null,
			};
			if (!this.emailChallenges.start(pending, challenge, ip))
				return emailRateLimited();
			return {
				ok: true,
				send: purpose === "reset" ? userId !== null : !existing,
			};
		});
	}

	resendEmailFlow(
		purpose: EmailPurpose,
		challenge: EmailFlow,
		ip: string,
		sessionHash: string | null,
	): EmailResult<{ email: string; send: boolean }> {
		return this.ctx.storage.transactionSync(() => {
			const pending = this.emailChallenges.find(
				challenge.id,
				purpose,
				sessionHash,
			);
			if (!pending)
				return {
					ok: false,
					error: "验证码已失效，请返回上一步重新获取",
					status: 400,
				};
			const existing = this.userByEmail(pending.email);
			if (purpose === "bind" && existing) {
				return {
					ok: false,
					error: EMAIL_IN_USE,
					status: 409,
				};
			}
			if (!this.emailChallenges.resend(pending, challenge, ip))
				return emailRateLimited();
			return {
				ok: true,
				email: pending.email,
				send:
					purpose === "reset"
						? !!existing && !existing.disabled && existing.id === pending.userId
						: !existing,
			};
		});
	}

	verifyResetCode(challenge: EmailFlow): boolean {
		return this.ctx.storage.transactionSync(() => {
			return !!this.emailChallenges.verify(challenge, "reset", null)?.userId;
		});
	}

	finishEmailFlow(
		purpose: EmailPurpose,
		challenge: EmailFlow,
		sessionHash: string | null,
		resetPasswordHash: string | null = null,
	): Outcome<object> {
		return this.ctx.storage.transactionSync(() => {
			const pending = this.emailChallenges.verify(
				challenge,
				purpose,
				sessionHash,
			);
			if (!pending) return invalidCode();
			if (purpose === "register" && pending.username && pending.passwordHash) {
				this.emailChallenges.remove(challenge.id);
				return this.createUser({
					username: pending.username,
					email: pending.email,
					passwordHash: pending.passwordHash,
					mustChangePassword: false,
				});
			}
			if (purpose === "bind" && sessionHash && pending.userId) {
				const user = this.sessionUser(sessionHash);
				if (
					user?.id !== pending.userId ||
					user.mustChangePassword ||
					user.email
				)
					return invalidCode();
				this.emailChallenges.remove(challenge.id);
				return this.updateBoundEmail(user.id, pending.email);
			}
			if (purpose === "reset" && pending.userId && resetPasswordHash) {
				const user = this.userByEmail(pending.email);
				if (!user || user.disabled || user.id !== pending.userId)
					return invalidCode();
				return this.setPassword(user.id, resetPasswordHash, false)
					? { ok: true }
					: invalidCode();
			}
			return invalidCode();
		});
	}

	// OAuth 应用

	/**
	 * OAuth 连接器每次调用时检查用户是否仍然启用，并记录应用的最后使用时间。
	 * 用户被禁用后令牌本身仍在有效期内，靠这里拒绝。
	 */
	authorizeApp(userId: string, clientId: string): boolean {
		const user = this.getUser(userId);
		if (!user || user.disabled) {
			return false;
		}
		const now = Date.now();
		this.sql.exec(
			`INSERT INTO app_usage (user_id, client_id, last_used_at) VALUES (?, ?, ?)
			ON CONFLICT (user_id, client_id) DO UPDATE SET last_used_at = excluded.last_used_at
			WHERE last_used_at < ?`,
			userId,
			clientId,
			now,
			now - LAST_USED_RESOLUTION_MS,
		);
		return true;
	}

	/** 各应用最后一次调用的时间，按 client_id。 */
	appUsage(userId: string): Record<string, number> {
		return Object.fromEntries(
			this.sql
				.exec<{ client_id: string; last_used_at: number }>(
					"SELECT client_id, last_used_at FROM app_usage WHERE user_id = ?",
					userId,
				)
				.toArray()
				.map((row) => [row.client_id, row.last_used_at]),
		);
	}

	private failuresOf(key: string): number {
		const row = this.sql
			.exec<{ failures: number; window_start: number }>(
				"SELECT failures, window_start FROM login_attempts WHERE key = ?",
				key,
			)
			.toArray()[0];
		return row && Date.now() - row.window_start < LOGIN_WINDOW_MS
			? row.failures
			: 0;
	}

	private usernameTaken(username: string): boolean {
		return (
			this.sql
				.exec("SELECT 1 FROM users WHERE username = ?", username)
				.toArray().length > 0
		);
	}

	/** 表结构的版本记在 meta 表里，升级时在一个事务中完成。 */
	private migrate(): void {
		this.sql.exec(
			"CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
		);
		const version = Number(
			this.sql
				.exec<{ value: string }>(
					"SELECT value FROM meta WHERE key = 'schema_version'",
				)
				.toArray()[0]?.value ?? 0,
		);
		if (version >= SCHEMA_VERSION) {
			return;
		}
		this.ctx.storage.transactionSync(() => {
			if (version < 2) this.migrateAccounts();
			if (version < 3) {
				this.sql.exec("ALTER TABLE users ADD COLUMN email TEXT");
				this.sql.exec("CREATE UNIQUE INDEX users_email ON users (email)");
				this.sql.exec(
					"ALTER TABLE users ADD COLUMN deleting INTEGER NOT NULL DEFAULT 0",
				);
				this.emailChallenges.migrate();
				this.sql.exec("DELETE FROM login_attempts WHERE key LIKE 'user:%'");
			}
			this.sql.exec("ALTER TABLE users DROP COLUMN name");

			this.sql.exec(
				"INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', ?)",
				String(SCHEMA_VERSION),
			);
		});
	}

	private migrateAccounts(): void {
		// 第 1 版：每个用户只有一个密钥，哈希存在 users.token_hash。新部署也从这里开始升级。
		this.sql.exec(`CREATE TABLE IF NOT EXISTS users (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			token_hash TEXT NOT NULL UNIQUE,
			disabled INTEGER NOT NULL DEFAULT 0,
			created_at INTEGER NOT NULL
		)`);

		// 第 2 版：登录账号和多个密钥。原来的密钥变成一条同时具有两种权限的密钥，
		// 已登录的 CLI 和已配置的连接器继续可用。token_hash 带有 UNIQUE 约束，
		// SQLite 不能直接删除这一列，所以重建 users 表。
		this.sql.exec(`CREATE TABLE keys (
			id TEXT PRIMARY KEY,
			user_id TEXT NOT NULL,
			name TEXT NOT NULL,
			token_hash TEXT NOT NULL UNIQUE,
			scopes TEXT NOT NULL,
			hint TEXT,
			created_at INTEGER NOT NULL,
			last_used_at INTEGER
		)`);
		this.sql.exec("CREATE INDEX keys_user_id ON keys (user_id)");
		const legacy = this.sql
			.exec<{ id: string; token_hash: string; created_at: number }>(
				"SELECT id, token_hash, created_at FROM users",
			)
			.toArray();
		for (const row of legacy) {
			this.sql.exec(
				"INSERT INTO keys (id, user_id, name, token_hash, scopes, created_at) VALUES (?, ?, ?, ?, 'device connector', ?)",
				randomId(8),
				row.id,
				LEGACY_KEY_NAME,
				row.token_hash,
				row.created_at,
			);
		}
		this.sql.exec(`CREATE TABLE users_v2 (
			id TEXT PRIMARY KEY,
			username TEXT UNIQUE,
			name TEXT NOT NULL,
			password_hash TEXT,
			must_change_password INTEGER NOT NULL DEFAULT 0,
			disabled INTEGER NOT NULL DEFAULT 0,
			created_at INTEGER NOT NULL
		)`);
		this.sql.exec(
			"INSERT INTO users_v2 (id, name, disabled, created_at) SELECT id, name, disabled, created_at FROM users",
		);
		this.sql.exec("DROP TABLE users");
		this.sql.exec("ALTER TABLE users_v2 RENAME TO users");
		this.sql.exec(`CREATE TABLE sessions (
			token_hash TEXT PRIMARY KEY,
			user_id TEXT NOT NULL,
			created_at INTEGER NOT NULL,
			expires_at INTEGER NOT NULL
		)`);
		this.sql.exec("CREATE INDEX sessions_user_id ON sessions (user_id)");
		this.sql.exec(`CREATE TABLE login_attempts (
			key TEXT PRIMARY KEY,
			failures INTEGER NOT NULL,
			window_start INTEGER NOT NULL
		)`);
		// OAuth 授权保存在 OAUTH_KV，这里只记每个应用最后一次调用的时间
		this.sql.exec(`CREATE TABLE app_usage (
			user_id TEXT NOT NULL,
			client_id TEXT NOT NULL,
			last_used_at INTEGER NOT NULL,
			PRIMARY KEY (user_id, client_id)
		)`);
	}
}

function toUser(row: UserRow): User {
	return {
		id: row.id,
		username: row.username,
		email: row.email,
		deleting: row.deleting === 1,
		disabled: row.disabled === 1,
		mustChangePassword: row.must_change_password === 1,
		createdAt: row.created_at,
	};
}

function parseScopes(text: string): Scope[] {
	return text
		.split(" ")
		.filter((s): s is Scope => s === "device" || s === "connector");
}

type EmailResult<T> =
	| ({ ok: true } & T)
	| { ok: false; error: string; status: number };

function invalidCode(): { ok: false; error: string; status: number } {
	return {
		ok: false,
		error: "验证码无效，请检查验证码。已过期请返回上一步重新获取",
		status: 400,
	};
}

function emailRateLimited(): { ok: false; error: string; status: number } {
	return { ok: false, error: "验证码请求过于频繁，请稍后重试", status: 429 };
}

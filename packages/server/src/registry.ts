import { DurableObject } from "cloudflare:workers";
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
	name: string;
	disabled: boolean;
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
const MAX_FAILURES_PER_USERNAME = 10;
const MAX_FAILURES_PER_IP = 20;
/** 密钥的最后使用时间最多每分钟写一次，避免每个 MCP 请求都写库。 */
const LAST_USED_RESOLUTION_MS = 60 * 1000;

const SCHEMA_VERSION = 2;

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
	name: string;
	disabled: number;
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
	"users.id, users.username, users.name, users.disabled, users.must_change_password, users.created_at";

/** 全局唯一的实例，保存用户、密钥哈希和登录状态。 */
export class Registry extends DurableObject<Env> {
	sql = this.ctx.storage.sql;

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
			const access = await hubOf(this.env, userId).setConnectorDevices(
				key.id,
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
		const { rowsWritten } = this.sql.exec(
			"DELETE FROM keys WHERE id = ? AND user_id = ?",
			keyId,
			userId,
		);
		if (rowsWritten > 0) {
			await hubOf(this.env, userId).revokeKey(keyId);
		}
		return rowsWritten > 0;
	}

	/** 吊销用户的所有密钥，所有电脑会断开。 */
	async revokeAllKeys(userId: string): Promise<boolean> {
		if (!this.getUser(userId)) {
			return false;
		}
		const keys = this.sql
			.exec<{ id: string }>(
				"DELETE FROM keys WHERE user_id = ? RETURNING id",
				userId,
			)
			.toArray();
		await hubOf(this.env, userId).revokeAllKeys(keys.map((key) => key.id));
		return true;
	}

	// 用户

	listUsers(): (User & { keyCount: number })[] {
		return this.sql
			.exec<UserRow & { key_count: number }>(
				`SELECT ${USER_COLUMNS},
					(SELECT count(*) FROM keys WHERE keys.user_id = users.id) AS key_count
				FROM users ORDER BY created_at`,
			)
			.toArray()
			.map((row) => ({ ...toUser(row), keyCount: row.key_count }));
	}

	getUser(id: string): User | null {
		const row = this.sql
			.exec<UserRow>(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`, id)
			.toArray()[0];
		return row ? toUser(row) : null;
	}

	createUser(
		username: string,
		name: string,
		passwordHash: string,
	): Outcome<{ user: User }> {
		if (this.usernameTaken(username)) {
			return { ok: false, error: `用户名「${username}」已被使用` };
		}
		const user: User = {
			id: randomId(8),
			username,
			name,
			disabled: false,
			mustChangePassword: true,
			createdAt: Date.now(),
		};
		this.sql.exec(
			"INSERT INTO users (id, username, name, password_hash, must_change_password, created_at) VALUES (?, ?, ?, ?, 1, ?)",
			user.id,
			username,
			name,
			passwordHash,
			user.createdAt,
		);
		return { ok: true, user };
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
	 * 用户自己修改密码时保留当前这次登录（keepSession），管理员重置时全部注销。
	 */
	setPassword(
		id: string,
		passwordHash: string,
		mustChange: boolean,
		keepSession?: string,
	): boolean {
		const { rowsWritten } = this.sql.exec(
			"UPDATE users SET password_hash = ?, must_change_password = ? WHERE id = ? AND username IS NOT NULL",
			passwordHash,
			mustChange ? 1 : 0,
			id,
		);
		this.sql.exec(
			"DELETE FROM sessions WHERE user_id = ? AND token_hash != ?",
			id,
			keepSession ?? "",
		);
		return rowsWritten > 0;
	}

	/** 禁用后该用户的设备立即断开，登录状态全部注销。 */
	async setDisabled(id: string, disabled: boolean): Promise<boolean> {
		const { rowsWritten } = this.sql.exec(
			"UPDATE users SET disabled = ? WHERE id = ?",
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

	/**
	 * 登录的第一步：检查是否尝试太多次，返回用户名对应的密码哈希。
	 * 密码由 Worker 校验，再调用 recordLoginFailure 或 createSession。
	 */
	beginLogin(
		username: string,
		ip: string,
	):
		| { limited: true }
		| {
				limited: false;
				user: { id: string; passwordHash: string } | null;
		  } {
		if (
			this.failuresOf(`user:${username}`) >= MAX_FAILURES_PER_USERNAME ||
			this.failuresOf(`ip:${ip}`) >= MAX_FAILURES_PER_IP
		) {
			return { limited: true };
		}
		const row = this.sql
			.exec<{ id: string; password_hash: string }>(
				"SELECT id, password_hash FROM users WHERE username = ? AND disabled = 0 AND password_hash IS NOT NULL",
				username,
			)
			.toArray()[0];
		return {
			limited: false,
			user: row ? { id: row.id, passwordHash: row.password_hash } : null,
		};
	}

	recordLoginFailure(username: string, ip: string): void {
		const now = Date.now();
		this.sql.exec(
			"DELETE FROM login_attempts WHERE window_start < ?",
			now - LOGIN_WINDOW_MS,
		);
		for (const key of [`user:${username}`, `ip:${ip}`]) {
			this.sql.exec(
				`INSERT INTO login_attempts (key, failures, window_start) VALUES (?, 1, ?)
				ON CONFLICT (key) DO UPDATE SET failures = failures + 1`,
				key,
				now,
			);
		}
	}

	/** 登录成功：清除该用户名的失败记录，返回新的登录状态令牌。 */
	async createSession(userId: string, username: string): Promise<string> {
		const now = Date.now();
		const token = newToken();
		this.sql.exec("DELETE FROM sessions WHERE expires_at < ?", now);
		this.sql.exec(
			"DELETE FROM login_attempts WHERE key = ?",
			`user:${username}`,
		);
		this.sql.exec(
			"INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
			await hashToken(token),
			userId,
			now,
			now + SESSION_TTL_MS,
		);
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
			this.sql.exec(
				"INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', ?)",
				String(SCHEMA_VERSION),
			);
		});
	}
}

function toUser(row: UserRow): User {
	return {
		id: row.id,
		username: row.username,
		name: row.name,
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

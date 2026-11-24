import { hashToken, newToken, randomString } from "./stubs.ts";

export type EmailPurpose = "register" | "bind" | "reset";
export type EmailFlow = {
	id: string;
	codeHash: string;
};
type PendingEmail = {
	purpose: EmailPurpose;
	email: string;
	userId: string | null;
	username: string | null;
	passwordHash: string | null;
	sessionHash: string | null;
};
type EmailRow = PendingEmail & {
	codeHash: string;
	expiresAt: number;
	attempts: number;
};

const WINDOW_MS = 15 * 60_000;
const RESEND_MS = 60_000;
const MAX_ATTEMPTS = 5;
const CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function normalizeEmail(value: unknown): string {
	const email = typeof value === "string" ? value.trim().toLowerCase() : "";
	if (email.length > 254) return "";
	const [local, domain, extra] = email.split("@");
	if (!local || local.length > 64 || !domain || extra !== undefined) return "";
	const labels = domain.split(".");
	return labels.length >= 2 &&
		labels.every((label) =>
			/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label),
		) &&
		local
			.split(".")
			.every((part) => /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+$/.test(part))
		? email
		: "";
}

export async function newEmailCode(flow = newToken()): Promise<{
	flow: string;
	code: string;
	challenge: EmailFlow;
}> {
	const code = randomString(CODE_ALPHABET, 8);
	return { flow, code, challenge: await hashEmailCode(flow, code) };
}

export function isEmailFlow(value: unknown): value is string {
	return typeof value === "string" && /^[A-Za-z0-9]{32}$/.test(value);
}

export async function emailProof(
	flow: unknown,
	input: unknown,
): Promise<EmailFlow | null> {
	if (!isEmailFlow(flow) || typeof input !== "string" || input.length > 20) {
		return null;
	}
	const code = input
		.toUpperCase()
		.replace(/[\s-]/g, "")
		.replaceAll("O", "0")
		.replace(/[IL]/g, "1");
	if (
		code.length !== 8 ||
		[...code].some((char) => !CODE_ALPHABET.includes(char))
	) {
		return null;
	}
	return hashEmailCode(flow, code);
}

async function hashEmailCode(flow: string, code: string): Promise<EmailFlow> {
	return {
		id: await hashToken(flow),
		codeHash: await hashToken(`${flow}:${code}`),
	};
}

/** 所有写操作与调用方的账号更新共用 Registry 的 SQLite 事务。 */
export class EmailChallenges {
	private readonly sql: SqlStorage;

	constructor(sql: SqlStorage) {
		this.sql = sql;
	}

	migrate(): void {
		this.sql.exec(`CREATE TABLE email_flows (
			id TEXT PRIMARY KEY,
			purpose TEXT NOT NULL,
			email TEXT NOT NULL,
			user_id TEXT,
			username TEXT,
			password_hash TEXT,
			session_hash TEXT,
			code_hash TEXT NOT NULL,
			expires_at INTEGER NOT NULL,
			attempts INTEGER NOT NULL DEFAULT 0
		)`);
		this.sql.exec(
			"CREATE INDEX email_flows_expiry ON email_flows (expires_at)",
		);
		this.sql.exec(
			"CREATE INDEX email_flows_user ON email_flows (user_id, purpose)",
		);
		this.sql.exec(`CREATE TABLE email_sends (
			email TEXT NOT NULL,
			ip TEXT NOT NULL,
			sent_at INTEGER NOT NULL
		)`);
		this.sql.exec("CREATE INDEX email_sends_time ON email_sends (sent_at)");
		this.sql.exec(
			"CREATE INDEX email_sends_email ON email_sends (email, sent_at)",
		);
		this.sql.exec("CREATE INDEX email_sends_ip ON email_sends (ip)");
	}

	start(pending: PendingEmail, challenge: EmailFlow, ip: string): boolean {
		const now = Date.now();
		if (!this.reserveSend(pending.email, ip, now)) return false;
		this.sql.exec("DELETE FROM email_flows WHERE expires_at <= ?", now);
		this.sql.exec(
			`INSERT INTO email_flows (id, purpose, email, user_id, username, password_hash, session_hash, code_hash, expires_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			challenge.id,
			pending.purpose,
			pending.email,
			pending.userId,
			pending.username,
			pending.passwordHash,
			pending.sessionHash,
			challenge.codeHash,
			now + WINDOW_MS,
		);
		return true;
	}

	find(
		id: string,
		purpose: EmailPurpose,
		sessionHash: string | null,
	): EmailRow | null {
		return (
			this.sql
				.exec<EmailRow>(
					`SELECT purpose, email, user_id AS userId, username, password_hash AS passwordHash,
					session_hash AS sessionHash, code_hash AS codeHash, expires_at AS expiresAt, attempts
				FROM email_flows WHERE id = ? AND purpose = ? AND session_hash IS ? AND expires_at > ?`,
					id,
					purpose,
					sessionHash,
					Date.now(),
				)
				.toArray()[0] ?? null
		);
	}

	resend(pending: EmailRow, challenge: EmailFlow, ip: string): boolean {
		const now = Date.now();
		if (!this.reserveSend(pending.email, ip, now)) return false;
		this.sql.exec(
			"UPDATE email_flows SET code_hash = ?, expires_at = ?, attempts = 0 WHERE id = ?",
			challenge.codeHash,
			now + WINDOW_MS,
			challenge.id,
		);
		return true;
	}

	verify(
		challenge: EmailFlow,
		purpose: EmailPurpose,
		sessionHash: string | null,
	): EmailRow | null {
		const pending = this.find(challenge.id, purpose, sessionHash);
		if (!pending || pending.attempts >= MAX_ATTEMPTS) return null;
		if (pending.codeHash !== challenge.codeHash) {
			this.sql.exec(
				"UPDATE email_flows SET attempts = attempts + 1 WHERE id = ?",
				challenge.id,
			);
			return null;
		}
		return pending;
	}

	remove(id: string): void {
		this.sql.exec("DELETE FROM email_flows WHERE id = ?", id);
	}

	clearSensitiveFlows(userId: string): void {
		this.sql.exec("DELETE FROM email_flows WHERE user_id = ?", userId);
	}

	deleteUser(userId: string, email: string | null): void {
		this.sql.exec(
			"DELETE FROM email_flows WHERE user_id = ? OR email = ?",
			userId,
			email,
		);
		this.sql.exec("DELETE FROM email_sends WHERE email = ?", email);
	}

	private reserveSend(email: string, ip: string, now: number): boolean {
		this.sql.exec(
			"DELETE FROM email_sends WHERE sent_at <= ?",
			now - WINDOW_MS,
		);
		const limits = this.sql
			.exec<{ perEmail: number; perIp: number; last: number | null }>(
				`SELECT count(*) FILTER (WHERE email = ?) AS perEmail,
				count(*) FILTER (WHERE ip = ?) AS perIp,
				max(sent_at) FILTER (WHERE email = ?) AS last
			FROM email_sends WHERE email = ? OR ip = ?`,
				email,
				ip,
				email,
				email,
				ip,
			)
			.one();
		if (
			limits.perEmail >= 5 ||
			limits.perIp >= 20 ||
			(limits.last !== null && now - limits.last < RESEND_MS)
		) {
			return false;
		}
		this.sql.exec(
			"INSERT INTO email_sends (email, ip, sent_at) VALUES (?, ?, ?)",
			email,
			ip,
			now,
		);
		return true;
	}
}

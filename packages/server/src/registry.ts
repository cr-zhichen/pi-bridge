import { DurableObject } from "cloudflare:workers";
import { hashToken, hubOf, newToken, randomId } from "./stubs.ts";

export interface User {
	id: string;
	name: string;
	disabled: boolean;
	createdAt: number;
}

type UserRow = {
	id: string;
	name: string;
	disabled: number;
	created_at: number;
};

/** 全局唯一的实例，保存用户和密钥哈希。 */
export class Registry extends DurableObject<Env> {
	sql = this.ctx.storage.sql;

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		this.sql.exec(`CREATE TABLE IF NOT EXISTS users (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			token_hash TEXT NOT NULL UNIQUE,
			disabled INTEGER NOT NULL DEFAULT 0,
			created_at INTEGER NOT NULL
		)`);
	}

	/** 返回密钥对应的启用中的用户 ID。 */
	authenticate(tokenHash: string): string | null {
		const row = this.sql
			.exec<{ id: string }>(
				"SELECT id FROM users WHERE token_hash = ? AND disabled = 0",
				tokenHash,
			)
			.toArray()[0];
		return row?.id ?? null;
	}

	listUsers(): User[] {
		return this.sql
			.exec<UserRow>(
				"SELECT id, name, disabled, created_at FROM users ORDER BY created_at",
			)
			.toArray()
			.map((row) => ({
				id: row.id,
				name: row.name,
				disabled: row.disabled === 1,
				createdAt: row.created_at,
			}));
	}

	async createUser(name: string): Promise<{ user: User; token: string }> {
		const token = newToken();
		const user: User = {
			id: randomId(8),
			name,
			disabled: false,
			createdAt: Date.now(),
		};
		this.sql.exec(
			"INSERT INTO users (id, name, token_hash, created_at) VALUES (?, ?, ?, ?)",
			user.id,
			name,
			await hashToken(token),
			user.createdAt,
		);
		return { user, token };
	}

	/** 禁用后该用户的设备立即断开。 */
	async setDisabled(id: string, disabled: boolean): Promise<boolean> {
		const { rowsWritten } = this.sql.exec(
			"UPDATE users SET disabled = ? WHERE id = ?",
			disabled ? 1 : 0,
			id,
		);
		if (rowsWritten > 0 && disabled) {
			await hubOf(this.env, id).revoke();
		}
		return rowsWritten > 0;
	}

	/** 生成新密钥，旧密钥立即失效，已连接的设备会断开。 */
	async resetToken(id: string): Promise<string | null> {
		const token = newToken();
		const { rowsWritten } = this.sql.exec(
			"UPDATE users SET token_hash = ? WHERE id = ?",
			await hashToken(token),
			id,
		);
		if (rowsWritten === 0) {
			return null;
		}
		await hubOf(this.env, id).revoke();
		return token;
	}
}

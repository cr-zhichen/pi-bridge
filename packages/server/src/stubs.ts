import type { Registry } from "./registry.ts";
import type { UserHub } from "./user-hub.ts";

export function registryOf(env: Env): DurableObjectStub<Registry> {
	return env.REGISTRY.get(env.REGISTRY.idFromName("registry"));
}

export function hubOf(env: Env, userId: string): DurableObjectStub<UserHub> {
	return env.USER_HUB.get(env.USER_HUB.idFromName(userId));
}

/** 只保存密钥的哈希。 */
export async function hashToken(token: string): Promise<string> {
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(token),
	);
	return toHex(new Uint8Array(digest));
}

export function randomId(bytes: number): string {
	return toHex(crypto.getRandomValues(new Uint8Array(bytes)));
}

const TOKEN_ALPHABET =
	"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/** 只用字母和数字：以 "-" 开头的密钥会被命令行当成选项。 */
export function newToken(): string {
	return randomString(TOKEN_ALPHABET, 32);
}

/** 从字母表中均匀地随机取字符。 */
export function randomString(alphabet: string, length: number): string {
	// 丢弃超出字母表整数倍的字节，避免取模带来的偏差
	const limit = 256 - (256 % alphabet.length);
	let result = "";
	while (result.length < length) {
		for (const byte of crypto.getRandomValues(new Uint8Array(length))) {
			if (byte < limit && result.length < length) {
				result += alphabet[byte % alphabet.length];
			}
		}
	}
	return result;
}

export function toHex(bytes: Uint8Array): string {
	return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

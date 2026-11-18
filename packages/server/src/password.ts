import { randomString, toHex } from "./stubs.ts";

/**
 * 密码哈希：PBKDF2-SHA256，每个密码单独加盐，存成 "pbkdf2-sha256$<迭代次数>$<盐>$<哈希>"。
 * Workers 上 PBKDF2 最多迭代 100,000 次。计算放在 Worker 里做，不放在 Registry：
 * Registry 是全局唯一的实例，哈希会阻塞所有请求的鉴权。
 */
const ITERATIONS = 100_000;
const SCHEME = "pbkdf2-sha256";

export const MIN_PASSWORD_LENGTH = 10;
/** 过长的密码会拖慢哈希计算。 */
export const MAX_PASSWORD_LENGTH = 128;

/** 去掉容易看错的 0 o 1 l i。 */
const PASSWORD_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

/** 管理员创建用户或重置密码时生成的初始密码，形如 xxxx-xxxx-xxxx-xxxx。 */
export function newPassword(): string {
	return randomString(PASSWORD_ALPHABET, 16).match(/.{4}/g)?.join("-") ?? "";
}

export async function hashPassword(password: string): Promise<string> {
	const salt = crypto.getRandomValues(new Uint8Array(16));
	const hash = await derive(password, salt, ITERATIONS);
	return `${SCHEME}$${ITERATIONS}$${toHex(salt)}$${toHex(hash)}`;
}

export async function verifyPassword(
	password: string,
	stored: string,
): Promise<boolean> {
	const [scheme, iterationText, salt, hash] = stored.split("$");
	const iterations = Number(iterationText);
	if (
		scheme !== SCHEME ||
		!Number.isInteger(iterations) ||
		iterations < 1 ||
		!salt ||
		!hash
	) {
		return false;
	}
	const expected = fromHex(hash);
	const actual = await derive(password, fromHex(salt), iterations);
	return (
		actual.length === expected.length &&
		crypto.subtle.timingSafeEqual(actual, expected)
	);
}

let dummyHash: Promise<string> | undefined;

/** 用户名不存在时也做一次同样耗时的校验，避免通过响应时间判断用户名是否存在。 */
export async function verifyDummy(password: string): Promise<false> {
	dummyHash ??= hashPassword(newPassword());
	await verifyPassword(password, await dummyHash);
	return false;
}

/** 检查新密码，不符合要求时返回错误提示。 */
export function passwordProblem(password: unknown): string | undefined {
	if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
		return `新密码至少 ${MIN_PASSWORD_LENGTH} 位`;
	}
	if (password.length > MAX_PASSWORD_LENGTH) {
		return `新密码不能超过 ${MAX_PASSWORD_LENGTH} 位`;
	}
	return undefined;
}

async function derive(
	password: string,
	salt: Uint8Array,
	iterations: number,
): Promise<Uint8Array> {
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(password),
		"PBKDF2",
		false,
		["deriveBits"],
	);
	const bits = await crypto.subtle.deriveBits(
		{ name: "PBKDF2", hash: "SHA-256", salt, iterations },
		key,
		256,
	);
	return new Uint8Array(bits);
}

function fromHex(hex: string): Uint8Array {
	return new Uint8Array(
		(hex.match(/../g) ?? []).map((byte) => Number.parseInt(byte, 16)),
	);
}

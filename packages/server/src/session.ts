import type { Registry, User } from "./registry.ts";
import { hashToken } from "./stubs.ts";

export type RegistryStub = DurableObjectStub<Registry>;

export interface Session {
	user: User;
	/** 登录状态令牌的哈希。 */
	hash: string;
}

/** __Host- 前缀要求 Secure、Path=/ 且不设 Domain，子域名无法覆盖。 */
const SESSION_COOKIE = "__Host-pb_session";

export async function currentSession(
	request: Request,
	registry: RegistryStub,
): Promise<Session | null> {
	const token = cookieOf(request, SESSION_COOKIE);
	if (!token) {
		return null;
	}
	const hash = await hashToken(token);
	const user = await registry.sessionUser(hash);
	return user ? { user, hash } : null;
}

export function sessionCookie(token: string, maxAgeSeconds: number): string {
	return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

function cookieOf(request: Request, name: string): string | undefined {
	for (const part of (request.headers.get("Cookie") ?? "").split(";")) {
		const [key, ...value] = part.trim().split("=");
		if (key === name) {
			return value.join("=");
		}
	}
	return undefined;
}

/** 浏览器发起的跨站请求带着别的 Origin。 */
export function isSameOrigin(request: Request): boolean {
	return request.headers.get("Origin") === new URL(request.url).origin;
}

/** 只允许跳转到本站的路径。 */
export function safeNext(next: string | null | undefined): string | undefined {
	return next?.startsWith("/") &&
		!next.startsWith("//") &&
		!next.startsWith("/\\")
		? next
		: undefined;
}

export function redirect(location: string, status = 302): Response {
	return new Response(null, { status, headers: { Location: location } });
}

import { ADMIN_PAGE } from "./admin-page.ts";
import { jsonError, notFound, readJson } from "./http.ts";
import { listGrants, revokeAllGrants } from "./oauth.ts";
import { htmlResponse } from "./page.ts";
import { hashPassword, newPassword } from "./password.ts";
import { normalizeUsername, usernameProblem } from "./registry.ts";
import { hubOf, registryOf } from "./stubs.ts";

/**
 * - GET  /admin                                管理页
 * - GET  /admin/api/users                      用户及其设备
 * - POST /admin/api/users                      创建用户 { username, name? }，返回初始密码
 * - POST /admin/api/users/<id>/account         为老用户设置登录账号 { username }，返回初始密码
 * - POST /admin/api/users/<id>/reset-password  重置密码，返回新密码
 * - POST /admin/api/users/<id>/disable|enable  禁用或启用
 * - POST /admin/api/users/<id>/revoke-access   吊销该用户的所有密钥和 OAuth 授权
 *
 * 接口使用 Authorization: Bearer <ADMIN_KEY>。管理员看不到也不能生成用户的密钥。
 */
export async function handleAdmin(
	request: Request,
	env: Env,
	parts: string[],
): Promise<Response> {
	if (parts.length === 0 && request.method === "GET") {
		return htmlResponse(ADMIN_PAGE);
	}
	if (parts[0] !== "api" || parts[1] !== "users") {
		return notFound();
	}
	if (!env.ADMIN_KEY) {
		return jsonError(
			"尚未设置管理员密钥。请在 Cloudflare 控制台为这个 Worker 添加 ADMIN_KEY 后重试",
			503,
		);
	}
	if (!(await isAdmin(request, env))) {
		return jsonError("管理员密钥不正确", 401);
	}

	const registry = registryOf(env);
	const [, , id, action] = parts;

	if (!id && request.method === "GET") {
		const users = await registry.listUsers();
		const detailed = await Promise.all(
			users.map(async (user) => {
				const [devices, grants] = await Promise.all([
					hubOf(env, user.id).listDevices(),
					listGrants(env, user.id),
				]);
				return { ...user, devices, appCount: grants.length };
			}),
		);
		return Response.json(detailed);
	}
	if (!id && request.method === "POST") {
		const body = await readJson(request);
		const username = normalizeUsername(body.username);
		const problem = usernameProblem(username);
		if (problem) {
			return jsonError(problem);
		}
		const name =
			(typeof body.name === "string" ? body.name.trim() : "").slice(0, 64) ||
			username;
		const password = newPassword();
		const result = await registry.createUser(
			username,
			name,
			await hashPassword(password),
		);
		return result.ok
			? Response.json({ user: result.user, password })
			: jsonError(result.error);
	}
	if (id && request.method === "POST") {
		switch (action) {
			case "disable":
			case "enable": {
				const found = await registry.setDisabled(id, action === "disable");
				return found ? Response.json({}) : userNotFound();
			}
			case "account": {
				const username = normalizeUsername((await readJson(request)).username);
				const problem = usernameProblem(username);
				if (problem) {
					return jsonError(problem);
				}
				const password = newPassword();
				const result = await registry.setAccount(
					id,
					username,
					await hashPassword(password),
				);
				return result.ok
					? Response.json({ username, password })
					: jsonError(result.error);
			}
			case "reset-password": {
				const password = newPassword();
				const found = await registry.setPassword(
					id,
					await hashPassword(password),
					true,
				);
				return found
					? Response.json({ password })
					: jsonError("用户不存在或还没有登录账号", 404);
			}
			case "revoke-access": {
				const found = await registry.revokeAllKeys(id);
				if (!found) {
					return userNotFound();
				}
				await revokeAllGrants(env, id);
				return Response.json({});
			}
		}
	}
	return notFound();
}

async function isAdmin(request: Request, env: Env): Promise<boolean> {
	const header = request.headers.get("Authorization") ?? "";
	const given = header.startsWith("Bearer ") ? header.slice(7) : "";
	const [a, b] = await Promise.all([digest(given), digest(env.ADMIN_KEY)]);
	return crypto.subtle.timingSafeEqual(a, b);
}

function digest(text: string): Promise<ArrayBuffer> {
	return crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
}

function userNotFound(): Response {
	return jsonError("用户不存在", 404);
}

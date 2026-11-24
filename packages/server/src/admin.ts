import { emailFeatures } from "./account-email.ts";
import { adminPage } from "./admin-page.ts";
import { normalizeEmail } from "./email-challenges.ts";
import { jsonError, notFound, readJson } from "./http.ts";
import { listGrants, revokeAllGrants } from "./oauth.ts";
import { htmlResponse } from "./page.ts";
import { hashPassword, newPassword } from "./password.ts";
import { normalizeUsername, usernameProblem } from "./registry.ts";
import { hubOf, registryOf } from "./stubs.ts";

/**
 * - GET  /admin                                管理页
 * - GET  /admin/api/users?page=1&q=...         分页搜索用户名与邮箱
 * - POST /admin/api/users                      创建用户 { username, email? }，返回初始密码
 * - POST /admin/api/users/<id>/account         为老用户设置登录账号 { username }，返回初始密码
 * - POST /admin/api/users/<id>/email           设置或解除邮箱 { email: string | null }
 * - POST /admin/api/users/<id>/reset-password  重置密码，返回新密码
 * - POST /admin/api/users/<id>/disable|enable  禁用或启用
 * - POST /admin/api/users/<id>/delete         删除用户 { confirm: true }
 *
 * 接口使用 Authorization: Bearer <ADMIN_KEY>。管理员看不到也不能生成用户的密钥。
 */
export async function handleAdmin(
	request: Request,
	env: Env,
	parts: string[],
): Promise<Response> {
	if (parts.length === 0 && request.method === "GET") {
		return htmlResponse(adminPage(emailFeatures(env).emailAvailable));
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
		const { searchParams } = new URL(request.url);
		const page = Number(searchParams.get("page") ?? 1);
		if (!Number.isSafeInteger(page) || page < 1) {
			return jsonError("页码无效");
		}
		const query = (searchParams.get("q") ?? "").trim().toLowerCase();
		if (query.length > 254) return jsonError("搜索内容过长");
		const { users, ...pagination } = await registry.listUsers(page, query);
		const detailed = await Promise.all(
			users.map(async (user) => {
				const [devices, grants] = await Promise.all([
					hubOf(env, user.id).listDevices(),
					listGrants(env, user.id),
				]);
				return { ...user, devices, appCount: grants.length };
			}),
		);
		return Response.json({ ...pagination, users: detailed });
	}
	if (!id && request.method === "POST") {
		const body = await readJson(request);
		const username = normalizeUsername(body.username);
		const problem = usernameProblem(username);
		if (problem) {
			return jsonError(problem);
		}
		const email = body.email == null ? null : normalizeEmail(body.email);
		if (email === "") return jsonError("请输入有效的邮箱地址");
		const password = newPassword();
		const result = await registry.createUser({
			username,
			email,
			passwordHash: await hashPassword(password),
			mustChangePassword: true,
		});
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
			case "email": {
				const { email: input } = await readJson(request);
				const email = input === null ? null : normalizeEmail(input);
				if (email === "") return jsonError("请输入有效的邮箱地址");
				const result = await registry.setEmail(id, email);
				return result.ok ? Response.json({}) : jsonError(result.error);
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
			case "delete": {
				const { confirm } = await readJson(request);
				if (confirm !== true) return jsonError("请确认删除用户");
				return deleteUser(env, id);
			}
		}
	}
	return notFound();
}

async function deleteUser(env: Env, id: string): Promise<Response> {
	const registry = registryOf(env);
	try {
		if (!(await registry.beginDeleteUser(id))) return userNotFound();
		const hub = hubOf(env, id);
		await hub.revoke();
		await revokeAllGrants(env, id);
		await hub.deleteAccount();
		await registry.finishDeleteUser(id);
		return Response.json({});
	} catch {
		console.error("pi-bridge 无法完成用户删除", id);
		return jsonError("用户删除未完成，请重新尝试", 503);
	}
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

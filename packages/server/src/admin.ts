import { ADMIN_PAGE } from "./admin-page.ts";
import { hubOf, registryOf } from "./stubs.ts";

/**
 * - GET  /admin                                管理页
 * - GET  /admin/api/users                      用户及其设备
 * - POST /admin/api/users                      创建用户 { name }
 * - POST /admin/api/users/<id>/disable|enable  禁用或启用
 * - POST /admin/api/users/<id>/reset-token     重置密钥
 *
 * 接口使用 Authorization: Bearer <ADMIN_KEY>。
 */
export async function handleAdmin(
	request: Request,
	env: Env,
	parts: string[],
): Promise<Response> {
	if (parts.length === 0 && request.method === "GET") {
		return new Response(ADMIN_PAGE, {
			headers: { "Content-Type": "text/html; charset=utf-8" },
		});
	}
	if (parts[0] !== "api" || parts[1] !== "users") {
		return new Response("Not Found", { status: 404 });
	}
	if (!env.ADMIN_KEY) {
		return Response.json(
			{
				error:
					"尚未设置管理员密钥。请在 Cloudflare 控制台为这个 Worker 添加 ADMIN_KEY 后重试",
			},
			{ status: 503 },
		);
	}
	if (!(await isAdmin(request, env))) {
		return Response.json({ error: "管理员密钥不正确" }, { status: 401 });
	}

	const registry = registryOf(env);
	const [, , id, action] = parts;

	if (!id && request.method === "GET") {
		const users = await registry.listUsers();
		const withDevices = await Promise.all(
			users.map(async (user) => ({
				...user,
				devices: await hubOf(env, user.id).listDevices(),
			})),
		);
		return Response.json(withDevices);
	}
	if (!id && request.method === "POST") {
		const { name } = await request.json<{ name?: unknown }>();
		if (typeof name !== "string" || !name.trim()) {
			return Response.json({ error: "请填写名称" }, { status: 400 });
		}
		return Response.json(await registry.createUser(name.trim().slice(0, 64)));
	}
	if (id && request.method === "POST") {
		if (action === "disable" || action === "enable") {
			const found = await registry.setDisabled(id, action === "disable");
			return found ? Response.json({}) : userNotFound();
		}
		if (action === "reset-token") {
			const token = await registry.resetToken(id);
			return token ? Response.json({ token }) : userNotFound();
		}
	}
	return new Response("Not Found", { status: 404 });
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
	return Response.json({ error: "用户不存在" }, { status: 404 });
}

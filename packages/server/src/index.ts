import { handleAdmin } from "./admin.ts";
import { handleMcp } from "./mcp.ts";
import { Registry } from "./registry.ts";
import { hashToken, hubOf, registryOf } from "./stubs.ts";
import { UserHub } from "./user-hub.ts";

export { Registry, UserHub };

/**
 * 路由：
 * - /admin              管理页，使用 ADMIN_KEY 登录
 * - /<密钥>/mcp          Claude / ChatGPT 网页版接入的 MCP 地址
 * - /<密钥>/connect      本机 CLI 的 WebSocket 连接
 * - /<密钥>/devices      该用户的设备列表，CLI 的 login 和 status 使用
 *
 * 路径中的密钥确定用户，之后的请求都交给该用户的 UserHub 处理。
 */
export default {
	async fetch(request, env) {
		const parts = new URL(request.url).pathname.split("/").filter(Boolean);

		if (parts[0] === "admin") {
			return handleAdmin(request, env, parts.slice(1));
		}
		const [token, action] = parts;
		if (
			!token ||
			parts.length !== 2 ||
			(action !== "mcp" && action !== "connect" && action !== "devices")
		) {
			return new Response("Not Found", { status: 404 });
		}

		const userId = await registryOf(env).authenticate(await hashToken(token));
		if (!userId) {
			return new Response("密钥无效或用户已被禁用", { status: 401 });
		}
		const hub = hubOf(env, userId);
		switch (action) {
			case "connect":
				return hub.fetch(request);
			case "devices":
				return Response.json(await hub.listDevices());
			case "mcp":
				return handleMcp(request, hub);
		}
	},
} satisfies ExportedHandler<Env>;

import { UserHub } from "./user-hub.ts";

export { UserHub };

/**
 * 路由：
 * - /admin           管理页，使用 ADMIN_KEY 登录
 * - /<密钥>/mcp       Claude / ChatGPT 网页版接入的 MCP 地址
 * - /<密钥>/connect   本机 CLI 的 WebSocket 连接
 *
 * 路径中的密钥确定用户，之后的请求都交给该用户的 UserHub 处理。
 */
export default {
	async fetch(request, _env) {
		const [first, second, ...rest] = new URL(request.url).pathname
			.split("/")
			.filter(Boolean);

		if (first === "admin") {
			return notImplemented();
		}
		if (
			first &&
			rest.length === 0 &&
			(second === "mcp" || second === "connect")
		) {
			return notImplemented();
		}
		return new Response("Not Found", { status: 404 });
	},
} satisfies ExportedHandler<Env>;

function notImplemented(): Response {
	return new Response("Not Implemented", { status: 501 });
}

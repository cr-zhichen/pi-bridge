import { ACCOUNT_ROUTES, handleAccount } from "./account.ts";
import { handleAdmin } from "./admin.ts";
import { jsonError, notFound } from "./http.ts";
import { handleMcp } from "./mcp.ts";
import { providerFor } from "./oauth.ts";
import { Registry, type Scope } from "./registry.ts";
import { redirect } from "./session.ts";
import { hashToken, hubOf, registryOf } from "./stubs.ts";
import { handleTransfer, TRANSFER_ID_PATTERN } from "./transfers.ts";
import { UserHub } from "./user-hub.ts";

export { Registry, UserHub };

/** 密钥路径下各操作需要的密钥权限。 */
const KEY_ACTIONS = new Map<string, Scope>([
	["connect", "device"],
	["devices", "device"],
	["mcp", "connector"],
]);

/**
 * 路由：
 * - /mcp                 网页版连接器的 MCP 地址，使用 OAuth（oauth.ts）
 * - /authorize、/oauth/...、/.well-known/...  OAuth 授权与发现
 * - /login、/account、/api/...  用户的账号页，使用用户名和密码登录
 * - /admin               管理页，使用 ADMIN_KEY 登录
 * - /transfers/<文件 ID> 临时文件上传与下载，使用对应的短效令牌
 * - /<密钥>/mcp          带密钥的 MCP 地址，给不支持 OAuth 的客户端，需要连接器密钥
 * - /<密钥>/connect      本机 CLI 的 WebSocket 连接，需要设备密钥
 * - /<密钥>/devices      该用户的设备列表，CLI 的 login 和 status 使用，需要设备密钥
 */
const routes = {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);
		const parts = url.pathname.split("/").filter(Boolean);

		if (parts.length === 0) {
			return redirect("/account");
		}
		if (parts[0] === "admin") {
			return handleAdmin(request, env, parts.slice(1));
		}
		if (ACCOUNT_ROUTES.has(parts[0] ?? "")) {
			return handleAccount(request, env, parts);
		}
		if (parts[0] === "transfers") {
			const [, fileId] = parts;
			return parts.length === 2 && fileId && TRANSFER_ID_PATTERN.test(fileId)
				? handleTransfer(request, env.TRANSFER_FILES, url, fileId)
				: notFound();
		}

		const [token, action] = parts;
		const scope = KEY_ACTIONS.get(action ?? "");
		if (!token || !scope || parts.length !== 2) {
			return notFound();
		}
		const auth = await registryOf(env).authenticateKey(await hashToken(token));
		if (!auth) {
			return new Response("密钥无效或用户已被禁用", { status: 401 });
		}
		if (!auth.scopes.includes(scope)) {
			return jsonError(
				scope === "device"
					? "这个密钥不能用来连接电脑。请在账号页添加电脑"
					: "这个密钥不能用作连接器地址。请使用账号页上的 OAuth 连接器地址",
				403,
			);
		}
		switch (action) {
			case "connect": {
				// 告诉 UserHub 这次连接用的是哪个密钥，覆盖客户端自己带的同名参数
				url.searchParams.set("key", auth.keyId);
				return hubOf(env, auth.userId).fetch(new Request(url, request));
			}
			case "devices":
				return Response.json(await hubOf(env, auth.userId).listDevices());
			default:
				if (
					(await hubOf(env, auth.userId).connectorAccess(auth.keyId, true)) ===
					null
				) {
					return jsonError("请在账号页重新生成带密钥的地址。", 403);
				}
				return handleMcp(request, env, auth.userId, auth.keyId);
		}
	},
};

export default {
	fetch(request, env, ctx) {
		return providerFor(new URL(request.url).origin, routes).fetch(
			request,
			env,
			ctx,
		);
	},
} satisfies ExportedHandler<Env>;

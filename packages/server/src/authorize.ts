import {
	AuthorizationError,
	CimdFetchError,
	type ConsentDescription,
} from "@cloudflare/workers-oauth-provider";
import { type AuthProps, type GrantMetadata, oauthOf } from "./oauth.ts";
import {
	BRAND,
	escapeHtml,
	htmlResponse,
	PAGE_CSP,
	PAGE_HEAD,
} from "./page.ts";
import type { User } from "./registry.ts";
import { currentSession, redirect } from "./session.ts";
import { registryOf } from "./stubs.ts";

/**
 * GET  /authorize  校验授权请求；未登录时先登录，初始密码未修改时先修改，然后显示确认页
 * POST /authorize  确认页的表单，允许或拒绝
 *
 * 授权请求保存在服务端，表单只带一个与当前浏览器绑定、只能用一次的 handle，无法被其他网站伪造。
 */
export async function handleAuthorize(
	request: Request,
	env: Env,
): Promise<Response> {
	const oauth = oauthOf(env);
	const registry = registryOf(env);
	const url = new URL(request.url);
	try {
		if (request.method === "GET") {
			const authRequest = await oauth.parseAuthRequest(request);
			const here = url.pathname + url.search;
			const session = await currentSession(request, registry);
			if (!session) {
				return redirect(`/login?next=${encodeURIComponent(here)}`);
			}
			if (session.user.mustChangePassword) {
				return redirect(`/account?next=${encodeURIComponent(here)}`);
			}
			const details = await oauth.describeConsent(authRequest);
			const consent = await oauth.beginConsent(authRequest);
			return htmlResponse(
				consentPage(details, consent.handle, session.user, here),
				{ headers: withConsentCsp(consent.headers) },
			);
		}
		if (request.method === "POST") {
			const form = await request.formData();
			const handle = String(form.get("handle") ?? "");
			if (form.get("decision") !== "approve") {
				const denied = await oauth.denyConsent(request, handle);
				return new Response(null, { status: 302, headers: denied.headers });
			}
			const session = await currentSession(request, registry);
			if (!session || session.user.mustChangePassword) {
				return errorPage("登录已失效，请回到原来的应用重新连接。");
			}
			const approved = await oauth.approveConsent(request, handle, {
				scope: [],
			});
			const details = await oauth.describeConsent(approved.request);
			const metadata: GrantMetadata = {
				clientName: details.clientName,
				clientDomain: details.clientDomain,
				redirectHost: details.redirectHost,
			};
			const props: AuthProps = { userId: session.user.id };
			const { redirectTo } = await oauth.completeAuthorization({
				request: approved.request,
				userId: session.user.id,
				metadata,
				scope: [],
				props,
			});
			approved.headers.set("Location", redirectTo);
			return new Response(null, { status: 302, headers: approved.headers });
		}
		return new Response("Method Not Allowed", { status: 405 });
	} catch (error) {
		if (error instanceof AuthorizationError && error.redirectTo) {
			return redirect(error.redirectTo);
		}
		if (error instanceof AuthorizationError) {
			return errorPage(
				error.code === "invalid_request" || error.code === "access_denied"
					? "授权页已过期或已经用过，请回到原来的应用重新连接。"
					: `授权请求无效：${error.description}`,
			);
		}
		if (error instanceof CimdFetchError) {
			return errorPage("无法验证这个应用的身份，请稍后重试。");
		}
		throw error;
	}
}

/** 确认页提交后要跳回客户端的网站，form-action 'self' 会拦住这次重定向。 */
function withConsentCsp(headers: Headers): Headers {
	if (!headers.has("Content-Security-Policy")) {
		headers.set(
			"Content-Security-Policy",
			PAGE_CSP.replace("form-action 'self'; ", ""),
		);
	}
	return headers;
}

function initial(name: string): string {
	return (Array.from(name.trim())[0] ?? "?").toUpperCase();
}

function consentPage(
	details: ConsentDescription,
	handle: string,
	user: User,
	here: string,
): string {
	const name = escapeHtml(details.clientName);
	const who =
		user.name === user.username
			? user.username
			: `${user.name} · ${user.username}`;
	return `<!doctype html>
<html lang="zh-CN">
<head>
${PAGE_HEAD}
<title>授权 ${name} · pi-bridge</title>
</head>
<body>
<div class="auth-page">
<main class="auth">
	<div class="pair"><span class="icon">${escapeHtml(initial(details.clientName))}</span><span class="line"></span><span class="logo">π</span></div>
	<h1 style="text-align:center">${name} 想要使用你的电脑</h1>
	<ul class="facts">
		<li>${
			details.clientDomain
				? `由 <strong>${escapeHtml(details.clientDomain)}</strong> 发布`
				: "应用名称由应用自行填写，未经验证"
		}</li>
		<li>授权后返回 <strong>${escapeHtml(details.redirectHost)}</strong></li>
	</ul>
	${
		details.redirectIsLoopback
			? `<div class="warn-box">授权将发送给这台电脑上的本地应用。只有在你刚刚从本地应用发起连接时才继续。</div>`
			: ""
	}
	<div class="who">
		<span style="display:flex;align-items:center;min-width:0"><span class="avatar">${escapeHtml(initial(user.name))}</span>${escapeHtml(who)}</span>
		<form method="post" action="/logout?next=${encodeURIComponent(here)}"><button class="link">切换账号</button></form>
	</div>
	<span class="label">允许后，${name} 可以在你在线的电脑上</span>
	<ul class="perms">
		<li>运行命令</li>
		<li>读取和修改文件</li>
		<li>使用 Pi 已安装的工具、Skills 和 MCP</li>
	</ul>
	<form method="post" action="/authorize" class="buttons">
		<input type="hidden" name="handle" value="${escapeHtml(handle)}">
		<button class="btn wide" name="decision" value="deny">拒绝</button>
		<button class="btn primary wide" name="decision" value="approve">允许</button>
	</form>
	<p class="note" style="text-align:center">只在你自己添加连接器时允许。之后可以随时在账号页撤销。</p>
</main>
</div>
</body>
</html>
`;
}

export function errorPage(message: string, status = 400): Response {
	return htmlResponse(
		`<!doctype html>
<html lang="zh-CN">
<head>
${PAGE_HEAD}
<title>无法完成授权 · pi-bridge</title>
</head>
<body>
<div class="auth-page">
<main class="auth">
	${BRAND}
	<h1>无法完成授权</h1>
	<p class="lead" style="margin:0">${escapeHtml(message)}</p>
</main>
</div>
</body>
</html>
`,
		{ status },
	);
}

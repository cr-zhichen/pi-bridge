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
	platformName,
} from "./page.ts";
import type { DeviceInfo } from "./protocol.ts";
import type { User } from "./registry.ts";
import { currentSession, redirect } from "./session.ts";
import { hubOf, registryOf } from "./stubs.ts";

/**
 * GET  /authorize  校验授权请求；未登录时先登录，初始密码未修改时先修改，然后显示确认页
 * POST /authorize  确认页的表单，允许或拒绝
 *
 * 授权请求保存在服务端，表单使用与当前浏览器绑定的一次性 handle。
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
			const devices = await hubOf(env, session.user.id).listDevices();
			const consent = await oauth.beginConsent(authRequest);
			return htmlResponse(
				consentPage(details, consent.handle, session.user, here, devices),
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
				return errorPage("登录已失效，请返回原应用重试。");
			}
			const approved = await oauth.approveConsent(request, handle, {
				scope: [],
			});
			const details = await oauth.describeConsent(approved.request);
			const connectorId = crypto.randomUUID();
			const hub = hubOf(env, session.user.id);
			const access = await hub.setConnectorAccess(
				connectorId,
				form.get("allDevices") === "on" ? "all" : "selected",
				form.getAll("deviceId"),
			);
			if (!access.ok) {
				return errorPage(`${access.error}请返回原应用重试。`);
			}
			const metadata: GrantMetadata = {
				connectorId,
				clientName: details.clientName,
				clientDomain: details.clientDomain,
				redirectHost: details.redirectHost,
			};
			const props: AuthProps = { userId: session.user.id, connectorId };
			try {
				const { redirectTo } = await oauth.completeAuthorization({
					request: approved.request,
					userId: session.user.id,
					metadata,
					scope: [],
					props,
				});
				approved.headers.set("Location", redirectTo);
				return new Response(null, { status: 302, headers: approved.headers });
			} catch (error) {
				await hub.removeConnectorAccess(connectorId);
				throw error;
			}
		}
		return new Response("Method Not Allowed", { status: 405 });
	} catch (error) {
		if (error instanceof AuthorizationError && error.redirectTo) {
			return redirect(error.redirectTo);
		}
		if (error instanceof AuthorizationError) {
			return errorPage(
				error.code === "invalid_request" || error.code === "access_denied"
					? "授权链接已失效，请返回原应用重新发起。"
					: `授权请求无效：${error.description}`,
			);
		}
		if (error instanceof CimdFetchError) {
			return errorPage("无法验证应用身份，请稍后重试。");
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
	devices: DeviceInfo[],
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
<main class="auth consent">
	<div class="pair"><span class="icon">${escapeHtml(initial(details.clientName))}</span><span class="line"></span><span class="logo">π</span></div>
	<h1 style="text-align:center">${name} 想要使用你的电脑</h1>
	<ul class="facts">
		<li>${
			details.clientDomain
				? `由 <strong>${escapeHtml(details.clientDomain)}</strong> 发布`
				: "应用名称未经验证"
		}</li>
		<li>授权后返回 <strong>${escapeHtml(details.redirectHost)}</strong></li>
	</ul>
	${
		details.redirectIsLoopback
			? `<div class="warn-box">授权将发往本机应用，请确认是由你刚刚发起的连接。</div>`
			: ""
	}
	<div class="who">
		<span class="who-user"><span class="avatar">${escapeHtml(initial(user.name))}</span><span class="who-name">${escapeHtml(who)}</span></span>
		<form method="post" action="/logout?next=${encodeURIComponent(here)}"><button class="link">切换账号</button></form>
	</div>
	<span class="label">允许后，${name} 可以</span>
	<ul class="perms">
		<li>在所选电脑上运行命令、读取和修改文件</li>
		<li>使用 Pi 已安装的工具、Skills 和 MCP</li>
		<li>上传和分享临时文件</li>
	</ul>
	<form method="post" action="/authorize" id="consent-form">
		<input type="hidden" name="handle" value="${escapeHtml(handle)}">
		<fieldset class="device-choice">
			<legend class="sr-only">允许访问的电脑</legend>
			<label class="check choice-all"><input type="checkbox" name="allDevices"><span>允许访问全部电脑（包括以后添加的电脑）</span></label>
			<div id="selected-devices">
				<div class="choice-head">
					<span class="label">选择电脑</span>
					${devices.length > 1 ? '<button type="button" class="link" id="toggle-all">全选当前电脑</button>' : ""}
				</div>
				${
					devices.length
						? `<div class="choice-list">${devices
								.map(
									(device) =>
										`<label class="choice-item"><input type="checkbox" name="deviceId" value="${escapeHtml(device.id)}"><span class="choice-main"><span class="choice-name">${escapeHtml(device.name)}</span>${device.platform ? `<span class="choice-platform">${escapeHtml(platformName(device.platform))}</span>` : ""}</span><span class="choice-status${device.online ? " on" : ""}"><span class="dot${device.online ? " on" : ""}"></span>${device.online ? "在线" : "离线"}</span></label>`,
								)
								.join("")}</div>`
						: '<div class="choice-empty">还没有电脑，请先前往 <a href="/account" target="_blank" rel="noopener">账号页</a> 添加后再刷新。</div>'
				}
			</div>
		</fieldset>
		<div class="buttons">
			<button class="btn wide" name="decision" value="deny">拒绝</button>
			<button class="btn primary wide" name="decision" value="approve">允许访问</button>
		</div>
	</form>
	<p class="note" style="text-align:center">可在账号页修改或撤销授权。</p>
</main>
</div>
<script>
	const form = document.getElementById("consent-form");
	const allow = form.querySelector('[value="approve"]');
	const all = form.elements.allDevices;
	const selection = document.getElementById("selected-devices");
	const inputs = Array.from(form.querySelectorAll('[name="deviceId"]'));
	const toggle = document.getElementById("toggle-all");
	function updateApproval() {
		const checked = inputs.filter((input) => input.checked).length;
		selection.hidden = all.checked;
		allow.disabled = !all.checked && checked === 0;
		if (toggle) toggle.textContent = checked === inputs.length ? "清空" : "全选当前电脑";
	}
	if (toggle) {
		toggle.addEventListener("click", () => {
			const next = inputs.some((input) => !input.checked);
			for (const input of inputs) input.checked = next;
			updateApproval();
		});
	}
	form.addEventListener("change", updateApproval);
	updateApproval();
</script>
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

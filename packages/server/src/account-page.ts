import {
	BRAND,
	PAGE_HEAD,
	PAGE_SCRIPT,
	PROJECT_ICON_LINK,
	PROJECT_TEXT_LINK,
} from "./page.ts";

const PASSWORD_FIELDS = `
				<div class="field"><span class="label">当前密码</span><input class="input" name="current" type="password" autocomplete="current-password" required></div>
				<div class="field"><span class="label">新密码</span><input class="input" name="next" type="password" placeholder="至少 10 位" autocomplete="new-password" minlength="10" required></div>
				<div class="field"><span class="label">确认新密码</span><input class="input" name="confirm" type="password" autocomplete="new-password" minlength="10" required></div>`;

/** /login 和 /account 共用这个页面：登录、修改初始密码、账号页三个视图。 */
export const ACCOUNT_PAGE = `<!doctype html>
<html lang="zh-CN">
<head>
${PAGE_HEAD}
<title>pi-bridge</title>
<style>
	#devices { overflow: visible; }
	#devices .status-on { color: var(--ok); font-weight: 500; }
	#devices .row-actions:has(.switch) { align-items: center; gap: 14px; }
	#devices .row-divider { width: 1px; height: 16px; background: var(--border); flex: none; }
	.switch { position: relative; display: inline-flex; align-items: center; gap: 8px; min-height: 32px; font-size: 12px; line-height: 1;
		color: var(--muted); cursor: pointer; user-select: none; white-space: nowrap; transition: color .15s; }
	.switch:hover { color: var(--text); }
	.switch:has(input:disabled) { opacity: .5; cursor: not-allowed; }
	.switch[data-tip]::before, .switch[data-tip]::after { position: absolute; pointer-events: none; z-index: 10; opacity: 0;
		transform: translateY(3px); transition: opacity .14s ease, transform .14s ease; }
	.switch[data-tip]::before { content: ""; right: 34px; bottom: calc(100% + 1.5px);
		border: 5px solid transparent; border-top-color: var(--text); border-bottom: 0; }
	.switch[data-tip]::after { content: attr(data-tip); right: 0; bottom: calc(100% + 6px);
		padding: 6px 10px; border-radius: var(--radius-sm); background: var(--text); color: var(--bg);
		font-size: 12px; line-height: 1.45; font-weight: 400; width: max-content; max-width: min(280px, calc(100vw - 48px));
		white-space: normal; box-shadow: 0 6px 18px rgb(0 0 0 / .16); }
	@media (hover: hover) {
		.switch[data-tip]:hover::before, .switch[data-tip]:hover::after { opacity: 1; transform: translateY(0); transition-delay: .08s; }
	}
	.switch[data-tip]:has(input:focus-visible)::before, .switch[data-tip]:has(input:focus-visible)::after {
		opacity: 1; transform: translateY(0); transition-delay: 0s; }
	.switch input { appearance: none; -webkit-appearance: none; flex: none; margin: 0; width: 32px; height: 18px; padding: 2px;
		border: 0; border-radius: 999px; background: var(--border-strong); cursor: pointer;
		transition: background-color .16s ease, opacity .16s ease; }
	.switch input::before { content: ""; display: block; width: 14px; height: 14px; border-radius: 50%; background: #fff;
		box-shadow: 0 1px 2px rgb(0 0 0 / .18); transition: transform .16s ease, background-color .16s ease; }
	.switch:hover input:not(:disabled):not(:checked) { background: color-mix(in srgb, var(--muted) 55%, var(--border-strong)); }
	.switch input:checked { background: var(--accent); }
	.switch:hover input:not(:disabled):checked { opacity: .88; }
	.switch input:checked::before { transform: translateX(14px); background: var(--accent-text); }
	.switch input:disabled { cursor: not-allowed; }
	@media (prefers-reduced-motion: reduce) {
		.switch, .switch[data-tip]::before, .switch[data-tip]::after, .switch input, .switch input::before { transition: none; }
	}
	.advanced-body > .card + .card { margin-top: 0; }
	.url-key-form { box-shadow: none; padding: 16px; display: grid; gap: 16px; }
	.url-key-foot { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap;
		padding-top: 14px; border-top: 1px solid var(--border); }
	@media (max-width: 640px) {
		#devices .row-actions:has(.switch) { flex-basis: 100%; justify-content: space-between; padding-left: 22px; }
		#devices .row-divider { display: none; }
		.switch[data-tip]::before { left: 34px; right: auto; }
		.switch[data-tip]::after { left: 0; right: auto; }
		.url-key-foot { flex-direction: column; align-items: stretch; }
	}
</style>
</head>
<body>

<div id="view-login" class="auth-page" hidden>
	<main class="auth">
		<form id="login-form">
			${BRAND}
			<h1>登录</h1>
			<p class="lead">使用管理员为你创建的账号</p>
			<div id="login-context" class="context" hidden><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg><span>登录后继续授权应用</span></div>
			<div class="field"><label class="label" for="username">用户名</label><input class="input" id="username" autocomplete="username" autocapitalize="none" spellcheck="false" required></div>
			<div class="field"><label class="label" for="password">密码</label><input class="input" id="password" type="password" autocomplete="current-password" required></div>
			<button class="btn primary wide auth-submit">登录</button>
			<p class="auth-hint">忘记密码请联系管理员重置</p>
		</form>
	</main>
	<footer class="auth-foot">${PROJECT_TEXT_LINK}</footer>
</div>

<div id="view-first" class="auth-page" hidden>
	<main class="auth">
		<form id="first-form" class="password-form">
			${BRAND}
			<h1>设置新密码</h1>
			<p class="lead">首次登录请修改初始密码。</p>${PASSWORD_FIELDS}
			<button class="btn primary wide auth-submit">保存并继续</button>
		</form>
	</main>
	<footer class="auth-foot"><button class="link logout">退出登录</button></footer>
</div>

<div id="view-account" hidden>
	<header class="top">
		${BRAND}
		<div class="user">
			<span id="whoami" class="name"></span>
			<button class="link" id="open-password">修改密码</button>
			<button class="link logout">退出</button>
			${PROJECT_ICON_LINK}
		</div>
	</header>

	<main class="container">
		<div id="legacy" class="banner" hidden>
			<span class="mark">!</span>
			<div>
				<strong>正在使用旧版密钥</strong>
				<p>请重新添加标有「旧密钥」的电脑，全部更换后吊销旧密钥。</p>
				<div class="actions"><button class="btn small" id="revoke-legacy">吊销旧密钥</button><button class="link" id="hide-legacy">稍后提醒</button></div>
			</div>
		</div>

		<section class="block">
			<div class="block-head">
				<div>
					<h2>连接网页版 AI</h2>
					<p class="sub">在 Claude 或 ChatGPT 中添加以下地址，登录后即可使用你的电脑。</p>
				</div>
			</div>
			<div class="card">
				<span class="label">连接器地址</span>
				<div class="copy hero" id="connector-url"></div>
				<p class="note">通用地址，不含密钥。添加后会跳转到此登录并授权。</p>
				<div class="tabs" role="tablist">
					<button class="tab on" data-tab="claude" role="tab">Claude</button>
					<button class="tab" data-tab="chatgpt" role="tab">ChatGPT</button>
				</div>
				<ol class="steps" data-panel="claude">
					<li><div>在侧边栏打开 <span class="ui">插件 → 连接器</span>，点击 <span class="ui">添加自定义连接器</span></div></li>
					<li><div>粘贴上方地址，身份验证选 <span class="ui">立即登录</span>，OAuth 客户端保持默认</div></li>
					<li><div>点击 <span class="ui">添加</span>，登录后选择允许访问的电脑</div></li>
				</ol>
				<ol class="steps" data-panel="chatgpt" hidden>
					<li><div>在侧边栏打开 <span class="ui">插件</span>，点击 <span class="ui">添加自定义 MCP 服务器</span></div></li>
					<li><div>名称填 pi-bridge，连接选 <span class="ui">服务器 URL</span> 并粘贴上方地址，身份验证选 <span class="ui">OAuth</span></div></li>
					<li><div>勾选确认提示并点击 <span class="ui">创建为插件</span>，登录后选择允许访问的电脑</div></li>
				</ol>
			</div>

			<div class="card list">
				<div class="list-head">已授权的应用</div>
				<div id="apps"></div>
			</div>

			<details class="advanced" id="url-keys-section">
				<summary>不支持 OAuth？使用带密钥的地址</summary>
				<div class="advanced-body">
					<div class="risk"><strong>请妥善保管地址。</strong>拿到它就能在所选电脑上执行命令。</div>
					<div class="card list" id="url-keys" style="box-shadow:none" hidden></div>
					<form id="url-key-form" class="card url-key-form">
						<div class="field"><label class="label" for="url-key-name">名称</label><input class="input" id="url-key-name" placeholder="例如：公司内部工具" maxlength="64" autocomplete="off" required></div>
						<fieldset class="device-choice">
							<legend class="sr-only">允许访问的电脑</legend>
							<label class="check choice-all"><input type="checkbox" name="allDevices"><span>允许访问全部电脑（包括以后添加的电脑）</span></label>
							<div id="url-key-selected">
								<div class="choice-head">
									<span class="label">选择电脑</span>
									<button type="button" class="link" id="url-key-toggle" hidden>全选当前电脑</button>
								</div>
								<div id="url-key-devices"></div>
							</div>
						</fieldset>
						<div class="url-key-foot">
							<label class="check"><input type="checkbox" id="url-key-ack" required><span>确认该客户端不支持 OAuth</span></label>
							<button class="btn" id="url-key-create" disabled>生成地址</button>
						</div>
					</form>
				</div>
			</details>
		</section>

		<section class="block">
			<div class="block-head">
				<div>
					<h2>我的电脑</h2>
					<p class="sub">每台电脑独立连接，不再使用时移除即可。</p>
				</div>
				<button class="btn primary" id="open-add">添加电脑</button>
			</div>
			<div class="card list" id="devices"></div>
		</section>
	</main>
</div>

<dialog class="modal" id="modal-add" aria-labelledby="add-title">
	<div class="modal-body">
		<div class="modal-head">
			<div><h3 id="add-title">添加电脑</h3><p class="sub">需先安装 Node.js 22.19+ 和 Pi。</p></div>
			<button type="button" class="link" data-close>关闭</button>
		</div>
		<form id="add-form">
			<label class="label" for="add-name">电脑名称（选填）</label>
			<input class="input" id="add-name" placeholder="例如：MacBook Pro" maxlength="64" autocomplete="off">
			<div class="modal-foot"><span></span><button class="btn primary">生成命令</button></div>
		</form>
		<div id="add-commands" hidden>
			<ol class="steps" id="add-steps"></ol>
			<p class="note">登录命令只显示一次；关闭后若未完成连接，可取消后重新添加。</p>
			<div class="modal-foot">
				<span class="waiting" id="add-waiting"><span class="dot wait"></span><span>等待电脑连接…</span></span>
				<button type="button" class="btn" id="add-done" data-close>完成</button>
			</div>
		</div>
	</div>
</dialog>

<dialog class="modal narrow" id="modal-password" aria-labelledby="password-title">
	<form class="modal-body password-form" id="password-form">
		<div class="modal-head"><h3 id="password-title">修改密码</h3><button type="button" class="link" data-close>关闭</button></div>${PASSWORD_FIELDS}
		<div class="modal-foot"><span class="sub" style="margin:0">其他浏览器将退出登录</span><button class="btn primary">保存</button></div>
	</form>
</dialog>

<dialog class="modal narrow" id="modal-access" aria-labelledby="access-title">
	<form class="modal-body" id="access-form">
		<div class="modal-head">
			<div><h3 id="access-title">选择可访问的电脑</h3><p class="sub" id="access-name"></p></div>
			<button type="button" class="link" data-close>关闭</button>
		</div>
		<fieldset class="device-choice">
			<legend class="sr-only">选择可访问的电脑</legend>
			<label class="check choice-all"><input type="checkbox" name="allDevices"><span>允许访问全部电脑（包括以后添加的电脑）</span></label>
			<div id="access-selected">
				<div class="choice-head">
					<span class="label" id="access-count"></span>
					<button type="button" class="link" id="access-toggle" hidden>全选当前电脑</button>
				</div>
				<div id="access-devices"></div>
			</div>
		</fieldset>
		<div class="dialog-actions">
			<button type="button" class="btn" data-close>取消</button>
			<button class="btn primary" id="access-save">保存</button>
		</div>
	</form>
</dialog>

<dialog class="modal" id="modal-secret" aria-labelledby="secret-title">
	<div class="modal-body">
		<div class="modal-head">
			<div><h3 id="secret-title"></h3><p class="sub">此地址只显示一次，请立即复制保存。</p></div>
			<button type="button" class="link" data-close>关闭</button>
		</div>
		<div id="secret-body"></div>
		<p class="note">在客户端添加时，身份验证选「无」或「无需登录」。</p>
	</div>
</dialog>

<div id="toasts" class="toasts" popover="manual"></div>

<script>
${PAGE_SCRIPT}
const params = new URLSearchParams(location.search);
const nextParam = params.get("next") ?? "";
const next = nextParam.startsWith("/") && !nextParam.startsWith("//") && !nextParam.startsWith("/\\\\") ? nextParam : "";
const isLoginPage = location.pathname === "/login";
let me = null;
let pollTimer = null;

async function api(path, body) {
	const res = await fetch("/api/" + path, {
		method: body === undefined ? "GET" : "POST",
		headers: { "Content-Type": "application/json" },
		body: body === undefined ? undefined : JSON.stringify(body),
	});
	const data = await res.json().catch(() => ({}));
	if (!res.ok) {
		if (res.status === 401 && !isLoginPage) {
			location.replace("/login");
		}
		throw new Error(data.error ?? "请求失败，请稍后重试");
	}
	return data;
}

function show(view) {
	for (const name of ["login", "first", "account"]) $("view-" + name).hidden = name !== view;
}

function badge(text, kind) {
	return el("span", { className: "badge" + (kind ? " " + kind : ""), textContent: text });
}

function row({ lead, title, badges = [], meta, extra, status, statusOn, actions = [] }) {
	return el("div", { className: "row" },
		lead,
		el("div", { className: "row-main" },
			el("div", { className: "row-title" }, el("span", { textContent: title }), ...badges.filter(Boolean)),
			meta ? (Array.isArray(meta)
				? el("div", { className: "row-meta" }, ...meta)
				: el("div", { className: "row-meta", textContent: meta })) : null,
			extra || null),
		status ? el("div", { className: "row-status" + (statusOn ? " on" : ""), textContent: status }) : null,
		actions.length ? el("div", { className: "row-actions" }, ...actions) : null,
	);
}

function button(text, className, onclick) {
	const node = el("button", { type: "button", className: "btn small " + (className ?? ""), textContent: text });
	node.onclick = () => act(node, onclick);
	return node;
}

function initial(name) {
	return (Array.from(name.trim())[0] ?? "?").toUpperCase();
}

const isLegacy = (key) => key.scopes.length > 1;
const only = (key, scope) => key.scopes.length === 1 && key.scopes[0] === scope;

// ---------- 连接网页版 AI ----------

function syncChoiceToggle(container, toggle) {
	if (!toggle) return;
	const inputs = Array.from(container.querySelectorAll('input[name="deviceId"]'));
	toggle.hidden = inputs.length < 2;
	if (inputs.length >= 2) {
		toggle.textContent = inputs.every((input) => input.checked) ? "清空" : "全选当前电脑";
	}
}

function bindChoiceToggle(container, toggle, onUpdate) {
	toggle.onclick = () => {
		const inputs = Array.from(container.querySelectorAll('input[name="deviceId"]'));
		const next = inputs.some((input) => !input.checked);
		for (const input of inputs) input.checked = next;
		onUpdate();
	};
}

function showDeviceChoices(container, toggle, deviceIds) {
	if (!me.devices.length) {
		container.replaceChildren(el("div", { className: "choice-empty", textContent: "请先在下方「我的电脑」中添加电脑。" }));
		syncChoiceToggle(container, toggle);
		return;
	}
	container.replaceChildren(el("div", { className: "choice-list" }, ...me.devices.map((device) =>
		el("label", { className: "choice-item" },
			el("input", { type: "checkbox", name: "deviceId", value: device.id, checked: deviceIds.includes(device.id) }),
			el("span", { className: "choice-main" },
				el("span", { className: "choice-name", textContent: device.name }),
				device.platform ? el("span", { className: "choice-platform", textContent: platformName(device.platform) }) : null),
			el("span", { className: "choice-status" + (device.online ? " on" : "") },
				el("span", { className: "dot" + (device.online ? " on" : "") }),
				device.online ? "在线" : "离线")))));
	syncChoiceToggle(container, toggle);
}

function selectedDevices(form) {
	return new FormData(form).getAll("deviceId");
}

function accessChoice(form) {
	return form.elements.allDevices.checked
		? { accessMode: "all" }
		: { accessMode: "selected", deviceIds: selectedDevices(form) };
}

function deviceChip(device) {
	return el("span", { className: "device-chip", title: device.online ? "在线" : "离线" },
		el("span", { className: "dot" + (device.online ? " on" : "") }),
		el("span", { textContent: device.name }));
}

function deviceScope(deviceAccess, reconnectHint) {
	if (deviceAccess === null) {
		return { badge: badge("已失效", "warn"), hint: reconnectHint, chips: null };
	}
	if (deviceAccess.mode === "all") {
		return { badge: badge("全部电脑"), hint: null, chips: null };
	}
	const matched = me.devices.filter((device) => deviceAccess.deviceIds.includes(device.id));
	if (!matched.length) {
		return { badge: badge("未选择电脑", "warn"), hint: null, chips: null };
	}
	return { badge: null, hint: null, chips: el("div", { className: "row-devices" }, ...matched.map(deviceChip)) };
}

function updateAccessState() {
	const all = $("access-form").elements.allDevices.checked;
	const count = selectedDevices($("access-form")).length;
	$("access-selected").hidden = all;
	$("access-save").disabled = !all && count === 0;
	$("access-count").textContent = me?.devices.length ? (count ? "已选 " + count + " 台" : "请至少选择 1 台") : "暂无电脑";
	syncChoiceToggle($("access-devices"), $("access-toggle"));
}

function editAccessButton(connectorId, name, deviceAccess) {
	if (deviceAccess === null) return null;
	const node = el("button", { type: "button", className: "btn small", textContent: "选择电脑" });
	node.onclick = () => {
		$("access-form").dataset.connectorId = connectorId;
		$("access-form").elements.allDevices.checked = deviceAccess.mode === "all";
		$("access-name").textContent = name;
		showDeviceChoices($("access-devices"), $("access-toggle"), deviceAccess.deviceIds);
		updateAccessState();
		openModal("modal-access");
	};
	return node;
}

function renderApps() {
	const rows = me.apps.map((app) => {
		const scope = deviceScope(app.deviceAccess, "请在客户端重新授权");
		const origin = app.clientDomain ? "来自 " + app.clientDomain : app.redirectHost + "（未验证）";
		return row({
			lead: el("span", { className: "icon", textContent: initial(app.clientName) }),
			title: app.clientName,
			badges: [scope.badge],
			meta: [origin, formatDate(app.createdAt) + "授权", scope.hint].filter(Boolean).join(" · "),
			extra: scope.chips,
			status: app.lastUsedAt ? ago(app.lastUsedAt) + "使用" : "尚未使用",
			actions: [editAccessButton(app.connectorId, app.clientName, app.deviceAccess), button("撤销", "", async () => {
				if (!await confirmDialog({
					title: "撤销「" + app.clientName + "」的授权？",
					message: "撤销后它将无法访问你的电脑，如需继续使用请重新授权。",
					confirmText: "撤销", danger: true,
				})) return;
				await api("me/apps/" + encodeURIComponent(app.id) + "/revoke", {});
				toast("已撤销");
			})],
		});
	});
	$("apps").replaceChildren(...(rows.length ? rows
		: [el("div", { className: "empty", textContent: "暂无已授权的应用，按上方步骤添加后会显示在这里。" })]));
}

function renderUrlKeys() {
	const checked = selectedDevices($("url-key-form"));
	showDeviceChoices($("url-key-devices"), $("url-key-toggle"), checked);
	updateUrlKeyButton();
	const keys = me.keys.filter((key) => key.scopes.includes("connector"));
	$("url-keys").hidden = keys.length === 0;
	$("url-keys").replaceChildren(...(keys.length ? [
		el("div", { className: "list-head", textContent: "已创建的地址" }),
		...keys.map((key) => {
			const scope = deviceScope(key.deviceAccess, "请重新生成地址");
			return row({
				title: key.name,
				badges: [scope.badge],
				meta: [key.hint ? "密钥 …" + key.hint : null, formatDate(key.createdAt) + "创建", scope.hint].filter(Boolean).join(" · "),
				extra: scope.chips,
				status: key.lastUsedAt ? ago(key.lastUsedAt) + "使用" : "尚未使用",
				actions: [editAccessButton(key.id, key.name, key.deviceAccess), button("删除", "danger", async () => {
					if (!await confirmDialog({
						title: "删除「" + key.name + "」？",
						message: isLegacy(key)
							? "删除后，使用这个密钥的客户端和电脑都会断开。"
							: "删除后，使用该地址的客户端将无法再连接。",
						confirmText: "删除", danger: true,
					})) return;
					await api("me/keys/" + key.id + "/revoke", {});
					toast("已删除");
				})],
			});
		}),
	] : []));
	if (keys.length) $("url-keys-section").open = true;
}

// ---------- 我的电脑 ----------

function removeWarning(device, key) {
	const others = device.keyId
		? me.devices.filter((d) => d.id !== device.id && d.keyId === device.keyId).map((d) => d.name)
		: [];
	const also = others.length ? "，" + others.join("、") + " 也会断开" : "";
	if (!key) return "该电脑密钥已失效，仅从列表中移除。";
	if (isLegacy(key)) {
		return "移除会同时吊销旧密钥" + also + "。";
	}
	return "移除后这台电脑会立即断开" + also + "，如需再用重新添加即可。";
}

function renderDevices() {
	const keys = new Map(me.keys.map((key) => [key.id, key]));
	const rows = me.devices.map((device) => {
		const key = keys.get(device.keyId);
		const delegation = el("input", { type: "checkbox", checked: device.delegationEnabled });
		delegation.setAttribute("role", "switch");
		delegation.onchange = () => act(delegation, async () => {
			try {
				await api("me/devices/" + device.id + "/delegation", { enabled: delegation.checked });
				toast(delegation.checked ? "已开启 Pi 委派" : "已关闭 Pi 委派");
			} catch (error) {
				delegation.checked = device.delegationEnabled;
				throw error;
			}
		});
		const delegationLabel = el("label", { className: "switch" }, el("span", { textContent: "Pi 委派" }), delegation);
		delegationLabel.dataset.tip = "允许将任务委派给本机 Pi 模型执行";
		const details = [platformName(device.platform), device.version && "pi-bridge " + device.version,
			key && (key.hint ? "密钥 …" + key.hint : key.name)].filter(Boolean).join(" · ");
		return row({
			lead: el("span", { className: "dot" + (device.online ? " on" : "") }),
			title: device.name,
			badges: [
				key && isLegacy(key) && badge("旧密钥", "warn"),
				device.keyId && !key && badge("密钥已吊销"),
			],
			meta: [
				el("span", { className: device.online ? "status-on" : "", textContent: device.online ? "在线" : ago(device.lastSeen) + "在线" }),
				details && " · " + details,
			],
			actions: [
				delegationLabel,
				el("span", { className: "row-divider" }),
				button("移除", "", async () => {
				if (!await confirmDialog({
					title: "移除「" + device.name + "」？",
					message: removeWarning(device, key),
					confirmText: "移除", danger: true,
				})) return;
				await api("me/devices/" + device.id + "/remove", {});
				toast("已移除");
			})],
		});
	});
	const used = new Set(me.devices.map((device) => device.keyId));
	for (const key of me.keys.filter((key) => only(key, "device") && !used.has(key.id))) {
		rows.push(row({
			lead: el("span", { className: "dot wait" }),
			title: key.name,
			badges: [badge("等待连接")],
			meta: formatTime(key.createdAt) + " 创建 · 密钥 …" + key.hint,
			actions: [button("取消", "", async () => {
				if (!await confirmDialog({
					title: "取消添加「" + key.name + "」？",
					message: "已生成的登录命令将会失效。",
					confirmText: "取消添加", cancelText: "保留", danger: true,
				})) return;
				await api("me/keys/" + key.id + "/revoke", {});
			})],
		}));
	}
	$("devices").replaceChildren(...(rows.length ? rows
		: [el("div", { className: "empty", textContent: "还没有电脑。点击右上角「添加电脑」开始连接。" })]));
}

function renderLegacy() {
	const legacy = me.keys.filter(isLegacy);
	let hidden = false;
	try { hidden = sessionStorage.getItem("hideLegacy") === "1"; } catch {}
	$("legacy").hidden = legacy.length === 0 || hidden;
}

async function load() {
	me = await api("me");
	if (me.user.mustChangePassword) {
		show("first");
		return;
	}
	if (next) {
		location.replace(next);
		return;
	}
	const { user } = me;
	$("whoami").textContent = user.name === user.username ? user.username : user.name + " · " + user.username;
	renderLegacy();
	renderApps();
	renderUrlKeys();
	renderDevices();
	show("account");
}

// ---------- 事件 ----------

$("connector-url").replaceChildren(el("code", { textContent: location.origin + "/mcp" }), copyButton(location.origin + "/mcp", "btn primary"));

for (const tab of document.querySelectorAll("[data-tab]")) {
	tab.onclick = () => {
		for (const t of document.querySelectorAll("[data-tab]")) t.classList.toggle("on", t === tab);
		for (const panel of document.querySelectorAll("[data-panel]")) panel.hidden = panel.dataset.panel !== tab.dataset.tab;
	};
}

$("login-form").onsubmit = async (event) => {
	event.preventDefault();
	const submit = event.submitter;
	submit.disabled = true;
	try {
		await api("login", { username: $("username").value, password: $("password").value });
		location.replace(next || "/account");
	} catch (error) {
		toast(error.message, true);
		submit.disabled = false;
	}
};

for (const form of document.querySelectorAll(".password-form")) {
	form.onsubmit = (event) => {
		event.preventDefault();
		const { current, next: newPassword, confirm: again } = form.elements;
		if (newPassword.value !== again.value) {
			toast("两次输入的新密码不一致", true);
			return;
		}
		act(event.submitter, async () => {
			await api("me/password", { current: current.value, next: newPassword.value });
			form.reset();
			if (form.id === "password-form") closeModal("modal-password");
			toast("密码已修改");
		});
	};
}

for (const logout of document.querySelectorAll(".logout")) {
	logout.onclick = async () => {
		await api("logout", {}).catch(() => {});
		location.replace("/login");
	};
}

$("open-password").onclick = () => openModal("modal-password");

$("hide-legacy").onclick = () => {
	try { sessionStorage.setItem("hideLegacy", "1"); } catch {}
	$("legacy").hidden = true;
};

$("revoke-legacy").onclick = (event) => act(event.currentTarget, async () => {
	const legacy = me.keys.filter(isLegacy);
	const names = me.devices.filter((d) => legacy.some((key) => key.id === d.keyId)).map((d) => d.name);
	if (!await confirmDialog({
		title: "吊销旧密钥？",
		message: names.length ? names.join("、") + " 会断开，需要重新添加。" : "吊销后，这个密钥无法再连接电脑。",
		confirmText: "吊销", danger: true,
	})) return;
	for (const key of legacy) await api("me/keys/" + key.id + "/revoke", {});
	toast("已吊销旧密钥");
});

function updateUrlKeyButton() {
	const all = $("url-key-form").elements.allDevices.checked;
	$("url-key-selected").hidden = all;
	$("url-key-create").disabled = !$("url-key-ack").checked || (!all && selectedDevices($("url-key-form")).length === 0);
	syncChoiceToggle($("url-key-devices"), $("url-key-toggle"));
}

bindChoiceToggle($("access-devices"), $("access-toggle"), updateAccessState);
bindChoiceToggle($("url-key-devices"), $("url-key-toggle"), updateUrlKeyButton);

$("access-form").onchange = updateAccessState;
$("access-form").onsubmit = (event) => {
	event.preventDefault();
	const form = event.currentTarget;
	const access = accessChoice(form);
	act(event.submitter, async () => {
		await api("me/connectors/" + form.dataset.connectorId + "/devices", access);
		$("modal-access").close();
		toast("已保存");
	});
};

$("url-key-form").onchange = updateUrlKeyButton;
$("url-key-form").onsubmit = (event) => {
	event.preventDefault();
	const access = accessChoice(event.currentTarget);
	act(event.submitter, async () => {
		const { key, token } = await api("me/keys", { name: $("url-key-name").value, type: "connector", ...access });
		$("url-key-form").reset();
		$("secret-title").textContent = "已生成「" + key.name + "」的地址";
		$("secret-body").replaceChildren(copyRow(location.origin + "/" + token + "/mcp"));
		openModal("modal-secret");
	}).finally(updateUrlKeyButton);
};

// 添加电脑：生成命令后每 3 秒检查一次这台电脑是否已连接
$("open-add").onclick = () => {
	$("add-form").hidden = false;
	$("add-form").reset();
	$("add-commands").hidden = true;
	openModal("modal-add");
};

function shellQuote(text) {
	return /^[A-Za-z0-9._-]+$/.test(text) ? text : '"' + text.replace(/["\\\\$\`]/g, "") + '"';
}

function setWaiting(device) {
	$("add-waiting").className = "waiting" + (device ? " done" : "");
	$("add-waiting").replaceChildren(
		el("span", { className: "dot " + (device ? "on" : "wait") }),
		el("span", { textContent: device ? "已连接：" + device.name : "等待电脑连接…" }),
	);
	$("add-done").className = "btn" + (device ? " primary" : "");
}

$("add-form").onsubmit = async (event) => {
	event.preventDefault();
	const submit = event.submitter;
	submit.disabled = true;
	try {
		const name = $("add-name").value.trim();
		const { key, token } = await api("me/keys", { name, type: "device" });
		const commands = [
			["安装（已安装可跳过）", "npm install -g @zgccrui/pi-bridge"],
			["登录", "pi-bridge login " + location.origin + " " + token + (name ? " --name " + shellQuote(name) : "")],
			["启动", "pi-bridge start",
				el("p", { className: "note" }, "如需开机自启，改用 ", el("code", { textContent: "pi-bridge service install" }))],
		];
		$("add-steps").replaceChildren(...commands.map(([label, command, note]) =>
			el("li", {}, el("div", {}, el("span", { className: "label", textContent: label }), copyRow(command, true), note))));
		setWaiting(null);
		$("add-form").hidden = true;
		$("add-commands").hidden = false;
		clearInterval(pollTimer);
		pollTimer = setInterval(async () => {
			const latest = await api("me").catch(() => null);
			const device = latest?.devices.find((d) => d.keyId === key.id && d.online);
			if (device) {
				clearInterval(pollTimer);
				setWaiting(device);
			}
		}, 3000);
	} catch (error) {
		toast(error.message, true);
	} finally {
		submit.disabled = false;
	}
};

$("modal-add").addEventListener("close", () => {
	clearInterval(pollTimer);
	load().catch((error) => toast(error.message, true));
});

if (isLoginPage) {
	$("login-context").hidden = !next.startsWith("/authorize");
	// 已经登录时直接跳转
	fetch("/api/me").then((res) => {
		if (res.ok) location.replace(next || "/account");
		else show("login");
	}, () => show("login"));
} else {
	load().catch((error) => toast(error.message, true));
}
</script>
</body>
</html>
`;

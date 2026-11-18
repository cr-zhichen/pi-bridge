import { BRAND, PAGE_HEAD, PAGE_SCRIPT } from "./page.ts";

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
</head>
<body>

<div id="view-login" class="center" hidden>
	<div class="auth">
		<form id="login-form" class="card">
			${BRAND}
			<div id="login-context" class="context" hidden>登录后继续授权连接器</div>
			<h1>登录</h1>
			<p class="lead">使用管理员为你创建的账号</p>
			<div class="field"><span class="label">用户名</span><input class="input" id="username" autocomplete="username" autocapitalize="none" spellcheck="false" required></div>
			<div class="field"><span class="label">密码</span><input class="input" id="password" type="password" autocomplete="current-password" required></div>
			<div class="field" style="margin-top:20px"><button class="btn primary wide">登录</button></div>
		</form>
		<p class="foot">账号由管理员创建。忘记密码请联系管理员重置。</p>
	</div>
</div>

<div id="view-first" class="center" hidden>
	<div class="auth">
		<form id="first-form" class="card password-form">
			${BRAND}
			<h1>设置新密码</h1>
			<p class="lead">当前是管理员生成的初始密码，修改后才能继续使用。</p>${PASSWORD_FIELDS}
			<div class="field" style="margin-top:20px"><button class="btn primary wide">保存并继续</button></div>
		</form>
		<p class="foot"><button class="link logout">退出登录</button></p>
	</div>
</div>

<div id="view-account" hidden>
	<header class="top">
		${BRAND}
		<div class="user">
			<span id="whoami" class="name"></span>
			<button class="link" id="open-password">修改密码</button>
			<button class="link logout">退出</button>
		</div>
	</header>

	<main class="container">
		<div id="legacy" class="banner" hidden>
			<span class="mark">!</span>
			<div>
				<strong>你还在使用升级前的旧密钥</strong>
				<p>旧密钥既能连接电脑，又能当作连接器地址，一旦泄露会影响所有电脑。建议更换：网页版改用下面的 OAuth 连接器，每台电脑重新添加一次，都换完后吊销旧密钥。</p>
				<div class="actions"><button class="btn small" id="revoke-legacy">吊销旧密钥</button><button class="link" id="hide-legacy">稍后提醒</button></div>
			</div>
		</div>

		<section class="block">
			<div class="block-head">
				<div>
					<h2>连接网页版 AI</h2>
					<p class="sub">在 Claude 或 ChatGPT 中添加连接器，登录并授权后即可使用你的电脑。</p>
				</div>
			</div>
			<div class="card">
				<span class="label">连接器地址</span>
				<div class="copy hero" id="connector-url"></div>
				<p class="note">地址里不含密钥，每个人的都一样。添加时会跳转到这里登录，确认后才能使用。</p>
				<div class="tabs" role="tablist">
					<button class="tab on" data-tab="claude" role="tab">Claude</button>
					<button class="tab" data-tab="chatgpt" role="tab">ChatGPT</button>
				</div>
				<ol class="steps" data-panel="claude">
					<li><div>在侧边栏打开 <span class="ui">插件 → 连接器</span>，点击 <span class="ui">添加自定义连接器</span></div></li>
					<li><div>粘贴上面的地址。身份验证选 <span class="ui">立即登录</span>，OAuth 客户端保持默认的 <span class="ui">使用 Claude 的已发布身份</span></div></li>
					<li><div>点击 <span class="ui">添加</span>，在弹出的页面登录 pi-bridge 并允许访问</div></li>
				</ol>
				<ol class="steps" data-panel="chatgpt" hidden>
					<li><div>在侧边栏打开 <span class="ui">插件</span>，点击 <span class="ui">添加自定义 MCP 服务器</span></div></li>
					<li><div>名称填 pi-bridge，连接选 <span class="ui">服务器 URL</span> 并粘贴上面的地址，身份验证选 <span class="ui">OAuth</span></div></li>
					<li><div>勾选 <span class="ui">我已了解，并希望继续</span>，点击 <span class="ui">创建为插件</span>，在弹出的页面登录 pi-bridge 并允许访问</div></li>
				</ol>
			</div>

			<div class="card list">
				<div class="list-head">已授权的应用</div>
				<div id="apps"></div>
			</div>

			<details class="advanced" id="url-keys-section">
				<summary>客户端不支持 OAuth？使用带密钥的地址</summary>
				<div class="advanced-body">
					<div class="risk"><strong>带密钥的地址等同于密码。</strong>拿到它就能在你所有在线的电脑上执行命令，不经过登录和授权确认，而且容易随截图、浏览器历史泄露。只在客户端确实不支持 OAuth 时使用。</div>
					<div class="card list" id="url-keys" style="box-shadow:none" hidden></div>
					<form id="url-key-form" class="inline-form">
						<input class="input" id="url-key-name" placeholder="用在哪里，例如：公司内部工具" maxlength="64" autocomplete="off" required>
						<button class="btn" id="url-key-create" disabled>生成带密钥的地址</button>
					</form>
					<label class="check"><input type="checkbox" id="url-key-ack">我了解这个地址等同于密码，并确认我使用的客户端不支持 OAuth</label>
				</div>
			</details>
		</section>

		<section class="block">
			<div class="block-head">
				<div>
					<h2>我的电脑</h2>
					<p class="sub">每台电脑用自己的密钥登录，丢失或不再使用时，只移除那一台。</p>
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
			<div><h3 id="add-title">添加电脑</h3><p class="sub">为这台电脑生成专用的登录命令。需要先安装 Pi 和 Node.js 22.19 以上。</p></div>
			<button type="button" class="link" data-close>关闭</button>
		</div>
		<form id="add-form">
			<span class="label">电脑名称</span>
			<input class="input" id="add-name" placeholder="例如 MacBook Pro" maxlength="64" autocomplete="off" required>
			<p class="note">网页版 AI 在你有多台电脑在线时按这个名称选择。</p>
			<div class="modal-foot"><span></span><button class="btn primary">生成登录命令</button></div>
		</form>
		<div id="add-commands" hidden>
			<ol class="steps" id="add-steps"></ol>
			<p class="note">命令里的密钥只显示这一次。关闭后如果还没登录，在列表里取消这台电脑再重新添加即可。</p>
			<div class="modal-foot">
				<span class="waiting" id="add-waiting"><span class="dot wait"></span><span>等待这台电脑连接…</span></span>
				<button type="button" class="btn" id="add-done" data-close>完成</button>
			</div>
		</div>
	</div>
</dialog>

<dialog class="modal narrow" id="modal-password" aria-labelledby="password-title">
	<form class="modal-body password-form" id="password-form">
		<div class="modal-head"><h3 id="password-title">修改密码</h3><button type="button" class="link" data-close>关闭</button></div>${PASSWORD_FIELDS}
		<div class="modal-foot"><span class="sub" style="margin:0">其他设备上的登录会失效</span><button class="btn primary">保存</button></div>
	</form>
</dialog>

<dialog class="modal" id="modal-secret" aria-labelledby="secret-title">
	<div class="modal-body">
		<div class="modal-head">
			<div><h3 id="secret-title"></h3><p class="sub">地址里的密钥只显示这一次，请立即复制。</p></div>
			<button type="button" class="link" data-close>关闭</button>
		</div>
		<div id="secret-body"></div>
		<p class="note">添加到客户端时，身份验证选择「无需登录」或「无」。</p>
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

function row({ lead, title, badges = [], meta, status, statusOn, actions = [] }) {
	return el("div", { className: "row" },
		lead,
		el("div", { className: "row-main" },
			el("div", { className: "row-title" }, el("span", { textContent: title }), ...badges.filter(Boolean)),
			meta ? el("div", { className: "row-meta", textContent: meta }) : null),
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

function renderApps() {
	const rows = me.apps.map((app) => row({
		lead: el("span", { className: "icon", textContent: initial(app.clientName) }),
		title: app.clientName,
		meta: (app.clientDomain ? "来自 " + app.clientDomain : "返回地址 " + app.redirectHost + " · 名称未经验证") + " · " + formatDate(app.createdAt) + "授权",
		status: app.lastUsedAt ? ago(app.lastUsedAt) + "使用" : "尚未使用",
		actions: [button("撤销", "", async () => {
			if (!await confirmDialog({
				title: "撤销「" + app.clientName + "」的授权？",
				message: "它将无法再使用你的电脑。要继续使用，需要在客户端里重新连接并授权。",
				confirmText: "撤销", danger: true,
			})) return;
			await api("me/apps/" + encodeURIComponent(app.id) + "/revoke", {});
			toast("已撤销");
		})],
	}));
	$("apps").replaceChildren(...(rows.length ? rows
		: [el("div", { className: "empty", textContent: "还没有授权的应用。按上面的步骤添加连接器后会显示在这里。" })]));
}

function renderUrlKeys() {
	const keys = me.keys.filter((key) => only(key, "connector"));
	$("url-keys").hidden = keys.length === 0;
	$("url-keys").replaceChildren(...keys.map((key) => row({
		title: key.name,
		meta: "密钥 …" + key.hint + " · " + formatDate(key.createdAt) + "创建",
		status: key.lastUsedAt ? ago(key.lastUsedAt) + "使用" : "尚未使用",
		actions: [button("吊销", "danger", async () => {
			if (!await confirmDialog({
				title: "吊销「" + key.name + "」？",
				message: "使用这个地址的客户端将无法再调用。",
				confirmText: "吊销", danger: true,
			})) return;
			await api("me/keys/" + key.id + "/revoke", {});
			toast("已吊销");
		})],
	})));
	if (keys.length) $("url-keys-section").open = true;
}

// ---------- 我的电脑 ----------

function removeWarning(device, key) {
	const others = device.keyId
		? me.devices.filter((d) => d.id !== device.id && d.keyId === device.keyId).map((d) => d.name)
		: [];
	const also = others.length ? "，" + others.join("、") + " 也会断开" : "";
	if (!key) return "它的密钥已经吊销，只从列表中移除。";
	if (isLegacy(key)) {
		return "它用的是迁移的旧密钥，移除会同时吊销旧密钥" + also + "，使用旧密钥的连接器地址也会失效。";
	}
	return "这台电脑会立即断开，它的密钥同时作废" + also + "。以后要再用，重新添加即可。";
}

function renderDevices() {
	const keys = new Map(me.keys.map((key) => [key.id, key]));
	const rows = me.devices.map((device) => {
		const key = keys.get(device.keyId);
		return row({
			lead: el("span", { className: "dot" + (device.online ? " on" : "") }),
			title: device.name,
			badges: [
				key && isLegacy(key) && badge("旧密钥", "warn"),
				device.keyId && !key && badge("密钥已吊销"),
			],
			meta: [platformName(device.platform), device.version && "pi-bridge " + device.version,
				key && (key.hint ? "密钥 …" + key.hint : key.name)].filter(Boolean).join(" · "),
			status: device.online ? "在线" : ago(device.lastSeen) + "在线",
			statusOn: device.online,
			actions: [button("移除", "", async () => {
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
			badges: [badge("等待首次连接")],
			meta: formatTime(key.createdAt) + " 生成登录命令 · 密钥 …" + key.hint,
			actions: [button("取消", "", async () => {
				if (!await confirmDialog({
					title: "取消添加「" + key.name + "」？",
					message: "之前生成的登录命令会作废。",
					confirmText: "取消添加", cancelText: "保留", danger: true,
				})) return;
				await api("me/keys/" + key.id + "/revoke", {});
			})],
		}));
	}
	$("devices").replaceChildren(...(rows.length ? rows
		: [el("div", { className: "empty", textContent: "还没有电脑。点击「添加电脑」，在要使用的电脑上运行生成的命令。" })]));
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
		message: (names.length ? names.join("、") + " 会断开，需要重新添加。" : "") + "使用旧密钥的连接器地址也会失效。",
		confirmText: "吊销", danger: true,
	})) return;
	for (const key of legacy) await api("me/keys/" + key.id + "/revoke", {});
	toast("已吊销旧密钥");
});

// 带密钥的地址：必须先确认风险
$("url-key-ack").onchange = (event) => { $("url-key-create").disabled = !event.target.checked; };
$("url-key-form").onsubmit = (event) => {
	event.preventDefault();
	if (!$("url-key-ack").checked) return;
	act(event.submitter, async () => {
		const { key, token } = await api("me/keys", { name: $("url-key-name").value, type: "connector" });
		$("url-key-name").value = "";
		$("url-key-ack").checked = false;
		$("url-key-create").disabled = true;
		$("secret-title").textContent = "已生成「" + key.name + "」的地址";
		$("secret-body").replaceChildren(copyRow(location.origin + "/" + token + "/mcp"));
		openModal("modal-secret");
	});
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
		el("span", { textContent: device ? "已连接：" + device.name : "等待这台电脑连接…" }),
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
			["登录", "pi-bridge login " + location.origin + " " + token + " --name " + shellQuote(name)],
			["开机后自动运行", "pi-bridge service install"],
		];
		$("add-steps").replaceChildren(...commands.map(([label, command]) =>
			el("li", {}, el("div", {}, el("span", { className: "label", textContent: label }), copyRow(command, true)))));
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

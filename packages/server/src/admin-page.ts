export const ADMIN_PAGE = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>pi-bridge 管理</title>
<style>
	:root {
		color-scheme: light dark;
		--bg: #f6f7f9;
		--card: #ffffff;
		--text: #1d2129;
		--muted: #6b7280;
		--border: #e5e7eb;
		--subtle: #f3f4f6;
		--accent: #4f46e5;
		--accent-text: #ffffff;
		--danger: #dc2626;
		--online: #16a34a;
		--shadow: 0 1px 2px rgb(0 0 0 / 0.04), 0 4px 16px rgb(0 0 0 / 0.04);
		font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Segoe UI", system-ui, sans-serif;
		font-size: 14px;
		line-height: 1.55;
	}
	@media (prefers-color-scheme: dark) {
		:root {
			--bg: #0f1115;
			--card: #171a21;
			--text: #e6e8ec;
			--muted: #8b919c;
			--border: #262b35;
			--subtle: #1f232c;
			--accent: #818cf8;
			--accent-text: #0f1115;
			--danger: #f87171;
			--online: #4ade80;
			--shadow: none;
		}
	}
	* { box-sizing: border-box; }
	body { margin: 0; background: var(--bg); color: var(--text); }
	[hidden] { display: none !important; }

	.login { min-height: 100vh; display: grid; place-items: center; padding: 24px; }
	.login .card { width: 100%; max-width: 360px; padding: 32px 28px; }
	.brand { display: flex; align-items: center; gap: 10px; font-weight: 600; font-size: 16px; }
	.logo { width: 28px; height: 28px; border-radius: 8px; background: var(--accent); color: var(--accent-text);
		display: grid; place-items: center; font-size: 15px; font-weight: 700; }
	.login .brand { margin-bottom: 6px; }
	.login p { margin: 0 0 20px; color: var(--muted); }
	.login form { display: grid; gap: 12px; }

	.wrap { max-width: 920px; margin: 0 auto; padding: 32px 20px 64px; }
	header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; }
	.card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; box-shadow: var(--shadow); }
	.section { padding: 20px; margin-bottom: 16px; }
	h2 { font-size: 14px; font-weight: 600; margin: 0 0 12px; }

	input { width: 100%; padding: 9px 12px; font: inherit; color: inherit; background: var(--card);
		border: 1px solid var(--border); border-radius: 8px; outline: none; transition: border-color .15s, box-shadow .15s; }
	input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 20%, transparent); }
	button { font: inherit; padding: 8px 14px; border-radius: 8px; border: 1px solid var(--border);
		background: var(--card); color: inherit; cursor: pointer; white-space: nowrap; transition: background .15s, opacity .15s; }
	button:hover { background: var(--subtle); }
	button:disabled { opacity: .6; cursor: default; }
	button.primary { background: var(--accent); border-color: var(--accent); color: var(--accent-text); font-weight: 500; }
	button.primary:hover { opacity: .9; }
	button.danger { color: var(--danger); }
	button.small { padding: 4px 10px; font-size: 13px; }
	button.ghost { border-color: transparent; background: transparent; color: var(--muted); }
	button.ghost:hover { background: var(--subtle); color: var(--text); }

	.create { display: flex; gap: 8px; }

	.secret { padding: 20px; margin-bottom: 16px; border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
		background: color-mix(in srgb, var(--accent) 6%, var(--card)); }
	.secret-head { display: flex; justify-content: space-between; align-items: start; gap: 12px; margin-bottom: 12px; }
	.secret-head strong { display: block; }
	.secret-head span { color: var(--muted); font-size: 13px; }
	.field { margin-top: 10px; }
	.field label { display: block; color: var(--muted); font-size: 13px; margin-bottom: 4px; }
	.copy-row { display: flex; gap: 8px; align-items: stretch; }
	.copy-row code { flex: 1; min-width: 0; padding: 8px 10px; border-radius: 8px; background: var(--card);
		border: 1px solid var(--border); font: 13px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;
		word-break: break-all; user-select: all; }

	table { width: 100%; border-collapse: collapse; }
	th { text-align: left; font-weight: 500; color: var(--muted); font-size: 13px; padding: 10px 20px;
		border-bottom: 1px solid var(--border); }
	td { padding: 14px 20px; border-bottom: 1px solid var(--border); vertical-align: top; }
	tr:last-child td { border-bottom: none; }
	.name { font-weight: 500; }
	.badge { display: inline-block; margin-left: 8px; padding: 1px 8px; border-radius: 999px; font-size: 12px;
		background: var(--subtle); color: var(--muted); font-weight: 400; }
	.device { display: flex; align-items: center; gap: 8px; }
	.device + .device { margin-top: 4px; }
	.dot { width: 8px; height: 8px; border-radius: 50%; background: var(--border); flex: none; }
	.dot.on { background: var(--online); box-shadow: 0 0 0 3px color-mix(in srgb, var(--online) 20%, transparent); }
	.muted { color: var(--muted); }
	.meta { color: var(--muted); font-size: 12px; }
	.actions { text-align: right; white-space: nowrap; }
	.actions button + button { margin-left: 6px; }
	.empty { padding: 40px 20px; text-align: center; color: var(--muted); }
	tr.disabled .name, tr.disabled .device { opacity: .55; }

	.toast { position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); padding: 10px 16px;
		border-radius: 8px; background: var(--text); color: var(--bg); box-shadow: var(--shadow); font-size: 13px; }
	.toast.error { background: var(--danger); color: #fff; }

	@media (max-width: 640px) {
		th:nth-child(3), td:nth-child(3) { display: none; }
		th, td { padding: 12px; }
		.actions button { display: block; width: 100%; }
		.actions button + button { margin: 6px 0 0; }
	}
</style>
</head>
<body>

<div id="login" class="login">
	<div class="card">
		<div class="brand"><div class="logo">π</div>pi-bridge</div>
		<p>使用管理员密钥登录</p>
		<form id="login-form">
			<input id="key" type="password" placeholder="管理员密钥" autocomplete="current-password" required autofocus>
			<button class="primary">登录</button>
		</form>
	</div>
</div>

<div id="app" class="wrap" hidden>
	<header>
		<div class="brand"><div class="logo">π</div>pi-bridge 管理</div>
		<button id="logout" class="ghost small">退出登录</button>
	</header>

	<section class="card section">
		<h2>创建用户</h2>
		<form id="create" class="create">
			<input id="name" placeholder="用户名称，例如张三" required>
			<button class="primary">创建用户</button>
		</form>
	</section>

	<section id="secret" class="card secret" hidden></section>

	<section class="card">
		<table>
			<thead><tr><th>用户</th><th>设备</th><th>创建时间</th><th></th></tr></thead>
			<tbody id="users"></tbody>
		</table>
		<div id="empty" class="empty" hidden>还没有用户</div>
	</section>
</div>

<div id="toast" class="toast" hidden></div>

<script>
const $ = (id) => document.getElementById(id);
let adminKey = sessionStorage.getItem("adminKey") ?? "";
let toastTimer;

async function api(path, body) {
	const res = await fetch("/admin/api/" + path, {
		method: body === undefined ? "GET" : "POST",
		headers: { Authorization: "Bearer " + adminKey, "Content-Type": "application/json" },
		body: body === undefined ? undefined : JSON.stringify(body),
	});
	const data = await res.json();
	if (!res.ok) {
		if (res.status === 401) logout();
		throw new Error(data.error ?? "请求失败，请稍后重试");
	}
	return data;
}

function el(tag, props = {}, ...children) {
	const node = Object.assign(document.createElement(tag), props);
	node.append(...children);
	return node;
}

function toast(message, isError) {
	const node = $("toast");
	node.textContent = message;
	node.className = "toast" + (isError ? " error" : "");
	node.hidden = false;
	clearTimeout(toastTimer);
	toastTimer = setTimeout(() => { node.hidden = true; }, 2500);
}

function logout() {
	sessionStorage.removeItem("adminKey");
	adminKey = "";
	$("login").hidden = false;
	$("app").hidden = true;
	$("key").value = "";
}

function copyRow(text) {
	const button = el("button", { className: "small", textContent: "复制" });
	button.onclick = async () => {
		await navigator.clipboard.writeText(text);
		toast("已复制");
	};
	return el("div", { className: "copy-row" }, el("code", { textContent: text }), button);
}

function showSecret(name, token) {
	const origin = location.origin;
	const close = el("button", { className: "ghost small", textContent: "关闭" });
	close.onclick = () => { $("secret").hidden = true; };
	$("secret").replaceChildren(
		el("div", { className: "secret-head" },
			el("div", {},
				el("strong", { textContent: name + " 的新密钥" }),
				el("span", { textContent: "密钥只显示这一次，请立即复制给使用者" })),
			close),
		el("div", { className: "field" }, el("label", { textContent: "在电脑上运行" }),
			copyRow("pi-bridge login " + origin + " " + token)),
		el("div", { className: "field" }, el("label", { textContent: "网页版连接器地址" }),
			copyRow(origin + "/" + token + "/mcp")),
	);
	$("secret").hidden = false;
}

function formatTime(ms) {
	return new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function deviceList(devices) {
	if (devices.length === 0) {
		return el("span", { className: "muted", textContent: "尚未连接" });
	}
	return el("div", {}, ...devices.map((d) => el("div", { className: "device" },
		el("span", { className: "dot" + (d.online ? " on" : "") }),
		el("span", { textContent: d.name }),
		el("span", { className: "meta", textContent: d.online ? "在线" : "最后在线 " + formatTime(d.lastSeen) }),
	)));
}

async function load() {
	const users = await api("users");
	$("empty").hidden = users.length > 0;
	$("users").replaceChildren(...users.map((user) => {
		const toggle = el("button", { className: "small", textContent: user.disabled ? "启用" : "禁用" });
		toggle.onclick = () => act(toggle, async () => {
			if (!user.disabled && !confirm("禁用后，" + user.name + " 的电脑会断开连接，网页版也无法再调用。")) return;
			await api("users/" + user.id + "/" + (user.disabled ? "enable" : "disable"), {});
			toast(user.disabled ? "已启用" : "已禁用");
		});
		const reset = el("button", { className: "small danger", textContent: "重置密钥" });
		reset.onclick = () => act(reset, async () => {
			if (!confirm("重置后旧密钥立即失效，" + user.name + " 需要在电脑上重新登录，并更新网页版的连接器地址。")) return;
			const { token } = await api("users/" + user.id + "/reset-token", {});
			showSecret(user.name, token);
		});
		return el("tr", { className: user.disabled ? "disabled" : "" },
			el("td", {}, el("span", { className: "name", textContent: user.name }),
				user.disabled ? el("span", { className: "badge", textContent: "已禁用" }) : ""),
			el("td", {}, deviceList(user.devices)),
			el("td", { className: "muted", textContent: formatTime(user.createdAt) }),
			el("td", { className: "actions" }, toggle, reset),
		);
	}));
}

async function act(button, fn) {
	button.disabled = true;
	try {
		await fn();
		await load();
	} catch (error) {
		toast(error.message, true);
	} finally {
		button.disabled = false;
	}
}

async function start() {
	try {
		await load();
		sessionStorage.setItem("adminKey", adminKey);
		$("login").hidden = true;
		$("app").hidden = false;
	} catch (error) {
		toast(error.message, true);
	}
}

$("login-form").onsubmit = (event) => {
	event.preventDefault();
	adminKey = $("key").value;
	start();
};

$("create").onsubmit = (event) => {
	event.preventDefault();
	const button = event.submitter;
	act(button, async () => {
		const { user, token } = await api("users", { name: $("name").value });
		$("name").value = "";
		showSecret(user.name, token);
	});
};

$("logout").onclick = logout;

if (adminKey) start();
</script>
</body>
</html>
`;

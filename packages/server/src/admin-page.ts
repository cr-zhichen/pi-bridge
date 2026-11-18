import { BRAND, PAGE_HEAD, PAGE_SCRIPT } from "./page.ts";

export const ADMIN_PAGE = `<!doctype html>
<html lang="zh-CN">
<head>
${PAGE_HEAD}
<title>pi-bridge 管理</title>
</head>
<body>

<div id="view-login" class="center">
	<div class="auth">
		<form id="login-form" class="card">
			${BRAND}
			<h1>管理员登录</h1>
			<p class="lead">使用部署时设置的 ADMIN_KEY</p>
			<div class="field"><span class="label">管理员密钥</span><input class="input" id="key" type="password" autocomplete="current-password" required autofocus></div>
			<div class="field" style="margin-top:20px"><button class="btn primary wide">登录</button></div>
		</form>
	</div>
</div>

<div id="view-app" hidden>
	<header class="top">
		${BRAND}
		<div class="user"><span>管理</span><button class="link" id="logout">退出</button></div>
	</header>
	<main class="container">
		<section class="block">
			<div class="block-head">
				<div>
					<h2>创建用户</h2>
					<p class="sub">创建后生成初始密码。用户登录账号页并修改密码后，自己添加电脑、连接网页版 AI。</p>
				</div>
			</div>
			<form id="create" class="card inline-form">
				<input class="input" id="username" placeholder="用户名，用于登录，例如 zhangsan" autocomplete="off" autocapitalize="none" spellcheck="false" required>
				<input class="input" id="name" placeholder="显示名称（可选），例如张三" autocomplete="off">
				<button class="btn primary">创建用户</button>
			</form>
		</section>

		<section class="block">
			<div class="block-head"><div><h2>用户</h2><p class="sub" id="summary"></p></div></div>
			<div class="card list" id="users"></div>
		</section>
	</main>
</div>

<dialog class="modal" id="modal-secret" aria-labelledby="secret-title">
	<div class="modal-body">
		<div class="modal-head">
			<div><h3 id="secret-title"></h3><p class="sub">密码只显示这一次，请立即发给使用者。首次登录后需要修改密码。</p></div>
			<button type="button" class="link" data-close>关闭</button>
		</div>
		<div id="secret-body"></div>
		<div class="modal-foot"><span></span><button type="button" class="btn" id="copy-all">复制全部</button></div>
	</div>
</dialog>

<div id="toasts" class="toasts" popover="manual"></div>

<script>
${PAGE_SCRIPT}
let adminKey = "";
try { adminKey = sessionStorage.getItem("adminKey") ?? ""; } catch {}
let secretText = "";

async function api(path, body) {
	const res = await fetch("/admin/api/" + path, {
		method: body === undefined ? "GET" : "POST",
		headers: { Authorization: "Bearer " + adminKey, "Content-Type": "application/json" },
		body: body === undefined ? undefined : JSON.stringify(body),
	});
	const data = await res.json().catch(() => ({}));
	if (!res.ok) {
		if (res.status === 401) logout();
		throw new Error(data.error ?? "请求失败，请稍后重试");
	}
	return data;
}

function logout() {
	try { sessionStorage.removeItem("adminKey"); } catch {}
	adminKey = "";
	$("view-login").hidden = false;
	$("view-app").hidden = true;
	$("key").value = "";
}

function showPassword(title, username, password) {
	const loginUrl = location.origin + "/login";
	secretText = "登录地址：" + loginUrl + "\\n用户名：" + username + "\\n初始密码：" + password;
	$("secret-title").textContent = title;
	$("secret-body").replaceChildren(
		field("登录地址", copyRow(loginUrl, true)),
		field("用户名", copyRow(username, true)),
		field("初始密码", copyRow(password, true)),
	);
	openModal("modal-secret");
}

$("copy-all").onclick = async () => {
	await navigator.clipboard.writeText(secretText);
	toast("已复制");
};

function badge(text, kind) {
	return el("span", { className: "badge" + (kind ? " " + kind : ""), textContent: text });
}

function button(text, className, onclick) {
	const node = el("button", { type: "button", className: "btn small " + className, textContent: text });
	node.onclick = () => act(node, onclick);
	return node;
}

function devicesText(devices) {
	if (devices.length === 0) return "还没有电脑";
	return devices.map((d) => d.name + "（" + (d.online ? "在线" : ago(d.lastSeen) + "在线") + "）").join("、");
}

function userRow(user) {
	const online = user.devices.some((d) => d.online);
	const toggle = button(user.disabled ? "启用" : "禁用", "", async () => {
		if (!user.disabled && !await confirmDialog({
			title: "禁用 " + user.name + "？",
			message: "这位用户的电脑会断开，网页版无法再调用，账号页会退出登录。启用后恢复。",
			confirmText: "禁用", danger: true,
		})) return;
		await api("users/" + user.id + "/" + (user.disabled ? "enable" : "disable"), {});
		toast(user.disabled ? "已启用" : "已禁用");
	});
	const account = button(user.username ? "重置密码" : "设置登录账号", "", async () => {
		if (user.username) {
			if (!await confirmDialog({
				title: "重置 " + user.name + " 的密码？",
				message: "旧密码立即失效，账号页会退出登录。电脑和网页版不受影响。",
				confirmText: "重置密码", danger: true,
			})) return;
			const { password } = await api("users/" + user.id + "/reset-password", {});
			showPassword(user.name + " 的新密码", user.username, password);
			return;
		}
		const result = await promptDialog({
			title: "为 " + user.name + " 设置登录账号",
			message: "设置后会生成初始密码。这位用户原来的电脑和连接器不受影响。",
			label: "用户名",
			placeholder: "例如 zhangsan",
			note: "2 到 32 位，只能包含字母、数字和 _ . -",
			confirmText: "生成账号",
			submit: (username) => api("users/" + user.id + "/account", { username }),
		});
		if (!result) return;
		showPassword(user.name + " 的登录账号", result.username, result.password);
	});
	const hasAccess = user.keyCount + user.appCount > 0;
	const revoke = button("吊销全部访问", "danger", async () => {
		if (!await confirmDialog({
			title: "吊销 " + user.name + " 的全部访问？",
			message: "全部 " + user.keyCount + " 个密钥和 " + user.appCount + " 个应用授权都会失效：所有电脑立即断开，网页版连接器也无法再调用。用户需要登录账号页重新添加。",
			confirmText: "吊销全部访问", danger: true,
		})) return;
		await api("users/" + user.id + "/revoke-access", {});
		toast("已吊销");
	});
	revoke.disabled = !hasAccess;

	const meta = [
		user.username ? "用户名 " + user.username : null,
		user.keyCount + " 个密钥",
		user.appCount + " 个应用",
		formatDate(user.createdAt) + "创建",
	].filter(Boolean).join(" · ");

	return el("div", { className: "row" + (user.disabled ? " disabled" : "") },
		el("span", { className: "dot" + (online && !user.disabled ? " on" : "") }),
		el("div", { className: "row-main" },
			el("div", { className: "row-title" },
				el("span", { textContent: user.name }),
				user.disabled && badge("已禁用"),
				!user.username && badge("未设置登录账号", "warn"),
				user.username && user.mustChangePassword && badge("待修改初始密码"),
			),
			el("div", { className: "row-meta", textContent: meta }),
			el("div", { className: "row-meta", textContent: devicesText(user.devices) }),
		),
		el("div", { className: "row-actions" }, toggle, account, revoke),
	);
}

async function load() {
	const users = await api("users");
	const online = users.reduce((n, u) => n + u.devices.filter((d) => d.online).length, 0);
	$("summary").textContent = users.length + " 位用户 · " + online + " 台电脑在线";
	$("users").replaceChildren(...(users.length ? users.map(userRow)
		: [el("div", { className: "empty", textContent: "还没有用户" })]));
}

async function start() {
	try {
		await load();
		try { sessionStorage.setItem("adminKey", adminKey); } catch {}
		$("view-login").hidden = true;
		$("view-app").hidden = false;
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
	act(event.submitter, async () => {
		const { user, password } = await api("users", { username: $("username").value, name: $("name").value });
		$("create").reset();
		showPassword("已创建用户 " + user.name, user.username, password);
	});
};

$("logout").onclick = logout;

if (adminKey) start();
</script>
</body>
</html>
`;

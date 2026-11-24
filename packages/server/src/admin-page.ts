import {
	BRAND,
	PAGE_HEAD,
	PAGE_SCRIPT,
	PROJECT_ICON_LINK,
	PROJECT_TEXT_LINK,
} from "./page.ts";

export function adminPage(emailAvailable: boolean): string {
	const emailUses = emailAvailable ? "登录和找回密码" : "登录";
	return `<!doctype html>
<html lang="zh-CN">
<head>
${PAGE_HEAD}
<title>pi-bridge 管理</title>
<style>
	#users { transition: opacity .15s ease; }
	#users.loading { opacity: .55; pointer-events: none; }
	#users .status-on { color: var(--ok); font-weight: 500; }
	#users-section .block-head { flex-wrap: wrap; }
	.user-search { position: relative; display: flex; align-items: center; width: 260px; max-width: 100%; }
	.user-search-icon { position: absolute; left: 10px; color: var(--muted); pointer-events: none; flex: none; }
	.user-search-input { height: 34px; padding: 0 30px 0 32px; font-size: 13px; }
	.user-search-input::-webkit-search-cancel-button,
	.user-search-input::-webkit-search-decoration { -webkit-appearance: none; appearance: none; }
	.user-search-clear { position: absolute; right: 5px; width: 24px; height: 24px; padding: 0; border: 0;
		border-radius: 5px; background: transparent; color: var(--muted); display: grid; place-items: center;
		cursor: pointer; transition: background-color .14s ease, color .14s ease; }
	.user-search-clear:hover { background: var(--surface-2); color: var(--text); }
	#modal-user-email .modal-head > div { min-width: 0; }
	#user-email-title { overflow-wrap: anywhere; }

	.list-foot { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;
		padding: 12px 20px; border-top: 1px solid var(--border); }
	.page-info { font-size: 12px; color: var(--muted); font-variant-numeric: tabular-nums; white-space: nowrap; }
	.page-nav { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
	.page-controls, .page-numbers { display: flex; align-items: center; gap: 2px; }
	.page-btn { min-width: 28px; height: 28px; padding: 0 7px; display: inline-flex; align-items: center; justify-content: center;
		border-radius: var(--radius-sm); border: 0; background: transparent; color: var(--muted);
		font: inherit; font-size: 12.5px; font-weight: 500; font-variant-numeric: tabular-nums; cursor: pointer;
		transition: background-color .14s ease, color .14s ease, opacity .14s ease; }
	.page-btn:hover:not(:disabled):not(.on) { background: var(--surface-2); color: var(--text); }
	.page-btn.on { background: var(--accent); color: var(--accent-text); cursor: default; }
	.page-btn:disabled { opacity: .3; cursor: not-allowed; }
	.page-btn svg { flex: none; }
	.page-ellipsis { min-width: 22px; height: 28px; display: inline-flex; align-items: center; justify-content: center;
		color: var(--muted); font-size: 12.5px; user-select: none; }
	.page-sep { width: 1px; height: 14px; background: var(--border); flex: none; }
	.page-jump { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--muted); white-space: nowrap; }
	.page-jump-input { width: 44px; height: 28px; padding: 0 6px; text-align: center; font-size: 12.5px; font-variant-numeric: tabular-nums; }
	.page-jump-btn { color: var(--text); }

	@media (prefers-reduced-motion: reduce) {
		#users, .page-btn, .user-search-clear { transition: none; }
	}
	@media (max-width: 640px) {
		.user-search { width: 100%; }
		.list-foot { flex-direction: column; align-items: center; gap: 10px; padding: 12px 16px; }
		.page-nav { width: 100%; justify-content: center; }
		.page-sep { display: none; }
		.page-controls { flex-wrap: wrap; justify-content: center; }
	}
</style>
</head>
<body>

<div id="view-login" class="auth-page">
	<main class="auth">
		<form id="login-form">
			${BRAND}
			<h1>管理员登录</h1>
			<p class="lead">使用部署时设置的 <code>ADMIN_KEY</code></p>
			<div class="field"><label class="label" for="key">管理员密钥</label><input class="input" id="key" type="password" autocomplete="current-password" required autofocus></div>
			<button class="btn primary wide auth-submit">登录</button>
		</form>
	</main>
	<footer class="auth-foot">${PROJECT_TEXT_LINK}</footer>
</div>

<div id="view-app" hidden>
	<header class="top">
		${BRAND}
		<div class="user">
			<span>管理</span>
			<button class="link" id="logout">退出</button>
			${PROJECT_ICON_LINK}
		</div>
	</header>
	<main class="container">
		<section class="block">
			<div class="block-head">
				<div>
					<h2>创建用户</h2>
					<p class="sub">创建后将生成初始密码，填写的邮箱可用于${emailUses}。</p>
				</div>
			</div>
			<form id="create" class="inline-form">
				<input class="input" id="username" placeholder="用户名（例如 zhangsan）" aria-label="用户名" autocomplete="off" autocapitalize="none" spellcheck="false" required>
				<input class="input" id="create-email" type="email" placeholder="邮箱（可选）" aria-label="邮箱（可选）" maxlength="254" autocomplete="off">
				<button class="btn primary">创建用户</button>
			</form>
		</section>

		<section class="block" id="users-section">
			<div class="block-head">
				<div><h2>用户</h2><p class="sub" id="summary" aria-live="polite"></p></div>
				<form class="user-search" id="search-users" role="search" aria-label="搜索用户">
					<svg class="user-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
					<input class="input user-search-input" type="search" id="user-search-query" aria-label="搜索用户名或邮箱" placeholder="搜索用户名或邮箱" maxlength="254" autocomplete="off" spellcheck="false">
					<button type="button" class="user-search-clear" id="clear-user-search" aria-label="清除搜索" title="清除" hidden>
						<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
					</button>
				</form>
			</div>
			<div class="card list">
				<div id="users"></div>
				<nav class="list-foot" id="users-pagination" aria-label="用户分页" hidden>
					<span class="page-info" id="users-page" role="status"></span>
					<div class="page-nav">
						<div class="page-controls">
							<button type="button" class="page-btn" id="previous-users" aria-label="上一页" title="上一页" aria-controls="users">
								<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>
							</button>
							<div class="page-numbers" id="users-pages"></div>
							<button type="button" class="page-btn" id="next-users" aria-label="下一页" title="下一页" aria-controls="users">
								<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>
							</button>
						</div>
						<span class="page-sep" aria-hidden="true"></span>
						<form class="page-jump" id="users-jump">
							<label for="jump-page">跳至</label>
							<input class="input page-jump-input" id="jump-page" type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off" aria-label="跳转页码">
							<span>页</span>
							<button type="submit" class="page-btn page-jump-btn" id="jump-submit">前往</button>
						</form>
					</div>
				</nav>
			</div>
		</section>
	</main>
</div>

<dialog class="modal" id="modal-secret" aria-labelledby="secret-title">
	<div class="modal-body">
		<div class="modal-head">
			<div><h3 id="secret-title"></h3><p class="sub">密码只显示一次，请立即发给用户，首次登录后需修改。</p></div>
			<button type="button" class="link" data-close>关闭</button>
		</div>
		<div id="secret-body"></div>
		<div class="modal-foot"><span></span><button type="button" class="btn" id="copy-all">复制全部</button></div>
	</div>
</dialog>

<dialog class="modal narrow" id="modal-user-email" aria-labelledby="user-email-title">
	<form class="modal-body" id="user-email-form">
		<div class="modal-head">
			<div>
				<h3 id="user-email-title">管理邮箱</h3>
				<p class="sub" id="user-email-sub">绑定后可用于${emailUses}</p>
			</div>
			<button type="button" class="link" data-close>关闭</button>
		</div>
		<div class="field">
			<label class="label" for="user-email">邮箱</label>
			<input class="input" type="email" id="user-email" placeholder="name@example.com" maxlength="254" autocomplete="off" required>
		</div>
		<div class="modal-foot">
			<span>
				<span class="sub" id="user-email-note" style="margin:0">保存后用户需重新登录</span>
				<button type="button" class="btn danger" id="remove-user-email" hidden>解除绑定</button>
			</span>
			<button class="btn primary" id="save-user-email">绑定邮箱</button>
		</div>
	</form>
</dialog>

<div id="toasts" class="toasts" popover="manual"></div>

<script>
${PAGE_SCRIPT}
let adminKey = "";
try { adminKey = sessionStorage.getItem("adminKey") ?? ""; } catch {}
let secretText = "";
let editingEmailUserId = "";
let usersPage = 1;
let usersPageCount = 1;
let usersQuery = "";
let usersRequest = null;
let searchTimer = null;
let searchComposing = false;

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
	usersPage = 1;
	usersPageCount = 1;
	usersQuery = "";
	usersRequest = null;
	clearTimeout(searchTimer);
	searchTimer = null;
	$("user-search-query").value = "";
	$("clear-user-search").hidden = true;
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

function showEmailEditor(user) {
	editingEmailUserId = user.id;
	const hasEmail = !!user.email;
	$("user-email-title").textContent = (hasEmail ? "修改 " : "绑定 ") + user.username + " 的邮箱";
	$("user-email-sub").textContent = hasEmail
		? "新邮箱可用于${emailUses}，修改后用户需重新登录。"
		: "绑定后可用于${emailUses}。";
	$("user-email").value = user.email ?? "";
	$("user-email-note").hidden = hasEmail;
	$("remove-user-email").hidden = !hasEmail;
	$("save-user-email").textContent = hasEmail ? "保存邮箱" : "绑定邮箱";
	openModal("modal-user-email");
}

async function updateUserEmail(email) {
	await api("users/" + editingEmailUserId + "/email", { email });
	closeModal("modal-user-email");
	toast(email ? "已保存邮箱" : "已解除邮箱绑定");
}

$("user-email-form").onsubmit = (event) => {
	event.preventDefault();
	act(event.submitter, () => updateUserEmail($("user-email").value.trim()));
};

$("remove-user-email").onclick = (event) => act(event.currentTarget, async () => {
	if (!await confirmDialog({
		title: "解除邮箱绑定？",
		message: "解除后该邮箱无法用于${emailUses}，用户需重新登录。",
		confirmText: "解除绑定", danger: true,
	})) return;
	await updateUserEmail(null);
});

function badge(text, kind) {
	return el("span", { className: "badge" + (kind ? " " + kind : ""), textContent: text });
}

function button(text, className, onclick) {
	const node = el("button", { type: "button", className: "btn small" + (className ? " " + className : ""), textContent: text });
	node.onclick = () => act(node, onclick);
	return node;
}

function deviceChip(device, inactive) {
	const on = device.online && !inactive;
	return el("span", {
		className: "device-chip",
		title: device.online ? "在线" : ago(device.lastSeen) + "在线",
	},
		el("span", { className: "dot" + (on ? " on" : "") }),
		el("span", { textContent: device.name }),
	);
}

function userRow(user) {
	const label = user.username ?? "旧账号 " + user.id;
	const inactive = user.disabled || user.deleting;
	const onlineCount = inactive ? 0 : user.devices.filter((d) => d.online).length;
	const toggle = button(user.disabled ? "启用" : "禁用", "", async () => {
		if (!user.disabled && !await confirmDialog({
			title: "禁用 " + label + "？",
			message: "禁用后该用户的电脑将断开、网页版无法调用并退出登录，启用后恢复。",
			confirmText: "禁用", danger: true,
		})) return;
		await api("users/" + user.id + "/" + (user.disabled ? "enable" : "disable"), {});
		toast(user.disabled ? "已启用" : "已禁用");
	});
	const account = button(user.username ? "重置密码" : "设置登录账号", "", async () => {
		if (user.username) {
			if (!await confirmDialog({
				title: "重置 " + label + " 的密码？",
				message: "旧密码立即失效并退出网页登录，已连接的电脑和 AI 不受影响。",
				confirmText: "重置密码", danger: true,
			})) return;
			const { password } = await api("users/" + user.id + "/reset-password", {});
			showPassword(label + " 的新密码", user.username, password);
			return;
		}
		const result = await promptDialog({
			title: "为 " + label + " 设置登录账号",
			message: "设置后将生成初始密码，不影响原有电脑与授权。",
			label: "用户名",
			placeholder: "例如 zhangsan",
			note: "2 到 32 位，只能包含字母、数字和 _ . -",
			confirmText: "生成账号",
			submit: (username) => api("users/" + user.id + "/account", { username }),
		});
		if (!result) return;
		showPassword(label + " 的登录账号", result.username, result.password);
	});
	const email = user.username ? el("button", {
		type: "button",
		className: "btn small",
		textContent: user.email ? "修改邮箱" : "绑定邮箱",
		onclick: () => showEmailEditor(user),
	}) : null;
	const remove = button(user.deleting ? "继续删除" : "删除", "danger", async () => {
		if (!user.deleting && !await confirmDialog({
			title: "删除 " + label + "？",
			message: "账号、设备和应用授权将永久删除，临时文件链接会失效。",
			confirmText: "删除用户", danger: true,
		})) return;
		try {
			await api("users/" + user.id + "/delete", { confirm: true });
		} catch (error) {
			await load();
			throw error;
		}
		toast("已删除用户");
	});

	const details = [
		user.email ?? "未绑定邮箱",
		user.keyCount + " 个密钥",
		user.appCount + " 个应用",
		formatDate(user.createdAt) + "创建",
	].filter(Boolean).join(" · ");

	return el("div", { className: "row" + (inactive ? " disabled" : "") },
		el("div", { className: "row-main" },
			el("div", { className: "row-title" },
				el("span", { textContent: label }),
				user.deleting ? badge("待完成删除", "warn") : user.disabled && badge("已禁用"),
				!user.deleting && !user.username && badge("未设置登录账号", "warn"),
				!user.deleting && user.username && user.mustChangePassword && badge("待修改初始密码"),
			),
			el("div", { className: "row-meta" },
				onlineCount > 0 && el("span", { className: "status-on", textContent: onlineCount + " 台在线" }),
				onlineCount > 0 && " · ",
				details,
			),
			user.devices.length > 0 && el("div", { className: "row-devices" }, ...user.devices.map((d) => deviceChip(d, inactive))),
		),
		el("div", { className: "row-actions" }, ...(user.deleting ? [remove] : [toggle, account, email, remove])),
	);
}

const previousUsers = $("previous-users");
const nextUsers = $("next-users");
const jumpInput = $("jump-page");
const jumpSubmit = $("jump-submit");
const searchUsersForm = $("search-users");
const searchUsersInput = $("user-search-query");
const clearUserSearch = $("clear-user-search");

function syncSearchClear() {
	clearUserSearch.hidden = !searchUsersInput.value && !usersQuery;
}

function pageItems(current, total) {
	if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
	if (current <= 4) return [1, 2, 3, 4, 5, "…", total];
	if (current >= total - 3) return [1, "…", total - 4, total - 3, total - 2, total - 1, total];
	return [1, "…", current - 1, current, current + 1, "…", total];
}

function setPaginationBusy(busy) {
	$("users").classList.toggle("loading", busy && $("users").childElementCount > 0);
	previousUsers.disabled = busy || usersPage <= 1;
	nextUsers.disabled = busy || usersPage >= usersPageCount;
	jumpInput.disabled = busy;
	jumpSubmit.disabled = busy;
	for (const btn of $("users-pages").querySelectorAll("button")) {
		btn.disabled = busy;
	}
}

function renderPagination(total, pageSize, shown) {
	const hidden = usersPageCount <= 1;
	$("users-pagination").hidden = hidden;
	if (hidden) return;
	const start = total ? (usersPage - 1) * pageSize + 1 : 0;
	const end = total ? start + shown - 1 : 0;
	$("users-page").textContent = "第 " + start + "–" + end + " 位，共 " + total + " 位";
	jumpInput.placeholder = String(usersPage);
	$("users-pages").replaceChildren(...pageItems(usersPage, usersPageCount).map((item) => {
		if (item === "…") return el("span", { className: "page-ellipsis", textContent: "…" });
		const active = item === usersPage;
		const btn = el("button", {
			type: "button",
			className: "page-btn" + (active ? " on" : ""),
			textContent: String(item),
		});
		btn.setAttribute("aria-controls", "users");
		btn.setAttribute("aria-label", "第 " + item + " 页");
		if (active) btn.setAttribute("aria-current", "page");
		else btn.onclick = () => goToUsersPage(item, true);
		return btn;
	}));
}

async function load(page = usersRequest?.page ?? usersPage, scroll = false, query = usersRequest?.query ?? usersQuery) {
	const request = { page, query };
	usersRequest = request;
	setPaginationBusy(true);
	try {
		const params = new URLSearchParams({ page: String(page), q: query });
		const result = await api("users?" + params);
		if (usersRequest !== request) return;
		const { users, total, pageSize = 10 } = result;
		usersPage = result.page;
		usersPageCount = result.pageCount;
		usersQuery = query;
		syncSearchClear();
		const online = users.reduce((n, u) => n + u.devices.filter((d) => d.online).length, 0);
		$("summary").textContent = (query ? "找到 " : "") + total + " 位用户 · " + (usersPageCount > 1 ? "本页 " : "") + online + " 台电脑在线";
		$("users").replaceChildren(...(users.length ? users.map(userRow)
			: [el("div", { className: "empty", textContent: query ? "未找到匹配的用户" : "还没有用户" })]));
		renderPagination(total, pageSize, users.length);
		if (scroll) {
			const top = $("users-section").getBoundingClientRect().top;
			if (top < 0) $("users-section").scrollIntoView({ behavior: "smooth", block: "start" });
		}
	} finally {
		if (usersRequest === request) {
			usersRequest = null;
			setPaginationBusy(false);
		}
	}
}

function goToUsersPage(page, scroll = false) {
	const target = Math.max(1, Math.min(usersPageCount, page));
	if (target === usersPage) return;
	load(target, scroll).catch((error) => toast(error.message, true));
}

previousUsers.onclick = () => goToUsersPage(usersPage - 1, true);
nextUsers.onclick = () => goToUsersPage(usersPage + 1, true);

$("users-jump").onsubmit = (event) => {
	event.preventDefault();
	const raw = jumpInput.value.trim();
	if (!raw) return;
	const target = Number(raw);
	if (!Number.isSafeInteger(target) || target < 1 || target > usersPageCount) {
		toast("请输入 1 到 " + usersPageCount + " 之间的页码", true);
		jumpInput.select();
		return;
	}
	jumpInput.value = "";
	goToUsersPage(target, true);
};

function runUserSearch(query) {
	clearTimeout(searchTimer);
	searchTimer = null;
	load(1, false, query).catch((error) => toast(error.message, true));
}

function scheduleUserSearch() {
	syncSearchClear();
	if (searchComposing) return;
	const nextQuery = searchUsersInput.value.trim();
	clearTimeout(searchTimer);
	if (nextQuery === usersQuery) return;
	searchTimer = setTimeout(() => runUserSearch(nextQuery), nextQuery ? 260 : 0);
}

searchUsersForm.onsubmit = (event) => {
	event.preventDefault();
	runUserSearch(searchUsersInput.value.trim());
};

searchUsersInput.addEventListener("compositionstart", () => { searchComposing = true; });
searchUsersInput.addEventListener("compositionend", () => {
	searchComposing = false;
	scheduleUserSearch();
});
searchUsersInput.addEventListener("input", scheduleUserSearch);
searchUsersInput.addEventListener("keydown", (event) => {
	if (event.key === "Escape" && (searchUsersInput.value || usersQuery)) {
		event.preventDefault();
		searchUsersInput.value = "";
		syncSearchClear();
		if (usersQuery) runUserSearch("");
	}
});

clearUserSearch.onclick = () => {
	searchUsersInput.value = "";
	syncSearchClear();
	if (usersQuery) runUserSearch("");
	searchUsersInput.focus();
};

async function start() {
	try {
		await load(1, false, "");
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
		const { user, password } = await api("users", {
			username: $("username").value,
			email: $("create-email").value.trim() || null,
		});
		$("create").reset();
		showPassword("已创建用户 " + user.username, user.username, password);
	});
};

$("logout").onclick = logout;

if (adminKey) start();
</script>
</body>
</html>
`;
}

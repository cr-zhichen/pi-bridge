/** 账号页、授权页和管理页共用的样式和脚本。 */

export const PAGE_STYLE = `
	:root {
		color-scheme: light dark;
		--bg: #fafafa; --surface: #ffffff; --surface-2: #f4f4f5; --border: #e4e4e7; --border-strong: #d4d4d8;
		--text: #18181b; --muted: #71717a; --accent: #18181b; --accent-text: #ffffff; --accent-soft: #f4f4f5;
		--danger: #dc2626; --ok: #16a34a; --ok-soft: #dcfce7; --warn: #d97706; --warn-soft: #fffbeb; --warn-text: #92400e; --warn-border: #fde68a;
		--radius: 10px; --radius-sm: 7px; --shadow: 0 1px 2px rgb(0 0 0 / .04); --overlay: rgb(0 0 0 / .4);
		--font: -apple-system, BlinkMacSystemFont, "Inter", "PingFang SC", "Segoe UI", system-ui, sans-serif;
		--mono: ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace;
	}
	@media (prefers-color-scheme: dark) {
		:root {
			--bg: #09090b; --surface: #111113; --surface-2: #19191c; --border: #27272a; --border-strong: #3f3f46;
			--text: #fafafa; --muted: #a1a1aa; --accent: #fafafa; --accent-text: #18181b; --accent-soft: #27272a;
			--danger: #f87171; --ok: #4ade80; --ok-soft: rgb(74 222 128 / .15); --warn: #f59e0b; --warn-soft: rgb(245 158 11 / .08);
			--warn-text: #fbbf24; --warn-border: rgb(245 158 11 / .3); --shadow: none; --overlay: rgb(0 0 0 / .6);
		}
	}
	* { box-sizing: border-box; }
	body { margin: 0; background: var(--bg); color: var(--text); font: 14px/1.6 var(--font); -webkit-font-smoothing: antialiased; }
	[hidden] { display: none !important; }
	code { font-family: var(--mono); }

	.top { max-width: 880px; margin: 0 auto; padding: 28px 24px 0; display: flex; justify-content: space-between; align-items: center; gap: 16px; }
	.brand { display: flex; gap: 10px; align-items: center; font-weight: 600; font-size: 16px; }
	.logo { width: 28px; height: 28px; flex: none; display: grid; place-items: center; border-radius: var(--radius-sm);
		background: var(--accent); color: var(--accent-text); font-weight: 700; }
	.user { display: flex; gap: 16px; align-items: center; color: var(--muted); font-size: 13px; min-width: 0; }
	.user > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.link { background: none; border: 0; padding: 0; color: var(--muted); cursor: pointer; font: inherit; white-space: nowrap; }
	.link:hover { color: var(--text); }

	.container { max-width: 880px; margin: 0 auto; padding: 8px 24px 80px; }
	.block { margin-top: 40px; }
	.block-head { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; margin-bottom: 14px; }
	h2 { margin: 0; font-size: 16px; font-weight: 600; letter-spacing: -0.01em; }
	h3 { margin: 0; font-size: 18px; font-weight: 600; letter-spacing: -0.01em; }
	.sub { margin: 4px 0 0; color: var(--muted); font-size: 13px; }

	.card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow); padding: 20px; }
	.card + .card { margin-top: 12px; }
	.label { display: block; font-size: 12px; color: var(--muted); margin-bottom: 6px; font-weight: 500; }
	.copy { display: flex; gap: 8px; align-items: flex-start; }
	.copy code { flex: 1; min-width: 0; padding: 9px 12px; background: var(--surface-2); border: 1px solid var(--border);
		border-radius: var(--radius-sm); font-size: 13px; line-height: 1.55; overflow-wrap: anywhere; user-select: all; }
	.copy > .btn { min-height: 40px; }
	.copy.hero code { font-size: 15px; padding: 12px 14px; }
	.copy.hero > .btn { min-height: 49px; }
	.note { margin: 10px 0 0; font-size: 13px; color: var(--muted); }
	.ui { font-weight: 600; }

	.btn { font: inherit; font-size: 13px; padding: 8px 14px; border-radius: var(--radius-sm); border: 1px solid var(--border);
		background: var(--surface); color: var(--text); cursor: pointer; white-space: nowrap; font-weight: 500; transition: background .15s, opacity .15s; }
	.btn:hover { background: var(--surface-2); }
	.btn.primary { background: var(--accent); border-color: var(--accent); color: var(--accent-text); }
	.btn.primary:hover { opacity: .88; }
	.btn.danger { color: var(--danger); }
	.btn.small { padding: 5px 10px; font-size: 12px; }
	.btn.wide { width: 100%; padding: 10px 14px; font-size: 14px; }
	.btn:disabled { opacity: .45; cursor: not-allowed; }

	.input { width: 100%; padding: 9px 12px; font: inherit; color: inherit; background: var(--surface); border: 1px solid var(--border);
		border-radius: var(--radius-sm); transition: border-color .15s, box-shadow .15s; }
	.input:focus { outline: none; border-color: var(--text); box-shadow: 0 0 0 3px var(--accent-soft); }
	.field + .field { margin-top: 12px; }
	.inline-form { display: flex; gap: 8px; flex-wrap: wrap; }
	.inline-form .input { flex: 1; min-width: 180px; }

	.tabs { display: flex; gap: 4px; margin: 22px 0 14px; border-bottom: 1px solid var(--border); }
	.tab { background: none; border: 0; border-bottom: 2px solid transparent; padding: 8px 12px; margin-bottom: -1px; color: var(--muted);
		cursor: pointer; font: inherit; font-weight: 500; }
	.tab:hover { color: var(--text); }
	.tab.on { color: var(--text); border-color: var(--accent); }
	.steps { margin: 0; padding: 0; list-style: none; counter-reset: step; display: grid; gap: 12px; }
	.steps > li { counter-increment: step; display: flex; gap: 12px; align-items: flex-start; }
	.steps > li::before { content: counter(step); flex: none; width: 22px; height: 22px; margin-top: 1px; border-radius: 50%; display: grid;
		place-items: center; font-size: 12px; font-weight: 600; background: var(--surface-2); border: 1px solid var(--border); color: var(--muted); }
	.steps > li > div { flex: 1; min-width: 0; }

	.list { padding: 0; overflow: hidden; }
	.list-head { padding: 12px 20px; font-size: 13px; font-weight: 600; border-bottom: 1px solid var(--border); }
	.row { display: flex; align-items: center; gap: 14px; padding: 14px 20px; }
	.row + .row { border-top: 1px solid var(--border); }
	.row-main { flex: 1; min-width: 0; }
	.row-title { font-weight: 500; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; overflow-wrap: anywhere; }
	.row-meta { font-size: 12px; color: var(--muted); margin-top: 2px; overflow-wrap: anywhere; }
	.row-status { font-size: 12px; color: var(--muted); white-space: nowrap; text-align: right; }
	.row-status.on { color: var(--ok); }
	.row-actions { display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
	.row.disabled .row-main { opacity: .55; }
	.icon { width: 34px; height: 34px; border-radius: var(--radius-sm); display: grid; place-items: center; font-weight: 700; font-size: 14px;
		flex: none; background: var(--surface-2); border: 1px solid var(--border); color: var(--text); }
	.dot { width: 8px; height: 8px; border-radius: 50%; background: var(--border-strong); flex: none; }
	.dot.on { background: var(--ok); box-shadow: 0 0 0 3px var(--ok-soft); }
	.dot.wait { background: var(--warn); animation: pulse 1.4s ease-in-out infinite; }
	@keyframes pulse { 50% { opacity: .35; } }
	.badge { font-size: 11px; padding: 1px 8px; border-radius: 999px; background: var(--surface-2); color: var(--muted);
		border: 1px solid var(--border); font-weight: 500; white-space: nowrap; }
	.badge.warn { background: var(--warn-soft); color: var(--warn-text); border-color: var(--warn-border); }
	.badge.ok { background: var(--ok-soft); color: var(--ok); border-color: transparent; }
	.empty { padding: 28px 20px; text-align: center; color: var(--muted); font-size: 13px; }

	.banner { display: flex; gap: 14px; align-items: flex-start; padding: 14px 16px; border-radius: var(--radius); background: var(--warn-soft);
		color: var(--warn-text); border: 1px solid var(--warn-border); margin-top: 24px; font-size: 13px; }
	.banner .mark { flex: none; width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; background: var(--warn);
		color: #fff; font-weight: 700; font-size: 13px; }
	.banner strong { display: block; font-size: 14px; margin-bottom: 2px; }
	.banner p { margin: 0; }
	.banner .actions { margin-top: 10px; display: flex; gap: 14px; align-items: center; }
	.banner .link { color: var(--warn-text); text-decoration: underline; text-underline-offset: 3px; }

	details.advanced { margin-top: 12px; border: 1px dashed var(--border-strong); border-radius: var(--radius); }
	details.advanced summary { cursor: pointer; list-style: none; padding: 12px 16px; font-size: 13px; color: var(--muted);
		display: flex; justify-content: space-between; gap: 12px; }
	details.advanced summary:hover { color: var(--text); }
	details.advanced summary::-webkit-details-marker { display: none; }
	details.advanced summary::after { content: "展开"; }
	details.advanced[open] summary::after { content: "收起"; }
	.advanced-body { padding: 0 16px 16px; display: grid; gap: 14px; }
	.risk { padding: 12px 14px; border-radius: var(--radius-sm); background: var(--surface-2); border-left: 3px solid var(--danger); font-size: 13px; }
	.risk strong { color: var(--danger); }
	.check { display: flex; gap: 8px; align-items: flex-start; font-size: 13px; color: var(--muted); cursor: pointer; }
	.check input { margin-top: 3px; accent-color: var(--accent); }

	.overlay { position: fixed; inset: 0; background: var(--overlay); display: grid; place-items: center; padding: 16px; z-index: 40; }
	.modal { width: 100%; max-width: 540px; max-height: calc(100vh - 32px); overflow: auto; background: var(--surface); border: 1px solid var(--border);
		border-radius: var(--radius); box-shadow: 0 24px 64px rgb(0 0 0 / .2); padding: 24px; }
	.modal.narrow { max-width: 420px; }
	.modal-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 18px; }
	.modal-foot { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-top: 20px; padding-top: 16px;
		border-top: 1px solid var(--border); }
	.waiting { display: flex; gap: 10px; align-items: center; font-size: 13px; color: var(--muted); }
	.waiting.done { color: var(--ok); }

	.center { min-height: 100vh; display: grid; place-items: center; padding: 24px; }
	.auth { width: 100%; max-width: 420px; }
	.auth .card { padding: 32px 28px; }
	.auth .brand { margin-bottom: 24px; }
	h1 { margin: 0 0 6px; font-size: 22px; font-weight: 600; letter-spacing: -0.01em; }
	.lead { margin: 0 0 22px; color: var(--muted); }
	.context { display: flex; gap: 10px; align-items: center; padding: 10px 12px; margin-bottom: 20px; border-radius: var(--radius-sm);
		background: var(--surface-2); border: 1px solid var(--border); font-size: 13px; }
	.foot { margin-top: 18px; text-align: center; color: var(--muted); font-size: 12px; }
	.perms { list-style: none; margin: 0 0 20px; padding: 0; display: grid; gap: 10px; }
	.perms li { display: flex; gap: 10px; align-items: flex-start; }
	.perms li::before { content: "✓"; flex: none; width: 20px; height: 20px; border-radius: 50%; display: grid; place-items: center;
		font-size: 12px; font-weight: 700; background: var(--surface-2); border: 1px solid var(--border); margin-top: 1px; }
	.who { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 12px 14px; border: 1px solid var(--border);
		border-radius: var(--radius-sm); margin-bottom: 20px; font-size: 13px; }
	.who form { margin: 0; }
	.avatar { width: 28px; height: 28px; border-radius: 50%; background: var(--surface-2); border: 1px solid var(--border); display: inline-grid;
		place-items: center; font-weight: 600; margin-right: 10px; flex: none; }
	.pair { display: flex; align-items: center; justify-content: center; gap: 14px; margin-bottom: 20px; }
	.pair .icon, .pair .logo { width: 48px; height: 48px; font-size: 20px; border-radius: var(--radius); }
	.pair .line { width: 40px; border-top: 2px dotted var(--border-strong); }
	.facts { margin: 0 0 20px; padding: 0; list-style: none; font-size: 13px; color: var(--muted); display: grid; gap: 4px; text-align: center; }
	.facts strong { color: var(--text); font-weight: 600; }
	.buttons { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
	.buttons form { display: contents; }
	.warn-box { padding: 10px 12px; border-radius: var(--radius-sm); background: var(--warn-soft); color: var(--warn-text);
		border: 1px solid var(--warn-border); font-size: 13px; margin-bottom: 20px; }

	.toast { position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); padding: 10px 16px; z-index: 60;
		border-radius: var(--radius-sm); background: var(--text); color: var(--bg); box-shadow: 0 8px 24px rgb(0 0 0 / .2); font-size: 13px; }
	.toast.error { background: var(--danger); color: #fff; }

	@media (max-width: 640px) {
		.top, .container { padding-left: 16px; padding-right: 16px; }
		.user .name { display: none; }
		.block-head { flex-direction: column; align-items: stretch; }
		.row { flex-wrap: wrap; padding: 14px 16px; }
		.row-status { text-align: left; }
		.copy { flex-direction: column; align-items: stretch; }
		.auth .card { padding: 28px 20px; }
	}
`;

/** 页面自己定义 load()，act() 在操作完成后调用它刷新。 */
export const PAGE_SCRIPT = `
const $ = (id) => document.getElementById(id);
let toastTimer;

function el(tag, props = {}, ...children) {
	const node = Object.assign(document.createElement(tag), props);
	node.append(...children.filter((child) => child !== null && child !== undefined && child !== false));
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

function copyButton(text, className = "btn") {
	const button = el("button", { type: "button", className, textContent: "复制" });
	button.onclick = async () => {
		await navigator.clipboard.writeText(typeof text === "function" ? text() : text);
		button.textContent = "已复制";
		setTimeout(() => { button.textContent = "复制"; }, 1500);
	};
	return button;
}

function copyRow(text, small) {
	return el("div", { className: "copy" }, el("code", { textContent: text }), copyButton(text, small ? "btn small" : "btn"));
}

function field(label, ...children) {
	return el("div", { className: "field" }, el("span", { className: "label", textContent: label }), ...children);
}

function formatTime(ms) {
	return new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function formatDate(ms) {
	return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function ago(ms) {
	const minutes = Math.floor((Date.now() - ms) / 60000);
	if (minutes < 1) return "刚刚";
	if (minutes < 60) return minutes + " 分钟前";
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return hours + " 小时前";
	const days = Math.floor(hours / 24);
	return days < 30 ? days + " 天前" : formatDate(ms);
}

const PLATFORMS = { darwin: "macOS", linux: "Linux", win32: "Windows" };

function platformName(platform) {
	return PLATFORMS[platform] ?? platform;
}

function openModal(id) {
	$(id).hidden = false;
	const input = $(id).querySelector("input:not([type=hidden]):not([type=checkbox])");
	if (input) setTimeout(() => input.focus(), 0);
}

function closeModal(id) {
	$(id).hidden = true;
	$(id).dispatchEvent(new Event("close"));
}

document.addEventListener("click", (event) => {
	const close = event.target.closest("[data-close]");
	if (close) closeModal(close.closest(".overlay").id);
	else if (event.target.classList?.contains("overlay")) closeModal(event.target.id);
});
document.addEventListener("keydown", (event) => {
	if (event.key !== "Escape") return;
	for (const overlay of document.querySelectorAll(".overlay:not([hidden])")) closeModal(overlay.id);
});

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
`;

export const PAGE_HEAD = `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<style>${PAGE_STYLE}</style>`;

export const PAGE_CSP =
	"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'";

export function htmlResponse(html: string, init: ResponseInit = {}): Response {
	const headers = new Headers(init.headers);
	headers.set("Content-Type", "text/html; charset=utf-8");
	if (!headers.has("Content-Security-Policy")) {
		headers.set("Content-Security-Policy", PAGE_CSP);
	}
	headers.set("Referrer-Policy", "no-referrer");
	headers.set("Cache-Control", "no-store");
	return new Response(html, { ...init, headers });
}

/** 转义放进 HTML 的文本。 */
export function escapeHtml(value: string): string {
	return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

export const BRAND = `<div class="brand"><span class="logo">π</span>pi-bridge</div>`;

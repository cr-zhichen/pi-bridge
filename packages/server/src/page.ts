/** 账号页、授权页和管理页共用的样式和脚本。 */

export const PAGE_STYLE = `
	:root {
		color-scheme: light dark;
		--bg: #fafafa; --surface: #ffffff; --surface-2: #f4f4f5; --border: #e4e4e7; --border-strong: #d4d4d8;
		--text: #18181b; --muted: #71717a; --accent: #18181b; --accent-text: #ffffff; --accent-soft: #f4f4f5;
		--danger: #dc2626; --ok: #16a34a; --ok-soft: #dcfce7; --warn: #d97706; --warn-soft: #fffbeb; --warn-text: #92400e; --warn-border: #fde68a;
		--radius: 10px; --radius-sm: 7px; --shadow: 0 1px 2px rgb(0 0 0 / .04);
		--font: -apple-system, BlinkMacSystemFont, "Inter", "PingFang SC", "Segoe UI", system-ui, sans-serif;
		--mono: ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace;
	}
	@media (prefers-color-scheme: dark) {
		:root {
			--bg: #09090b; --surface: #111113; --surface-2: #19191c; --border: #27272a; --border-strong: #3f3f46;
			--text: #fafafa; --muted: #a1a1aa; --accent: #fafafa; --accent-text: #18181b; --accent-soft: #27272a;
			--danger: #f87171; --ok: #4ade80; --ok-soft: rgb(74 222 128 / .15); --warn: #f59e0b; --warn-soft: rgb(245 158 11 / .08);
			--warn-text: #fbbf24; --warn-border: rgb(245 158 11 / .3); --shadow: none;
		}
	}
	* { box-sizing: border-box; }
	body { margin: 0; background: var(--bg); color: var(--text); font: 14px/1.6 var(--font); -webkit-font-smoothing: antialiased; }
	[hidden] { display: none !important; }
	code { font-family: var(--mono); }
	::selection { background: color-mix(in srgb, var(--text) 16%, transparent); }
	:focus-visible { outline: 2px solid var(--text); outline-offset: 2px; }

	.top { max-width: 880px; margin: 0 auto; padding: 28px 24px 0; display: flex; justify-content: space-between; align-items: center; gap: 16px; }
	.brand { display: flex; gap: 10px; align-items: center; font-weight: 600; font-size: 16px; }
	.logo { width: 28px; height: 28px; flex: none; display: grid; place-items: center; border-radius: var(--radius-sm);
		background: var(--accent); color: var(--accent-text); font-weight: 700; }
	.user { display: flex; gap: 16px; align-items: center; color: var(--muted); font-size: 13px; min-width: 0; }
	.user > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.link { background: none; border: 0; padding: 0; color: var(--muted); cursor: pointer; font: inherit; white-space: nowrap; }
	.link:hover { color: var(--text); }
	.project-link { display: grid; place-items: center; flex: none; width: 32px; height: 32px; border-radius: var(--radius-sm); }
	.project-link:hover { background: var(--surface-2); }

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
	.btn.danger-solid { background: var(--danger); border-color: var(--danger); color: #fff; }
	.btn.danger-solid:hover { opacity: .88; }
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
	.risk { padding: 12px 14px; border-radius: var(--radius-sm); font-size: 13px;
		background: color-mix(in srgb, var(--danger) 6%, var(--surface)); border: 1px solid color-mix(in srgb, var(--danger) 22%, var(--border)); }
	.risk strong { color: var(--danger); }
	.check { display: flex; gap: 8px; align-items: flex-start; font-size: 13px; color: var(--muted); cursor: pointer; }
	.check input { margin-top: 3px; accent-color: var(--accent); }

	dialog.modal { width: min(540px, calc(100vw - 32px)); max-height: calc(100vh - 32px); padding: 0; overflow: auto; color: var(--text);
		background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: 0 24px 64px rgb(0 0 0 / .2); }
	dialog.modal.narrow { width: min(420px, calc(100vw - 32px)); }
	/* 旧版浏览器的 ::backdrop 不继承自定义属性，这里直接写颜色 */
	dialog.modal::backdrop { background: rgb(0 0 0 / .4); }
	@media (prefers-color-scheme: dark) { dialog.modal::backdrop { background: rgb(0 0 0 / .6); } }
	dialog.modal[open] { animation: dialog-in .16s ease-out; }
	dialog.modal[open]::backdrop { animation: fade-in .16s ease-out; }
	@keyframes dialog-in { from { opacity: 0; transform: translateY(8px) scale(.98); } }
	@keyframes fade-in { from { opacity: 0; } }
	.modal-body { padding: 24px; }
	.dialog-text { margin: 8px 0 0; color: var(--muted); }
	.dialog-field { margin-top: 18px; }
	.dialog-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 24px; }
	.field-error { margin: 6px 0 0; color: var(--danger); font-size: 12px; }
	.modal-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 18px; }
	.modal-foot { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-top: 20px; padding-top: 16px;
		border-top: 1px solid var(--border); }
	.waiting { display: flex; gap: 10px; align-items: center; font-size: 13px; color: var(--muted); }
	.waiting.done { color: var(--ok); }

	/* 登录、授权这类单页：顶栏和账号页一致，表单不套卡片，单独一列放在页面中间 */
	.auth-page { min-height: 100vh; min-height: 100svh; display: grid; grid-template-rows: auto 1fr; }
	.auth-page > .top { width: 100%; }
	.auth { width: 100%; max-width: 408px; margin: 0 auto; padding: 40px 24px 96px; align-self: center; }
	.auth h1 { font-size: 26px; line-height: 1.3; }
	.auth .lead { margin: 8px 0 32px; }
	.auth .field + .field { margin-top: 20px; }
	.auth .label { margin-bottom: 8px; font-size: 13px; color: var(--text); }
	.auth .input { height: 44px; padding: 0 14px; }
	.auth-submit { display: block; height: 44px; margin-top: 28px; }
	.auth-hint { margin: 16px 0 0; text-align: center; color: var(--muted); font-size: 13px; }
	h1 { margin: 0; font-size: 22px; line-height: 1.35; font-weight: 600; letter-spacing: -0.02em; text-wrap: balance; }
	.lead { margin: 6px 0 24px; color: var(--muted); }
	.lead code { padding: 1px 5px; border-radius: 4px; background: var(--surface-2); color: var(--text); font-size: .9em; }
	.context { display: flex; gap: 8px; align-items: center; margin: -16px 0 32px; color: var(--muted); font-size: 13px; }
	.context svg { flex: none; }

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
	.facts { margin: 8px 0 20px; padding: 0; list-style: none; font-size: 13px; color: var(--muted); display: grid; gap: 4px; text-align: center; }
	.facts strong { color: var(--text); font-weight: 600; }
	.buttons { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
	.buttons form { display: contents; }
	.warn-box { padding: 10px 12px; border-radius: var(--radius-sm); background: var(--warn-soft); color: var(--warn-text);
		border: 1px solid var(--warn-border); font-size: 13px; margin-bottom: 20px; }

	/* 提示放在 popover 里，和弹窗一样处在顶层，弹窗打开时也看得见 */
	.toasts { position: fixed; inset: auto 0 24px; margin: 0 auto; width: max-content; max-width: calc(100vw - 32px); padding: 0;
		border: 0; background: transparent; overflow: visible; pointer-events: none; }
	.toasts:popover-open, .toasts:not([popover]) { display: flex; flex-direction: column; align-items: center; gap: 8px; }
	.toast { display: flex; align-items: center; gap: 10px; padding: 10px 14px 10px 10px; border-radius: var(--radius-sm); font-size: 13px;
		background: var(--text); color: var(--bg); box-shadow: 0 8px 24px rgb(0 0 0 / .2); animation: toast-in .18s ease-out;
		transition: opacity .2s, transform .2s; pointer-events: auto; }
	.toast.leaving { opacity: 0; transform: translateY(4px); }
	.toast-icon { width: 18px; height: 18px; flex: none; border-radius: 50%; display: grid; place-items: center; font-size: 11px; font-weight: 700;
		background: var(--ok); color: #fff; }
	.toast.error { background: var(--danger); color: #fff; }
	.toast.error .toast-icon { background: #fff; color: var(--danger); }
	@keyframes toast-in { from { opacity: 0; transform: translateY(6px); } }
	@media (prefers-reduced-motion: reduce) {
		dialog.modal[open], dialog.modal[open]::backdrop, .toast { animation: none; }
	}

	@media (max-width: 640px) {
		.top, .container, .auth { padding-left: 16px; padding-right: 16px; }
		.user .name { display: none; }
		.block-head { flex-direction: column; align-items: stretch; }
		.row { flex-wrap: wrap; padding: 14px 16px; }
		.row-status { text-align: left; }
		.copy { flex-direction: column; align-items: stretch; }
	}
`;

/** 页面自己定义 load()，act() 在操作完成后调用它刷新。 */
export const PAGE_SCRIPT = `
const $ = (id) => document.getElementById(id);

function el(tag, props = {}, ...children) {
	const node = Object.assign(document.createElement(tag), props);
	node.append(...children.filter((child) => child !== null && child !== undefined && child !== false));
	return node;
}

/** 页面底部的提示，可以叠放多条。重新显示 popover 把它提到所有弹窗之上。 */
function toast(message, isError) {
	const box = $("toasts");
	const item = el("div", { className: "toast" + (isError ? " error" : ""), role: isError ? "alert" : "status" },
		el("span", { className: "toast-icon", textContent: isError ? "!" : "✓" }),
		el("span", { textContent: message }));
	box.append(item);
	if (box.showPopover) {
		if (box.matches(":popover-open")) box.hidePopover();
		box.showPopover();
	}
	setTimeout(() => {
		item.classList.add("leaving");
		setTimeout(() => {
			item.remove();
			if (!box.children.length && box.hidePopover && box.matches(":popover-open")) box.hidePopover();
		}, 200);
	}, isError ? 4500 : 2500);
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

// 弹窗用原生 <dialog>：顶层显示、焦点锁定和 Esc 关闭都由浏览器处理。
function openModal(id) {
	$(id).showModal();
	const input = $(id).querySelector("input:not([type=hidden]):not([type=checkbox])");
	if (input) input.focus();
}

function closeModal(id) {
	$(id).close();
}

let pressedOn = null;
document.addEventListener("pointerdown", (event) => { pressedOn = event.target; });
document.addEventListener("click", (event) => {
	const close = event.target.closest("[data-close]");
	if (close) close.closest("dialog")?.close();
	// 点在弹窗外的遮罩上：事件目标是 dialog 本身（内容都在 .modal-body 里）。
	// 要求按下时也在遮罩上，避免在输入框里拖选文字时松开鼠标关掉弹窗
	else if (event.target instanceof HTMLDialogElement && pressedOn === event.target) event.target.close();
});

function dialogText(message) {
	return typeof message === "string" ? el("p", { className: "dialog-text", textContent: message }) : message;
}

/** 确认框，返回是否确认。danger 时确认按钮为红色，默认焦点放在取消上。 */
function confirmDialog({ title, message, confirmText = "确定", cancelText = "取消", danger = false }) {
	return new Promise((resolve) => {
		let confirmed = false;
		const ok = el("button", { type: "button", className: "btn " + (danger ? "danger-solid" : "primary"), textContent: confirmText });
		const cancel = el("button", { type: "button", className: "btn", textContent: cancelText });
		const dialog = el("dialog", { className: "modal narrow" },
			el("div", { className: "modal-body" },
				el("h3", { textContent: title }),
				message && dialogText(message),
				el("div", { className: "dialog-actions" }, cancel, ok)));
		ok.onclick = () => { confirmed = true; dialog.close(); };
		cancel.onclick = () => dialog.close();
		dialog.addEventListener("close", () => { dialog.remove(); resolve(confirmed); });
		document.body.append(dialog);
		dialog.showModal();
		(danger ? cancel : ok).focus();
	});
}

/**
 * 输入框，返回 submit 的结果，取消时返回 null。
 * submit 抛出的错误显示在输入框下方，弹窗保持打开。
 */
function promptDialog({ title, message, label, placeholder = "", note, confirmText = "确定", submit = (value) => value }) {
	return new Promise((resolve) => {
		let result = null;
		const input = el("input", { className: "input", placeholder, required: true, autocomplete: "off", spellcheck: false });
		input.setAttribute("autocapitalize", "none");
		const error = el("p", { className: "field-error", hidden: true });
		const ok = el("button", { type: "submit", className: "btn primary", textContent: confirmText });
		const cancel = el("button", { type: "button", className: "btn", textContent: "取消" });
		const form = el("form", { className: "modal-body" },
			el("h3", { textContent: title }),
			message && dialogText(message),
			el("div", { className: "dialog-field" },
				el("span", { className: "label", textContent: label }), input,
				note && el("p", { className: "note", textContent: note }), error),
			el("div", { className: "dialog-actions" }, cancel, ok));
		const dialog = el("dialog", { className: "modal narrow" }, form);
		form.onsubmit = async (event) => {
			event.preventDefault();
			ok.disabled = true;
			error.hidden = true;
			try {
				result = await submit(input.value.trim());
				dialog.close();
			} catch (err) {
				error.textContent = err.message;
				error.hidden = false;
				input.focus();
			} finally {
				ok.disabled = false;
			}
		};
		cancel.onclick = () => dialog.close();
		dialog.addEventListener("close", () => { dialog.remove(); resolve(result); });
		document.body.append(dialog);
		dialog.showModal();
		input.focus();
	});
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

const PROJECT_URL = "https://github.com/cr-zhichen/pi-bridge";
const PROJECT_LABEL = "GitHub 仓库";

export const PROJECT_ICON_LINK = `<a class="link project-link" href="${PROJECT_URL}" target="_blank" rel="noopener" aria-label="${PROJECT_LABEL}（在新标签页打开）" title="${PROJECT_LABEL}">
	<svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M6.766 11.328c-2.063-.25-3.516-1.734-3.516-3.656 0-.781.281-1.625.75-2.188-.203-.515-.172-1.609.063-2.062.625-.078 1.468.25 1.968.703.594-.187 1.219-.281 1.985-.281.765 0 1.39.094 1.953.265.484-.437 1.344-.765 1.969-.687.218.422.25 1.515.046 2.047.5.593.766 1.39.766 2.203 0 1.922-1.453 3.375-3.547 3.64.531.344.89 1.094.89 1.954v1.625c0 .468.391.734.86.547C13.781 14.359 16 11.53 16 8.03 16 3.61 12.406 0 7.984 0 3.563 0 0 3.61 0 8.031a7.88 7.88 0 0 0 5.172 7.422c.422.156.828-.125.828-.547v-1.25c-.219.094-.5.156-.75.156-1.031 0-1.64-.562-2.078-1.609-.172-.422-.36-.672-.719-.719-.187-.015-.25-.093-.25-.187 0-.188.313-.328.625-.328.453 0 .844.281 1.25.86.313.452.64.655 1.031.655s.641-.14 1-.5c.266-.265.47-.5.657-.656"/></svg>
</a>`;

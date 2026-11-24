import { BRAND, PROJECT_TEXT_LINK } from "./page.ts";
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "./password.ts";

function emailField(id: string): string {
	return `<div class="field"><label class="label" for="${id}">邮箱</label><input class="input" id="${id}" type="email" name="email" placeholder="name@example.com" autocomplete="email" maxlength="254" required></div>`;
}

function codeField(id: string): string {
	return `<div class="field"><label class="label" for="${id}">验证码</label><input class="input input-code" id="${id}" name="code" placeholder="输入邮件中的 8 位验证码" autocomplete="one-time-code" autocapitalize="characters" spellcheck="false" maxlength="12" required></div>`;
}

function newPasswordField(id: string, label: string): string {
	return `<div class="field"><label class="label" for="${id}">${label}</label><input class="input" id="${id}" type="password" name="password" autocomplete="new-password" placeholder="至少 ${MIN_PASSWORD_LENGTH} 位" minlength="${MIN_PASSWORD_LENGTH}" maxlength="${MAX_PASSWORD_LENGTH}" required></div>`;
}

export const EMAIL_AUTH_VIEWS = `
<div id="view-register" class="auth-page" hidden>
	<main class="auth">
		${BRAND}
		<h1>注册账号</h1>
		<form data-email-purpose="register" data-email-step="start">
			<p class="lead">创建 pi-bridge 账号，需通过邮箱验证。</p>
			<div class="field"><label class="label" for="register-username">用户名</label><input class="input" id="register-username" name="username" placeholder="2–32 位字母、数字或 _ . -" autocomplete="username" autocapitalize="none" spellcheck="false" minlength="2" maxlength="32" required></div>
			${emailField("register-email")}
			${newPasswordField("register-password", "密码")}
			<button class="btn primary wide auth-submit">发送验证码</button>
			<p class="auth-hint">已有账号？<button class="link link-strong" type="button" data-auth-view="login">返回登录</button></p>
		</form>
		<form data-email-purpose="register" data-email-step="finish" hidden>
			<p class="lead">验证码已发送至 <span class="email-target" data-email-target></span>，15 分钟内有效。</p>
			${codeField("register-code")}
			<button class="btn primary wide auth-submit">完成注册</button>
			<p class="auth-hint email-actions">
				<button class="link" type="button" data-email-back>修改信息</button>
				<span class="auth-sep" aria-hidden="true">·</span>
				<button class="link" type="button" data-email-resend>重新发送</button>
			</p>
		</form>
	</main>
	<footer class="auth-foot">${PROJECT_TEXT_LINK}</footer>
</div>

<div id="view-reset" class="auth-page" hidden>
	<main class="auth">
		${BRAND}
		<h1>找回密码</h1>
		<form data-email-purpose="reset" data-email-step="start">
			<p class="lead">输入已绑定的邮箱获取验证码，未绑定请联系管理员。</p>
			${emailField("reset-email")}
			<button class="btn primary wide auth-submit">发送验证码</button>
			<p class="auth-hint"><button class="link" type="button" data-auth-view="login">返回登录</button></p>
		</form>
		<form data-email-purpose="reset" data-email-step="finish" hidden>
			<p class="lead">如果 <span class="email-target" data-email-target></span> 已绑定账号，你将收到验证码。</p>
			${codeField("reset-code")}
			${newPasswordField("reset-password", "新密码")}
			<button class="btn primary wide auth-submit">重置密码</button>
			<p class="auth-hint email-actions">
				<button class="link" type="button" data-email-back>更换邮箱</button>
				<span class="auth-sep" aria-hidden="true">·</span>
				<button class="link" type="button" data-email-resend>重新发送</button>
			</p>
		</form>
	</main>
	<footer class="auth-foot">${PROJECT_TEXT_LINK}</footer>
</div>`;

export const EMAIL_ACCOUNT_MODAL = `
<dialog class="modal narrow" id="modal-email" aria-labelledby="email-title">
	<div class="modal-body">
		<div class="modal-head">
			<div>
				<h3 id="email-title">绑定邮箱</h3>
				<p class="sub" id="email-sub">绑定后可用于登录和找回密码。</p>
			</div>
			<button type="button" class="link" data-close>关闭</button>
		</div>
		<div id="verified-email" hidden>
			<div class="email-row">
				<span class="email-row-main">
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
					<span id="verified-email-address"></span>
				</span>
				<span class="badge ok">已验证</span>
			</div>
		</div>
		<form data-email-purpose="bind" data-email-step="start">
			${emailField("bind-email")}
			<div class="field"><label class="label" for="bind-password">当前密码</label><input class="input" id="bind-password" type="password" name="password" autocomplete="current-password" maxlength="${MAX_PASSWORD_LENGTH}" required></div>
			<div class="modal-foot">
				<span class="sub" style="margin:0">将向该邮箱发送验证码</span>
				<button class="btn primary">发送验证码</button>
			</div>
		</form>
		<form data-email-purpose="bind" data-email-step="finish" hidden>
			<p class="email-step-note">验证码已发送至 <span class="email-target" data-email-target></span>，15 分钟内有效。</p>
			${codeField("bind-code")}
			<div class="modal-foot">
				<div class="modal-links">
					<button class="link" type="button" data-email-back>返回修改</button>
					<span class="auth-sep" aria-hidden="true">·</span>
					<button class="link" type="button" data-email-resend>重新发送</button>
				</div>
				<button class="btn primary">确认绑定</button>
			</div>
		</form>
	</div>
</dialog>`;

export const EMAIL_ACCOUNT_SCRIPT = `
const emailFlows = new Map();
const emailCooldowns = new Map();
const emailForm = (purpose, step) => document.querySelector('[data-email-purpose="' + purpose + '"][data-email-step="' + step + '"]');

function stopResendCooldown(purpose) {
	const state = emailCooldowns.get(purpose);
	if (state) {
		clearInterval(state.timer);
		emailCooldowns.delete(purpose);
	}
	const resend = emailForm(purpose, "finish")?.querySelector("[data-email-resend]");
	if (resend) {
		resend.textContent = "重新发送";
		resend.disabled = false;
	}
}

function syncResendButton(purpose) {
	const resend = emailForm(purpose, "finish")?.querySelector("[data-email-resend]");
	if (!resend) return;
	const state = emailCooldowns.get(purpose);
	const left = state ? Math.ceil((state.until - Date.now()) / 1000) : 0;
	if (left > 0) {
		resend.textContent = "重新发送 (" + left + "s)";
		resend.disabled = true;
	} else {
		stopResendCooldown(purpose);
	}
}

function startResendCooldown(purpose) {
	stopResendCooldown(purpose);
	const until = Date.now() + 60000;
	const timer = setInterval(() => syncResendButton(purpose), 1000);
	emailCooldowns.set(purpose, { until, timer });
	syncResendButton(purpose);
}

function showEmailStep(purpose, step) {
	for (const name of ["start", "finish"]) emailForm(purpose, name).hidden = name !== step;
	emailForm(purpose, step).querySelector("input").focus();
}

function clearEmailFlow(purpose) {
	emailFlows.delete(purpose);
	stopResendCooldown(purpose);
	const target = emailForm(purpose, "finish")?.querySelector("[data-email-target]");
	if (target) target.textContent = "";
	emailForm(purpose, "start").reset();
	emailForm(purpose, "finish").reset();
}

function showLoginOptions(options) {
	$("start-register").hidden = !options.registrationOpen;
	$("start-reset").hidden = !options.emailAvailable;
	$("login-action-sep").hidden = !(options.registrationOpen && options.emailAvailable);
	$("contact-admin").hidden = options.emailAvailable;
}

for (const button of document.querySelectorAll("[data-auth-view]")) {
	button.onclick = () => {
		const view = button.dataset.authView;
		show(view);
		if (view === "login") $("identifier").focus();
		else {
			clearEmailFlow(view);
			showEmailStep(view, "start");
		}
	};
}

async function emailAction(form, purpose, task) {
	const buttons = [...form.querySelectorAll("button")];
	buttons.forEach((button) => { button.disabled = true; });
	try {
		await task();
	} catch (error) {
		toast(error.message, true);
	} finally {
		buttons.forEach((button) => { button.disabled = false; });
		syncResendButton(purpose);
	}
}

for (const form of document.querySelectorAll("[data-email-purpose]")) {
	const { emailPurpose: purpose, emailStep: step } = form.dataset;
	form.onsubmit = (event) => {
		event.preventDefault();
		emailAction(form, purpose, async () => {
			const body = Object.fromEntries(new FormData(form));
			if (step === "start") {
				const { flow } = await api("email/" + purpose + "/start", body);
				emailFlows.set(purpose, flow);
				const target = emailForm(purpose, "finish").querySelector("[data-email-target]");
				if (target) target.textContent = String(body.email ?? "").trim();
				if (form.elements.password) form.elements.password.value = "";
				showEmailStep(purpose, "finish");
				startResendCooldown(purpose);
				return;
			}
			const startForm = emailForm(purpose, "start");
			const nextIdentifier = purpose === "register"
				? String(startForm.elements.username?.value ?? "").trim()
				: String(startForm.elements.email?.value ?? "").trim();
			await api("email/" + purpose + "/finish", { ...body, flow: emailFlows.get(purpose) });
			clearEmailFlow(purpose);
			if (purpose === "bind") {
				closeModal("modal-email");
				toast("邮箱已绑定");
				await load();
				return;
			}
			show("login");
			if (nextIdentifier) {
				$("identifier").value = nextIdentifier;
				$("password").value = "";
				$("password").focus();
			} else {
				$("identifier").focus();
			}
			toast(purpose === "register" ? "账号已创建，请登录" : "密码已重置，请登录");
		});
	};
	const back = form.querySelector("[data-email-back]");
	if (back) back.onclick = () => {
		form.reset();
		emailFlows.delete(purpose);
		stopResendCooldown(purpose);
		showEmailStep(purpose, "start");
	};
	const resend = form.querySelector("[data-email-resend]");
	if (resend) resend.onclick = () => emailAction(form, purpose, async () => {
		const { flow } = await api("email/" + purpose + "/resend", { flow: emailFlows.get(purpose) });
		emailFlows.set(purpose, flow);
		form.elements.code.value = "";
		form.elements.code.focus();
		startResendCooldown(purpose);
		toast(purpose === "reset" ? "如果该邮箱已绑定账号，你将收到验证码" : "验证码已发送");
	});
}

$("open-email").onclick = () => {
	const email = me.user.email;
	clearEmailFlow("bind");
	$("email-title").textContent = email ? "账号邮箱" : "绑定邮箱";
	$("email-sub").textContent = email ? "可用于登录账号和找回密码。" : "绑定后可用于登录和找回密码。";
	$("verified-email").hidden = !email;
	$("verified-email-address").textContent = email ?? "";
	emailForm("bind", "start").hidden = !!email;
	emailForm("bind", "finish").hidden = true;
	openModal("modal-email");
};

$("modal-email").addEventListener("close", () => {
	clearEmailFlow("bind");
});
`;

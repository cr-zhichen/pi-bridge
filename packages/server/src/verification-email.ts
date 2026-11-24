import type { EmailPurpose } from "./email-challenges.ts";
import { escapeHtml } from "./page.ts";

type EmailCopy = {
	action: string;
	intro: string;
	ignoreNote: string;
};

const COPY: Record<EmailPurpose, EmailCopy> = {
	register: {
		action: "完成注册",
		intro: "在页面输入以下验证码以完成 pi-bridge 账号注册。",
		ignoreNote: "如非本人操作，请忽略此邮件，请勿将验证码告知他人。",
	},
	bind: {
		action: "绑定邮箱",
		intro: "在页面输入以下验证码以将此邮箱绑定到你的 pi-bridge 账号。",
		ignoreNote: "如非本人操作，请忽略此邮件，请勿将验证码告知他人。",
	},
	reset: {
		action: "重置密码",
		intro: "在页面输入以下验证码以重置你的 pi-bridge 登录密码。",
		ignoreNote: "如非本人操作，请忽略此邮件，你的账号密码不会发生变更。",
	},
};

export function verificationEmail(
	purpose: EmailPurpose,
	origin: string,
	code: string,
): { subject: string; html: string; text: string } {
	const { action, intro, ignoreNote } = COPY[purpose];
	const subject = `pi-bridge · ${action}`;
	const rawCode = `${code.slice(0, 4)}-${code.slice(4)}`;
	const site = escapeHtml(origin);
	const formattedCode = escapeHtml(rawCode);
	const preheader = escapeHtml(
		`你的 pi-bridge ${action}验证码是 ${rawCode}，15 分钟内有效。`,
	);

	const text = [
		`pi-bridge · ${action}`,
		"",
		intro,
		"",
		`验证码：${rawCode}`,
		"验证码 15 分钟内有效。",
		ignoreNote,
		"",
		`来源站点：${origin}`,
	].join("\n");

	return {
		subject,
		text,
		html: `<!doctype html>
<html lang="zh-CN">
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width, initial-scale=1">
	<meta name="color-scheme" content="light dark">
	<meta name="supported-color-schemes" content="light dark">
	<title>${escapeHtml(subject)}</title>
	<style>
		:root { color-scheme: light dark; supported-color-schemes: light dark; }
		@media (prefers-color-scheme: dark) {
			.mail-bg { background-color: #09090b !important; }
			.mail-logo { background-color: #fafafa !important; color: #18181b !important; }
			.mail-text { color: #fafafa !important; }
			.mail-muted { color: #a1a1aa !important; }
			.mail-code { background-color: #19191c !important; border-color: #27272a !important; color: #fafafa !important; }
			.mail-divider { border-top-color: #27272a !important; }
			.mail-link { color: #a1a1aa !important; }
		}
	</style>
</head>
<body class="mail-bg" style="margin:0;padding:0;background-color:#ffffff;color:#18181b;font-family:-apple-system,BlinkMacSystemFont,'Inter','PingFang SC','Segoe UI',system-ui,sans-serif;-webkit-font-smoothing:antialiased;">
	<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${preheader}&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;</div>
	<table role="presentation" width="100%" cellspacing="0" cellpadding="0" class="mail-bg" style="background-color:#ffffff;">
		<tr>
			<td align="center" style="padding:40px 20px 48px;">
				<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:420px;text-align:left;">
					<tr>
						<td>
							<table role="presentation" cellspacing="0" cellpadding="0" style="margin-bottom:36px;">
								<tr>
									<td class="mail-logo" align="center" valign="middle" width="28" height="28" style="width:28px;height:28px;border-radius:7px;background-color:#18181b;color:#ffffff;font-size:15px;font-weight:700;line-height:28px;text-align:center;">&pi;</td>
									<td class="mail-text" valign="middle" style="padding-left:10px;font-size:16px;font-weight:600;line-height:24px;letter-spacing:-0.01em;color:#18181b;">pi-bridge</td>
								</tr>
							</table>
							<h1 class="mail-text" style="margin:0;font-size:26px;font-weight:600;line-height:34px;letter-spacing:-0.02em;color:#18181b;">${action}</h1>
							<p class="mail-muted" style="margin:8px 0 28px;font-size:14px;line-height:22px;color:#71717a;">${intro}</p>
							<div class="mail-muted" style="margin:0 0 8px;font-size:12px;font-weight:500;line-height:18px;color:#71717a;">验证码</div>
							<div class="mail-code" style="padding:14px 16px;background-color:#f4f4f5;border:1px solid #e4e4e7;border-radius:7px;font-family:ui-monospace,'SF Mono',SFMono-Regular,Menlo,Consolas,monospace;font-size:24px;font-weight:600;line-height:32px;letter-spacing:0.14em;color:#18181b;user-select:all;-webkit-user-select:all;">${formattedCode}</div>
							<p class="mail-muted" style="margin:12px 0 0;font-size:13px;line-height:21px;color:#71717a;">验证码 15 分钟内有效。${ignoreNote}</p>
							<div class="mail-divider" style="margin-top:32px;padding-top:16px;border-top:1px solid #e4e4e7;">
								<p class="mail-muted" style="margin:0 0 6px;font-size:12px;line-height:18px;color:#71717a;">来源站点：<a class="mail-link" href="${site}" style="color:#71717a;text-decoration:underline;text-underline-offset:2px;word-break:break-all;overflow-wrap:anywhere;">${site}</a></p>
								<p class="mail-muted" style="margin:0;font-size:12px;line-height:18px;color:#71717a;">此邮件由 pi-bridge 自动发送，请勿直接回复。</p>
							</div>
						</td>
					</tr>
				</table>
			</td>
		</tr>
	</table>
</body>
</html>`,
	};
}

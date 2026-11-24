import {
	type EmailPurpose,
	emailProof,
	isEmailFlow,
	newEmailCode,
	normalizeEmail,
} from "./email-challenges.ts";
import { jsonError, notFound, readJson } from "./http.ts";
import {
	hashPassword,
	MAX_PASSWORD_LENGTH,
	passwordProblem,
	verifyPassword,
} from "./password.ts";
import { normalizeUsername, usernameProblem } from "./registry.ts";
import { currentSession, type RegistryStub } from "./session.ts";
import { verificationEmail } from "./verification-email.ts";

type EmailEnv = Env & {
	EMAIL?: SendEmail;
	EMAIL_FROM?: string;
	ALLOW_REGISTRATION?: string;
};

export function emailFeatures(env: EmailEnv): {
	emailAvailable: boolean;
	registrationOpen: boolean;
} {
	const emailAvailable = !!mailSender(env);
	return {
		emailAvailable,
		registrationOpen: emailAvailable && env.ALLOW_REGISTRATION === "true",
	};
}

export async function handleAccountEmail(
	request: Request,
	env: EmailEnv,
	ctx: ExecutionContext,
	registry: RegistryStub,
	purpose: EmailPurpose,
	action: string,
): Promise<Response> {
	const sender = mailSender(env);
	const registrationOpen = env.ALLOW_REGISTRATION === "true";
	if (purpose === "register" && !registrationOpen)
		return jsonError("此实例未开放注册", 403);
	if (!sender) return jsonError("暂时无法发送邮件，请联系管理员", 503);

	const session =
		purpose === "bind" ? await currentSession(request, registry) : null;
	if (purpose === "bind" && (!session || session.user.mustChangePassword)) {
		return jsonError("请登录并设置新密码后再绑定邮箱", 403);
	}
	const sessionHash = session?.hash ?? null;
	const body = await readJson(request);
	const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";

	if (action === "finish") {
		const proof = await emailProof(body.flow, body.code);
		if (!proof) return jsonError("请输入邮件中的 8 位验证码");
		let passwordHash: string | null = null;
		if (purpose === "reset") {
			const problem = passwordProblem(body.password);
			if (problem || typeof body.password !== "string")
				return jsonError(problem ?? "请填写新密码");
			if (!(await registry.verifyResetCode(proof))) {
				return jsonError(
					"验证码无效，请检查验证码。已过期请返回上一步重新获取",
				);
			}
			passwordHash = await hashPassword(body.password);
		}
		const result = await registry.finishEmailFlow(
			purpose,
			proof,
			sessionHash,
			passwordHash,
		);
		return result.ok ? Response.json({}) : jsonError(result.error);
	}

	if (action === "resend") {
		if (!isEmailFlow(body.flow)) return jsonError("请重新获取验证码");
		const { flow, code, challenge } = await newEmailCode(body.flow);
		const result = await registry.resendEmailFlow(
			purpose,
			challenge,
			ip,
			sessionHash,
		);
		if (!result.ok) return jsonError(result.error, result.status);
		return respondWithFlow(request, sender, ctx, purpose, {
			flow,
			email: result.email,
			send: result.send,
			code,
		});
	}
	if (action !== "start") return notFound();

	const email = normalizeEmail(body.email);
	if (!email) return jsonError("请输入有效的邮箱地址");

	let registration: { username: string; passwordHash: string } | null = null;
	let binding: { sessionHash: string; passwordHash: string } | null = null;
	if (purpose === "register") {
		const username = normalizeUsername(body.username);
		const problem = usernameProblem(username) ?? passwordProblem(body.password);
		if (problem || typeof body.password !== "string")
			return jsonError(problem ?? "请填写密码");
		registration = {
			username,
			passwordHash: await hashPassword(body.password),
		};
	}
	if (session) {
		const { username } = session.user;
		const password = body.password;
		if (
			!username ||
			typeof password !== "string" ||
			!password ||
			password.length > MAX_PASSWORD_LENGTH
		) {
			return jsonError("请输入当前密码");
		}
		const check = await registry.beginLogin(username, ip);
		if (check.limited) return jsonError("密码尝试次数过多，请稍后重试", 429);
		if (
			!check.user ||
			!(await verifyPassword(password, check.user.passwordHash))
		) {
			await registry.recordLoginFailure(check.attemptKey, ip);
			return jsonError("当前密码不正确");
		}
		binding = {
			sessionHash: session.hash,
			passwordHash: check.user.passwordHash,
		};
	}

	const { flow, code, challenge } = await newEmailCode();
	const result = await registry.startEmailFlow(
		purpose,
		email,
		challenge,
		ip,
		registration,
		binding,
	);
	if (!result.ok) return jsonError(result.error, result.status);
	return respondWithFlow(request, sender, ctx, purpose, {
		flow,
		email,
		send: result.send,
		code,
	});
}

function mailSender(
	env: EmailEnv,
): { binding: SendEmail; from: string } | null {
	const from = env.EMAIL_FROM?.trim();
	return env.EMAIL && from ? { binding: env.EMAIL, from } : null;
}

async function respondWithFlow(
	request: Request,
	sender: { binding: SendEmail; from: string },
	ctx: ExecutionContext,
	purpose: EmailPurpose,
	{
		flow,
		email,
		send,
		code,
	}: { flow: string; email: string; send: boolean; code: string },
): Promise<Response> {
	if (send) {
		const origin = new URL(request.url).origin;
		const task = sender.binding
			.send({
				from: sender.from,
				to: email,
				...verificationEmail(purpose, origin, code),
			})
			.then(
				() => true,
				() => {
					console.error("pi-bridge 无法发送邮件验证码", purpose);
					return false;
				},
			);
		if (purpose === "reset") ctx.waitUntil(task);
		else if (!(await task)) return jsonError("验证码发送失败，请稍后重试", 503);
	}
	return Response.json({ flow });
}

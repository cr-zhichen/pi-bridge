import { emailFeatures, handleAccountEmail } from "./account-email.ts";
import { ACCOUNT_PAGE } from "./account-page.ts";
import { handleAuthorize } from "./authorize.ts";
import { normalizeEmail } from "./email-challenges.ts";
import { jsonError, notFound, readJson } from "./http.ts";
import { isLegacyApp, listApps, listGrants, revokeApp } from "./oauth.ts";
import { htmlResponse } from "./page.ts";
import {
	hashPassword,
	MAX_PASSWORD_LENGTH,
	passwordProblem,
	verifyDummy,
	verifyPassword,
} from "./password.ts";
import { normalizeUsername, SESSION_TTL_MS } from "./registry.ts";
import {
	currentSession,
	isSameOrigin,
	type RegistryStub,
	redirect,
	type Session,
	safeNext,
	sessionCookie,
} from "./session.ts";
import { hubOf, registryOf } from "./stubs.ts";
import { ALL_DEVICES } from "./user-hub.ts";

/** 这些路径由 handleAccount 处理。 */
export const ACCOUNT_ROUTES = new Set([
	"login",
	"logout",
	"account",
	"authorize",
	"api",
]);

/**
 * 用户的账号页，使用用户名或邮箱和密码登录：
 * - GET  /login                       登录页，登录后跳到 ?next= 指定的站内地址，默认 /account
 * - POST /logout                      表单退出（授权页的「切换账号」），然后回到登录页
 * - GET  /account                     账号页
 * - GET|POST /authorize               OAuth 授权确认（authorize.ts）
 * - POST /api/login                   { identifier, password }
 * - GET  /api/auth/options           邮箱和开放注册状态
 * - POST /api/email/<register|bind|reset>/<start|resend|finish>
 * - POST /api/logout
 * - GET  /api/me                      当前用户、电脑、密钥和已授权的应用
 * - POST /api/me/password             { current, next }
 * - POST /api/me/keys                 创建设备密钥或带密钥的连接器地址
 * - POST /api/me/keys/<id>/revoke
 * - POST /api/me/connectors/<id>/devices  { accessMode, deviceIds }，修改允许访问的电脑
 * - POST /api/me/devices/<id>/remove  移除电脑并吊销它使用的密钥
 * - POST /api/me/devices/<id>/delegation  { enabled }，设置是否允许委派任务给 Pi
 * - POST /api/me/apps/<id>/revoke     撤销 OAuth 授权
 *
 * 登录状态保存在 HttpOnly Cookie 中。写操作只接受同源的 JSON 请求，防止跨站请求。
 */
export async function handleAccount(
	request: Request,
	env: Env,
	parts: string[],
	ctx: ExecutionContext,
): Promise<Response> {
	const registry = registryOf(env);
	const [first, ...rest] = parts;

	if (first === "authorize" && parts.length === 1) {
		return handleAuthorize(request, env);
	}
	if (request.method === "GET" && parts.length === 1) {
		if (first === "login") {
			return htmlResponse(ACCOUNT_PAGE);
		}
		if (first === "account") {
			return (await currentSession(request, registry))
				? htmlResponse(ACCOUNT_PAGE)
				: redirect(`/login${new URL(request.url).search}`);
		}
	}
	if (first === "logout" && parts.length === 1 && request.method === "POST") {
		if (!isSameOrigin(request)) {
			return jsonError("请求来源无效", 403);
		}
		const session = await currentSession(request, registry);
		if (session) {
			await registry.deleteSession(session.hash);
		}
		const next = safeNext(new URL(request.url).searchParams.get("next"));
		const response = redirect(
			next ? `/login?next=${encodeURIComponent(next)}` : "/login",
			303,
		);
		response.headers.set("Set-Cookie", sessionCookie("", 0));
		return response;
	}
	if (first !== "api") {
		return notFound();
	}
	if (
		request.method === "POST" &&
		!(
			isSameOrigin(request) &&
			(request.headers.get("Content-Type") ?? "").startsWith("application/json")
		)
	) {
		return jsonError("请求来源无效", 403);
	}

	const path = rest.join("/");
	if (path === "auth/options" && request.method === "GET") {
		return Response.json(emailFeatures(env));
	}
	const [resource, purpose, emailAction] = rest;
	if (
		request.method === "POST" &&
		resource === "email" &&
		rest.length === 3 &&
		emailAction &&
		(purpose === "register" || purpose === "bind" || purpose === "reset")
	) {
		return handleAccountEmail(
			request,
			env,
			ctx,
			registry,
			purpose,
			emailAction,
		);
	}
	if (path === "login" && request.method === "POST") {
		return login(request, registry);
	}
	if (path === "logout" && request.method === "POST") {
		const session = await currentSession(request, registry);
		if (session) {
			await registry.deleteSession(session.hash);
		}
		return Response.json(
			{},
			{ headers: { "Set-Cookie": sessionCookie("", 0) } },
		);
	}

	const session = await currentSession(request, registry);
	if (!session) {
		return jsonError("请先登录", 401);
	}
	const { user } = session;
	const hub = hubOf(env, user.id);

	if (path === "me" && request.method === "GET") {
		if (user.mustChangePassword) {
			return Response.json({
				user,
				keys: [],
				devices: [],
				apps: [],
				...emailFeatures(env),
			});
		}
		const [keys, devices, access] = await Promise.all([
			registry.listKeys(user.id),
			hub.listDevices(),
			hub.listConnectorAccess(),
		]);
		const apps = await listApps(env, user.id, access);
		return Response.json({
			user,
			...emailFeatures(env),
			keys: keys.map((key) => ({
				...key,
				deviceAccess:
					access[key.id] === undefined && key.scopes.includes("connector")
						? ALL_DEVICES
						: (access[key.id] ?? null),
			})),
			devices,
			apps,
		});
	}
	if (path === "me/password" && request.method === "POST") {
		return changePassword(request, registry, session);
	}
	if (user.mustChangePassword) {
		return jsonError("请先修改初始密码", 403);
	}
	if (request.method !== "POST") {
		return notFound();
	}

	if (path === "me/keys") {
		const body = await readJson(request);
		if (body.type !== "device" && body.type !== "connector") {
			return jsonError("密钥类型无效");
		}
		const label = body.type === "device" ? "电脑名称" : "地址名称";
		if (body.name !== undefined && typeof body.name !== "string") {
			return jsonError(`请填写有效的${label}`);
		}
		const name = body.name?.trim() ?? "";
		if (name.length > 64) {
			return jsonError(`${label}不能超过 64 个字符`);
		}
		if (body.type === "connector" && !name) {
			return jsonError("请填写地址名称");
		}
		const result = await registry.createKey(
			user.id,
			name || "新电脑",
			body.type,
			body.accessMode,
			body.deviceIds,
		);
		return result.ok
			? Response.json({ key: result.key, token: result.token })
			: jsonError(result.error);
	}

	const segments = path.split("/");
	const [me, kind, id, action] = segments;
	if (
		me !== "me" ||
		segments.length !== 4 ||
		!id ||
		!/^[A-Za-z0-9:_-]+$/.test(id)
	) {
		return notFound();
	}
	if (kind === "keys" && action === "revoke") {
		const found = await registry.revokeKey(user.id, id);
		return found ? Response.json({}) : jsonError("密钥不存在", 404);
	}
	if (kind === "connectors" && action === "devices") {
		const { accessMode, deviceIds } = await readJson(request);
		const legacy = id.startsWith("oauth:")
			? (await listGrants(env, user.id)).some((grant) => isLegacyApp(grant, id))
			: /^[a-f0-9]{16}$/.test(id) &&
				(await registry.listKeys(user.id)).some(
					(key) => key.id === id && key.scopes.includes("connector"),
				);
		const result = await hub.updateConnectorAccess(
			id,
			accessMode,
			deviceIds,
			legacy,
		);
		if (!result) {
			return jsonError("连接器已失效，请重新连接。", 404);
		}
		return result.ok ? Response.json({}) : jsonError(result.error);
	}
	if (kind === "devices" && action === "delegation") {
		const { enabled } = await readJson(request);
		if (typeof enabled !== "boolean") {
			return jsonError("请指定是否允许委派任务给 Pi");
		}
		const found = await hub.setDelegationEnabled(id, enabled);
		return found ? Response.json({}) : jsonError("电脑不存在", 404);
	}
	if (kind === "devices" && action === "remove") {
		const device = (await hub.listDevices()).find((d) => d.id === id);
		if (!device) {
			return jsonError("电脑不存在", 404);
		}
		if (device.keyId) {
			await registry.revokeKey(user.id, device.keyId);
		}
		await hub.removeDevice(id);
		return Response.json({});
	}
	if (kind === "apps" && action === "revoke") {
		const grant = (await listGrants(env, user.id)).find(
			(item) => item.id === id,
		);
		if (!grant) {
			return jsonError("授权已失效，请重新连接。", 404);
		}
		await revokeApp(env, user.id, grant);
		return Response.json({});
	}
	return notFound();
}

async function login(
	request: Request,
	registry: RegistryStub,
): Promise<Response> {
	const body = await readJson(request);
	const identifier =
		typeof body.identifier === "string" && body.identifier.includes("@")
			? normalizeEmail(body.identifier)
			: normalizeUsername(body.identifier);
	const error = "登录失败，请检查账号和密码或稍后重试";
	const password = typeof body.password === "string" ? body.password : "";
	if (
		!identifier ||
		identifier.length > 254 ||
		!password ||
		password.length > MAX_PASSWORD_LENGTH
	) {
		return jsonError(error, 401);
	}
	const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
	const check = await registry.beginLogin(identifier, ip);
	if (check.limited === "ip") {
		return jsonError("登录失败次数过多，请稍后重试", 429);
	}
	const user = check.limited ? null : check.user;
	const ok = user
		? await verifyPassword(password, user.passwordHash)
		: await verifyDummy(password);
	if (!ok || !user) {
		await registry.recordLoginFailure(check.attemptKey, ip);
		return jsonError(error, 401);
	}
	const token = await registry.createSession(
		user.id,
		identifier,
		user.passwordHash,
	);
	if (!token) return jsonError(error, 401);
	return Response.json(
		{},
		{ headers: { "Set-Cookie": sessionCookie(token, SESSION_TTL_MS / 1000) } },
	);
}

async function changePassword(
	request: Request,
	registry: RegistryStub,
	session: Session,
): Promise<Response> {
	const { current, next } = await readJson(request);
	const problem = passwordProblem(next);
	if (problem || typeof next !== "string") {
		return jsonError(problem ?? "请填写新密码");
	}
	const stored = await registry.passwordHashOf(session.user.id);
	if (
		!stored ||
		typeof current !== "string" ||
		current.length > MAX_PASSWORD_LENGTH ||
		!(await verifyPassword(current, stored))
	) {
		return jsonError("当前密码不正确");
	}
	if (current === next) {
		return jsonError("新密码不能与当前密码相同");
	}
	const changed = await registry.setPassword(
		session.user.id,
		await hashPassword(next),
		false,
		{ sessionHash: session.hash, passwordHash: stored },
	);
	return changed ? Response.json({}) : jsonError("请重新登录后再修改密码", 401);
}

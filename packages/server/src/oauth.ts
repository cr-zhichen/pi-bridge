import {
	type GrantSummary,
	type OAuthHelpers,
	OAuthProvider,
	type OAuthResourceContext,
} from "@cloudflare/workers-oauth-provider";
import { handleMcp } from "./mcp.ts";
import { hubOf, registryOf } from "./stubs.ts";
import { ALL_DEVICES, type DeviceAccess } from "./user-hub.ts";

/**
 * 网页版连接器的 OAuth：
 * - /mcp                                          带 OAuth 令牌的 MCP 地址
 * - /authorize                                    登录并确认授权（account.ts）
 * - /oauth/token、/oauth/register、/.well-known/...  由 workers-oauth-provider 处理
 *
 * 客户端可以用元数据文档（CIMD，Claude 默认的方式）或动态注册（DCR）。
 * 客户端、授权和令牌保存在 OAUTH_KV，令牌只存哈希。
 */

/** completeAuthorization 写入令牌的数据，调用 /mcp 时取回。 */
export interface AuthProps {
	userId: string;
	/** 按电脑授权上线前签发的令牌只有 userId。 */
	connectorId?: string;
}

/** 写在授权记录上的元数据，账号页的「已授权的应用」用它显示。 */
export interface GrantMetadata {
	connectorId: string;
	clientName: string;
	/** CIMD 客户端的域名，由客户端自己控制，可信。动态注册的客户端没有。 */
	clientDomain?: string;
	redirectHost: string;
}

export interface AppInfo extends Omit<GrantMetadata, "connectorId"> {
	id: string;
	connectorId: string;
	deviceAccess: DeviceAccess | null;
	clientId: string;
	createdAt: number;
	lastUsedAt: number | null;
}

export function oauthOf(env: Env): OAuthHelpers {
	return (env as Env & { OAUTH_PROVIDER: OAuthHelpers }).OAUTH_PROVIDER;
}

function legacyConnectorId(grantId: string): string {
	return `oauth:${grantId}`;
}

export function isLegacyApp(grant: GrantSummary, connectorId: string): boolean {
	const metadata = grant.metadata as Partial<GrantMetadata> | undefined;
	return !metadata?.connectorId && legacyConnectorId(grant.id) === connectorId;
}

/** 用户的全部授权。 */
export async function listGrants(
	env: Env,
	userId: string,
): Promise<GrantSummary[]> {
	const oauth = oauthOf(env);
	const grants: GrantSummary[] = [];
	let cursor: string | undefined;
	do {
		const page = await oauth.listUserGrants(userId, { cursor });
		grants.push(...page.items);
		cursor = page.cursor;
	} while (cursor);
	return grants;
}

export async function listApps(
	env: Env,
	userId: string,
	access: Record<string, DeviceAccess | null>,
): Promise<AppInfo[]> {
	const [grants, usage] = await Promise.all([
		listGrants(env, userId),
		registryOf(env).appUsage(userId),
	]);
	return grants
		.map((grant) => {
			const metadata = (grant.metadata ?? {}) as Partial<GrantMetadata>;
			const connectorId = metadata.connectorId ?? legacyConnectorId(grant.id);
			return {
				id: grant.id,
				connectorId,
				deviceAccess:
					access[connectorId] === undefined && !metadata.connectorId
						? ALL_DEVICES
						: (access[connectorId] ?? null),
				clientId: grant.clientId,
				clientName: metadata.clientName || grant.clientId,
				clientDomain: metadata.clientDomain,
				redirectHost: metadata.redirectHost ?? "",
				// 库里的时间是秒，这里统一成毫秒
				createdAt: grant.createdAt * 1000,
				lastUsedAt: usage[grant.clientId] ?? null,
			};
		})
		.sort((a, b) => b.createdAt - a.createdAt);
}

/** 撤销用户的全部授权，已发出的令牌立即失效。 */
export async function revokeAllGrants(env: Env, userId: string): Promise<void> {
	for (const grant of await listGrants(env, userId)) {
		await revokeApp(env, userId, grant);
	}
}

export async function revokeApp(
	env: Env,
	userId: string,
	grant: GrantSummary,
): Promise<void> {
	const metadata = grant.metadata as Partial<GrantMetadata> | undefined;
	await hubOf(env, userId).revokeConnectorAccess(
		metadata?.connectorId ?? legacyConnectorId(grant.id),
	);
	await oauthOf(env).revokeGrant(grant.id, userId);
}

const apiHandler: ExportedHandler<Env> &
	Pick<Required<ExportedHandler<Env>>, "fetch"> = {
	async fetch(request, env, ctx) {
		const { props, auth } = ctx as OAuthResourceContext<AuthProps>;
		const allowed = await registryOf(env).authorizeApp(
			props.userId,
			auth.clientId ?? "",
		);
		if (!allowed) {
			return new Response("用户已被禁用", { status: 403 });
		}
		let connectorId = props.connectorId;
		if (!connectorId) {
			const legacy = await oauthOf(env).unwrapToken(auth.token);
			if (legacy) connectorId = legacyConnectorId(legacy.grantId);
		}
		if (
			!connectorId ||
			(await hubOf(env, props.userId).connectorAccess(
				connectorId,
				!props.connectorId,
			)) === null
		) {
			return new Response("请在客户端重新连接并选择允许访问的电脑。", {
				status: 401,
				headers: { "WWW-Authenticate": 'Bearer error="invalid_token"' },
			});
		}
		return handleMcp(request, env, props.userId, connectorId);
	},
};

const providers = new Map<string, OAuthProvider<Env>>();

/**
 * OAuth 的资源地址必须是完整的 URL，而每个人部署的域名不同，所以按请求的域名创建。
 * 同一个 Worker 绑定了多个域名时，各域名的令牌互不通用。
 */
export function providerFor(
	origin: string,
	defaultHandler: ExportedHandler<Env> &
		Pick<Required<ExportedHandler<Env>>, "fetch">,
): OAuthProvider<Env> {
	let provider = providers.get(origin);
	if (!provider) {
		provider = new OAuthProvider<Env>({
			apiRoute: "/mcp",
			apiHandler,
			defaultHandler,
			authorizeEndpoint: "/authorize",
			tokenEndpoint: "/oauth/token",
			clientRegistrationEndpoint: "/oauth/register",
			clientIdMetadataDocumentEnabled: true,
			resourceMetadata: {
				resource: `${origin}/mcp`,
				authorization_servers: [origin],
				resource_name: "pi-bridge",
			},
			// 连接器持续使用就一直有效，连续 30 天没用才需要重新授权
			refreshTokenTTL: 30 * 24 * 60 * 60,
			refreshTokenIdleTTL: 30 * 24 * 60 * 60,
		});
		providers.set(origin, provider);
	}
	return provider;
}

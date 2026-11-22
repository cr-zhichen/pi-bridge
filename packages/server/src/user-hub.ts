import { DurableObject } from "cloudflare:workers";
import {
	CLOSE_INCOMPATIBLE,
	CLOSE_REPLACED,
	CLOSE_REVOKED,
	type DeviceInfo,
	type DeviceMessage,
	deviceIdOf,
	type OpName,
	type Ops,
	PROTOCOL_VERSION,
} from "./protocol.ts";
import { randomId } from "./stubs.ts";

export type Result<T> = { ok: true; result: T } | { ok: false; error: string };

const RECONNECT_TIMEOUT_MS = 3_000;
/** 转发的操作都由 CLI 限时返回；超过这个时间说明设备没有响应。 */
const REQUEST_TIMEOUT_MS = 60_000;
const DEVICE_NOT_ALLOWED =
	"此连接器无权访问这台电脑，请在账号页修改允许访问的电脑。";

interface Pending {
	ws: WebSocket;
	resolve: (result: Result<unknown>) => void;
	timer: ReturnType<typeof setTimeout>;
	/** 连接中断或超时时返回的错误。 */
	lostError: string;
}

type DeviceRow = {
	id: string;
	name: string;
	platform: string;
	version: string;
	last_seen: number;
	key_id: string | null;
	delegation_enabled: number;
};

function keyTag(keyId: string): string {
	return `key:${keyId}`;
}

/**
 * 每个用户一个实例：保持该用户各设备的 WebSocket 连接，
 * 把 MCP 工具调用转发到会话 ID 或任务 ID 对应的设备。
 */
export class UserHub extends DurableObject<Env> {
	sql = this.ctx.storage.sql;
	pending = new Map<string, Pending>();
	private reconnectWaiters = new Map<string, Set<(ws: WebSocket) => void>>();

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		this.sql.exec(`CREATE TABLE IF NOT EXISTS devices (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			platform TEXT NOT NULL,
			version TEXT NOT NULL,
			last_seen INTEGER NOT NULL,
			delegation_enabled INTEGER NOT NULL DEFAULT 0
		)`);
		// 设备最近一次连接用的密钥，账号页据此显示每台电脑用的是哪个密钥
		const columns = this.sql
			.exec<{ name: string }>("PRAGMA table_info(devices)")
			.toArray();
		if (!columns.some((column) => column.name === "key_id")) {
			this.sql.exec("ALTER TABLE devices ADD COLUMN key_id TEXT");
		}
		if (!columns.some((column) => column.name === "delegation_enabled")) {
			this.sql.exec(
				"ALTER TABLE devices ADD COLUMN delegation_enabled INTEGER NOT NULL DEFAULT 0",
			);
		}
		this.sql.exec(`CREATE TABLE IF NOT EXISTS connector_access (
			id TEXT PRIMARY KEY,
			device_ids TEXT NOT NULL
		)`);
		// CLI 的心跳由运行时直接回复，不唤醒休眠的实例
		this.ctx.setWebSocketAutoResponse(
			new WebSocketRequestResponsePair("ping", "pong"),
		);
	}

	/** CLI 的 WebSocket 连接。查询参数 key 是 Worker 鉴权后填入的密钥 ID。 */
	async fetch(request: Request): Promise<Response> {
		if (request.headers.get("Upgrade") !== "websocket") {
			return new Response("需要 WebSocket 连接", { status: 426 });
		}
		const query = new URL(request.url).searchParams;
		if (query.get("protocol") !== String(PROTOCOL_VERSION)) {
			const { 0: client, 1: server } = new WebSocketPair();
			server.accept();
			server.close(CLOSE_INCOMPATIBLE, String(PROTOCOL_VERSION));
			return new Response(null, { status: 101, webSocket: client });
		}
		const id = query.get("device") ?? "";
		if (!/^[a-z0-9]{8,32}$/.test(id)) {
			return new Response("设备 ID 无效", { status: 400 });
		}

		for (const old of this.ctx.getWebSockets(id)) {
			old.close(CLOSE_REPLACED, "replaced");
		}
		const keyId = query.get("key") ?? "";
		const previous = this.sql
			.exec<{ key_id: string | null }>(
				"SELECT key_id FROM devices WHERE id = ?",
				id,
			)
			.toArray()[0];
		// 设备 ID 由 CLI 提交，另一把密钥连接同一个 ID 时须重新授权。
		if (previous && previous.key_id !== keyId) {
			this.removeDeviceAccess(id);
		}
		const { 0: client, 1: server } = new WebSocketPair();
		this.ctx.acceptWebSocket(server, [id, keyTag(keyId)]);
		this.sql.exec(
			`INSERT INTO devices (id, name, platform, version, last_seen, key_id) VALUES (?, ?, ?, ?, ?, ?)
			ON CONFLICT (id) DO UPDATE SET name = excluded.name, platform = excluded.platform,
				version = excluded.version, last_seen = excluded.last_seen, key_id = excluded.key_id`,
			id,
			(query.get("name") || id).slice(0, 64),
			(query.get("platform") ?? "").slice(0, 32),
			(query.get("version") ?? "").slice(0, 32),
			Date.now(),
			keyId,
		);
		for (const reconnect of this.reconnectWaiters.get(id) ?? []) {
			reconnect(server);
		}
		return new Response(null, { status: 101, webSocket: client });
	}

	webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): void {
		if (typeof message !== "string") {
			return;
		}
		const response = JSON.parse(message) as DeviceMessage;
		const pending = this.pending.get(response.id);
		if (!pending) {
			return;
		}
		clearTimeout(pending.timer);
		this.pending.delete(response.id);
		pending.resolve(
			response.ok
				? { ok: true, result: response.result }
				: { ok: false, error: response.error },
		);
		this.touch(ws);
	}

	webSocketClose(ws: WebSocket): void {
		this.disconnected(ws);
	}

	webSocketError(ws: WebSocket): void {
		this.disconnected(ws);
	}

	listDevices(): DeviceInfo[] {
		return this.sql
			.exec<DeviceRow>("SELECT * FROM devices ORDER BY last_seen DESC")
			.toArray()
			.map((row) => ({
				id: row.id,
				name: row.name,
				platform: row.platform,
				version: row.version,
				online: this.socketOf(row.id) !== undefined,
				lastSeen: row.last_seen,
				keyId: row.key_id ?? undefined,
				delegationEnabled: row.delegation_enabled === 1,
			}));
	}

	listConnectorAccess(): Record<string, string[]> {
		return Object.fromEntries(
			this.sql
				.exec<{ id: string; device_ids: string }>(
					"SELECT id, device_ids FROM connector_access",
				)
				.toArray()
				.map(({ id, device_ids }) => [id, JSON.parse(device_ids) as string[]]),
		);
	}

	connectorDevices(connectorId: string): string[] | null {
		const row = this.sql
			.exec<{ device_ids: string }>(
				"SELECT device_ids FROM connector_access WHERE id = ?",
				connectorId,
			)
			.toArray()[0];
		return row ? (JSON.parse(row.device_ids) as string[]) : null;
	}

	setConnectorDevices(
		connectorId: string,
		selection: unknown,
	): { ok: true } | { ok: false; error: string } {
		if (!Array.isArray(selection) || selection.length === 0) {
			return { ok: false, error: "请至少选择一台电脑。" };
		}
		const registered = new Set(
			this.sql
				.exec<{ id: string }>("SELECT id FROM devices")
				.toArray()
				.map((row) => row.id),
		);
		if (
			!selection.every((id) => typeof id === "string" && registered.has(id))
		) {
			return { ok: false, error: "所选电脑已无法使用，请重新选择。" };
		}
		this.sql.exec(
			`INSERT INTO connector_access (id, device_ids) VALUES (?, ?)
			ON CONFLICT (id) DO UPDATE SET device_ids = excluded.device_ids`,
			connectorId,
			JSON.stringify([...new Set(selection)]),
		);
		return { ok: true };
	}

	updateConnectorDevices(connectorId: string, selection: unknown) {
		return this.connectorDevices(connectorId) === null
			? null
			: this.setConnectorDevices(connectorId, selection);
	}

	removeConnectorAccess(connectorId: string): void {
		this.sql.exec("DELETE FROM connector_access WHERE id = ?", connectorId);
	}

	setDelegationEnabled(deviceId: string, enabled: boolean): boolean {
		const { rowsWritten } = this.sql.exec(
			"UPDATE devices SET delegation_enabled = ? WHERE id = ?",
			Number(enabled),
			deviceId,
		);
		return rowsWritten > 0;
	}

	async openSession(
		connectorId: string,
		device: string | undefined,
		cwd: string,
	): Promise<
		Result<
			Ops["open_session"]["result"] & {
				deviceName: string;
				delegationEnabled: boolean;
			}
		>
	> {
		const allowed = this.connectorDevices(connectorId);
		const devices = this.listDevices().filter((d) => allowed?.includes(d.id));
		if (devices.length === 0) {
			return {
				ok: false,
				error: "此连接器没有可访问的电脑，请在账号页选择电脑。",
			};
		}
		const online = devices.filter((d) => d.online);
		const names = online.map((d) => d.name).join("、");
		let target: DeviceInfo | undefined;
		if (device) {
			target =
				devices.find((d) => d.id === device) ??
				devices.find((d) => d.name === device);
		} else {
			const candidates = online.length > 0 ? online : devices;
			if (candidates.length === 1) {
				target = candidates[0];
			}
		}
		if (!target) {
			return {
				ok: false,
				error: device
					? `找不到连接器可访问的电脑「${device}」。可访问的电脑：${devices.map((d) => d.name).join("、")}`
					: online.length === 0
						? "没有在线的设备。请在电脑上运行 pi-bridge start"
						: `有多台设备在线，请用 device 参数指定：${names}`,
			};
		}

		const result = (await this.request(connectorId, target.id, "open_session", {
			cwd,
		})) as Result<Ops["open_session"]["result"]>;
		return result.ok
			? {
					ok: true,
					result: {
						...result.result,
						deviceName: target.name,
						delegationEnabled: this.delegationEnabled(target.id),
					},
				}
			: result;
	}

	/**
	 * 按会话 ID 或任务 ID 的前缀把操作转发到对应设备。
	 * 新任务的 ID 由这里生成：连接在等待途中断开时，网页 AI 仍能拿到 job_id 继续查看。
	 */
	async forward(
		connectorId: string,
		op: Exclude<OpName, "open_session">,
		params: { sessionId: string } | { jobId: string },
	): Promise<Result<unknown>> {
		const id = "sessionId" in params ? params.sessionId : params.jobId;
		const deviceId = deviceIdOf(id);
		if (!deviceId) {
			return { ok: false, error: `ID 无效：${id}` };
		}
		if (op === "run" || op === "call" || op === "delegate") {
			const jobId = `${deviceId}.${randomId(6)}`;
			return this.request(
				connectorId,
				deviceId,
				op,
				{ ...params, jobId },
				`设备连接中断，任务可能仍在运行。设备重新连接后可以用 wait 查看结果，或用 cancel 停止。job_id: ${jobId}`,
			);
		}
		return this.request(connectorId, deviceId, op, params);
	}

	private delegationEnabled(deviceId: string): boolean {
		return (
			this.sql
				.exec<{ delegation_enabled: number }>(
					"SELECT delegation_enabled FROM devices WHERE id = ?",
					deviceId,
				)
				.toArray()[0]?.delegation_enabled === 1
		);
	}

	/** 用户被禁用或所有密钥被吊销时断开所有设备。 */
	revoke(): void {
		for (const ws of this.ctx.getWebSockets()) {
			ws.close(CLOSE_REVOKED, "revoked");
		}
	}

	/** 密钥被吊销时只断开用它连接的设备。 */
	revokeKey(keyId: string): void {
		this.removeConnectorAccess(keyId);
		for (const ws of this.ctx.getWebSockets(keyTag(keyId))) {
			ws.close(CLOSE_REVOKED, "revoked");
		}
	}

	revokeAllKeys(keyIds: string[]): void {
		this.sql.exec(
			"DELETE FROM connector_access WHERE id IN (SELECT value FROM json_each(?))",
			JSON.stringify(keyIds),
		);
		this.revoke();
	}

	/** 从设备列表中移除，仍连接着的话先断开。密钥由调用方吊销。 */
	removeDevice(deviceId: string): boolean {
		for (const ws of this.ctx.getWebSockets(deviceId)) {
			ws.close(CLOSE_REVOKED, "removed");
		}
		return this.ctx.storage.transactionSync(() => {
			const { rowsWritten } = this.sql.exec(
				"DELETE FROM devices WHERE id = ?",
				deviceId,
			);
			this.removeDeviceAccess(deviceId);
			return rowsWritten > 0;
		});
	}

	private removeDeviceAccess(deviceId: string): void {
		this.sql.exec(
			`UPDATE connector_access SET device_ids = (
				SELECT json_group_array(value) FROM json_each(device_ids) WHERE value != ?
			) WHERE ? IN (SELECT value FROM json_each(device_ids))`,
			deviceId,
			deviceId,
		);
	}

	private async request(
		connectorId: string,
		deviceId: string,
		op: OpName,
		params: unknown,
		lostError = "设备连接中断或没有响应，请稍后重试",
	): Promise<Result<unknown>> {
		if (!this.connectorDevices(connectorId)?.includes(deviceId)) {
			return { ok: false, error: DEVICE_NOT_ALLOWED };
		}
		const startedAt = Date.now();
		let ws = this.socketOf(deviceId);
		if (!ws) {
			const name = this.sql
				.exec<{ name: string }>(
					"SELECT name FROM devices WHERE id = ?",
					deviceId,
				)
				.toArray()[0]?.name;
			if (name === undefined) {
				return { ok: false, error: "会话或任务不存在" };
			}
			ws = await this.waitForReconnect(deviceId);
			if (!ws) {
				return {
					ok: false,
					error: `设备「${name}」不在线，本次操作未发送，请在设备恢复连接后重试`,
				};
			}
			if (!this.connectorDevices(connectorId)?.includes(deviceId)) {
				return { ok: false, error: DEVICE_NOT_ALLOWED };
			}
		}
		const usesDelegation = op === "delegate" || op === "list_models";
		if (usesDelegation && !this.delegationEnabled(deviceId)) {
			return {
				ok: false,
				error: "这台电脑未开启 Pi 委派。请在账号页的「我的电脑」中开启。",
			};
		}
		const socket = ws;
		const id = crypto.randomUUID();
		const remainingMs = REQUEST_TIMEOUT_MS - (Date.now() - startedAt);
		const result = await new Promise<Result<unknown>>((resolve) => {
			const timer = setTimeout(() => {
				this.pending.delete(id);
				resolve({ ok: false, error: lostError });
			}, remainingMs);
			this.pending.set(id, { ws: socket, resolve, timer, lostError });
			socket.send(JSON.stringify({ type: "request", id, op, params }));
		});
		// 旧 CLI 对未知操作返回成功响应，但没有 result。
		if (usesDelegation && result.ok && result.result === undefined) {
			return {
				ok: false,
				error:
					"这台电脑的 pi-bridge 版本不支持此操作。请在电脑上运行 pi-bridge update 后重试。",
			};
		}
		return result;
	}

	private waitForReconnect(deviceId: string): Promise<WebSocket | undefined> {
		const waiters =
			this.reconnectWaiters.get(deviceId) ?? new Set<(ws: WebSocket) => void>();
		this.reconnectWaiters.set(deviceId, waiters);
		return new Promise((resolve) => {
			const finish = (ws?: WebSocket) => {
				clearTimeout(timer);
				waiters.delete(finish);
				if (waiters.size === 0) {
					this.reconnectWaiters.delete(deviceId);
				}
				resolve(ws);
			};
			const timer = setTimeout(() => finish(), RECONNECT_TIMEOUT_MS);
			waiters.add(finish);
		});
	}

	private socketOf(deviceId: string): WebSocket | undefined {
		return this.ctx
			.getWebSockets(deviceId)
			.filter((ws) => ws.readyState === WebSocket.OPEN)
			.at(-1);
	}

	private disconnected(ws: WebSocket): void {
		this.touch(ws);
		for (const [id, pending] of this.pending) {
			if (pending.ws === ws) {
				clearTimeout(pending.timer);
				this.pending.delete(id);
				pending.resolve({
					ok: false,
					error: pending.lostError,
				});
			}
		}
	}

	private touch(ws: WebSocket): void {
		const [deviceId] = this.ctx.getTags(ws);
		this.sql.exec(
			"UPDATE devices SET last_seen = ? WHERE id = ?",
			Date.now(),
			deviceId,
		);
	}
}

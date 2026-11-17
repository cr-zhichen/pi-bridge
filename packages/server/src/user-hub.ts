import { DurableObject } from "cloudflare:workers";
import {
	CLOSE_REPLACED,
	CLOSE_REVOKED,
	type DeviceInfo,
	type DeviceMessage,
	deviceIdOf,
	type OpName,
	type Ops,
	PROTOCOL_VERSION,
} from "@pi-bridge/protocol";
import { randomId } from "./stubs.ts";

export type Result<T> = { ok: true; result: T } | { ok: false; error: string };

/** 转发的操作都由 CLI 限时返回；超过这个时间说明设备没有响应。 */
const REQUEST_TIMEOUT_MS = 60_000;

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
};

/**
 * 每个用户一个实例：保持该用户各设备的 WebSocket 连接，
 * 把 MCP 工具调用转发到会话 ID 或任务 ID 对应的设备。
 */
export class UserHub extends DurableObject<Env> {
	sql = this.ctx.storage.sql;
	pending = new Map<string, Pending>();

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		this.sql.exec(`CREATE TABLE IF NOT EXISTS devices (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			platform TEXT NOT NULL,
			version TEXT NOT NULL,
			last_seen INTEGER NOT NULL
		)`);
		// CLI 的心跳由运行时直接回复，不唤醒休眠的实例
		this.ctx.setWebSocketAutoResponse(
			new WebSocketRequestResponsePair("ping", "pong"),
		);
	}

	/** CLI 的 WebSocket 连接。 */
	async fetch(request: Request): Promise<Response> {
		if (request.headers.get("Upgrade") !== "websocket") {
			return new Response("需要 WebSocket 连接", { status: 426 });
		}
		const query = new URL(request.url).searchParams;
		if (query.get("protocol") !== String(PROTOCOL_VERSION)) {
			return new Response("pi-bridge 命令行与服务端版本不一致，请更新后重试", {
				status: 400,
			});
		}
		const id = query.get("device") ?? "";
		if (!/^[a-z0-9]{8,32}$/.test(id)) {
			return new Response("设备 ID 无效", { status: 400 });
		}

		for (const old of this.ctx.getWebSockets(id)) {
			old.close(CLOSE_REPLACED, "replaced");
		}
		const { 0: client, 1: server } = new WebSocketPair();
		this.ctx.acceptWebSocket(server, [id]);
		this.sql.exec(
			`INSERT INTO devices (id, name, platform, version, last_seen) VALUES (?, ?, ?, ?, ?)
			ON CONFLICT (id) DO UPDATE SET name = excluded.name, platform = excluded.platform,
				version = excluded.version, last_seen = excluded.last_seen`,
			id,
			(query.get("name") || id).slice(0, 64),
			(query.get("platform") ?? "").slice(0, 32),
			(query.get("version") ?? "").slice(0, 32),
			Date.now(),
		);
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
			}));
	}

	/** 在指定设备上打开会话；只有一台设备在线时可以不指定。 */
	async openSession(
		device: string | undefined,
		cwd: string,
	): Promise<Result<Ops["open_session"]["result"] & { deviceName: string }>> {
		const online = this.listDevices().filter((d) => d.online);
		const names = online.map((d) => d.name).join("、");
		let target: DeviceInfo | undefined;
		if (device) {
			target = online.find((d) => d.name === device || d.id === device);
		} else if (online.length === 1) {
			target = online[0];
		}
		if (!target) {
			return {
				ok: false,
				error: device
					? `设备「${device}」不在线。在线设备：${names || "无"}`
					: online.length === 0
						? "没有在线的设备。请在电脑上运行 pi-bridge start"
						: `有多台设备在线，请用 device 参数指定：${names}`,
			};
		}

		const result = (await this.request(target.id, "open_session", {
			cwd,
		})) as Result<Ops["open_session"]["result"]>;
		return result.ok
			? { ok: true, result: { ...result.result, deviceName: target.name } }
			: result;
	}

	/**
	 * 按会话 ID 或任务 ID 的前缀把操作转发到对应设备。
	 * run 和 call 的任务 ID 由这里生成：连接在等待途中断开时，网页 AI 仍能拿到 job_id 继续查看。
	 */
	async forward(
		op: Exclude<OpName, "open_session">,
		params: { sessionId: string } | { jobId: string },
	): Promise<Result<unknown>> {
		const id = "sessionId" in params ? params.sessionId : params.jobId;
		const deviceId = deviceIdOf(id);
		if (!deviceId) {
			return { ok: false, error: `ID 无效：${id}` };
		}
		if (op === "run" || op === "call") {
			const jobId = `${deviceId}.${randomId(6)}`;
			return this.request(
				deviceId,
				op,
				{ ...params, jobId },
				`设备连接中断，任务可能仍在运行。设备重新连接后可以用 wait 查看结果，或用 cancel 停止。job_id: ${jobId}`,
			);
		}
		return this.request(deviceId, op, params);
	}

	/** 密钥重置或用户被禁用时断开所有设备。 */
	revoke(): void {
		for (const ws of this.ctx.getWebSockets()) {
			ws.close(CLOSE_REVOKED, "revoked");
		}
	}

	private request(
		deviceId: string,
		op: OpName,
		params: unknown,
		lostError = "设备连接中断或没有响应，请稍后重试",
	): Promise<Result<unknown>> {
		const ws = this.socketOf(deviceId);
		if (!ws) {
			const name = this.sql
				.exec<{ name: string }>(
					"SELECT name FROM devices WHERE id = ?",
					deviceId,
				)
				.toArray()[0]?.name;
			if (name === undefined) {
				return Promise.resolve({ ok: false, error: "会话或任务不存在" });
			}
			return Promise.resolve({
				ok: false,
				error: `设备「${name}」当前不在线，请确认电脑上的 pi-bridge 正在运行`,
			});
		}
		const id = crypto.randomUUID();
		return new Promise((resolve) => {
			const timer = setTimeout(() => {
				this.pending.delete(id);
				resolve({ ok: false, error: lostError });
			}, REQUEST_TIMEOUT_MS);
			this.pending.set(id, { ws, resolve, timer, lostError });
			ws.send(JSON.stringify({ type: "request", id, op, params }));
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

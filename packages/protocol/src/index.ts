/**
 * Worker 与本机 CLI 之间通过 WebSocket 交换的消息。
 *
 * Worker 只做鉴权和转发；会话、任务和完整输出都由 CLI 在本机维护。
 * 会话 ID 和任务 ID 以 "<设备 ID>." 开头，Worker 据此把后续调用转发到对应设备。
 * 设备信息放在连接 URL 的查询参数里（见 ConnectParams），因为 Durable Object
 * 需要在接受 WebSocket 时就给连接打上设备标签。
 */

export const PROTOCOL_VERSION = 1;

/** run、call、wait 在本机最多等待的时间，需短于网页版 AI 调用工具的超时。 */
export const WAIT_MS = 25_000;

/** 每次返回的输出上限（字符），超出时保留开头和结尾。 */
export const OUTPUT_LIMIT = 20_000;

/** CLI 连接 /<密钥>/connect 时携带的查询参数。 */
export interface ConnectParams {
	protocol: string;
	device: string;
	name: string;
	platform: string;
	version: string;
}

/** 取出会话 ID 或任务 ID 中的设备 ID。设备 ID 不含 "."。 */
export function deviceIdOf(id: string): string | undefined {
	const dot = id.indexOf(".");
	return dot > 0 ? id.slice(0, dot) : undefined;
}

/** WebSocket 关闭码：同一设备在别处重新连接，旧连接不再重连。 */
export const CLOSE_REPLACED = 4001;
/** WebSocket 关闭码：密钥被重置或用户被禁用。 */
export const CLOSE_REVOKED = 4003;

export interface Image {
	data: string;
	mimeType: string;
}

/**
 * run、call、wait、cancel 的统一返回。
 *
 * 调用最多等待 WAIT_MS：结束时 status 为 "done"；未结束时为 "running"，
 * 之后用 jobId 调用 wait 继续获取新增输出。
 */
export interface JobResult {
	jobId: string;
	kind: "run" | "call";
	status: "running" | "done";
	/** 上次返回之后新增的输出，超出上限时只保留开头和结尾。 */
	output: string;
	images?: Image[];
	/** 输出被截断时，完整输出所在的本机文件。 */
	fullOutputPath?: string;
	/** run 结束时的退出码；被取消或被信号终止时为 null。 */
	exitCode?: number | null;
	/** call 的工具返回了错误。 */
	isError?: boolean;
	cancelled?: boolean;
	elapsedMs: number;
}

export interface ToolSummary {
	name: string;
	description: string;
	/** 只有按名称查询时才返回。 */
	inputSchema?: unknown;
}

export interface SkillSummary {
	name: string;
	description: string;
	path: string;
}

export interface Capabilities {
	tools: ToolSummary[];
	skills: SkillSummary[];
}

/** Worker 转发给 CLI 的操作及其参数和结果。 */
export interface Ops {
	open_session: {
		params: { cwd: string };
		result: { sessionId: string; cwd: string; contextFiles: string[] };
	};
	list_capabilities: {
		params: { sessionId: string; tools?: string[] };
		result: Capabilities;
	};
	call: {
		/** jobId 由 Worker 生成。 */
		params: { sessionId: string; tool: string; args: unknown; jobId: string };
		result: JobResult;
	};
	run: {
		params: { sessionId: string; command: string; jobId: string };
		result: JobResult;
	};
	wait: { params: { jobId: string }; result: JobResult };
	cancel: { params: { jobId: string }; result: JobResult };
}

export type OpName = keyof Ops;

export type Request = {
	[K in OpName]: {
		type: "request";
		id: string;
		op: K;
		params: Ops[K]["params"];
	};
}[OpName];

export type Response =
	| { type: "response"; id: string; ok: true; result: Ops[OpName]["result"] }
	| { type: "response"; id: string; ok: false; error: string };

/** CLI 发给 Worker 的消息。 */
export type DeviceMessage = Response;

/** Worker 发给 CLI 的消息。 */
export type ServerMessage = Request;

/** /<密钥>/devices 返回的设备列表。 */
export interface DeviceInfo {
	id: string;
	name: string;
	platform: string;
	version: string;
	online: boolean;
	lastSeen: number;
}

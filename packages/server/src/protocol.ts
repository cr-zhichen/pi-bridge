/**
 * Worker 与本机 CLI 之间通过 WebSocket 交换的消息，以及两端共同遵守的约定。
 * CLI 直接引用这个文件；一键部署时 Cloudflare 只复制 packages/server，所以放在这里。
 *
 * - Worker 只保存用户和设备，负责鉴权和转发；会话、任务和完整输出都由 CLI 在本机维护。
 * - 网页 AI 用 delegate 把任务交给独立的 Pi 会话（需要追问时可带 delegationId 续接），和 call、run 共用 wait、cancel。
 *   Pi 的 read、grep、edit 等通过 call 调用；Skills 由 open_session 和 list_capabilities
 *   给出 SKILL.md 路径，网页 AI 读取后按说明操作。
 * - call 和 run 像模型发起的工具调用一样触发 Pi 扩展的钩子（run 按 bash 工具处理），
 *   扩展可以阻止调用或修改参数；会话释放时触发 session_shutdown。
 * - 会话 ID 以 "<设备 ID>." 开头，由 CLI 生成；同一目录在多个聊天中共用一个会话。
 * - 任务 ID 同样以设备 ID 开头，由 Worker 生成：连接在等待途中断开时，返回的错误里仍带着
 *   job_id，设备重连后可以继续 wait 或 cancel。电脑关机或 CLI 退出后不恢复。
 * - 设备信息放在连接 URL 的查询参数里（见 ConnectParams），因为 Durable Object
 *   需要在接受 WebSocket 时就给连接打上设备标签。
 */

export const PROTOCOL_VERSION = 1;

/** run、call、wait 在本机最多等待的时间，需短于网页版 AI 调用工具的超时。 */
export const WAIT_MS = 25_000;

export const THINKING_LEVELS = [
	"off",
	"minimal",
	"low",
	"medium",
	"high",
	"xhigh",
	"max",
] as const;

export type ThinkingLevel = (typeof THINKING_LEVELS)[number];

export interface ModelSelection {
	model: string;
	thinkingLevel: ThinkingLevel;
}

export interface ModelSummary {
	id: string;
	name: string;
	thinkingLevels: ThinkingLevel[];
}

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
/**
 * WebSocket 关闭码：CLI 与服务端的协议版本不一致，关闭原因是服务端的协议版本。
 * CLI 读不到 WebSocket 握手失败时的 HTTP 响应，所以服务端先接受连接再用这个关闭码关闭。
 */
export const CLOSE_INCOMPATIBLE = 4002;
/** WebSocket 关闭码：密钥被吊销或用户被禁用。 */
export const CLOSE_REVOKED = 4003;

export interface Image {
	data: string;
	mimeType: string;
}

/**
 * run、call、delegate、wait、cancel 的统一返回。
 *
 * 调用最多等待 WAIT_MS：结束时 status 为 "done"；未结束时为 "running"，
 * 之后用 jobId 调用 wait 继续获取新增输出。
 */
export interface JobResult {
	jobId: string;
	kind: "run" | "call" | "delegate";
	status: "running" | "done";
	/** 上次返回之后新增的输出，超出上限时只保留开头和结尾。 */
	output: string;
	images?: Image[];
	/** 输出被截断时，完整输出所在的本机文件。 */
	fullOutputPath?: string;
	/** run 结束时的退出码；被取消或被信号终止时为 null。 */
	exitCode?: number | null;
	/** call 或 delegate 执行失败。 */
	isError?: boolean;
	/** delegate 可继续追问时返回，传给下一次 delegate 即可复用该会话上下文。 */
	delegationId?: string;
	modelSelection?: ModelSelection;
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
		result: {
			sessionId: string;
			cwd: string;
			contextFiles: string[];
			/** 和 Pi 写进系统提示词的 Skills 相同，不含 disable-model-invocation 的。 */
			skills?: SkillSummary[];
			/** 支持委派的 CLI 才返回模型状态。 */
			hasModels?: boolean;
			defaultModel?: ModelSelection;
		};
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
	list_models: {
		params: { sessionId: string };
		result: ModelSummary[];
	};
	delegate: {
		params: {
			sessionId: string;
			task: string;
			delegationId?: string;
			model?: string;
			thinkingLevel?: ThinkingLevel;
			jobId: string;
		};
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
	delegationEnabled: boolean;
	/** 最近一次连接用的密钥 ID。 */
	keyId?: string;
}

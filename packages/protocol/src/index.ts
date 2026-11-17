/**
 * Worker 与本机 CLI 之间通过 WebSocket 交换的消息。
 *
 * Worker 只做鉴权和转发；会话、任务和完整输出都由 CLI 在本机维护。
 * 会话 ID 和任务 ID 以 "<设备 ID>." 开头，Worker 据此把后续调用转发到对应设备。
 */

export const PROTOCOL_VERSION = 1;

/** CLI 连上 Worker 后发送的第一条消息。 */
export interface Hello {
	type: "hello";
	protocolVersion: number;
	deviceId: string;
	deviceName: string;
	platform: string;
	cliVersion: string;
}

/**
 * run、call、wait 的统一返回。
 *
 * 调用最多等待一段时间：结束时 status 为 "done"；未结束时为 "running"，
 * 之后用 jobId 调用 wait 继续获取新增输出。
 */
export interface Output {
	status: "done" | "running";
	jobId?: string;
	/** 上次返回之后新增的输出，超出上限时只保留开头和结尾。 */
	output: string;
	/** run 结束时的退出码。 */
	exitCode?: number;
	isError?: boolean;
	/** 输出被截断时，完整输出所在的本机文件。 */
	fullOutputPath?: string;
}

export interface Capabilities {
	tools: { name: string; description: string; inputSchema: unknown }[];
	skills: { name: string; description: string; path: string }[];
}

/** Worker 转发给 CLI 的操作及其参数和结果。 */
export interface Ops {
	open_session: { params: { cwd: string }; result: { sessionId: string } };
	list_capabilities: { params: { sessionId: string }; result: Capabilities };
	call: {
		params: { sessionId: string; tool: string; args: unknown };
		result: Output;
	};
	run: { params: { sessionId: string; command: string }; result: Output };
	wait: { params: { jobId: string }; result: Output };
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
export type DeviceMessage = Hello | Response;

/** Worker 发给 CLI 的消息。 */
export type ServerMessage = Request;

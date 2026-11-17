import { randomBytes } from "node:crypto";
import {
	closeSync,
	mkdirSync,
	openSync,
	readdirSync,
	rmSync,
	statSync,
	writeFileSync,
	writeSync,
} from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import type { AgentTool, AgentToolCall } from "@earendil-works/pi-agent-core";
import type { AgentSession } from "@earendil-works/pi-coding-agent";
import type {
	Capabilities,
	Image,
	JobResult,
	Ops,
	Request,
	Response,
} from "../../server/src/protocol.ts";
import { WAIT_MS } from "../../server/src/protocol.ts";
import { JOBS_DIR } from "./config.ts";
import { clip, readLog } from "./output.ts";
import type { PiSdk } from "./pi.ts";

/** 会话空闲这么久且没有运行中的任务时释放。 */
const SESSION_IDLE_MS = 30 * 60_000;
/** 完整输出文件保留的时间。 */
const JOB_LOG_TTL_MS = 7 * 24 * 60 * 60_000;

interface Session {
	id: string;
	cwd: string;
	pi: AgentSession;
	contextFiles: string[];
	lastUsed: number;
	jobs: Set<string>;
}

interface Job {
	id: string;
	kind: "run" | "call";
	session: Session;
	startedAt: number;
	endedAt?: number;
	finished: boolean;
	done: Promise<void>;
	abort: AbortController;
	cancelled: boolean;
	/** run 的输出日志；call 的结果过长时也写在这里。 */
	logPath: string;
	/** run：已写入日志和已返回给网页 AI 的字节数。 */
	written: number;
	delivered: number;
	exitCode?: number | null;
	/** call：工具的返回结果，只返回一次。 */
	result?: { text: string; images: Image[]; isError: boolean };
	resultDelivered: boolean;
}

/** 在本机维护会话和任务，执行 Worker 转发来的操作。 */
export class Bridge {
	deviceId: string;
	pi: PiSdk;
	sessions = new Map<string, Session>();
	jobs = new Map<string, Job>();
	sweeper: NodeJS.Timeout;

	constructor(deviceId: string, pi: PiSdk) {
		this.deviceId = deviceId;
		this.pi = pi;
		this.sweeper = setInterval(() => this.releaseIdleSessions(), 60_000);
		removeOldJobLogs();
	}

	async handle(request: Request): Promise<Response> {
		log(describe(request));
		try {
			const result = await this.dispatch(request);
			return { type: "response", id: request.id, ok: true, result };
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			return { type: "response", id: request.id, ok: false, error: message };
		}
	}

	/** 退出前停止所有任务，避免留下子进程。 */
	shutdown(): void {
		clearInterval(this.sweeper);
		for (const job of this.jobs.values()) {
			job.abort.abort();
		}
		for (const session of this.sessions.values()) {
			session.pi.dispose();
		}
	}

	private dispatch(request: Request): Promise<Ops[Request["op"]]["result"]> {
		switch (request.op) {
			case "open_session":
				return this.openSession(request.params.cwd);
			case "list_capabilities":
				return Promise.resolve(
					this.listCapabilities(request.params.sessionId, request.params.tools),
				);
			case "run":
				return this.run(request.params);
			case "call":
				return this.call(request.params);
			case "wait":
				return this.waitJob(this.job(request.params.jobId));
			case "cancel":
				return this.cancel(request.params.jobId);
		}
	}

	private async openSession(
		input: string,
	): Promise<Ops["open_session"]["result"]> {
		const cwd = resolveDirectory(input);
		const existing = [...this.sessions.values()].find((s) => s.cwd === cwd);
		if (existing) {
			existing.lastUsed = Date.now();
			return {
				sessionId: existing.id,
				cwd,
				contextFiles: existing.contextFiles,
			};
		}

		const { sdk } = this.pi;
		const resourceLoader = new sdk.DefaultResourceLoader({
			cwd,
			agentDir: sdk.getAgentDir(),
			// 与 pi 命令行相同的内置扩展：用户安装了注册同名工具或命令的扩展（例如另一个 MCP 扩展）时，
			// 由那个扩展取代内置的
			extensionFactories: [
				{
					name: "codemode",
					factory: sdk.createCodemodeExtension(),
					replaceable: true,
					builtin: true,
				},
				{
					name: "tool-search",
					factory: sdk.createToolSearchExtension(),
					replaceable: true,
					builtin: true,
				},
				{
					name: "mcp",
					factory: sdk.createMcpExtension(),
					replaceable: true,
					builtin: true,
				},
			],
		});
		await resourceLoader.reload();
		const { session: pi } = await sdk.createAgentSession({
			cwd,
			resourceLoader,
			sessionManager: sdk.SessionManager.inMemory(cwd),
		});
		// 触发 session_start，扩展在这里完成初始化，MCP 服务器开始连接
		await pi.bindExtensions({});

		const session: Session = {
			id: this.newId(),
			cwd,
			pi,
			contextFiles: resourceLoader
				.getAgentsFiles()
				.agentsFiles.map((f) => f.path),
			lastUsed: Date.now(),
			jobs: new Set(),
		};
		this.sessions.set(session.id, session);
		return { sessionId: session.id, cwd, contextFiles: session.contextFiles };
	}

	private listCapabilities(sessionId: string, names?: string[]): Capabilities {
		const { pi } = this.session(sessionId);
		const tools = pi.getAllTools().filter((t) => t.exposure !== "hidden");
		if (names && names.length > 0) {
			const unknown = names.filter((n) => !tools.some((t) => t.name === n));
			if (unknown.length > 0) {
				throw new Error(`未知工具：${unknown.join("、")}`);
			}
			return {
				tools: tools
					.filter((t) => names.includes(t.name))
					.map((t) => ({
						name: t.name,
						description: t.description,
						inputSchema: t.parameters,
					})),
				skills: [],
			};
		}
		return {
			tools: tools.map((t) => ({ name: t.name, description: t.description })),
			skills: pi.resourceLoader.getSkills().skills.map((s) => ({
				name: s.name,
				description: s.description,
				path: s.filePath,
			})),
		};
	}

	private run({
		sessionId,
		command,
		jobId,
	}: Ops["run"]["params"]): Promise<JobResult> {
		const session = this.session(sessionId);
		const job = this.createJob(jobId, "run", session);
		const settings = session.pi.settingsManager;
		const prefix = settings.getShellCommandPrefix();
		const shell = this.pi.sdk.createLocalBashOperations({
			shellPath: settings.getShellPath(),
		});

		const fd = openSync(job.logPath, "w");
		const write = (data: Buffer) => {
			writeSync(fd, data);
			job.written += data.length;
		};
		job.done = shell
			.exec(prefix ? `${prefix}\n${command}` : command, session.cwd, {
				onData: write,
				signal: job.abort.signal,
			})
			.then(
				({ exitCode }) => {
					job.exitCode = exitCode;
				},
				(error: unknown) => {
					job.exitCode = null;
					if (!job.cancelled) {
						write(
							Buffer.from(
								`\n${error instanceof Error ? error.message : error}\n`,
							),
						);
					}
				},
			)
			.finally(() => {
				closeSync(fd);
				this.finish(job);
			});
		return this.waitJob(job);
	}

	private call({
		sessionId,
		tool: name,
		args,
		jobId,
	}: Ops["call"]["params"]): Promise<JobResult> {
		const session = this.session(sessionId);
		const definition = session.pi.getToolDefinition(name);
		if (!definition) {
			throw new Error(`未知工具：${name}。用 list_capabilities 查看可用工具`);
		}
		const job = this.createJob(jobId, "call", session);
		// 扩展工具执行时需要会话上下文，模型发起的调用由 Pi 自动传入
		const tool: AgentTool = {
			name: definition.name,
			label: definition.label,
			description: definition.description,
			parameters: definition.parameters,
			prepareArguments: definition.prepareArguments,
			execute: (id, params, signal, onUpdate) =>
				definition.execute(
					id,
					params as never,
					signal,
					onUpdate,
					session.pi.extensionRunner.createToolContext(id, signal),
				),
		};

		// Pi 的 ctx.executeTool 只能在模型发起的工具调用中使用，这里直接运行工具：
		// 经过参数校验，不经过扩展的 tool_call、tool_result 钩子
		job.done = this.pi.core
			.runToolCall(
				{
					type: "toolCall",
					id: job.id,
					name,
					arguments: (args ?? {}) as AgentToolCall["arguments"],
				},
				{
					tools: [tool],
					assistantMessage: undefined as never,
					context: { messages: [], tools: [tool] },
					signal: job.abort.signal,
				},
			)
			.then(({ result, isError }) => {
				const text: string[] = [];
				const images: Image[] = [];
				for (const block of result.content) {
					if (block.type === "text") {
						text.push(block.text);
					} else {
						images.push({ data: block.data, mimeType: block.mimeType });
					}
				}
				job.result = { text: text.join("\n"), images, isError };
			})
			.finally(() => this.finish(job));
		return this.waitJob(job);
	}

	private async cancel(jobId: string): Promise<JobResult> {
		const job = this.job(jobId);
		if (!job.finished) {
			job.cancelled = true;
			job.abort.abort();
			await job.done;
		}
		return this.collect(job);
	}

	/** 最多等待 WAIT_MS，返回上次之后的新增输出。 */
	private async waitJob(job: Job): Promise<JobResult> {
		if (!job.finished) {
			const timer = new AbortController();
			await Promise.race([
				job.done,
				sleep(WAIT_MS, undefined, { signal: timer.signal }).catch(() => {}),
			]);
			timer.abort();
		}
		job.session.lastUsed = Date.now();
		return this.collect(job);
	}

	private collect(job: Job): JobResult {
		const base = {
			jobId: job.id,
			kind: job.kind,
			status: job.finished ? ("done" as const) : ("running" as const),
			elapsedMs: (job.endedAt ?? Date.now()) - job.startedAt,
			cancelled: job.cancelled || undefined,
		};
		if (job.kind === "run") {
			const { text, clipped, end } = readLog(
				job.logPath,
				job.delivered,
				job.written,
				job.finished,
			);
			job.delivered = end;
			return {
				...base,
				output: text,
				fullOutputPath: clipped ? job.logPath : undefined,
				exitCode: job.finished ? job.exitCode : undefined,
			};
		}

		if (!job.result) {
			return { ...base, output: "" };
		}
		const isError = job.result.isError || undefined;
		if (job.resultDelivered) {
			return { ...base, output: "", isError };
		}
		job.resultDelivered = true;
		const { text, clipped } = clip(job.result.text);
		if (clipped) {
			writeFileSync(job.logPath, job.result.text);
		}
		return {
			...base,
			output: text,
			images: job.result.images,
			isError,
			fullOutputPath: clipped ? job.logPath : undefined,
		};
	}

	private createJob(id: string, kind: Job["kind"], session: Session): Job {
		mkdirSync(JOBS_DIR, { recursive: true });
		const job: Job = {
			id,
			kind,
			session,
			startedAt: Date.now(),
			finished: false,
			done: Promise.resolve(),
			abort: new AbortController(),
			cancelled: false,
			logPath: join(JOBS_DIR, `${id}.log`),
			written: 0,
			delivered: 0,
			resultDelivered: false,
		};
		this.jobs.set(id, job);
		session.jobs.add(id);
		session.lastUsed = Date.now();
		return job;
	}

	private finish(job: Job): void {
		job.finished = true;
		job.endedAt = Date.now();
	}

	private session(id: string): Session {
		const session = this.sessions.get(id);
		if (!session) {
			throw new Error("会话不存在或已过期，请重新调用 open_session");
		}
		session.lastUsed = Date.now();
		return session;
	}

	private job(id: string): Job {
		const job = this.jobs.get(id);
		if (!job) {
			throw new Error("任务不存在或已过期");
		}
		return job;
	}

	private releaseIdleSessions(): void {
		const now = Date.now();
		for (const session of this.sessions.values()) {
			const running = [...session.jobs].some(
				(id) => !this.jobs.get(id)?.finished,
			);
			if (running || now - session.lastUsed < SESSION_IDLE_MS) {
				continue;
			}
			session.pi.dispose();
			for (const id of session.jobs) {
				this.jobs.delete(id);
			}
			this.sessions.delete(session.id);
			log(`释放空闲会话 ${session.cwd}`);
		}
	}

	/** 会话 ID 以设备 ID 开头，Worker 据此转发；任务 ID 由 Worker 生成。 */
	private newId(): string {
		return `${this.deviceId}.${randomBytes(6).toString("hex")}`;
	}
}

function resolveDirectory(input: string): string {
	const path =
		input === "~" || input.startsWith("~/")
			? join(homedir(), input.slice(1))
			: input;
	if (!isAbsolute(path)) {
		throw new Error(`请提供绝对路径：${input}`);
	}
	try {
		if (statSync(path).isDirectory()) {
			return resolve(path);
		}
	} catch {}
	throw new Error(`目录不存在：${path}`);
}

function removeOldJobLogs(): void {
	const now = Date.now();
	let files: string[];
	try {
		files = readdirSync(JOBS_DIR);
	} catch {
		return;
	}
	for (const file of files) {
		const path = join(JOBS_DIR, file);
		if (now - statSync(path).mtimeMs > JOB_LOG_TTL_MS) {
			rmSync(path, { force: true });
		}
	}
}

function describe(request: Request): string {
	switch (request.op) {
		case "open_session":
			return `打开 ${request.params.cwd}`;
		case "run":
			return `运行 ${request.params.command.slice(0, 200)}`;
		case "call":
			return `调用 ${request.params.tool}`;
		default:
			return request.op;
	}
}

export function log(message: string): void {
	console.log(`[${new Date().toLocaleString()}] ${message}`);
}

import { randomBytes } from "node:crypto";
import {
	closeSync,
	mkdirSync,
	openSync,
	readdirSync,
	realpathSync,
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
	ModelSelection,
	ModelSummary,
	Ops,
	Request,
	Response,
	SkillSummary,
	ThinkingLevel,
} from "../../server/src/protocol.ts";
import { WAIT_MS } from "../../server/src/protocol.ts";
import { JOBS_DIR } from "./config.ts";
import { clip, readLog } from "./output.ts";
import type { PiSdk } from "./pi.ts";
import {
	type DelegationOptions,
	delegationHistory,
	listDelegations,
	runPiDelegation,
	saveDelegationSelection,
} from "./pi-delegation.ts";

/** 会话空闲这么久且没有运行中的任务时释放。 */
const SESSION_IDLE_MS = 30 * 60_000;
/** 完整输出文件保留的时间。 */
const JOB_LOG_TTL_MS = 7 * 24 * 60 * 60_000;

interface Session {
	id: string;
	cwd: string;
	delegationCwd: string;
	pi: AgentSession;
	contextFiles: string[];
	lastUsed: number;
	jobs: Set<string>;
}

interface Job {
	id: string;
	kind: JobResult["kind"];
	session: Session;
	startedAt: number;
	endedAt?: number;
	finished: boolean;
	done: Promise<void>;
	abort: AbortController;
	cancelled: boolean;
	/** run 的输出日志；call 和 delegate 的结果过长时也写在这里。 */
	logPath: string;
	/** run：已写入日志和已返回给网页 AI 的字节数。 */
	written: number;
	delivered: number;
	exitCode?: number | null;
	result?: { text: string; images?: Image[]; isError: boolean };
	resultDelivered: boolean;
	/** delegate：等待返回的进度。 */
	progress: string[];
	delegationId?: string;
	modelSelection?: ModelSelection;
}

/** 在本机维护会话和任务，执行 Worker 转发来的操作。 */
export class Bridge {
	deviceId: string;
	pi: PiSdk;
	waitMs: number;
	sessions = new Map<string, Session>();
	private activeDelegations = new Map<string, string>();
	private shuttingDown = false;
	jobs = new Map<string, Job>();
	sweeper: NodeJS.Timeout;

	constructor(deviceId: string, pi: PiSdk, waitMs = WAIT_MS) {
		this.deviceId = deviceId;
		this.pi = pi;
		this.waitMs = waitMs;
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

	/** 退出前停止所有任务，避免留下子进程；再关闭会话，让扩展清理资源。 */
	async shutdown(): Promise<void> {
		this.shuttingDown = true;
		clearInterval(this.sweeper);
		for (const job of this.jobs.values()) {
			job.abort.abort();
		}
		await Promise.all(
			[...this.jobs.values()]
				.filter((job) => job.kind === "delegate")
				.map((job) => job.done),
		);
		const runtimes = new Set(
			[...this.sessions.values()].map(({ pi }) => pi.modelRuntime),
		);
		await Promise.all(
			[...this.sessions.values()].map(({ pi }) => closePiSession(pi)),
		);
		await Promise.all(
			[...runtimes].map((runtime) =>
				typeof runtime.settleCredentialWrites === "function"
					? runtime.settleCredentialWrites().catch(() => {})
					: undefined,
			),
		);
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
			case "list_models":
				return this.listModels(request.params.sessionId);
			case "list_delegations":
				return listDelegations(
					this.pi.sdk,
					this.session(request.params.sessionId).delegationCwd,
					request.params.limit,
				);
			case "delegate":
				return this.delegate(request.params);
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
		const delegationCwd = realpathSync(cwd);
		const existing = [...this.sessions.values()].find(
			(s) => s.cwd === cwd && s.delegationCwd === delegationCwd,
		);
		if (existing) {
			existing.lastUsed = Date.now();
			return this.refreshSessionDescription(existing);
		}

		const pi = await this.createPiSession(cwd);
		const session: Session = {
			id: this.newId(),
			cwd,
			delegationCwd,
			pi,
			contextFiles: pi.resourceLoader
				.getAgentsFiles()
				.agentsFiles.map((f) => f.path),
			lastUsed: Date.now(),
			jobs: new Set(),
		};
		this.sessions.set(session.id, session);
		return describeSession(session);
	}

	private async refreshSessionDescription(
		session: Session,
	): Promise<Ops["open_session"]["result"]> {
		const startup = await this.resolveStartupSelection(session);
		return describeSession(session, startup);
	}

	private async resolveStartupSelection(
		session: Session,
		signal?: AbortSignal,
	): Promise<{
		model: AgentSession["model"];
		thinkingLevel: ThinkingLevel;
		modelRuntime: AgentSession["modelRuntime"];
	}> {
		const { sdk } = this.pi;
		const { cwd, pi } = session;
		await pi.modelRuntime.refresh({ allowNetwork: false, signal });
		signal?.throwIfAborted();
		// 让 SDK 按最新设置解析启动模型，继续使用工作会话已注册的模型提供商。
		const { session: startup } = await sdk.createAgentSession({
			cwd,
			modelRuntime: pi.modelRuntime,
			resourceLoader: new sdk.DefaultResourceLoader({
				cwd,
				agentDir: sdk.getAgentDir(),
				noExtensions: true,
			}),
			sessionManager: sdk.SessionManager.inMemory(cwd),
			noTools: "all",
		});
		try {
			return {
				model: startup.model,
				thinkingLevel: startup.thinkingLevel,
				modelRuntime: startup.modelRuntime,
			};
		} finally {
			startup.dispose();
		}
	}

	private async createPiSession(cwd: string): Promise<AgentSession> {
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
		try {
			await pi.bindExtensions({});
		} catch (error) {
			pi.dispose();
			throw error;
		}
		return pi;
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
			skills: allSkills(pi).map(toSummary),
		};
	}

	private async listModels(sessionId: string): Promise<ModelSummary[]> {
		const { pi } = this.session(sessionId);
		await pi.modelRuntime.refresh({ allowNetwork: false });
		const models = await pi.modelRuntime.getAvailable();
		return models.map((model) => ({
			id: modelId(model),
			name: model.name,
			thinkingLevels: this.pi.ai.getSupportedThinkingLevels(model),
		}));
	}

	private async delegate(
		params: Ops["delegate"]["params"],
	): Promise<JobResult> {
		if (this.shuttingDown) {
			throw new Error("pi-bridge 正在退出，请重启后再委派任务。");
		}
		const session = this.session(params.sessionId);
		const history = delegationHistory(
			this.pi.sdk,
			session.delegationCwd,
			params.delegationId,
		);
		const activeJob = this.activeDelegations.get(history.id);
		if (activeJob) {
			throw new Error(
				`该委派会话正在运行任务（job_id: ${activeJob}），请先等待完成或取消。`,
			);
		}

		const job = this.createJob(params.jobId, "delegate", session);
		this.activeDelegations.set(history.id, job.id);
		job.delegationId = history.file ? history.id : undefined;
		const signal = job.abort.signal;
		job.done = (async () => {
			try {
				const overrides = await this.delegationOverrides(
					session,
					params,
					history.file,
					signal,
				);
				const result = await runPiDelegation(
					this.pi.cliPath,
					history,
					{ task: params.task, ...overrides },
					signal,
					(line) => job.progress.push(line),
				);
				job.result = result;
				job.modelSelection = result.modelSelection;
				const file = this.pi.sdk.SessionManager.findById(
					history.cwd,
					history.id,
					history.dir,
				);
				if (file) {
					job.delegationId = history.id;
					if (!signal.aborted && !result.isError) {
						saveDelegationSelection(this.pi.sdk, file, overrides);
					}
				}
			} catch (error) {
				if (!signal.aborted) {
					job.result = {
						text: error instanceof Error ? error.message : String(error),
						isError: true,
					};
				}
			} finally {
				this.activeDelegations.delete(history.id);
				this.finish(job);
			}
		})();
		return this.waitJob(job);
	}

	private async delegationOverrides(
		session: Session,
		{ model, thinkingLevel }: Ops["delegate"]["params"],
		sessionFile: string | undefined,
		signal: AbortSignal,
	): Promise<DelegationOptions> {
		if (!sessionFile && !model && !thinkingLevel) {
			return {};
		}

		const previous = sessionFile
			? this.pi.sdk.SessionManager.open(sessionFile).buildSessionContext()
			: undefined;
		const { modelRuntime } = session.pi;
		if (sessionFile && !previous?.model && !model) {
			throw new Error("这次委派没有记录模型，请指定模型后继续。");
		}
		const requestedModel =
			model ??
			(previous?.model &&
				`${previous.model.provider}/${previous.model.modelId}`);
		let selected: AgentSession["model"];
		if (requestedModel) {
			await modelRuntime.refresh({ allowNetwork: false, signal });
			const available = await modelRuntime.getAvailable(undefined, { signal });
			selected = available.find(
				(candidate) => modelId(candidate) === requestedModel,
			);
			if (!selected) {
				throw new Error(
					`Pi 模型「${requestedModel}」不可用，请用 list_models 查看可选模型。`,
				);
			}
		} else {
			const startup = await this.resolveStartupSelection(session, signal);
			selected = startup.model;
			if (!selected || !modelRuntime.getModel(selected.provider, selected.id)) {
				throw new Error("没有选中的 Pi 模型，请在电脑上的 Pi 中配置默认模型。");
			}
		}

		const allowed = this.pi.ai.getSupportedThinkingLevels(selected);
		if (thinkingLevel && !allowed.includes(thinkingLevel)) {
			throw new Error(
				`Pi 模型「${modelId(selected)}」不支持思考等级 ${thinkingLevel}。可用等级：${allowed.join("、")}。`,
			);
		}
		return {
			model: requestedModel
				? { provider: selected.provider, id: selected.id }
				: undefined,
			thinkingLevel:
				thinkingLevel ??
				allowed.find((level) => level === previous?.thinkingLevel),
		};
	}

	/**
	 * 网页 AI 运行命令相当于模型调用 bash 工具，按 bash 工具触发扩展的钩子：
	 * tool_call 可以阻止命令或修改命令内容。
	 */
	private async run({
		sessionId,
		command,
		jobId,
	}: Ops["run"]["params"]): Promise<JobResult> {
		const session = this.session(sessionId);
		const runner = session.pi.extensionRunner;
		const input = { command };
		const decision = runner.hasHandlers("tool_call")
			? await runner.emitToolCall({
					type: "tool_call",
					toolName: "bash",
					toolCallId: jobId,
					input,
				})
			: undefined;
		if (decision?.block) {
			throw new Error(
				`命令被 Pi 扩展阻止${decision.reason ? `：${decision.reason}` : ""}`,
			);
		}

		const job = this.createJob(jobId, "run", session);
		const settings = session.pi.settingsManager;
		const prefix = settings.getShellCommandPrefix();
		const shell = this.pi.sdk.createLocalBashOperations({
			shellPath: settings.getShellPath(),
		});
		await runner.emit({
			type: "tool_execution_start",
			toolCallId: job.id,
			toolName: "bash",
			args: input,
		});

		const fd = openSync(job.logPath, "w");
		const write = (data: Buffer) => {
			writeSync(fd, data);
			job.written += data.length;
		};
		job.done = shell
			.exec(
				prefix ? `${prefix}\n${input.command}` : input.command,
				session.cwd,
				{
					onData: write,
					signal: job.abort.signal,
				},
			)
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
			.finally(async () => {
				closeSync(fd);
				await this.emitRunResult(job, input);
				this.finish(job);
			});
		return this.waitJob(job);
	}

	/**
	 * 命令结束后触发 tool_result、tool_execution_end。输出在运行中已经陆续返回给网页 AI，
	 * 扩展对结果的修改不再生效。
	 */
	private async emitRunResult(
		job: Job,
		input: { command: string },
	): Promise<void> {
		const runner = job.session.pi.extensionRunner;
		const output = readLog(job.logPath, 0, job.written, true).text;
		const result = {
			content: [{ type: "text" as const, text: output }],
			details: undefined,
		};
		const isError = job.exitCode !== 0;
		if (runner.hasHandlers("tool_result")) {
			await runner.emitToolResult({
				type: "tool_result",
				toolName: "bash",
				toolCallId: job.id,
				input,
				...result,
				isError,
			});
		}
		await runner.emit({
			type: "tool_execution_end",
			toolCallId: job.id,
			toolName: "bash",
			result,
			isError,
			durationMs: Date.now() - job.startedAt,
		});
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
		const runner = session.pi.extensionRunner;
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
					runner.createToolContext(id, signal),
				),
		};

		// Pi 的 ctx.executeTool 只能在模型发起的工具调用中使用，这里直接运行工具，
		// 并像模型发起的调用一样触发扩展的钩子：tool_call 可以阻止调用或修改参数，tool_result 可以修改结果
		job.done = (async () => {
			await runner.emit({
				type: "tool_execution_start",
				toolCallId: job.id,
				toolName: name,
				args,
			});
			const outcome = await this.pi.core.runToolCall(
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
					beforeToolCall: async ({ toolCall, args }) =>
						runner.hasHandlers("tool_call")
							? runner.emitToolCall({
									type: "tool_call",
									toolName: toolCall.name,
									toolCallId: toolCall.id,
									input: args as Record<string, unknown>,
								})
							: undefined,
					afterToolCall: async ({ toolCall, args, result, isError }) =>
						runner.hasHandlers("tool_result")
							? runner.emitToolResult({
									type: "tool_result",
									toolName: toolCall.name,
									toolCallId: toolCall.id,
									input: args as Record<string, unknown>,
									content: result.content,
									details: result.details,
									...(result.structuredContent === undefined
										? {}
										: { structuredContent: result.structuredContent }),
									isError,
									usage: result.usage,
								})
							: undefined,
				},
			);
			await runner.emit({
				type: "tool_execution_end",
				toolCallId: job.id,
				toolName: name,
				result: outcome.result,
				isError: outcome.isError,
				durationMs: outcome.durationMs,
			});
			const text: string[] = [];
			const images: Image[] = [];
			for (const block of outcome.result.content) {
				if (block.type === "text") {
					text.push(block.text);
				} else {
					images.push({ data: block.data, mimeType: block.mimeType });
				}
			}
			job.result = { text: text.join("\n"), images, isError: outcome.isError };
		})().finally(() => this.finish(job));
		return this.waitJob(job);
	}

	private async cancel(jobId: string): Promise<JobResult> {
		const job = this.job(jobId);
		if (!job.finished) {
			job.cancelled = true;
			job.abort.abort();
			if (job.kind === "delegate") {
				return this.waitJob(job);
			}
			await job.done;
		}
		return this.collect(job);
	}

	/** 最多等待 waitMs，返回上次之后的新增输出。 */
	private async waitJob(job: Job): Promise<JobResult> {
		if (!job.finished) {
			const timer = new AbortController();
			await Promise.race([
				job.done,
				sleep(this.waitMs, undefined, { signal: timer.signal }).catch(() => {}),
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
			delegationId: job.finished ? job.delegationId : undefined,
			modelSelection: job.modelSelection,
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
		if (job.kind === "delegate" && !job.finished) {
			return {
				...base,
				output: clip(job.progress.splice(0).join("\n")).text,
			};
		}

		if (!job.result) {
			return { ...base, output: "" };
		}
		const isError = job.result.isError || undefined;
		if (job.kind === "call" && job.resultDelivered) {
			return { ...base, output: "", isError };
		}
		const { text, clipped } = clip(job.result.text);
		if (clipped && !job.resultDelivered) {
			writeFileSync(job.logPath, job.result.text);
		}
		job.resultDelivered = true;
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
			progress: [],
		};
		this.jobs.set(id, job);
		session.jobs.add(id);
		session.lastUsed = Date.now();
		return job;
	}

	private finish(job: Job): void {
		job.finished = true;
		job.endedAt = Date.now();
		if (job.kind === "delegate") {
			job.session.lastUsed = job.endedAt;
		}
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
			for (const id of session.jobs) {
				this.jobs.delete(id);
			}
			this.sessions.delete(session.id);
			void closePiSession(session.pi);
			log(`释放空闲会话 ${session.cwd}`);
		}
	}

	/** 会话 ID 以设备 ID 开头，Worker 据此转发；任务 ID 由 Worker 生成。 */
	private newId(): string {
		return `${this.deviceId}.${randomBytes(6).toString("hex")}`;
	}
}

/** 像退出 pi 时一样先触发 session_shutdown，扩展在这里断开 MCP 服务器等资源。 */
async function closePiSession(pi: AgentSession): Promise<void> {
	const runner = pi.extensionRunner;
	try {
		if (runner.hasHandlers("session_shutdown")) {
			await runner.emit({ type: "session_shutdown", reason: "quit" });
		}
	} finally {
		pi.dispose();
	}
}

function describeSession(
	session: Session,
	startup: {
		model: AgentSession["model"];
		thinkingLevel: ThinkingLevel;
		modelRuntime: AgentSession["modelRuntime"];
	} = session.pi,
): Ops["open_session"]["result"] {
	const { id, cwd, contextFiles, pi } = session;
	const { model, thinkingLevel, modelRuntime } = startup;
	const models = modelRuntime.getAvailableSnapshot();
	const selected =
		model && models.find((candidate) => modelId(candidate) === modelId(model));
	return {
		sessionId: id,
		cwd,
		contextFiles,
		skills: promptSkills(pi),
		hasModels: models.length > 0,
		defaultModel: selected
			? { model: modelId(selected), thinkingLevel }
			: undefined,
	};
}

function modelId(model: { provider: string; id: string }): string {
	return `${model.provider}/${model.id}`;
}

type Skill = ReturnType<
	AgentSession["resourceLoader"]["getSkills"]
>["skills"][number];

function allSkills(pi: AgentSession): Skill[] {
	return pi.resourceLoader.getSkills().skills;
}

/**
 * Pi 写进系统提示词的 Skills：标了 disable-model-invocation 的只能由用户点名使用，
 * 不主动列给模型，list_capabilities 里仍然能查到。
 */
function promptSkills(pi: AgentSession): SkillSummary[] {
	return allSkills(pi)
		.filter((s) => s.disableModelInvocation !== true)
		.map(toSummary);
}

function toSummary(s: Skill): SkillSummary {
	return { name: s.name, description: s.description, path: s.filePath };
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
		case "delegate":
			return request.params.delegationId ? "委派 Pi（续接）" : "委派 Pi";
		default:
			return request.op;
	}
}

export function log(message: string): void {
	console.log(`[${new Date().toLocaleString()}] ${message}`);
}

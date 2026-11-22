import { type ChildProcess, execFile, spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { once } from "node:events";
import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { stripVTControlCharacters } from "node:util";
import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import type {
	DelegationSummary,
	ModelSelection,
	ThinkingLevel,
} from "../../server/src/protocol.ts";
import { DATA_DIR } from "./config.ts";
import type { PiSdk } from "./pi.ts";

interface DelegationHistory {
	id: string;
	dir: string;
	cwd: string;
	file: string | undefined;
}

interface DelegationResult {
	text: string;
	isError: boolean;
	modelSelection?: ModelSelection;
}

export interface DelegationOptions {
	model?: { provider: string; id: string };
	thinkingLevel?: ThinkingLevel;
}

type AssistantReply = Extract<
	Extract<AgentSessionEvent, { type: "message_end" }>["message"],
	{ role: "assistant" }
>;

const SESSION_ID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const STOP_GRACE_MS = 2_000;
const TASK_PREFIX = "请执行以下委派任务。\n\n";
const PREVIEW_LENGTH = 120;

function projectDelegations(cwd: string): string {
	const project = createHash("sha256").update(cwd).digest("hex");
	return join(DATA_DIR, "delegations", project);
}

export function delegationHistory(
	sdk: PiSdk["sdk"],
	cwd: string,
	id?: string,
): DelegationHistory {
	if (id !== undefined && !SESSION_ID.test(id)) {
		throw new Error("委派会话不存在，请省略 delegation_id 开启新任务。");
	}
	const sessionId = id ?? randomUUID();
	const dir = join(projectDelegations(cwd), sessionId);
	const file = id ? sdk.SessionManager.findById(cwd, id, dir) : undefined;
	if (id && !file) {
		throw new Error("委派会话在当前目录不存在，请使用原目录或开启新任务。");
	}
	return { id: sessionId, dir, cwd, file };
}

export async function listDelegations(
	sdk: PiSdk["sdk"],
	cwd: string,
	limit: number,
): Promise<DelegationSummary[]> {
	const project = projectDelegations(cwd);
	if (!existsSync(project)) {
		return [];
	}
	const candidates = readdirSync(project, { withFileTypes: true }).flatMap(
		(entry) => {
			if (!entry.isDirectory() || !SESSION_ID.test(entry.name)) {
				return [];
			}
			const dir = join(project, entry.name);
			const file = sdk.SessionManager.findById(cwd, entry.name, dir);
			return file
				? [{ delegationId: entry.name, dir, updatedAt: statSync(file).mtimeMs }]
				: [];
		},
	);
	// 只为需要返回的会话读取任务摘要，避免加载此目录的全部对话。
	const recent = candidates
		.sort((a, b) => b.updatedAt - a.updatedAt)
		.slice(0, limit);
	const summaries = await Promise.all(
		recent.map(async ({ delegationId, dir, updatedAt }) => {
			const sessions = await sdk.SessionManager.list(cwd, dir);
			const session = sessions.find((entry) => entry.id === delegationId);
			if (!session) return undefined;
			const message = session.firstMessage.startsWith(TASK_PREFIX)
				? session.firstMessage.slice(TASK_PREFIX.length)
				: session.firstMessage;
			const text = stripVTControlCharacters(message)
				.replace(/\s+/g, " ")
				.trim();
			const characters = Array.from(text);
			const preview =
				characters.length > PREVIEW_LENGTH
					? `${characters.slice(0, PREVIEW_LENGTH).join("")}…`
					: text;
			return { delegationId, updatedAt, preview };
		}),
	);
	return summaries.filter((summary) => summary !== undefined);
}

export function saveDelegationSelection(
	sdk: PiSdk["sdk"],
	file: string,
	{ model, thinkingLevel }: DelegationOptions,
): void {
	if (!model && !thinkingLevel) {
		return;
	}
	const session = sdk.SessionManager.open(file);
	const saved = session.buildSessionContext();
	// Pi 的命令行覆盖值有时只应用于本次进程。用 Pi 的会话条目保存该选择，供下一轮恢复。
	if (
		model &&
		(model.provider !== saved.model?.provider ||
			model.id !== saved.model?.modelId)
	) {
		session.appendModelChange(model.provider, model.id);
	}
	if (thinkingLevel && thinkingLevel !== saved.thinkingLevel) {
		session.appendThinkingLevelChange(thinkingLevel);
	}
}

export async function runPiDelegation(
	cliPath: string,
	{ id, dir, cwd }: DelegationHistory,
	options: DelegationOptions & { task: string },
	signal: AbortSignal,
	onProgress: (line: string) => void,
): Promise<DelegationResult> {
	signal.throwIfAborted();
	mkdirSync(dir, { recursive: true, mode: 0o700 });
	const pidFile = join(dir, "running-pi.pid");
	const previousPid = readPid(pidFile);
	if (previousPid && isRunning(previousPid)) {
		throw new Error("上一轮委派的 Pi 进程仍在运行，请等待结束后再续接。");
	}
	const args = [
		cliPath,
		"--mode",
		"json",
		"--session-dir",
		dir,
		"--session-id",
		id,
	];
	if (options.model) {
		args.push(
			"--provider",
			options.model.provider,
			"--model",
			options.model.id,
		);
	}
	if (options.thinkingLevel) {
		args.push("--thinking", options.thinkingLevel);
	}
	const child = spawn(process.execPath, args, {
		cwd,
		windowsHide: true,
		detached: process.platform !== "win32",
	});
	let stopTimer: ReturnType<typeof setTimeout> | undefined;
	const abort = () => {
		stopPi(child);
		if (process.platform !== "win32") {
			// 扩展可能在关闭时仍等待 I/O。进程结束前不能续接同一份历史。
			stopTimer = setTimeout(() => forceStopPi(child), STOP_GRACE_MS);
		}
	};
	signal.addEventListener("abort", abort, { once: true });
	let reply: AssistantReply | undefined;
	let invalidOutput = false;
	let stderr = "";
	let inputError: Error | undefined;
	const output = createInterface({ input: child.stdout, crlfDelay: Infinity });
	output.on("line", (line) => {
		let event: AgentSessionEvent;
		try {
			const value: unknown = JSON.parse(line);
			if (!value || typeof value !== "object" || !("type" in value)) {
				invalidOutput = true;
				return;
			}
			event = value as AgentSessionEvent;
		} catch {
			invalidOutput = true;
			return;
		}
		if (event.type === "message_end" && event.message.role === "assistant") {
			reply = event.message;
			return;
		}
		const progress = formatProgress(event);
		if (progress) {
			onProgress(progress);
		}
	});
	child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
		stderr = (stderr + chunk).slice(-4_000);
	});
	child.stdin.on("error", (error) => {
		inputError = error;
	});
	const closed = once(child, "close") as Promise<
		[number | null, NodeJS.Signals | null]
	>;
	const pid = child.pid;
	try {
		try {
			if (pid) {
				// 先登记进程，再交付任务。bridge 异常退出后，该进程仍可能占用历史。
				writeFileSync(pidFile, String(pid), { mode: 0o600 });
			}
		} catch (error) {
			abort();
			await closed;
			throw error;
		}
		// 通过 stdin 传入普通提示，避免将任务文本识别为命令行参数或扩展命令。
		child.stdin.end(TASK_PREFIX + options.task);
		const [code, exitSignal] = await closed;
		return delegationResult(reply, {
			cancelled: signal.aborted,
			failed: code !== 0,
			diagnostic:
				stripVTControlCharacters(stderr).trim() || inputError?.message,
			invalidOutput,
			exit: exitSignal ?? code,
		});
	} finally {
		clearTimeout(stopTimer);
		output.close();
		signal.removeEventListener("abort", abort);
		if (pid && readPid(pidFile) === pid) {
			rmSync(pidFile, { force: true });
		}
	}
}

function readPid(file: string): number | undefined {
	try {
		const raw = readFileSync(file, "utf8");
		return /^[1-9][0-9]*$/.test(raw) ? Number(raw) : undefined;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			return undefined;
		}
		throw error;
	}
}

function isRunning(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ESRCH") {
			return false;
		}
		throw error;
	}
}

function stopPi(child: ChildProcess): void {
	if (process.platform === "win32" && child.pid) {
		// Windows 需要同时停止 Pi 启动的工具进程。
		const taskkill = join(
			process.env.SystemRoot || "C:\\Windows",
			"System32",
			"taskkill.exe",
		);
		execFile(
			taskkill,
			["/T", "/F", "/PID", String(child.pid)],
			{ windowsHide: true },
			(error) => {
				if (error && child.exitCode === null && child.signalCode === null) {
					child.kill();
				}
			},
		);
	} else {
		child.kill("SIGTERM");
	}
}

function forceStopPi(child: ChildProcess): void {
	if (child.pid) {
		try {
			process.kill(-child.pid, "SIGKILL");
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ESRCH") {
				child.kill("SIGKILL");
			}
		}
	}
}

function delegationResult(
	reply: AssistantReply | undefined,
	status: {
		cancelled: boolean;
		failed: boolean;
		diagnostic?: string;
		invalidOutput: boolean;
		exit: number | string | null;
	},
): DelegationResult {
	const text = reply?.content
		.filter((block) => block.type === "text")
		.map((block) => block.text)
		.join("");
	const modelSelection = reply?.thinkingLevel
		? {
				model: `${reply.provider}/${reply.model}`,
				thinkingLevel: reply.thinkingLevel,
			}
		: undefined;
	let error: string | undefined;
	if (!status.cancelled) {
		if (status.failed) {
			error =
				reply?.errorMessage ||
				status.diagnostic ||
				`Pi 进程异常退出（${status.exit}）。`;
		} else if (status.invalidOutput) {
			error = "Pi 返回了无法读取的事件。";
		} else if (reply?.stopReason === "length") {
			error = "Pi 输出达到长度上限，结果可能不完整。";
		} else if (reply?.stopReason !== "stop" || !text) {
			error = reply?.errorMessage || "Pi 没有返回完整结果。";
		}
	}
	return {
		text: [error, text].filter(Boolean).join("\n\n"),
		isError: Boolean(error),
		modelSelection,
	};
}

function formatProgress(event: AgentSessionEvent): string | undefined {
	switch (event.type) {
		case "tool_execution_start":
			return `调用 ${event.toolName}`;
		case "tool_execution_end":
			if (event.isError) {
				return `工具 ${event.toolName} 执行失败`;
			}
			if (event.durationMs && event.durationMs >= 3_000) {
				return `工具 ${event.toolName} 已完成（${Math.round(event.durationMs / 1_000)} 秒）`;
			}
			return undefined;
		case "auto_retry_start":
			return `模型请求重试（第 ${event.attempt}/${event.maxAttempts} 次）`;
		case "compaction_start":
			return "正在压缩上下文…";
		case "compaction_end":
			return event.errorMessage ? "压缩上下文失败" : undefined;
		default:
			return undefined;
	}
}

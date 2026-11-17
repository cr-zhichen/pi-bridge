import {
	type CallToolResult,
	createMcpHandler,
	McpServer,
} from "@modelcontextprotocol/server";
import {
	type Capabilities,
	type JobResult,
	type OpName,
	type Ops,
	WAIT_MS,
} from "@pi-bridge/protocol";
import * as z from "zod";
import type { Result, UserHub } from "./user-hub.ts";

type Hub = DurableObjectStub<UserHub>;

const WAIT_SECONDS = WAIT_MS / 1000;

const INSTRUCTIONS = `pi-bridge 让你在用户的电脑上读写文件、运行命令，并使用电脑上 Pi 已安装的工具和 Skills。

1. 先调用 open_session 打开要操作的目录，之后的调用都带上返回的 session_id。
2. open_session 会列出该目录适用的项目说明文件（如 AGENTS.md），开始工作前先用 call 调用 read 读取它们。
3. 运行命令用 run；读取、搜索、修改文件用 call 调用 read、grep、find、ls、edit、write。
4. list_capabilities 列出其他可用工具和 Skills。使用 Skill 时先用 read 读取它的 SKILL.md，再按说明操作。
5. run 和 call 最多等待约 ${WAIT_SECONDS} 秒，未完成时返回 job_id，用 wait 继续获取输出，用 cancel 停止。`;

export function handleMcp(request: Request, hub: Hub): Promise<Response> {
	return createMcpHandler(() => buildServer(hub)).fetch(request);
}

function buildServer(hub: Hub): McpServer {
	const server = new McpServer(
		{ name: "pi-bridge", version: "0.1.0" },
		{ instructions: INSTRUCTIONS },
	);
	const sessionId = z.string().describe("open_session 返回的 session_id");
	const jobId = z.string().describe("run 或 call 返回的 job_id");

	server.registerTool(
		"open_session",
		{
			title: "打开目录",
			description:
				"在用户电脑的指定目录打开会话，返回 session_id 和该目录适用的项目说明文件。同一目录再次打开会得到同一个会话。",
			inputSchema: z.object({
				cwd: z
					.string()
					.describe("要操作的目录的绝对路径，可以用 ~ 表示用户主目录"),
				device: z
					.string()
					.optional()
					.describe("设备名称；只有一台设备在线时可以省略"),
			}),
			annotations: { readOnlyHint: true, openWorldHint: false },
		},
		async ({ cwd, device }) => {
			const result = await hub.openSession(device, cwd);
			if (!result.ok) {
				return errorResult(result.error);
			}
			const { sessionId, deviceName, contextFiles } = result.result;
			const lines = [
				`session_id: ${sessionId}`,
				`设备：${deviceName}`,
				`目录：${result.result.cwd}`,
			];
			if (contextFiles.length > 0) {
				lines.push(
					"",
					"项目说明文件（开始前先读取）：",
					...contextFiles.map((f) => `- ${f}`),
				);
			}
			return textResult(lines.join("\n"));
		},
	);

	server.registerTool(
		"list_capabilities",
		{
			title: "列出工具和 Skills",
			description:
				"列出可以通过 call 调用的工具和可用的 Skills。传入 tools 时只返回这些工具，并附带参数定义。",
			inputSchema: z.object({
				session_id: sessionId,
				tools: z
					.array(z.string())
					.optional()
					.describe("要查看参数定义的工具名称"),
			}),
			annotations: { readOnlyHint: true, openWorldHint: false },
		},
		async ({ session_id, tools }) => {
			const result = await forward(hub, "list_capabilities", {
				sessionId: session_id,
				tools,
			});
			return result.ok
				? textResult(formatCapabilities(result.result))
				: errorResult(result.error);
		},
	);

	server.registerTool(
		"call",
		{
			title: "调用 Pi 工具",
			description: `调用 Pi 的工具，常用的有：
- read { path, offset?, limit? }：读取文件，offset 和 limit 按行计
- grep { pattern, path?, glob?, ignoreCase?, literal?, context?, limit? }：搜索文件内容
- find { pattern, path? }：按文件名 glob 查找文件
- ls { path? }：列出目录
- edit { path, edits: [{ oldText, newText }] }：精确替换文件内容，oldText 必须在文件中唯一
- write { path, content }：创建或覆盖文件
其他工具（扩展和 MCP 服务器提供的）用 list_capabilities 查看名称和参数。最多等待约 ${WAIT_SECONDS} 秒，未完成时返回 job_id。`,
			inputSchema: z.object({
				session_id: sessionId,
				tool: z.string().describe("工具名称"),
				args: z.record(z.string(), z.unknown()).describe("工具参数"),
			}),
			annotations: { destructiveHint: true, openWorldHint: true },
		},
		async ({ session_id, tool, args }) =>
			jobResult(
				await forward(hub, "call", { sessionId: session_id, tool, args }),
			),
	);

	server.registerTool(
		"run",
		{
			title: "运行命令",
			description: `在会话目录中用 shell 运行命令。最多等待约 ${WAIT_SECONDS} 秒：命令结束时返回输出和退出码；未结束时返回已有输出和 job_id，用 wait 继续获取。输出过长时只保留开头和结尾，并给出完整输出的文件路径。`,
			inputSchema: z.object({
				session_id: sessionId,
				command: z.string().describe("要运行的命令"),
			}),
			annotations: { destructiveHint: true, openWorldHint: true },
		},
		async ({ session_id, command }) =>
			jobResult(await forward(hub, "run", { sessionId: session_id, command })),
	);

	server.registerTool(
		"wait",
		{
			title: "等待任务",
			description: `继续等待 run 或 call 的任务，最多约 ${WAIT_SECONDS} 秒，返回上次之后的新增输出。`,
			inputSchema: z.object({ job_id: jobId }),
			annotations: { readOnlyHint: true, openWorldHint: false },
		},
		async ({ job_id }) =>
			jobResult(await forward(hub, "wait", { jobId: job_id })),
	);

	server.registerTool(
		"cancel",
		{
			title: "停止任务",
			description: "停止 run 或 call 的任务。",
			inputSchema: z.object({ job_id: jobId }),
			annotations: { destructiveHint: false, openWorldHint: false },
		},
		async ({ job_id }) =>
			jobResult(await forward(hub, "cancel", { jobId: job_id })),
	);

	return server;
}

async function forward<K extends Exclude<OpName, "open_session">>(
	hub: Hub,
	op: K,
	params: Omit<Ops[K]["params"], "jobId"> | Ops[K]["params"],
): Promise<Result<Ops[K]["result"]>> {
	return (await hub.forward(
		op,
		params as { sessionId: string } | { jobId: string },
	)) as Result<Ops[K]["result"]>;
}

function jobResult(result: Result<JobResult>): CallToolResult {
	if (!result.ok) {
		return errorResult(result.error);
	}
	const job = result.result;
	const parts = [formatStatus(job)];
	if (job.fullOutputPath) {
		parts.push(
			`输出过长，已省略中间部分。完整输出保存在 ${job.fullOutputPath}，可以用 call 调用 read 或 grep 查看。`,
		);
	}
	if (job.output) {
		parts.push(job.output);
	}
	return {
		content: [
			{ type: "text", text: parts.join("\n\n") },
			...(job.images ?? []).map((image) => ({
				type: "image" as const,
				data: image.data,
				mimeType: image.mimeType,
			})),
		],
		isError: job.isError,
	};
}

function formatStatus(job: JobResult): string {
	const seconds = Math.round(job.elapsedMs / 1000);
	if (job.status === "running") {
		return `仍在运行（已运行 ${seconds} 秒），job_id: ${job.jobId}。用 wait 获取后续输出，或用 cancel 停止。`;
	}
	if (job.cancelled) {
		return `已停止（运行了 ${seconds} 秒）。`;
	}
	if (job.kind === "run") {
		return `已结束，退出码 ${job.exitCode ?? "无"}（用时 ${seconds} 秒）。`;
	}
	return job.isError
		? `工具返回错误（用时 ${seconds} 秒）。`
		: `已完成（用时 ${seconds} 秒）。`;
}

function formatCapabilities({ tools, skills }: Capabilities): string {
	const lines: string[] = [];
	if (tools.some((t) => t.inputSchema !== undefined)) {
		for (const tool of tools) {
			lines.push(
				`## ${tool.name}`,
				tool.description,
				"参数：",
				JSON.stringify(tool.inputSchema),
				"",
			);
		}
		return lines.join("\n");
	}
	lines.push("工具：");
	for (const tool of tools) {
		lines.push(`- ${tool.name}：${oneLine(firstLine(tool.description))}`);
	}
	lines.push("", "Skills（用 read 读取路径中的 SKILL.md 后按说明操作）：");
	for (const skill of skills) {
		lines.push(
			`- ${skill.name}：${oneLine(skill.description)}（${skill.path}）`,
		);
	}
	if (skills.length === 0) {
		lines.push("（无）");
	}
	return lines.join("\n");
}

function firstLine(text: string): string {
	return text.split("\n", 1)[0] ?? "";
}

function oneLine(text: string): string {
	return text.replace(/\s+/g, " ").trim();
}

function textResult(text: string): CallToolResult {
	return { content: [{ type: "text", text }] };
}

function errorResult(text: string): CallToolResult {
	return { content: [{ type: "text", text }], isError: true };
}

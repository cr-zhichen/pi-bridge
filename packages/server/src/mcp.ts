import {
	type CallToolResult,
	createMcpHandler,
	McpServer,
} from "@modelcontextprotocol/server";
import * as z from "zod";
import pkg from "../package.json" with { type: "json" };
import {
	type Capabilities,
	type JobResult,
	type OpName,
	type Ops,
	type SkillSummary,
	THINKING_LEVELS,
	WAIT_MS,
} from "./protocol.ts";
import { hubOf } from "./stubs.ts";
import {
	createUpload,
	expireFile,
	getDownloadLink,
	TRANSFER_ID_PATTERN,
} from "./transfers.ts";
import type { Result } from "./user-hub.ts";

const WAIT_SECONDS = WAIT_MS / 1000;

const INSTRUCTIONS = `pi-bridge 让你在用户的电脑上读写文件、运行命令，并使用电脑上 Pi 已安装的工具和 Skills。

1. 操作电脑前，先调用 open_session 打开目录，需要 session_id 时使用它返回的值。
2. open_session 会列出该目录适用的项目说明文件（如 AGENTS.md），开始工作前先用 call 调用 read 读取它们。
3. open_session 还会列出电脑上可用的 Skills。任务符合某个 Skill 的描述时，先用 call 调用 read 读取它的 SKILL.md，再按说明操作。
4. 运行命令用 run；读取、搜索、修改文件用 call 调用 read、grep、find、ls、edit、write。
5. list_capabilities 列出扩展和 MCP 服务器提供的其他工具。
6. 用户允许当前任务使用 Pi 时，可以用 delegate 委派；找回以前的委派用 list_delegations，续接时把相应的 delegation_id 传给 delegate。run、call 和 delegate 最多等待约 ${WAIT_SECONDS} 秒，未完成时返回 job_id，用 wait 获取后续输出或结果，用 cancel 停止。`;

export function handleMcp(
	request: Request,
	env: Env,
	userId: string,
	connectorId: string,
): Promise<Response> {
	const origin = new URL(request.url).origin;
	return createMcpHandler(() =>
		buildServer(env, origin, userId, connectorId),
	).fetch(request);
}

function buildServer(
	env: Env,
	origin: string,
	userId: string,
	connectorId: string,
): McpServer {
	const server = new McpServer(
		{ name: "pi-bridge", version: pkg.version },
		{ instructions: INSTRUCTIONS },
	);
	const hub = hubOf(env, userId);
	const sessionId = z.string().describe("open_session 返回的 session_id");
	const jobId = z.string().describe("run、call 或 delegate 返回的 job_id");

	async function forward<K extends Exclude<OpName, "open_session">>(
		op: K,
		params: Omit<Ops[K]["params"], "jobId"> | Ops[K]["params"],
	): Promise<Result<Ops[K]["result"]>> {
		return (await hub.forward(
			connectorId,
			op,
			params as { sessionId: string } | { jobId: string },
		)) as Result<Ops[K]["result"]>;
	}

	server.registerTool(
		"open_session",
		{
			title: "打开目录",
			description:
				"在用户电脑的指定目录打开会话，返回 session_id、该目录适用的项目说明文件和可用的 Skills。同一目录再次打开会得到同一个会话。",
			inputSchema: z.object({
				cwd: z
					.string()
					.describe("要操作的目录的绝对路径，可以用 ~ 表示用户主目录"),
				device: z
					.string()
					.optional()
					.describe(
						"电脑名称。只允许访问一台电脑，或允许访问的电脑中只有一台在线时可以省略。",
					),
			}),
			annotations: { readOnlyHint: true, openWorldHint: false },
		},
		async ({ cwd, device }) => {
			const result = await hub.openSession(connectorId, device, cwd);
			if (!result.ok) {
				return errorResult(result.error);
			}
			const {
				sessionId,
				deviceName,
				contextFiles,
				skills,
				delegationEnabled,
				hasModels,
				defaultModel,
			} = result.result;
			const lines = [
				`session_id: ${sessionId}`,
				`设备：${deviceName}`,
				`目录：${result.result.cwd}`,
			];
			if (hasModels === undefined) {
				lines.push("Pi 委派：请更新本机 pi-bridge 后使用。");
			} else {
				lines.push(
					`Pi 委派：${delegationEnabled ? "已开启" : "已关闭"}`,
					`Pi 模型：${hasModels ? "有可选模型" : "没有可选模型"}`,
				);
			}
			if (defaultModel) {
				lines.push(
					`默认模型：${defaultModel.model}（思考等级：${defaultModel.thinkingLevel}）`,
				);
			}
			if (contextFiles.length > 0) {
				lines.push(
					"",
					"项目说明文件（开始前先读取）：",
					...contextFiles.map((f) => `- ${f}`),
				);
			}
			if (skills === undefined) {
				lines.push("", "可用的 Skills 用 list_capabilities 查看。");
			} else if (skills.length > 0) {
				lines.push(
					"",
					"可用的 Skills（任务符合描述时，先用 call 调用 read 读取 SKILL.md，再按说明操作）：",
					...formatSkills(skills),
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
			const result = await forward("list_capabilities", {
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
			jobResult(await forward("call", { sessionId: session_id, tool, args })),
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
			jobResult(await forward("run", { sessionId: session_id, command })),
	);

	server.registerTool(
		"list_models",
		{
			title: "列出 Pi 模型",
			description: "列出当前会话可选的 Pi 模型和各自支持的思考等级。",
			inputSchema: z.object({ session_id: sessionId }),
			annotations: { readOnlyHint: true, openWorldHint: true },
		},
		async ({ session_id }) => {
			const result = await forward("list_models", {
				sessionId: session_id,
			});
			if (!result.ok) {
				return errorResult(result.error);
			}
			return textResult(
				result.result
					.map(
						({ id, name, thinkingLevels }) =>
							`- ${id}（${name}，思考等级：${thinkingLevels.join("、")}）`,
					)
					.join("\n") || "没有可选的 Pi 模型。",
			);
		},
	);

	server.registerTool(
		"list_delegations",
		{
			title: "查找 Pi 委派",
			description:
				"列出当前电脑、当前目录的近期 Pi 委派，按最近更新时间排序，包含任务开头和可用于续接的 delegation_id。用户想继续之前的委派、当前对话中又没有委派 ID 时使用。无法确定要续接哪一条时，先请用户选择。",
			inputSchema: z.object({
				session_id: sessionId,
				limit: z.number().int().min(1).max(20).default(5),
			}),
			annotations: { readOnlyHint: true, openWorldHint: false },
		},
		async ({ session_id, limit }) => {
			const result = await forward("list_delegations", {
				sessionId: session_id,
				limit,
			});
			if (!result.ok) {
				return errorResult(result.error);
			}
			if (!result.result.length) {
				return textResult("当前目录没有保存的 Pi 委派。");
			}
			return textResult(
				result.result
					.map(
						({ delegationId, updatedAt, preview }) =>
							`- ${new Date(updatedAt).toISOString()} · ${preview}\n  delegation_id: ${delegationId}`,
					)
					.join("\n"),
			);
		},
	);

	server.registerTool(
		"delegate",
		{
			title: "委派任务给 Pi",
			description: `在会话目录中把任务交给 Pi 执行，仅在用户允许或要求使用 Pi 时调用。不传 delegation_id 时会在全新独立会话中执行（Pi 看不到当前聊天上下文，需在 task 中提供完整背景、目标和约束）；需要基于之前某次委派继续追问或补充修改时，可自主传入它返回的 delegation_id 以复用上下文。最多等待约 ${WAIT_SECONDS} 秒，未完成时返回 job_id 和当前进度，用 wait 获取后续进度或结果，用 cancel 停止。`,
			inputSchema: z.object({
				session_id: sessionId,
				task: z.string().trim().min(1).describe("交给 Pi 的任务描述"),
				delegation_id: z
					.string()
					.trim()
					.min(1)
					.optional()
					.describe(
						"需要追问或续接某次已有委派时传入它返回的 delegation_id；省略则开启全新的独立会话",
					),
				model: z
					.string()
					.trim()
					.min(1)
					.optional()
					.describe(
						"list_models 返回的模型 ID，省略时使用 Pi 的默认模型（续接时保持该委派会话当前模型）",
					),
				thinking_level: z
					.enum(THINKING_LEVELS)
					.optional()
					.describe(
						"思考等级，省略时使用 Pi 的配置（续接时保持该委派会话当前设置）",
					),
			}),
			annotations: { destructiveHint: true, openWorldHint: true },
		},
		async ({ session_id, task, delegation_id, model, thinking_level }) =>
			jobResult(
				await forward("delegate", {
					sessionId: session_id,
					task,
					delegationId: delegation_id,
					model,
					thinkingLevel: thinking_level,
				}),
			),
	);

	server.registerTool(
		"wait",
		{
			title: "等待任务",
			description: `等待任务，最多约 ${WAIT_SECONDS} 秒，返回新增输出或任务结果。`,
			inputSchema: z.object({ job_id: jobId }),
			annotations: { readOnlyHint: true, openWorldHint: false },
		},
		async ({ job_id }) => jobResult(await forward("wait", { jobId: job_id })),
	);

	server.registerTool(
		"cancel",
		{
			title: "停止任务",
			description: "停止 run、call 或 delegate 的任务。",
			inputSchema: z.object({ job_id: jobId }),
			annotations: { destructiveHint: false, openWorldHint: false },
		},
		async ({ job_id }) => jobResult(await forward("cancel", { jobId: job_id })),
	);

	registerTransferTools(server, env.TRANSFER_FILES, origin, userId);
	return server;
}

function registerTransferTools(
	server: McpServer,
	bucket: R2Bucket,
	origin: string,
	userId: string,
): void {
	const fileId = z
		.string()
		.regex(TRANSFER_ID_PATTERN)
		.describe("create_upload 返回的 file_id");

	server.registerTool(
		"create_upload",
		{
			title: "申请上传临时文件",
			description:
				"为一个文件申请临时上传地址和令牌。按结果中的用法发送文件，上传成功后可获取下载链接。",
			inputSchema: z.object({
				file_name: z
					.string()
					.trim()
					.min(1)
					.max(255)
					.regex(/^[^/\\\p{Cc}]+$/u)
					.describe("含扩展名的文件名"),
			}),
			annotations: { destructiveHint: false, openWorldHint: false },
		},
		async ({ file_name }) =>
			textResult(
				JSON.stringify(await createUpload(bucket, origin, userId, file_name)),
			),
	);

	server.registerTool(
		"get_download_link",
		{
			title: "获取下载链接",
			description: "为已上传且仍在保留期内的临时文件获取新的下载链接。",
			inputSchema: z.object({ file_id: fileId }),
			annotations: { readOnlyHint: true, openWorldHint: false },
		},
		async ({ file_id }) => {
			const result = await getDownloadLink(bucket, origin, userId, file_id);
			return result
				? textResult(JSON.stringify(result))
				: errorResult(
						"文件尚未上传、已过期或无法访问。请检查文件 ID，过期后请重新上传",
					);
		},
	);

	server.registerTool(
		"expire_file",
		{
			title: "删除临时文件",
			description: "删除暂存的文件并立即使下载链接失效。文件确认用完后可调用。",
			inputSchema: z.object({ file_id: fileId }),
			annotations: { destructiveHint: true, openWorldHint: false },
		},
		async ({ file_id }) =>
			(await expireFile(bucket, userId, file_id))
				? textResult("已删除临时文件")
				: errorResult("文件已删除或无法访问，请检查文件 ID"),
	);
}

function jobResult(result: Result<JobResult>): CallToolResult {
	if (!result.ok) {
		return errorResult(result.error);
	}
	const job = result.result;
	const parts = [formatStatus(job)];
	if (job.delegationId) {
		parts.push(
			`delegation_id: ${job.delegationId}（需要继续追问此委派时传给 delegate）`,
		);
	}
	if (job.modelSelection) {
		parts.push(
			`Pi 模型：${job.modelSelection.model}（思考等级：${job.modelSelection.thinkingLevel}）`,
		);
	}
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
		? `任务失败（用时 ${seconds} 秒）。`
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
	lines.push(...formatSkills(skills));
	if (skills.length === 0) {
		lines.push("（无）");
	}
	return lines.join("\n");
}

function formatSkills(skills: SkillSummary[]): string[] {
	return skills.map(
		(skill) =>
			`- ${skill.name}：${oneLine(skill.description)}（${skill.path}）`,
	);
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

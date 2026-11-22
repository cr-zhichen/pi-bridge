import assert from "node:assert/strict";
import { once } from "node:events";
import {
	mkdirSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import type { JobResult, Ops, Request } from "../../server/src/protocol.ts";
import type { Bridge } from "../src/bridge.ts";

export type Send = <T>(op: Request["op"], params: unknown) => Promise<T>;

export async function checkDelegation(
	send: Send,
	opened: Ops["open_session"]["result"],
	bridge: Bridge,
): Promise<void> {
	const wait = (jobId: string) => send<JobResult>("wait", { jobId });
	const run = (id: string, sessionId: string, task: string, options = {}) =>
		send<JobResult>("delegate", {
			sessionId,
			jobId: `compat.${id}`,
			task,
			...options,
		});
	assert.equal(opened.hasModels, false);
	const missingModel = await run(
		"no-model",
		opened.sessionId,
		"This task requires a model.",
	);
	assert.equal(missingModel.isError, true);
	assert.match(
		missingModel.output,
		/no models? (available|selected)|no api key found/i,
	);

	let releaseSlow: (() => void) | undefined;
	const provider = createServer(async (request, response) => {
		if (request.url === "/startup-hook") {
			provider.emit("startup-hook");
			return;
		}
		const chunks: Buffer[] = [];
		for await (const chunk of request) {
			chunks.push(chunk);
		}
		const body = JSON.parse(Buffer.concat(chunks).toString()) as {
			model: string;
			messages: { role: string; content: unknown }[];
		};
		const userMessages = body.messages.filter(
			(message) => message.role === "user",
		);
		const user = userMessages.at(-1);
		const task = JSON.stringify(user?.content);
		if (task.includes("Cancel this task")) {
			provider.emit("task-started");
			return;
		}
		if (task.includes("Return a provider error")) {
			response.writeHead(401, { "Content-Type": "application/json" });
			response.end(
				JSON.stringify({ error: { message: "fixture rejected this request" } }),
			);
			return;
		}
		const readResult = body.messages.findLast(
			(message) => message.role === "tool",
		);
		const wantsRead =
			(task.includes("Read the fixture") ||
				task.includes("Slow read with progress")) &&
			!readResult;
		if (task.includes("Slow read with progress") && readResult) {
			provider.emit("slow-after-tool");
			await new Promise<void>((resolve) => {
				releaseSlow = resolve;
			});
		}
		const delta = wantsRead
			? {
					role: "assistant",
					tool_calls: [
						{
							index: 0,
							id: "read_fixture",
							type: "function",
							function: { name: "read", arguments: '{"path":"fixture.txt"}' },
						},
					],
				}
			: {
					role: "assistant",
					content:
						task.includes("Follow up") || task.includes("Independent check")
							? `turns=${userMessages.length};model=${body.model};seenFirst=${JSON.stringify(body.messages).includes("Read the fixture")}`
							: (readResult?.content ?? `used ${body.model}`),
				};
		const event = {
			id: "fixture-response",
			object: "chat.completion.chunk",
			model: body.model,
			choices: [
				{ index: 0, delta, finish_reason: wantsRead ? "tool_calls" : "stop" },
			],
		};
		response.writeHead(200, { "Content-Type": "text/event-stream" });
		response.end(`data: ${JSON.stringify(event)}\n\ndata: [DONE]\n\n`);
	});
	await once(provider.listen(0, "127.0.0.1"), "listening");
	try {
		const { port } = provider.address() as AddressInfo;
		const agentDir = join(process.cwd(), ".pi", "agent");
		const extensions = join(agentDir, "extensions");
		mkdirSync(extensions, { recursive: true });
		writeFileSync(
			join(extensions, "slow-startup.ts"),
			`export default function (pi) {
	pi.on("before_agent_start", async ({ prompt }) => {
		if (prompt?.includes("Cancel during startup")) await fetch("http://127.0.0.1:${port}/startup-hook");
	});
}
`,
		);
		const modelsPath = join(agentDir, "models.json");
		writeFileSync(
			modelsPath,
			JSON.stringify({
				providers: {
					fixture: {
						baseUrl: `http://127.0.0.1:${port}/v1`,
						api: "openai-completions",
						apiKey: "fixture-key",
						models: ["primary", "alternate"].map((id) => ({
							id,
							name: id,
							reasoning: true,
						})),
					},
				},
			}),
		);
		const settingsPath = join(agentDir, "settings.json");
		const settings = {
			defaultProvider: "fixture",
			defaultModel: "primary",
			defaultThinkingLevel: "medium",
		};
		writeFileSync(settingsPath, JSON.stringify(settings));
		const cwd = join(process.cwd(), "delegated-project");
		mkdirSync(cwd);
		writeFileSync(join(cwd, "fixture.txt"), "read in the delegated directory");
		const session = await send<Ops["open_session"]["result"]>("open_session", {
			cwd,
		});
		assert.equal(session.hasModels, true);
		assert.deepEqual(session.defaultModel, {
			model: "fixture/primary",
			thinkingLevel: "medium",
		});
		const models = await send<Ops["list_models"]["result"]>("list_models", {
			sessionId: session.sessionId,
		});
		assert.ok(
			models
				.find((model) => model.id === "fixture/alternate")
				?.thinkingLevels.includes("high"),
		);

		// 短任务直接一次完成并返回 delegationId，重复 wait 保持幂等
		const read = await run("default", session.sessionId, "Read the fixture");
		assert.equal(read.status, "done");
		assert.equal(read.isError, undefined, read.output);
		assert.match(read.output, /read in the delegated directory/);
		assert.deepEqual(read.modelSelection, session.defaultModel);
		assert.ok(read.delegationId);
		assert.equal((await wait(read.jobId)).output, read.output);

		// 多轮追问：传入 delegationId 复用上下文，并支持切模型和思考等级
		const followUp = await run("follow-up", session.sessionId, "Follow up", {
			delegationId: read.delegationId,
			model: "fixture/alternate",
			thinkingLevel: "high",
		});
		assert.equal(followUp.status, "done");
		assert.equal(followUp.delegationId, read.delegationId);
		assert.equal(followUp.output, "turns=2;model=alternate;seenFirst=true");
		assert.deepEqual(followUp.modelSelection, {
			model: "fixture/alternate",
			thinkingLevel: "high",
		});
		const inherited = await run(
			"inherited",
			session.sessionId,
			"Follow up with the same settings",
			{
				delegationId: read.delegationId,
			},
		);
		assert.equal(inherited.output, "turns=3;model=alternate;seenFirst=true");
		assert.deepEqual(inherited.modelSelection, followUp.modelSelection);
		const switched = await run(
			"model-only",
			session.sessionId,
			"Follow up with another model",
			{
				delegationId: read.delegationId,
				model: "fixture/primary",
			},
		);
		assert.equal(switched.output, "turns=4;model=primary;seenFirst=true");
		assert.deepEqual(switched.modelSelection, {
			model: "fixture/primary",
			thinkingLevel: "high",
		});

		// 省略 delegationId 时开启全新独立会话
		const independent = await run(
			"independent",
			session.sessionId,
			"Independent check",
		);
		assert.equal(independent.status, "done");
		assert.ok(independent.delegationId);
		assert.notEqual(independent.delegationId, read.delegationId);
		assert.equal(independent.output, "turns=1;model=primary;seenFirst=false");

		const list = (sessionId: string, limit: number) =>
			send<Ops["list_delegations"]["result"]>("list_delegations", {
				sessionId,
				limit,
			});
		const recent = await list(session.sessionId, 5);
		assert.deepEqual(
			recent.map(({ delegationId, preview }) => ({ delegationId, preview })),
			[
				{
					delegationId: independent.delegationId,
					preview: "Independent check",
				},
				{ delegationId: read.delegationId, preview: "Read the fixture" },
			],
		);
		assert.deepEqual(await list(session.sessionId, 1), recent.slice(0, 1));
		assert.deepEqual(await list(opened.sessionId, 5), []);
		const restored = await run(
			"restored",
			session.sessionId,
			"Follow up after lookup",
			{
				delegationId: recent[1]?.delegationId,
			},
		);
		assert.equal(restored.output, "turns=5;model=primary;seenFirst=true");
		assert.equal(
			(await list(session.sessionId, 1))[0]?.delegationId,
			read.delegationId,
		);

		const alias = join(process.cwd(), "delegated-alias");
		symlinkSync(cwd, alias, "junction");
		const aliasSession = await send<Ops["open_session"]["result"]>(
			"open_session",
			{
				cwd: alias,
			},
		);
		rmSync(alias);
		symlinkSync(process.cwd(), alias, "junction");
		assert.equal(
			(await list(aliasSession.sessionId, 1))[0]?.delegationId,
			read.delegationId,
		);

		// 跨目录会话或不存在的 delegationId 直接前置失败
		await assert.rejects(
			run("wrong-session", opened.sessionId, "Follow up", {
				delegationId: read.delegationId,
			}),
			/在当前目录不存在/,
		);
		await assert.rejects(
			run("missing-delegation", session.sessionId, "Follow up", {
				delegationId: "compat.nonexistent",
			}),
			/不存在/,
		);

		// 显式选择模型与思考等级
		const selected = await run(
			"selection",
			session.sessionId,
			"Use the optional model",
			{
				model: "fixture/alternate",
				thinkingLevel: "high",
			},
		);
		assert.equal(selected.status, "done");
		assert.match(selected.output, /used alternate/);
		assert.deepEqual(selected.modelSelection, {
			model: "fixture/alternate",
			thinkingLevel: "high",
		});

		// 模型和思考等级前置校验失败
		const unknown = await run(
			"unknown",
			session.sessionId,
			"Use a missing model",
			{
				model: "fixture/missing",
			},
		);
		assert.equal(unknown.isError, true);
		assert.match(unknown.output, /不可用/);
		const unsupported = await run(
			"unsupported",
			session.sessionId,
			"Use an unavailable thinking level",
			{
				thinkingLevel: "max",
			},
		);
		assert.equal(unsupported.isError, true);
		assert.match(unsupported.output, /不支持思考等级 max/);

		// 提供商报错时，如果 Pi 保存了这一轮，返回可恢复的历史 ID。
		const rejected = await run(
			"rejected",
			session.sessionId,
			"Return a provider error",
		);
		assert.equal(rejected.status, "done");
		assert.equal(rejected.isError, true);
		assert.match(rejected.output, /fixture rejected this request/);
		assert.ok(rejected.delegationId);
		const recoveredError = await run(
			"retry-error",
			session.sessionId,
			"Follow up after provider error",
			{
				delegationId: rejected.delegationId,
			},
		);
		assert.equal(recoveredError.isError, undefined, recoveredError.output);
		assert.equal(
			recoveredError.output,
			"turns=2;model=primary;seenFirst=false",
		);

		// 长任务运行期间返回工具调用进度，完成后返回最终结果
		const originalWaitMs = bridge.waitMs;
		bridge.waitMs = 150;
		try {
			const slowAfterTool = once(provider, "slow-after-tool", {
				signal: AbortSignal.timeout(10_000),
			});
			const running = await run(
				"progress",
				session.sessionId,
				"Slow read with progress",
			);
			await slowAfterTool;
			const progress =
				running.status === "running" && running.output
					? running
					: await wait(running.jobId);
			assert.equal(progress.status, "running");
			assert.match(progress.output, /调用 read/);
			assert.doesNotMatch(progress.output, /fixture\.txt/);
			releaseSlow?.();
			bridge.waitMs = originalWaitMs;
			const finished = await wait(running.jobId);
			assert.equal(finished.status, "done");
			assert.ok(finished.delegationId);
			assert.match(finished.output, /read in the delegated directory/);
		} finally {
			bridge.waitMs = originalWaitMs;
			releaseSlow?.();
		}

		// 取消运行中的追问：进行中禁止并发追问，取消后原委派会话仍可继续使用
		const started = once(provider, "task-started", {
			signal: AbortSignal.timeout(10_000),
		});
		const pending = run("cancelled", session.sessionId, "Cancel this task", {
			delegationId: read.delegationId,
			model: "fixture/primary",
		});
		await assert.rejects(
			run("busy", session.sessionId, "Follow up", {
				delegationId: read.delegationId,
			}),
			/正在运行任务/,
		);
		await started;
		const cancelled = await send<JobResult>("cancel", {
			jobId: "compat.cancelled",
		});
		assert.equal(cancelled.cancelled, true);
		assert.equal((await pending).cancelled, true);
		const afterCancel = await run(
			"after-cancel",
			session.sessionId,
			"Follow up after cancel",
			{ delegationId: read.delegationId },
		);
		assert.equal(afterCancel.status, "done");
		assert.equal(afterCancel.delegationId, read.delegationId);
		assert.match(afterCancel.output, /seenFirst=true/);

		const startup = once(provider, "startup-hook", {
			signal: AbortSignal.timeout(10_000),
		});
		const stoppingAtStartup = run(
			"cancel-startup",
			session.sessionId,
			"Cancel during startup",
			{
				delegationId: read.delegationId,
			},
		);
		await startup;
		const stopped = await send<JobResult>("cancel", {
			jobId: "compat.cancel-startup",
		});
		assert.equal(stopped.status, "done");
		assert.equal(stopped.cancelled, true);
		assert.equal(stopped.delegationId, read.delegationId);
		await stoppingAtStartup;
		const recovered = await run(
			"recovered",
			session.sessionId,
			"Follow up after startup cancellation",
			{
				delegationId: read.delegationId,
			},
		);
		assert.equal(recovered.isError, undefined, recovered.output);
		assert.match(recovered.output, /seenFirst=true/);

		// 修改默认模型设置后，下次 open_session 和新委派立即生效
		writeFileSync(
			settingsPath,
			JSON.stringify({
				...settings,
				defaultModel: "alternate",
				defaultThinkingLevel: "low",
			}),
		);
		const updated = await send<Ops["open_session"]["result"]>("open_session", {
			cwd,
		});
		assert.equal(updated.sessionId, session.sessionId);
		assert.deepEqual(updated.defaultModel, {
			model: "fixture/alternate",
			thinkingLevel: "low",
		});
		const updatedDefault = await run(
			"updated",
			session.sessionId,
			"Use the updated default",
		);
		assert.equal(updatedDefault.status, "done");
		assert.match(updatedDefault.output, /used alternate/);
		assert.deepEqual(updatedDefault.modelSelection, updated.defaultModel);

		// 原有模型移除后，追问在发送历史前失败。
		const modelConfig = JSON.parse(readFileSync(modelsPath, "utf8"));
		modelConfig.providers.fixture.models.pop();
		writeFileSync(modelsPath, JSON.stringify(modelConfig));
		const unavailable = await run(
			"removed-model",
			session.sessionId,
			"Follow up after removing model",
			{
				delegationId: updatedDefault.delegationId,
			},
		);
		assert.equal(unavailable.isError, true);
		assert.match(unavailable.output, /「fixture\/alternate」不可用/);
	} finally {
		provider.closeAllConnections();
		await new Promise<void>((resolve) => provider.close(() => resolve()));
	}
}

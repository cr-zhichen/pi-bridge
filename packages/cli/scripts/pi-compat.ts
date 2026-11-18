/**
 * 在指定版本的 Pi 上检查 pi-bridge 能否正常工作：mise run test-pi -- <版本>，不指定时用最新版。
 *
 * 用 npm 把 Pi 全局安装到临时目录，并以临时目录作为主目录运行，不读写这台电脑上的 Pi 设置。
 * 主目录里放一个扩展：注册工具，检查扩展工具也能调用；注册钩子，检查调用会触发扩展的钩子。
 * 再放两个 Skill，其中一个标了 disable-model-invocation：open_session 只列出另一个，
 * list_capabilities 两个都列出。
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import type {
	Capabilities,
	JobResult,
	Ops,
	Request,
} from "../../server/src/protocol.ts";
import { Bridge } from "../src/bridge.ts";
import { findPi, loadPi, piProblem } from "../src/pi.ts";

if (process.argv[2] === "--run") {
	await check();
} else {
	const version = process.argv[2] ?? "latest";
	const home = mkdtempSync(join(tmpdir(), "pi-bridge-compat-"));
	const prefix = join(home, "npm");
	execFileSync(
		"npm",
		[
			"install",
			"-g",
			"--ignore-scripts",
			"--no-fund",
			"--no-audit",
			"--prefix",
			prefix,
			`@earendil-works/pi-coding-agent@${version}`,
		],
		{ stdio: "inherit" },
	);
	const testSkills: [string, string][] = [
		["bridge-visible", ""],
		["bridge-manual", "disable-model-invocation: true\n"],
	];
	for (const [name, extra] of testSkills) {
		const dir = join(home, ".pi", "agent", "skills", name);
		mkdirSync(dir, { recursive: true });
		writeFileSync(
			join(dir, "SKILL.md"),
			`---\nname: ${name}\ndescription: Test skill ${name}\n${extra}---\n\nTest.\n`,
		);
	}
	const extensions = join(home, ".pi", "agent", "extensions");
	mkdirSync(extensions, { recursive: true });
	writeFileSync(
		join(extensions, "echo.ts"),
		`import { Type } from "typebox";
export default function (pi) {
	pi.registerTool({
		name: "bridge_echo",
		label: "Echo",
		description: "Echo text",
		parameters: Type.Object({ text: Type.String() }),
		async execute(_id, params) {
			return { content: [{ type: "text", text: "echo:" + params.text }], details: {} };
		},
	});
	const events = (globalThis.bridgeEvents ??= []);
	for (const type of ["tool_execution_start", "tool_execution_end", "tool_result", "session_shutdown"]) {
		pi.on(type, (event) => {
			events.push(event.toolName ? type + ":" + event.toolName : type);
		});
	}
	pi.on("tool_call", (event) => {
		if (event.toolName === "bridge_echo" && event.input.text === "block") {
			return { block: true, reason: "blocked-by-hook" };
		}
		if (event.toolName === "bash") {
			event.input.command = event.input.command.replace("hook-me", "hooked");
		}
	});
	pi.on("tool_result", (event) => {
		if (event.toolName === "bridge_echo") {
			return { content: [{ type: "text", text: "after:" + event.content[0].text }] };
		}
	});
}
`,
	);
	execFileSync(process.execPath, [import.meta.filename, "--run"], {
		stdio: "inherit",
		cwd: home,
		env: {
			...process.env,
			HOME: home,
			USERPROFILE: home,
			PATH: [join(prefix, "bin"), prefix, process.env.PATH].join(delimiter),
		},
	});
}

async function check(): Promise<void> {
	const pi = findPi();
	const problem = piProblem(pi);
	if (problem || !pi) {
		throw new Error(problem);
	}
	console.log(`Pi ${pi.version}：${pi.dir}`);
	const bridge = new Bridge("compat", await loadPi(pi));
	let n = 0;
	const send = async <T>(op: Request["op"], params: unknown): Promise<T> => {
		const response = await bridge.handle({
			type: "request",
			id: String(++n),
			op,
			params,
		} as Request);
		if (!response.ok) {
			throw new Error(`${op}：${response.error}`);
		}
		return response.result as T;
	};

	writeFileSync("hello.txt", "hello from pi-bridge\n");
	const opened = await send<Ops["open_session"]["result"]>("open_session", {
		cwd: process.cwd(),
	});
	const { sessionId } = opened;
	const { tools, skills } = await send<Capabilities>("list_capabilities", {
		sessionId,
	});
	const skillNames = (list: { name: string }[] | undefined) =>
		(list ?? [])
			.map((s) => s.name)
			.sort()
			.join(", ");
	if (skillNames(opened.skills) !== "bridge-visible") {
		throw new Error(
			`open_session 的 Skills 不对：${skillNames(opened.skills)}`,
		);
	}
	if (skillNames(skills) !== "bridge-manual, bridge-visible") {
		throw new Error(`list_capabilities 的 Skills 不对：${skillNames(skills)}`);
	}
	const names = tools.map((t) => t.name);
	for (const name of ["read", "bridge_echo"]) {
		if (!names.includes(name)) {
			throw new Error(`工具列表中没有 ${name}：${names.join(", ")}`);
		}
	}
	const expect = (result: JobResult, text: string) => {
		if (result.isError || !result.output.includes(text)) {
			throw new Error(`结果不符合预期：${JSON.stringify(result)}`);
		}
	};
	expect(
		await send("call", {
			sessionId,
			tool: "read",
			args: { path: "hello.txt" },
			jobId: "compat.read",
		}),
		"hello from pi-bridge",
	);
	expect(
		await send("call", {
			sessionId,
			tool: "bridge_echo",
			args: { text: "ok" },
			jobId: "compat.echo",
		}),
		"after:echo:ok",
	);
	const blocked = await send<JobResult>("call", {
		sessionId,
		tool: "bridge_echo",
		args: { text: "block" },
		jobId: "compat.block",
	});
	if (!blocked.isError || !blocked.output.includes("blocked-by-hook")) {
		throw new Error(`tool_call 没有阻止调用：${JSON.stringify(blocked)}`);
	}
	expect(
		await send("run", {
			sessionId,
			command: "echo hook-me",
			jobId: "compat.run",
		}),
		"hooked",
	);
	await bridge.shutdown();
	const events = (globalThis as { bridgeEvents?: string[] }).bridgeEvents ?? [];
	for (const event of [
		"tool_execution_start:bridge_echo",
		"tool_result:bridge_echo",
		"tool_execution_end:bridge_echo",
		"tool_execution_start:bash",
		"tool_result:bash",
		"tool_execution_end:bash",
		"session_shutdown",
	]) {
		if (!events.includes(event)) {
			throw new Error(`没有触发 ${event}：${events.join(", ")}`);
		}
	}
	console.log(`Pi ${pi.version} 检查通过：${names.length} 个工具`);
}

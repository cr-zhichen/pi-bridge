import { existsSync, readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { delimiter, dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import type { AgentSession } from "@earendil-works/pi-coding-agent";
import type { ThinkingLevel } from "../../server/src/protocol.ts";
import { isNewer } from "./update.ts";

/** 本机 Pi 的 SDK，以及它所用的模型与工具接口。 */
export interface PiSdk {
	sdk: typeof import("@earendil-works/pi-coding-agent");
	core: typeof import("@earendil-works/pi-agent-core");
	cliPath: string;
	ai: {
		getSupportedThinkingLevels(
			model: NonNullable<AgentSession["model"]>,
		): ThinkingLevel[];
	};
}

const PACKAGE = "@earendil-works/pi-coding-agent";
const CORE_PACKAGE = "@earendil-works/pi-agent-core";
const AI_PACKAGE = "@earendil-works/pi-ai";
/**
 * 支持的最低 Pi 版本：更早的版本没有内置的 codemode、MCP 扩展。
 * CI 用 mise run test-pi 在这个版本和最新版本上检查，修改时同步改 ci.yml。
 */
export const MIN_PI_VERSION = "0.99.0";

export interface LocalPi {
	/** Pi 的 npm 包目录。 */
	dir: string;
	version: string;
}

/**
 * 找到这台电脑上命令行里的 pi 对应的安装，返回 undefined 表示没有安装。
 * 按 PATH 顺序查找，跳过找不到安装目录的同名命令（例如 mise 的 shim）。
 */
export function findPi(): LocalPi | undefined {
	const names =
		process.platform === "win32" ? ["pi.cmd", "pi.exe", "pi"] : ["pi"];
	for (const dir of (process.env.PATH ?? "").split(delimiter)) {
		for (const name of names) {
			const command = join(dir, name);
			if (!existsSync(command)) {
				continue;
			}
			const found = packageOf(command);
			if (found) {
				return found;
			}
		}
	}
	return undefined;
}

/** 本机 Pi 不可用时的提示；可用时返回 undefined。 */
export function piProblem(pi: LocalPi | undefined): string | undefined {
	if (!pi) {
		return "这台电脑上没有找到 Pi。请先安装 Pi：https://pi.dev";
	}
	if (isNewer(MIN_PI_VERSION, pi.version)) {
		return `这台电脑上的 Pi 版本是 ${pi.version}，pi-bridge 需要 ${MIN_PI_VERSION} 或更高版本。运行 pi update 升级 Pi`;
	}
	return undefined;
}

/** 从本机 Pi 的安装目录加载它的 SDK，扩展因此和终端里的 pi 运行在同一版本上。 */
export async function loadPi(pi: LocalPi): Promise<PiSdk> {
	const bin = readPackage(pi.dir)?.bin;
	const entry = typeof bin === "string" ? bin : bin?.pi;
	if (!entry) {
		throw new Error("找不到 Pi 命令行入口，请重新安装 Pi");
	}
	const [sdk, core, ai] = await Promise.all([
		importPackage(pi.dir) as Promise<PiSdk["sdk"]>,
		importPackage(findDependency(pi.dir, CORE_PACKAGE)) as Promise<
			PiSdk["core"]
		>,
		importPackage(findDependency(pi.dir, AI_PACKAGE)) as Promise<PiSdk["ai"]>,
	]);
	return { sdk, core, ai, cliPath: join(pi.dir, entry) };
}

function findDependency(piDir: string, name: string): string {
	const searchPaths =
		createRequire(join(piDir, "package.json")).resolve.paths(name) ?? [];
	const dir = searchPaths
		.map((path) => join(path, name))
		.find((path) => readPackage(path)?.name === name);
	if (!dir) {
		throw new Error(`Pi 的安装不完整，找不到 ${name}。请重新安装 Pi`);
	}
	return dir;
}

function importPackage(dir: string): Promise<unknown> {
	const manifest = readPackage(dir);
	const entry = manifest?.exports?.["."]?.import ?? manifest?.main;
	return import(pathToFileURL(join(dir, entry ?? "dist/index.js")).href);
}

/**
 * 由 pi 命令找到 Pi 的包目录：
 * - npm 在 macOS、Linux 上安装的 pi 链接到包里的入口文件，向上找到包目录；
 * - npm 在 Windows 上安装的 pi.cmd 与 node_modules 在同一目录；
 * - 官方安装脚本安装的 pi 是 <agent 目录>/bin 下的启动脚本，当前版本在 install/current-version 中。
 */
function packageOf(command: string): LocalPi | undefined {
	const real = realpathSync(command);
	for (let dir = dirname(real); dir !== dirname(dir); dir = dirname(dir)) {
		const found = piAt(dir);
		if (found) {
			return found;
		}
	}
	const bin = dirname(real);
	const npmWindows = piAt(join(bin, "node_modules", PACKAGE));
	if (npmWindows) {
		return npmWindows;
	}
	const install = join(dirname(bin), "install");
	try {
		const version = readFileSync(
			join(install, "current-version"),
			"utf8",
		).trim();
		return piAt(join(install, "releases", version, "node_modules", PACKAGE));
	} catch {
		return undefined;
	}
}

function piAt(dir: string): LocalPi | undefined {
	const manifest = readPackage(dir);
	return manifest?.name === PACKAGE
		? { dir, version: manifest.version }
		: undefined;
}

interface Manifest {
	name?: string;
	version: string;
	bin?: string | { pi?: string };
	main?: string;
	exports?: { "."?: { import?: string } };
}

function readPackage(dir: string): Manifest | undefined {
	try {
		return JSON.parse(
			readFileSync(join(dir, "package.json"), "utf8"),
		) as Manifest;
	} catch {
		return undefined;
	}
}

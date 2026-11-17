import { execFileSync } from "node:child_process";
import pkg from "../package.json" with { type: "json" };

const LATEST_URL = `https://registry.npmjs.org/${pkg.name.replace("/", "%2f")}/latest`;

/** 查询 npm 上最新的正式版本；网络不通或查询失败时返回 undefined。 */
export async function latestVersion(): Promise<string | undefined> {
	try {
		const response = await fetch(LATEST_URL, {
			signal: AbortSignal.timeout(10_000),
		});
		if (!response.ok) {
			await response.body?.cancel();
			return undefined;
		}
		return ((await response.json()) as { version: string }).version;
	} catch {
		return undefined;
	}
}

/** candidate 是否比 current 新。版本号格式为 x.y.z，可带 -rc.1 这类预发布后缀。 */
export function isNewer(candidate: string, current: string): boolean {
	const [candidateCore = "", candidatePre] = candidate.split("-", 2);
	const [currentCore = "", currentPre] = current.split("-", 2);
	const a = candidateCore.split(".").map(Number);
	const b = currentCore.split(".").map(Number);
	for (let i = 0; i < 3; i++) {
		if ((a[i] ?? 0) !== (b[i] ?? 0)) {
			return (a[i] ?? 0) > (b[i] ?? 0);
		}
	}
	// 同一版本号下，正式版比预发布版新
	return candidatePre === undefined && currentPre !== undefined;
}

/** 用 npm 全局安装指定版本，npm 的输出直接显示在终端。 */
export function installVersion(version: string): void {
	try {
		execFileSync("npm", ["install", "-g", `${pkg.name}@${version}`], {
			stdio: "inherit",
			// Windows 上 npm 是 npm.cmd，需要通过 shell 运行
			shell: process.platform === "win32",
		});
	} catch {
		throw new Error("安装失败，请根据上面 npm 的输出处理后重试");
	}
}

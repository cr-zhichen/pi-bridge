#!/usr/bin/env node
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import pkg from "../package.json" with { type: "json" };
import { Bridge, log } from "./bridge.ts";
import {
	type Config,
	checkDeviceName,
	defaultDeviceName,
	loadConfig,
	mcpUrl,
	newDeviceId,
	saveConfig,
} from "./config.ts";
import { connect, fetchDevices } from "./connection.ts";
import { findPi, loadPi, piProblem } from "./pi.ts";
import {
	installService,
	serviceInstalled,
	serviceLogHint,
	uninstallService,
} from "./service.ts";
import { installVersion, isNewer, latestVersion } from "./update.ts";

const UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

const HELP = `pi-bridge ${pkg.version}
让 Claude 和 ChatGPT 网页版调用这台电脑上的 Pi。

用法：
  pi-bridge login <服务地址> <密钥>   登录 pi-bridge 服务
  pi-bridge start                     在前台运行
  pi-bridge service install           开机后自动在后台运行
  pi-bridge service uninstall         取消开机自动运行
  pi-bridge status                    查看连接状态
  pi-bridge rename <电脑名称>         修改电脑名称
  pi-bridge update                    更新到最新版本

选项：
  --name <电脑名称>   登录时指定电脑名称，不指定时第一次登录会询问
  -h, --help          显示帮助
  -v, --version       显示版本
`;

const { values, positionals } = parseArgs({
	allowPositionals: true,
	options: {
		name: { type: "string" },
		help: { type: "boolean", short: "h" },
		version: { type: "boolean", short: "v" },
	},
});

try {
	await main(positionals);
} catch (error) {
	console.error(error instanceof Error ? error.message : error);
	process.exitCode = 1;
}

async function main([command, ...args]: string[]): Promise<void> {
	if (values.version) {
		console.log(pkg.version);
		return;
	}
	if (values.help || command === undefined) {
		console.log(HELP);
		return;
	}
	switch (command) {
		case "login":
			return login(args);
		case "start":
			return start();
		case "service":
			return service(args[0]);
		case "status":
			return status();
		case "rename":
			return rename(args);
		case "update":
			return update();
		default:
			throw new Error(
				`未知命令：${command}。运行 pi-bridge --help 查看可用命令`,
			);
	}
}

async function login([server, token]: string[]): Promise<void> {
	if (!server || !token) {
		throw new Error("用法：pi-bridge login <服务地址> <密钥>");
	}
	let url: URL;
	try {
		url = new URL(server);
	} catch {
		throw new Error(`服务地址无效：${server}`);
	}
	const normalized = url.origin + url.pathname.replace(/\/+$/, "");
	const devices = await fetchDevices({ server: normalized, token });
	if (devices === undefined) {
		throw new Error(`无法连接到 ${normalized}，请检查服务地址和网络`);
	}
	if (devices === 401) {
		throw new Error("密钥无效或用户已被禁用");
	}
	if (!Array.isArray(devices)) {
		throw new Error("服务地址不正确或服务暂时不可用，请检查服务地址后重试");
	}

	const previous = loadConfig();
	const deviceId = previous?.deviceId ?? newDeviceId();
	const name =
		values.name ??
		(previous ? previous.deviceName : await askDeviceName(defaultDeviceName()));
	const config: Config = {
		server: normalized,
		token,
		deviceId,
		deviceName: checkDeviceName(name, deviceId, devices),
	};
	saveConfig(config);
	console.log(`已登录 ${normalized}，电脑名称：${config.deviceName}`);

	if (serviceInstalled()) {
		installService();
		console.log("后台服务已按新设置重启");
	} else {
		console.log(
			"运行 pi-bridge start 开始使用，或运行 pi-bridge service install 开机后自动在后台运行",
		);
	}
	console.log(`\n网页版连接器地址：\n${mcpUrl(config)}`);
}

/** 在终端中询问电脑名称，直接回车使用默认名称；不在终端中运行时直接使用默认名称。 */
async function askDeviceName(fallback: string): Promise<string> {
	if (!process.stdin.isTTY) {
		return fallback;
	}
	const rl = createInterface({ input: process.stdin, output: process.stdout });
	const answer = await rl.question(`电脑名称（直接回车使用 ${fallback}）：`);
	rl.close();
	return answer.trim() || fallback;
}

async function rename([name]: string[]): Promise<void> {
	if (!name) {
		throw new Error("用法：pi-bridge rename <电脑名称>");
	}
	const config = requireConfig();
	const devices = await fetchDevices(config);
	if (devices === 401) {
		throw new Error("密钥无效或用户已被禁用");
	}
	if (!Array.isArray(devices)) {
		throw new Error("无法连接到服务，请检查网络后重试");
	}
	config.deviceName = checkDeviceName(name, config.deviceId, devices);
	saveConfig(config);
	console.log(`电脑名称已改为 ${config.deviceName}`);

	if (serviceInstalled()) {
		installService();
		console.log("后台服务已重启，新名称已生效");
	} else if (devices.find((d) => d.id === config.deviceId)?.online) {
		console.log("重新运行 pi-bridge start 后生效");
	}
}

async function start(): Promise<void> {
	const config = requireConfig();
	const pi = findPi();
	const problem = piProblem(pi);
	if (problem || !pi) {
		// macOS、Linux 的后台服务以失败退出后会被系统重新启动，安装或升级 Pi 后自动恢复
		log(problem ?? "");
		process.exitCode = 1;
		return;
	}
	const bridge = new Bridge(config.deviceId, await loadPi(pi));
	log(`使用 Pi ${pi.version}`);
	const stop = () => {
		bridge.shutdown();
		process.exit(0);
	};
	process.on("SIGINT", stop);
	process.on("SIGTERM", stop);
	connect(config, bridge, stop);
	void notifyUpdate();
	setInterval(notifyUpdate, UPDATE_CHECK_INTERVAL_MS);
}

async function notifyUpdate(): Promise<void> {
	const latest = await latestVersion();
	if (latest && isNewer(latest, pkg.version)) {
		log(`发现新版本 ${latest}，运行 pi-bridge update 更新`);
	}
}

async function update(): Promise<void> {
	const latest = await latestVersion();
	if (!latest) {
		throw new Error("无法查询最新版本，请检查网络后重试");
	}
	if (!isNewer(latest, pkg.version)) {
		console.log(`已是最新版本 ${pkg.version}`);
		return;
	}
	console.log(`正在从 ${pkg.version} 更新到 ${latest}`);
	installVersion(latest);
	console.log(`已更新到 ${latest}`);
	if (serviceInstalled()) {
		installService();
		console.log("后台服务已重启");
	}
}

function service(action: string | undefined): void {
	if (action === "install") {
		requireConfig();
		const problem = piProblem(findPi());
		if (problem) {
			throw new Error(problem);
		}
		installService();
		const logs = serviceLogHint();
		console.log("已设置为开机后自动在后台运行，现在已经启动");
		if (logs) {
			console.log(`查看运行日志：${logs}`);
		}
	} else if (action === "uninstall") {
		uninstallService();
		console.log("已取消开机自动运行，后台进程已停止");
	} else {
		throw new Error("用法：pi-bridge service install | uninstall");
	}
}

async function status(): Promise<void> {
	const config = requireConfig();
	const [devices, latest] = await Promise.all([
		fetchDevices(config),
		latestVersion(),
	]);
	const connection = connectionText(devices, config.deviceId);
	const pi = findPi();
	const version =
		latest && isNewer(latest, pkg.version)
			? `${pkg.version}（可更新到 ${latest}，运行 pi-bridge update）`
			: pkg.version;
	console.log(`版本：${version}
Pi：${piProblem(pi) ?? pi?.version}
服务地址：${config.server}
电脑名称：${config.deviceName}
连接状态：${connection}
开机自动运行：${serviceInstalled() ? "已开启" : "未开启"}

网页版连接器地址：
${mcpUrl(config)}`);
}

function requireConfig(): Config {
	const config = loadConfig();
	if (!config) {
		throw new Error("尚未登录。先运行 pi-bridge login <服务地址> <密钥>");
	}
	return config;
}

function connectionText(
	devices: Awaited<ReturnType<typeof fetchDevices>>,
	deviceId: string,
): string {
	if (devices === undefined) {
		return "无法连接到服务";
	}
	if (devices === 401) {
		return "密钥无效或用户已被禁用";
	}
	if (!Array.isArray(devices)) {
		return "服务暂时不可用";
	}
	return devices.find((d) => d.id === deviceId)?.online ? "在线" : "离线";
}

#!/usr/bin/env node
import { parseArgs } from "node:util";
import type { DeviceInfo } from "../../server/src/protocol.ts";
import pkg from "../package.json" with { type: "json" };
import { Bridge, log } from "./bridge.ts";
import {
	type Config,
	defaultDeviceName,
	loadConfig,
	mcpUrl,
	newDeviceId,
	saveConfig,
} from "./config.ts";
import { checkToken, connect } from "./connection.ts";
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
  pi-bridge update                    更新到最新版本

选项：
  -h, --help      显示帮助
  -v, --version   显示版本
`;

const { values, positionals } = parseArgs({
	allowPositionals: true,
	options: {
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
	const status = await checkToken({ server: normalized, token });
	if (status === undefined) {
		throw new Error(`无法连接到 ${normalized}，请检查服务地址和网络`);
	}
	if (status === 401) {
		throw new Error("密钥无效或用户已被禁用");
	}
	if (status !== 200) {
		throw new Error("服务地址不正确或服务暂时不可用，请检查服务地址后重试");
	}

	const previous = loadConfig();
	const config: Config = {
		server: normalized,
		token,
		deviceId: previous?.deviceId ?? newDeviceId(),
		deviceName: previous?.deviceName ?? defaultDeviceName(),
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

function start(): void {
	const config = requireConfig();
	const bridge = new Bridge(config.deviceId);
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
	const [connection, latest] = await Promise.all([
		connectionStatus(config),
		latestVersion(),
	]);
	const version =
		latest && isNewer(latest, pkg.version)
			? `${pkg.version}（可更新到 ${latest}，运行 pi-bridge update）`
			: pkg.version;
	console.log(`版本：${version}
服务地址：${config.server}
电脑名称：${config.deviceName}
连接状态：${connection}
开机自动运行：${serviceInstalled() ? "已开启" : "未开启"}

网页版连接器地址：
${mcpUrl(config)}`);
}

async function connectionStatus(config: Config): Promise<string> {
	try {
		const response = await fetch(`${config.server}/${config.token}/devices`);
		if (response.status === 401) {
			return "密钥无效或用户已被禁用";
		}
		const devices = (await response.json()) as DeviceInfo[];
		const self = devices.find((d) => d.id === config.deviceId);
		return self?.online ? "在线" : "离线";
	} catch {
		return "无法连接到服务";
	}
}

function requireConfig(): Config {
	const config = loadConfig();
	if (!config) {
		throw new Error("尚未登录。先运行 pi-bridge login <服务地址> <密钥>");
	}
	return config;
}

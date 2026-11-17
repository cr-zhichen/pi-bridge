import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, hostname } from "node:os";
import { join } from "node:path";
import type { DeviceInfo } from "../../server/src/protocol.ts";

export const DATA_DIR = join(homedir(), ".pi-bridge");
export const JOBS_DIR = join(DATA_DIR, "jobs");
export const SERVICE_LOG = join(DATA_DIR, "service.log");
const CONFIG_PATH = join(DATA_DIR, "config.json");

export interface Config {
	server: string;
	token: string;
	deviceId: string;
	deviceName: string;
}

export function loadConfig(): Config | undefined {
	try {
		return JSON.parse(readFileSync(CONFIG_PATH, "utf8")) as Config;
	} catch {
		return undefined;
	}
}

export function saveConfig(config: Config): void {
	mkdirSync(DATA_DIR, { recursive: true });
	writeFileSync(CONFIG_PATH, `${JSON.stringify(config, null, "\t")}\n`, {
		mode: 0o600,
	});
}

export function newDeviceId(): string {
	return randomBytes(8).toString("hex");
}

export function defaultDeviceName(): string {
	return hostname().split(".")[0] || hostname();
}

/** 服务端保存的电脑名称最长 64 个字符。 */
const MAX_DEVICE_NAME = 64;

/**
 * 检查电脑名称，返回去掉首尾空白后的名称。
 * 网页版 AI 按名称选择电脑，所以不能与同一用户的其他电脑重名。
 */
export function checkDeviceName(
	name: string,
	deviceId: string,
	devices: DeviceInfo[],
): string {
	const trimmed = name.trim();
	if (!trimmed) {
		throw new Error("电脑名称不能为空");
	}
	if (trimmed.length > MAX_DEVICE_NAME) {
		throw new Error(`电脑名称不能超过 ${MAX_DEVICE_NAME} 个字符`);
	}
	if (devices.some((d) => d.id !== deviceId && d.name === trimmed)) {
		throw new Error(`你的另一台电脑已经叫「${trimmed}」，请换一个名称`);
	}
	return trimmed;
}

export function mcpUrl(config: Config): string {
	return `${config.server}/${config.token}/mcp`;
}

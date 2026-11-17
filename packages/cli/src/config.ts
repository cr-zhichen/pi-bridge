import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, hostname } from "node:os";
import { join } from "node:path";

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

export function mcpUrl(config: Config): string {
	return `${config.server}/${config.token}/mcp`;
}

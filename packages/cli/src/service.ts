import { execFileSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { homedir, userInfo } from "node:os";
import { dirname, join } from "node:path";
import { DATA_DIR, SERVICE_LOG } from "./config.ts";

const NAME = "pi-bridge";
const LABEL = "dev.pi-bridge";
/** 当前运行的入口文件：从源码运行时是 main.ts，安装后是打包好的 main.js。 */
const MAIN = realpathSync(process.argv[1] ?? "");

/**
 * 开机后自动运行 pi-bridge start。
 * 使用安装时的 Node 路径和 PATH，后台运行的命令能找到和终端里一样的工具。
 */
export function installService(): void {
	mkdirSync(DATA_DIR, { recursive: true });
	switch (process.platform) {
		case "darwin": {
			const plist = launchdPlistPath();
			uninstallLaunchd();
			mkdirSync(dirname(plist), { recursive: true });
			writeFileSync(plist, launchdPlist());
			execFileSync("launchctl", ["bootstrap", launchdDomain(), plist]);
			return;
		}
		case "linux": {
			const unit = systemdUnitPath();
			mkdirSync(dirname(unit), { recursive: true });
			writeFileSync(unit, systemdUnit());
			execFileSync("systemctl", ["--user", "daemon-reload"]);
			execFileSync("systemctl", ["--user", "enable", `${NAME}.service`]);
			execFileSync("systemctl", ["--user", "restart", `${NAME}.service`]);
			return;
		}
		case "win32": {
			execFileSync("schtasks", [
				"/Create",
				"/F",
				"/TN",
				NAME,
				"/SC",
				"ONLOGON",
				"/TR",
				`"${process.execPath}" "${MAIN}" start`,
			]);
			execFileSync("schtasks", ["/Run", "/TN", NAME]);
			return;
		}
		default:
			throw new Error(`暂不支持在 ${process.platform} 上开机自动运行`);
	}
}

export function uninstallService(): void {
	switch (process.platform) {
		case "darwin":
			uninstallLaunchd();
			rmSync(launchdPlistPath(), { force: true });
			return;
		case "linux":
			if (existsSync(systemdUnitPath())) {
				execFileSync("systemctl", [
					"--user",
					"disable",
					"--now",
					`${NAME}.service`,
				]);
				rmSync(systemdUnitPath());
				execFileSync("systemctl", ["--user", "daemon-reload"]);
			}
			return;
		case "win32":
			if (serviceInstalled()) {
				execFileSync("schtasks", ["/End", "/TN", NAME], { stdio: "ignore" });
				execFileSync("schtasks", ["/Delete", "/F", "/TN", NAME]);
			}
			return;
	}
}

export function serviceInstalled(): boolean {
	switch (process.platform) {
		case "darwin":
			return existsSync(launchdPlistPath());
		case "linux":
			return existsSync(systemdUnitPath());
		case "win32":
			try {
				execFileSync("schtasks", ["/Query", "/TN", NAME], { stdio: "ignore" });
				return true;
			} catch {
				return false;
			}
		default:
			return false;
	}
}

export function serviceLogHint(): string | undefined {
	switch (process.platform) {
		case "darwin":
			return SERVICE_LOG;
		case "linux":
			return `journalctl --user -u ${NAME}`;
		default:
			return undefined;
	}
}

function launchdPlistPath(): string {
	return join(homedir(), "Library", "LaunchAgents", `${LABEL}.plist`);
}

function launchdDomain(): string {
	return `gui/${userInfo().uid}`;
}

function uninstallLaunchd(): void {
	try {
		execFileSync("launchctl", ["bootout", `${launchdDomain()}/${LABEL}`], {
			stdio: "ignore",
		});
	} catch {
		// 服务未加载
	}
}

function launchdPlist(): string {
	const args = [process.execPath, MAIN, "start"]
		.map((arg) => `\t\t<string>${escapeXml(arg)}</string>`)
		.join("\n");
	return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>Label</key>
	<string>${LABEL}</string>
	<key>ProgramArguments</key>
	<array>
${args}
	</array>
	<key>EnvironmentVariables</key>
	<dict>
		<key>PATH</key>
		<string>${escapeXml(process.env.PATH ?? "")}</string>
	</dict>
	<key>RunAtLoad</key>
	<true/>
	<key>KeepAlive</key>
	<dict>
		<key>SuccessfulExit</key>
		<false/>
	</dict>
	<key>StandardOutPath</key>
	<string>${escapeXml(SERVICE_LOG)}</string>
	<key>StandardErrorPath</key>
	<string>${escapeXml(SERVICE_LOG)}</string>
</dict>
</plist>
`;
}

function systemdUnitPath(): string {
	return join(homedir(), ".config", "systemd", "user", `${NAME}.service`);
}

function systemdUnit(): string {
	return `[Unit]
Description=pi-bridge
After=network-online.target

[Service]
ExecStart="${process.execPath}" "${MAIN}" start
Environment="PATH=${process.env.PATH ?? ""}"
Restart=on-failure
RestartSec=10

[Install]
WantedBy=default.target
`;
}

function escapeXml(text: string): string {
	return text
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;");
}

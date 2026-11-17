#!/usr/bin/env node
import { parseArgs } from "node:util";
import pkg from "../package.json" with { type: "json" };

const HELP = `pi-bridge ${pkg.version}
让 Claude 和 ChatGPT 网页版调用这台电脑上的 Pi。

用法：
  pi-bridge login <服务地址> <密钥>   连接到 pi-bridge 服务
  pi-bridge start                     在前台运行
  pi-bridge service install           开机后自动在后台运行
  pi-bridge service uninstall         取消开机自动运行
  pi-bridge status                    查看连接状态

选项：
  -h, --help      显示帮助
  -v, --version   显示版本
`;

const COMMANDS = ["login", "start", "service", "status"];

const { values, positionals } = parseArgs({
	allowPositionals: true,
	options: {
		help: { type: "boolean", short: "h" },
		version: { type: "boolean", short: "v" },
	},
});

const [command] = positionals;

if (values.version) {
	console.log(pkg.version);
} else if (values.help || command === undefined) {
	console.log(HELP);
} else if (COMMANDS.includes(command)) {
	console.error(`${command} 尚未实现`);
	process.exitCode = 1;
} else {
	console.error(`未知命令：${command}。运行 pi-bridge --help 查看可用命令`);
	process.exitCode = 1;
}

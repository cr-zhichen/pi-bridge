import {
	CLOSE_INCOMPATIBLE,
	CLOSE_REPLACED,
	CLOSE_REVOKED,
	type ConnectParams,
	type DeviceInfo,
	PROTOCOL_VERSION,
	type ServerMessage,
} from "../../server/src/protocol.ts";
import pkg from "../package.json" with { type: "json" };
import { type Bridge, log } from "./bridge.ts";
import { accountUrl, type Config } from "./config.ts";

const PING_INTERVAL_MS = 20_000;
/** 这么久没有收到任何消息，就认为连接已失效并重连。 */
const DEAD_AFTER_MS = 60_000;
const MAX_RETRY_DELAY_S = 60;

/**
 * 保持与 Worker 的连接，断开后自动重连。
 * 密钥失效或同一设备在别处连接时调用 stop，不再重连。
 */
export function connect(
	config: Config,
	bridge: Bridge,
	stop: () => void,
): void {
	let retries = 0;

	const retry = () => {
		const delay = Math.min(MAX_RETRY_DELAY_S, 2 ** retries);
		retries++;
		log(`${delay} 秒后重新连接`);
		setTimeout(attempt, delay * 1000);
	};

	const attempt = async () => {
		const devices = await fetchDevices(config);
		if (devices === 401 || devices === 403) {
			log(
				devices === 401
					? `密钥无效、已被吊销或用户已被禁用。${relogin(config)}`
					: `这个密钥不能用来连接电脑。${relogin(config)}`,
			);
			stop();
			return;
		}
		if (!Array.isArray(devices)) {
			log(
				devices === undefined
					? "无法连接到服务，请检查网络"
					: "服务暂时不可用，稍后会自动重试",
			);
			retry();
			return;
		}
		open();
	};

	const open = () => {
		const ws = new WebSocket(connectUrl(config));
		let lastMessage = Date.now();
		let heartbeat: NodeJS.Timeout | undefined;
		let closed = false;

		const onClosed = (code: number, reason: string) => {
			if (closed) {
				return;
			}
			closed = true;
			clearInterval(heartbeat);
			if (code === CLOSE_REPLACED) {
				log(
					"这台电脑已在其他地方连接（例如另一个 pi-bridge 进程），当前进程退出",
				);
				stop();
			} else if (code === CLOSE_REVOKED) {
				log(`密钥已被吊销或用户已被禁用。${relogin(config)}`);
				stop();
			} else if (code === CLOSE_INCOMPATIBLE) {
				log(
					Number(reason) > PROTOCOL_VERSION
						? "pi-bridge 版本过旧，无法连接服务。运行 pi-bridge update 更新"
						: "服务端版本过旧，无法连接。请联系管理员更新服务端",
				);
				stop();
			} else {
				log("连接已断开");
				retry();
			}
		};

		ws.onopen = () => {
			retries = 0;
			lastMessage = Date.now();
			log(`已连接到 ${config.server}，电脑名称：${config.deviceName}`);
			heartbeat = setInterval(() => {
				if (Date.now() - lastMessage > DEAD_AFTER_MS) {
					ws.close();
					onClosed(1006, "");
					return;
				}
				ws.send("ping");
			}, PING_INTERVAL_MS);
		};
		ws.onmessage = async (event) => {
			lastMessage = Date.now();
			if (event.data === "pong") {
				return;
			}
			const request = JSON.parse(String(event.data)) as ServerMessage;
			const response = await bridge.handle(request);
			if (ws.readyState === WebSocket.OPEN) {
				ws.send(JSON.stringify(response));
			}
		};
		ws.onclose = (event) => onClosed(event.code, event.reason);
	};

	void attempt();
}

function relogin(config: Config): string {
	return `请在 ${accountUrl(config.server)} 重新添加这台电脑，用生成的命令登录`;
}

/** 该用户的电脑列表；请求失败时返回 HTTP 状态码，网络不通时返回 undefined。 */
export async function fetchDevices(
	config: Pick<Config, "server" | "token">,
): Promise<DeviceInfo[] | number | undefined> {
	try {
		const response = await fetch(`${config.server}/${config.token}/devices`);
		if (response.status !== 200) {
			await response.body?.cancel();
			return response.status;
		}
		return (await response.json()) as DeviceInfo[];
	} catch {
		return undefined;
	}
}

function connectUrl(config: Config): URL {
	const url = new URL(`${config.server}/${config.token}/connect`);
	url.protocol = url.protocol === "http:" ? "ws:" : "wss:";
	const params: ConnectParams = {
		protocol: String(PROTOCOL_VERSION),
		device: config.deviceId,
		name: config.deviceName,
		platform: process.platform,
		version: pkg.version,
	};
	for (const [key, value] of Object.entries(params)) {
		url.searchParams.set(key, value);
	}
	return url;
}

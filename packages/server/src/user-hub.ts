import { DurableObject } from "cloudflare:workers";

/**
 * 每个用户一个实例：保持该用户各设备的 WebSocket 连接，
 * 把 MCP 工具调用转发到会话 ID 或任务 ID 对应的设备。
 */
export class UserHub extends DurableObject<Env> {}

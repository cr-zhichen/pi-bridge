import assert from "node:assert/strict";
import { test } from "node:test";
import type { DeviceInfo } from "../../server/src/protocol.ts";
import { checkDeviceName } from "./config.ts";

const device = (id: string, name: string): DeviceInfo => ({
	id,
	name,
	platform: "darwin",
	version: "0.2.0",
	online: false,
	lastSeen: 0,
});

test("checkDeviceName 去掉首尾空白", () => {
	assert.equal(checkDeviceName("  办公室电脑 ", "a", []), "办公室电脑");
});

test("checkDeviceName 拒绝空名称和超长名称", () => {
	assert.throws(() => checkDeviceName("   ", "a", []));
	assert.equal(checkDeviceName("x".repeat(64), "a", []).length, 64);
	assert.throws(() => checkDeviceName("x".repeat(65), "a", []));
});

test("checkDeviceName 只拒绝与其他电脑重名", () => {
	const devices = [device("a", "MacBook"), device("b", "台式机")];
	assert.equal(checkDeviceName("MacBook", "a", devices), "MacBook");
	assert.throws(() => checkDeviceName("台式机", "a", devices));
});

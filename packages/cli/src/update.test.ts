import assert from "node:assert/strict";
import { test } from "node:test";
import { isNewer } from "./update.ts";

test("按数值比较各段版本号", () => {
	assert.equal(isNewer("0.10.0", "0.9.0"), true);
	assert.equal(isNewer("0.9.0", "0.10.0"), false);
	assert.equal(isNewer("1.0.0", "0.99.99"), true);
	assert.equal(isNewer("0.2.1", "0.2.0"), true);
});

test("版本相同时不算更新", () => {
	assert.equal(isNewer("0.2.0", "0.2.0"), false);
});

test("正式版比同号的预发布版新，反之不成立", () => {
	assert.equal(isNewer("0.2.0", "0.2.0-rc.1"), true);
	assert.equal(isNewer("0.2.0-rc.1", "0.2.0"), false);
	assert.equal(isNewer("0.2.0", "0.3.0-rc.1"), false);
});

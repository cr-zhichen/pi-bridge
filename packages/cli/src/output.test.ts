import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { clip, incompleteTail, readLog } from "./output.ts";

function logFile(content: string | Buffer): string {
	const path = join(mkdtempSync(join(tmpdir(), "pi-bridge-test-")), "job.log");
	writeFileSync(path, content);
	return path;
}

test("clip 在上限内原样返回，超出时保留开头和结尾", () => {
	assert.deepEqual(clip("abc", 10), { text: "abc", clipped: false });

	const text = `HEAD${"x".repeat(1000)}TAIL`;
	const result = clip(text, 100);
	assert.equal(result.clipped, true);
	assert.ok(result.text.startsWith("HEAD"));
	assert.ok(result.text.endsWith("TAIL"));
	assert.match(result.text, /省略 908 个字符/);
});

test("readLog 只返回 from 之后的新增内容", () => {
	const path = logFile("first\nsecond\n");
	const first = readLog(path, 0, 6, false);
	assert.deepEqual(first, { text: "first\n", clipped: false, end: 6 });
	const rest = readLog(path, first.end, 13, true);
	assert.deepEqual(rest, { text: "second\n", clipped: false, end: 13 });
	assert.deepEqual(readLog(path, 13, 13, true), {
		text: "",
		clipped: false,
		end: 13,
	});
});

test("readLog 超出上限时保留开头和结尾，并读到末尾", () => {
	const content = `START${"y".repeat(5000)}END`;
	const path = logFile(content);
	const result = readLog(path, 0, content.length, true, 100);
	assert.equal(result.clipped, true);
	assert.equal(result.end, content.length);
	assert.ok(result.text.startsWith("START"));
	assert.ok(result.text.endsWith("END"));
	assert.match(result.text, /省略 \d+ 字节/);
});

test("readLog 运行中不切断末尾的多字节字符，结束后读完", () => {
	const bytes = Buffer.from("你好");
	const path = logFile(bytes.subarray(0, 5));
	const partial = readLog(path, 0, 5, false);
	assert.deepEqual(partial, { text: "你", clipped: false, end: 3 });

	writeFileSync(path, bytes);
	assert.deepEqual(readLog(path, partial.end, bytes.length, true), {
		text: "好",
		clipped: false,
		end: 6,
	});
});

test("readLog 去掉终端颜色控制符", () => {
	const content = "\u001b[31merror\u001b[0m\r\n";
	const path = logFile(content);
	assert.equal(
		readLog(path, 0, Buffer.byteLength(content), true).text,
		"error\n",
	);
});

test("incompleteTail 识别末尾不完整的 UTF-8 字符", () => {
	const ni = Buffer.from("你");
	assert.equal(incompleteTail(Buffer.from("abc")), 0);
	assert.equal(incompleteTail(ni), 0);
	assert.equal(incompleteTail(ni.subarray(0, 1)), 1);
	assert.equal(incompleteTail(ni.subarray(0, 2)), 2);
	const emoji = Buffer.from("😀");
	assert.equal(incompleteTail(emoji.subarray(0, 3)), 3);
	assert.equal(incompleteTail(emoji), 0);
});

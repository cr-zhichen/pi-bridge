import { closeSync, openSync, readSync } from "node:fs";
import { stripVTControlCharacters } from "node:util";
import { OUTPUT_LIMIT } from "@pi-bridge/protocol";

/** 截断时开头所占的比例，其余留给结尾：命令输出的结尾通常更重要。 */
const HEAD_SHARE = 0.25;

export interface Clipped {
	text: string;
	clipped: boolean;
}

/** 超出上限时只保留开头和结尾。 */
export function clip(text: string, limit = OUTPUT_LIMIT): Clipped {
	if (text.length <= limit) {
		return { text, clipped: false };
	}
	const head = Math.floor(limit * HEAD_SHARE);
	return {
		text: `${text.slice(0, head)}\n\n…省略 ${text.length - limit} 个字符…\n\n${text.slice(text.length - (limit - head))}`,
		clipped: true,
	};
}

/**
 * 读取日志文件中 [from, to) 的字节，超出上限时只读开头和结尾。
 *
 * 命令还在运行时（final 为 false），末尾不完整的 UTF-8 字符留到下次读取，
 * 返回的 end 是实际读到的位置。
 */
export function readLog(
	path: string,
	from: number,
	to: number,
	final: boolean,
	limit = OUTPUT_LIMIT,
): Clipped & { end: number } {
	if (to <= from) {
		return { text: "", clipped: false, end: from };
	}
	const fd = openSync(path, "r");
	try {
		const tailStart =
			to - from > limit ? to - Math.ceil(limit * (1 - HEAD_SHARE)) : from;
		let tail = readBytes(fd, tailStart, to);
		if (!final) {
			tail = tail.subarray(0, tail.length - incompleteTail(tail));
		}
		const end = tailStart + tail.length;
		if (tailStart === from) {
			return { text: clean(tail.toString("utf8")), clipped: false, end };
		}
		const head = readBytes(fd, from, from + Math.floor(limit * HEAD_SHARE));
		const omitted = tailStart - from - head.length;
		return {
			text: `${clean(head.toString("utf8"))}\n\n…省略 ${omitted} 字节…\n\n${clean(tail.toString("utf8"))}`,
			clipped: true,
			end,
		};
	} finally {
		closeSync(fd);
	}
}

function readBytes(fd: number, from: number, to: number): Buffer {
	const buffer = Buffer.alloc(to - from);
	const read = readSync(fd, buffer, 0, buffer.length, from);
	return buffer.subarray(0, read);
}

/** 末尾不完整的 UTF-8 字符所占的字节数。 */
export function incompleteTail(bytes: Uint8Array): number {
	for (let i = 1; i <= Math.min(3, bytes.length); i++) {
		const byte = bytes[bytes.length - i] ?? 0;
		if ((byte & 0xc0) === 0x80) {
			continue;
		}
		const size = byte >= 0xf0 ? 4 : byte >= 0xe0 ? 3 : byte >= 0xc0 ? 2 : 1;
		return size > i ? i : 0;
	}
	return 0;
}

/** 去掉颜色等终端控制字符，统一换行符。 */
function clean(text: string): string {
	return stripVTControlCharacters(text).replaceAll("\r\n", "\n");
}

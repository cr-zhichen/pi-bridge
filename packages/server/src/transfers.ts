import { jsonError, notFound } from "./http.ts";
import { hashToken, newToken, randomId, registryOf, toHex } from "./stubs.ts";

const TRANSFER_MAX_BYTES = 50_000_000;
export const TRANSFER_ID_PATTERN = /^[a-f0-9]{32}$/;
const TOKEN_TTL_MS = 10 * 60_000;
const FILE_TTL_MS = 24 * 60 * 60_000;
const encoder = new TextEncoder();

function objectKey(fileId: string): string {
	return `transfers/${fileId}`;
}

function fileUrl(origin: string, fileId: string): URL {
	const url = new URL(`/transfers/${fileId}`, origin);
	url.protocol = "https:";
	return url;
}

export async function createUpload(
	bucket: R2Bucket,
	origin: string,
	userId: string,
	fileName: string,
) {
	const fileId = randomId(16);
	const token = newToken();
	const tokenHash = await hashToken(token);
	// 随机占位内容为上传提供一个只有服务端知道的 ETag。条件写入成功后，
	// 原令牌的元数据会与占位内容一起消失。并发上传和删除后重放都无法再次写入。
	const slot = await bucket.put(
		objectKey(fileId),
		crypto.getRandomValues(new Uint8Array(32)),
		{ customMetadata: { userId, fileName, tokenHash } },
	);
	return {
		file_id: fileId,
		upload_url: fileUrl(origin, fileId).href,
		upload_token: token,
		expires_at: new Date(slot.uploaded.getTime() + TOKEN_TTL_MS).toISOString(),
		max_bytes: TRANSFER_MAX_BYTES,
		instructions:
			"向 upload_url 发 PUT 请求，请求头为 Authorization: Bearer <upload_token> 和 Content-Length: <文件字节数>。请求体直接发送原始文件，例如用 curl --upload-file <文件路径> 并加上 Authorization 请求头。上传成功后从 JSON 响应取 download_url。请勿把上传令牌转发给接收方。",
	};
}

export async function getDownloadLink(
	bucket: R2Bucket,
	origin: string,
	userId: string,
	fileId: string,
) {
	const file = await bucket.head(objectKey(fileId));
	const secret = file?.customMetadata?.downloadSecret;
	if (
		!file ||
		!secret ||
		file.customMetadata?.userId !== userId ||
		fileExpiresAt(file) <= Date.now()
	) {
		return undefined;
	}
	return downloadLink(origin, fileId, file, secret);
}

export async function expireFile(
	bucket: R2Bucket,
	userId: string,
	fileId: string,
): Promise<boolean> {
	const key = objectKey(fileId);
	const file = await bucket.head(key);
	if (file?.customMetadata?.userId !== userId) {
		return false;
	}
	await bucket.delete(key);
	return true;
}

export async function handleTransfer(
	request: Request,
	env: Env,
	url: URL,
	fileId: string,
): Promise<Response> {
	if (url.protocol !== "https:") {
		return jsonError("请使用 HTTPS 上传或下载文件", 400);
	}
	switch (request.method) {
		case "PUT":
			return upload(request, env, url.origin, fileId);
		case "GET":
			return download(env, url, fileId);
		default:
			return new Response(null, {
				status: 405,
				headers: { Allow: "GET, PUT" },
			});
	}
}

async function upload(
	request: Request,
	env: Env,
	origin: string,
	fileId: string,
): Promise<Response> {
	const token = request.headers
		.get("Authorization")
		?.match(/^Bearer ([a-z0-9]{32})$/i)?.[1];
	if (!token) {
		return jsonError("请提供上传令牌", 401);
	}
	const key = objectKey(fileId);
	const bucket = env.TRANSFER_FILES;
	const slot = await bucket.head(key);
	const { userId, fileName, tokenHash } = slot?.customMetadata ?? {};
	if (
		!slot ||
		!userId ||
		!fileName ||
		!tokenHash ||
		slot.uploaded.getTime() + TOKEN_TTL_MS <= Date.now() ||
		(await hashToken(token)) !== tokenHash ||
		!(await registryOf(env).isRetainedUser(userId))
	) {
		return jsonError("上传令牌无效、已使用或已过期，请重新申请上传", 403);
	}
	const contentLength = request.headers.get("Content-Length");
	if (!contentLength || !/^\d+$/.test(contentLength)) {
		return jsonError("请提供文件的 Content-Length 后重试", 411);
	}
	if (Number(contentLength) > TRANSFER_MAX_BYTES) {
		return jsonError(
			`文件超过 ${TRANSFER_MAX_BYTES / 1_000_000} MB，请缩小文件后重试`,
			413,
		);
	}
	const downloadSecret = newToken();
	const file = await bucket.put(key, request.body, {
		onlyIf: { etagMatches: slot.etag },
		customMetadata: { userId, fileName, downloadSecret },
	});
	if (!file) {
		return jsonError("上传令牌已失效，请重新申请上传", 409);
	}
	return Response.json(
		await downloadLink(origin, fileId, file, downloadSecret),
		{ status: 201, headers: { "Cache-Control": "no-store" } },
	);
}

function fileExpiresAt(file: R2Object): number {
	return file.uploaded.getTime() + FILE_TTL_MS;
}

async function signDownload(secret: string, expires: string): Promise<string> {
	const key = await crypto.subtle.importKey(
		"raw",
		encoder.encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const signature = await crypto.subtle.sign(
		"HMAC",
		key,
		encoder.encode(expires),
	);
	return toHex(new Uint8Array(signature));
}

async function downloadLink(
	origin: string,
	fileId: string,
	file: R2Object,
	secret: string,
) {
	const fileExpiry = fileExpiresAt(file);
	const expires = Math.min(Date.now() + TOKEN_TTL_MS, fileExpiry);
	const url = fileUrl(origin, fileId);
	url.searchParams.set("expires", String(expires));
	url.searchParams.set(
		"signature",
		await signDownload(secret, String(expires)),
	);
	return {
		file_id: fileId,
		download_url: url.href,
		download_expires_at: new Date(expires).toISOString(),
		file_expires_at: new Date(fileExpiry).toISOString(),
	};
}

async function download(env: Env, url: URL, fileId: string): Promise<Response> {
	const expires = url.searchParams.get("expires");
	const signature = url.searchParams.get("signature");
	if (
		!expires ||
		!/^\d+$/.test(expires) ||
		Number(expires) <= Date.now() ||
		!signature ||
		!/^[a-f0-9]{64}$/.test(signature)
	) {
		return notFound();
	}
	const key = objectKey(fileId);
	const bucket = env.TRANSFER_FILES;
	const meta = await bucket.head(key);
	const { userId, downloadSecret: secret } = meta?.customMetadata ?? {};
	if (
		!meta ||
		!userId ||
		!secret ||
		fileExpiresAt(meta) <= Date.now() ||
		!crypto.subtle.timingSafeEqual(
			encoder.encode(signature),
			encoder.encode(await signDownload(secret, expires)),
		) ||
		!(await registryOf(env).isRetainedUser(userId))
	) {
		return notFound();
	}
	const file = await bucket.get(key);
	if (!file) {
		return notFound();
	}
	return new Response(file.body, {
		headers: {
			"Cache-Control": "private, no-store",
			"Content-Length": String(file.size),
			"Content-Type": "application/octet-stream",
			"Content-Disposition": attachmentName(
				file.customMetadata?.fileName ?? "download",
			),
			"X-Content-Type-Options": "nosniff",
		},
	});
}

function attachmentName(name: string): string {
	const ascii = name.replace(/[^a-z0-9_. -]/gi, "_");
	const encoded = encodeURIComponent(name.toWellFormed()).replace(
		/['()*]/g,
		(char) => `%${char.charCodeAt(0).toString(16)}`,
	);
	return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

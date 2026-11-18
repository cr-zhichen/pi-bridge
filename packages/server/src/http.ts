/** 读取 JSON 请求体，格式不对时返回空对象。 */
export async function readJson(
	request: Request,
): Promise<Record<string, unknown>> {
	try {
		const body = await request.json();
		return body && typeof body === "object"
			? (body as Record<string, unknown>)
			: {};
	} catch {
		return {};
	}
}

export function jsonError(error: string, status = 400): Response {
	return Response.json({ error }, { status });
}

export function notFound(): Response {
	return new Response("Not Found", { status: 404 });
}

// Shared request/response policy for every author API endpoint.

export function adminJson(
  value: unknown,
  status: number,
  headers?: Readonly<Record<string, string>>,
): Response {
  return Response.json(value, {
    status,
    headers: { 'Cache-Control': 'no-store', ...headers },
  });
}

export function adminBoundaryAllows(request: Request, requireOrigin: boolean): boolean {
  const url = new URL(request.url);
  const host = request.headers.get('Host');
  if (!host || host !== url.host) return false;
  if (!requireOrigin) return true;
  const origin = request.headers.get('Origin');
  return origin !== null && origin === url.origin;
}

export type JsonObjectResult =
  | { readonly ok: true; readonly value: Record<string, unknown> }
  | { readonly ok: false; readonly status: 400 | 413 };

export async function readJsonObject(request: Request, maxBytes: number): Promise<JsonObjectResult> {
  const declared = Number(request.headers.get('Content-Length'));
  if (Number.isFinite(declared) && declared > maxBytes) return { ok: false, status: 413 };
  if (!request.body) return { ok: false, status: 400 };

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  let bytes = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    bytes += part.value.byteLength;
    if (bytes > maxBytes) {
      await reader.cancel();
      return { ok: false, status: 413 };
    }
    text += decoder.decode(part.value, { stream: true });
  }
  text += decoder.decode();

  try {
    const value: unknown = JSON.parse(text);
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? { ok: true, value: value as Record<string, unknown> }
      : { ok: false, status: 400 };
  } catch {
    return { ok: false, status: 400 };
  }
}

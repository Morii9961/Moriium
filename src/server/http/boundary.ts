// Shared request/response policy for every author API endpoint.
//
// The guard sequence lives here rather than in each handler module. Two
// endpoints that each implement "session, then Host, then Origin, then CSRF"
// are two chances to leave a step out, and the one left out would be invisible
// until someone came looking.

import { requireAuthor, verifyCsrfToken, type AuthorSession } from '../auth/session.ts';
import { describeForLog, isAdminError } from '../errors.ts';

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

export type BodyBytesResult =
  // Pinned to a plain ArrayBuffer rather than the default ArrayBufferLike, so
  // the bytes stay usable as a `BodyInit` without a cast at every call site.
  | { readonly ok: true; readonly value: Uint8Array<ArrayBuffer> }
  | { readonly ok: false; readonly status: 400 | 413 };

/**
 * Reads a request body, refusing one that outgrows `maxBytes` mid-stream.
 *
 * The declared Content-Length is checked first only as a courtesy to an honest
 * client. The running total is what actually enforces the cap, because a
 * dishonest length is exactly the case the cap exists for.
 */
export async function readBodyBytes(request: Request, maxBytes: number): Promise<BodyBytesResult> {
  const declared = Number(request.headers.get('Content-Length'));
  if (Number.isFinite(declared) && declared > maxBytes) return { ok: false, status: 413 };
  if (!request.body) return { ok: false, status: 400 };

  const reader = request.body.getReader();
  const parts: Uint8Array[] = [];
  let bytes = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    bytes += part.value.byteLength;
    if (bytes > maxBytes) {
      await reader.cancel();
      return { ok: false, status: 413 };
    }
    parts.push(part.value);
  }

  const value = new Uint8Array(bytes);
  let offset = 0;
  for (const part of parts) {
    value.set(part, offset);
    offset += part.byteLength;
  }
  return { ok: true, value };
}

export async function readJsonObject(request: Request, maxBytes: number): Promise<JsonObjectResult> {
  const body = await readBodyBytes(request, maxBytes);
  if (!body.ok) return body;

  try {
    const value: unknown = JSON.parse(new TextDecoder().decode(body.value));
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? { ok: true, value: value as Record<string, unknown> }
      : { ok: false, status: 400 };
  } catch {
    return { ok: false, status: 400 };
  }
}

/** A refusal to read the body at all: wrong type, too large, or malformed. */
export class RequestBodyError extends Error {
  readonly status: 400 | 413 | 415;

  constructor(status: 400 | 413 | 415, message: string) {
    super(message);
    this.name = 'RequestBodyError';
    this.status = status;
  }
}

export type AuthorizedRequest =
  | { readonly ok: true; readonly authorId: number }
  | { readonly ok: false; readonly response: Response };

/**
 * The one authorization path for the author API.
 *
 * Reads need a session. Writes additionally need Host and Origin to match the
 * request's own URL and a CSRF token to match the session's, because Astro's
 * `security.checkOrigin` covers three form content types and none of the
 * request shapes this API actually uses (ADR 0002 section 9.4).
 */
export async function authorizeRequest(
  request: Request,
  session: AuthorSession,
  write: boolean,
): Promise<AuthorizedRequest> {
  if (!adminBoundaryAllows(request, write)) {
    return { ok: false, response: adminJson({ error: 'Request refused.' }, 403) };
  }
  const author = await requireAuthor(session);
  if (!author) {
    return { ok: false, response: adminJson({ error: 'Authentication required.' }, 401) };
  }
  if (write && !(await verifyCsrfToken(session, request.headers.get('X-CSRF-Token')))) {
    return { ok: false, response: adminJson({ error: 'Request refused.' }, 403) };
  }
  return { ok: true, authorId: author.id };
}

/**
 * Maps a thrown failure onto a status.
 *
 * Only an AdminError reaches the author with its own wording; anything else is
 * logged through the redactor and answered generically, so an unforeseen
 * failure cannot narrate the filesystem to whoever provoked it.
 */
export function responseForError(error: unknown): Response {
  if (error instanceof RequestBodyError) {
    return adminJson({ error: error.message }, error.status);
  }
  if (isAdminError(error)) {
    const status =
      error.code === 'unauthorized'
        ? 401
        : error.code === 'forbidden' ||
            error.code === 'path-outside-root' ||
            error.code === 'media-gate-refused'
          ? 403
          : error.code === 'conflict'
            ? 409
            : error.code === 'db-locked'
              ? 503
              : error.code === 'validation-failed'
                ? 400
                : 500;
    return adminJson({ error: error.userMessage, code: error.code }, status);
  }
  console.error(describeForLog(error));
  return adminJson({ error: 'The author API could not complete that request.' }, 500);
}

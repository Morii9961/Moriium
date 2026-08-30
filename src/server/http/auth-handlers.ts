// The small HTTP boundary for login, session status and logout. Article DTOs
// deliberately do not enter this slice; they are the next production block.

import type { DatabaseSync } from 'node:sqlite';
import type { LoginThrottle } from '../auth/login-throttle.ts';
import {
  authenticateSession,
  csrfTokenFor,
  requireAuthor,
  verifyCsrfToken,
  type AuthorSession,
} from '../auth/session.ts';

const MAX_LOGIN_BYTES = 4_096;

function json(value: unknown, status: number, headers?: Readonly<Record<string, string>>): Response {
  return Response.json(value, {
    status,
    headers: { 'Cache-Control': 'no-store', ...headers },
  });
}

function boundaryAllows(request: Request, requireOrigin: boolean): boolean {
  const url = new URL(request.url);
  const host = request.headers.get('Host');
  if (!host || host !== url.host) return false;
  if (!requireOrigin) return true;
  const origin = request.headers.get('Origin');
  return origin !== null && origin === url.origin;
}

type BodyResult =
  | { readonly ok: true; readonly value: Record<string, unknown> }
  | { readonly ok: false; readonly status: 400 | 413 };

async function readSmallJsonObject(request: Request): Promise<BodyResult> {
  const declared = Number(request.headers.get('Content-Length'));
  if (Number.isFinite(declared) && declared > MAX_LOGIN_BYTES) return { ok: false, status: 413 };
  if (!request.body) return { ok: false, status: 400 };

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  let bytes = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    bytes += part.value.byteLength;
    if (bytes > MAX_LOGIN_BYTES) {
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

export async function handleLogin(
  request: Request,
  session: AuthorSession,
  db: DatabaseSync,
  throttle: LoginThrottle,
): Promise<Response> {
  if (!boundaryAllows(request, true)) return json({ error: 'Request refused.' }, 403);
  if (request.headers.get('Content-Type')?.split(';', 1)[0]?.trim() !== 'application/json') {
    return json({ error: 'Expected JSON.' }, 415);
  }

  const body = await readSmallJsonObject(request);
  if (!body.ok) return json({ error: 'Invalid login request.' }, body.status);
  const name = body.value.name;
  const password = body.value.password;
  if (
    typeof name !== 'string' ||
    name.trim().length === 0 ||
    name.length > 100 ||
    typeof password !== 'string' ||
    password.length === 0 ||
    password.length > 512
  ) {
    return json({ error: 'Invalid login request.' }, 400);
  }

  const result = await authenticateSession(db, throttle, session, { name, password });
  if (!result.ok && result.reason === 'rate-limited') {
    return json(
      { error: 'Too many failed login attempts. Try again later.' },
      429,
      { 'Retry-After': String(Math.max(1, Math.ceil(result.retryAfterMs / 1_000))) },
    );
  }
  if (!result.ok) return json({ error: 'Invalid account name or password.' }, 401);
  return json({ author: result.author, csrfToken: result.csrfToken }, 200);
}

export async function handleSession(request: Request, session: AuthorSession): Promise<Response> {
  if (!boundaryAllows(request, false)) return json({ error: 'Request refused.' }, 403);
  const author = await requireAuthor(session);
  const csrfToken = await csrfTokenFor(session);
  return author && csrfToken
    ? json({ author, csrfToken }, 200)
    : json({ error: 'Authentication required.' }, 401);
}

export async function handleLogout(request: Request, session: AuthorSession): Promise<Response> {
  if (!boundaryAllows(request, true)) return json({ error: 'Request refused.' }, 403);
  if (!(await requireAuthor(session))) return json({ error: 'Authentication required.' }, 401);

  // Astro's built-in checkOrigin intentionally covers form content types only,
  // not the JSON used by this admin. The explicit token remains the primary
  // JSON CSRF defence. Source:
  // https://docs.astro.build/en/reference/configuration-reference/#securitycheckorigin
  if (!(await verifyCsrfToken(session, request.headers.get('X-CSRF-Token')))) {
    return json({ error: 'Request refused.' }, 403);
  }

  session.destroy();
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
}

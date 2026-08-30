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
import { adminBoundaryAllows, adminJson, readJsonObject } from './boundary.ts';

const MAX_LOGIN_BYTES = 4_096;

export async function handleLogin(
  request: Request,
  session: AuthorSession,
  db: DatabaseSync,
  throttle: LoginThrottle,
): Promise<Response> {
  if (!adminBoundaryAllows(request, true)) return adminJson({ error: 'Request refused.' }, 403);
  if (request.headers.get('Content-Type')?.split(';', 1)[0]?.trim() !== 'application/json') {
    return adminJson({ error: 'Expected JSON.' }, 415);
  }

  const body = await readJsonObject(request, MAX_LOGIN_BYTES);
  if (!body.ok) return adminJson({ error: 'Invalid login request.' }, body.status);
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
    return adminJson({ error: 'Invalid login request.' }, 400);
  }

  const result = await authenticateSession(db, throttle, session, { name, password });
  if (!result.ok && result.reason === 'rate-limited') {
    return adminJson(
      { error: 'Too many failed login attempts. Try again later.' },
      429,
      { 'Retry-After': String(Math.max(1, Math.ceil(result.retryAfterMs / 1_000))) },
    );
  }
  if (!result.ok) return adminJson({ error: 'Invalid account name or password.' }, 401);
  return adminJson({ author: result.author, csrfToken: result.csrfToken }, 200);
}

export async function handleSession(request: Request, session: AuthorSession): Promise<Response> {
  if (!adminBoundaryAllows(request, false)) return adminJson({ error: 'Request refused.' }, 403);
  const author = await requireAuthor(session);
  const csrfToken = await csrfTokenFor(session);
  return author && csrfToken
    ? adminJson({ author, csrfToken }, 200)
    : adminJson({ error: 'Authentication required.' }, 401);
}

export async function handleLogout(request: Request, session: AuthorSession): Promise<Response> {
  if (!adminBoundaryAllows(request, true)) return adminJson({ error: 'Request refused.' }, 403);
  if (!(await requireAuthor(session))) return adminJson({ error: 'Authentication required.' }, 401);

  // Astro's built-in checkOrigin intentionally covers form content types only,
  // not the JSON used by this admin. The explicit token remains the primary
  // JSON CSRF defence. Source:
  // https://docs.astro.build/en/reference/configuration-reference/#securitycheckorigin
  if (!(await verifyCsrfToken(session, request.headers.get('X-CSRF-Token')))) {
    return adminJson({ error: 'Request refused.' }, 403);
  }

  session.destroy();
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
}

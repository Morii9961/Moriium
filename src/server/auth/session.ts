// Author identity and CSRF data carried by Astro Sessions.
//
// Astro stores the session id in its HttpOnly cookie and the data on the
// server. A successful login regenerates the id before attaching identity, so
// a pre-authentication id cannot be fixed and promoted into an author session.
// Source: https://docs.astro.build/en/guides/sessions/#interacting-with-session-data

import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { authenticate } from '../accounts.ts';
import type { LoginThrottle } from './login-throttle.ts';

export type AuthorIdentity = {
  readonly id: number;
  readonly name: string;
};

export interface AuthorSession {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): void;
  regenerate(): Promise<void>;
  destroy(): void;
}

export type AuthenticationResult =
  | { readonly ok: true; readonly author: AuthorIdentity; readonly csrfToken: string }
  | { readonly ok: false; readonly reason: 'invalid-credentials' }
  | { readonly ok: false; readonly reason: 'rate-limited'; readonly retryAfterMs: number };

export async function authenticateSession(
  db: DatabaseSync,
  throttle: LoginThrottle,
  session: AuthorSession,
  input: { readonly name: string; readonly password: string },
): Promise<AuthenticationResult> {
  const name = input.name.trim();
  const decision = throttle.check(name);
  if (!decision.allowed) {
    return { ok: false, reason: 'rate-limited', retryAfterMs: decision.retryAfterMs };
  }

  const account = await authenticate(db, name, input.password);
  if (!account) {
    throttle.recordFailure(name);
    return { ok: false, reason: 'invalid-credentials' };
  }

  throttle.recordSuccess(name);
  await session.regenerate();
  const author = { id: account.id, name: account.name };
  const csrfToken = randomBytes(32).toString('base64url');
  session.set('author', author);
  session.set('csrfToken', csrfToken);
  return { ok: true, author, csrfToken };
}

export async function requireAuthor(session: AuthorSession): Promise<AuthorIdentity | null> {
  const value = await session.get('author');
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<AuthorIdentity>;
  return Number.isSafeInteger(candidate.id) && typeof candidate.name === 'string'
    ? { id: candidate.id!, name: candidate.name }
    : null;
}

export async function csrfTokenFor(session: AuthorSession): Promise<string | null> {
  const value = await session.get('csrfToken');
  return typeof value === 'string' ? value : null;
}

/** Compares complete tokens without leaking a matching prefix through timing. */
export async function verifyCsrfToken(
  session: AuthorSession,
  submitted: string | null,
): Promise<boolean> {
  const expected = await csrfTokenFor(session);
  if (!expected || !submitted) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(submitted);
  return left.length === right.length && timingSafeEqual(left, right);
}

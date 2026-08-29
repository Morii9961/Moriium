// Authentication, session and request-guard tests.
//
// ADR 0001 section 5 requires these to be proven, so each test is an attempt to
// get past a guard: log in with the wrong password, keep guessing past the
// limit, reuse another session's CSRF token, post from another origin, arrive
// with a rebound Host.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CURRENT_PARAMS,
  MINIMUM_LENGTH,
  hashPassword,
  needsRehash,
  parseHash,
  verifyPassword,
} from './passwords.ts';
import {
  COOKIE_LIMITATIONS,
  LOCKOUT_WINDOW_MS,
  MAX_FAILED_LOGINS,
  SESSION_COOKIE,
  SessionStore,
} from './sessions.ts';
import { guardRequest, readCookie } from '../http/guards.ts';

const PASSWORD = 'a-sufficiently-long-fixture-password';

describe('password hashing', () => {
  it('accepts the right password and rejects a wrong one', async () => {
    const stored = await hashPassword(PASSWORD);
    assert.equal(await verifyPassword(PASSWORD, stored), true);
    assert.equal(await verifyPassword(`${PASSWORD}x`, stored), false);
  });

  it('never stores the password itself', async () => {
    const stored = await hashPassword(PASSWORD);
    assert.equal(stored.includes(PASSWORD), false);
  });

  it('salts every hash, so the same password stores differently twice', async () => {
    const a = await hashPassword(PASSWORD);
    const b = await hashPassword(PASSWORD);
    assert.notEqual(a, b);
    assert.notDeepEqual(parseHash(a).salt, parseHash(b).salt);
  });

  it('records the parameters it used', async () => {
    const parsed = parseHash(await hashPassword(PASSWORD));
    assert.deepEqual(parsed.params, { ...CURRENT_PARAMS });
  });

  it('still verifies a hash made with weaker parameters, and flags it for rehash', async () => {
    const weak = { N: 1024, r: 8, p: 1, keyLength: 64 };
    const stored = await hashPassword(PASSWORD, weak);
    // The point of recording parameters: an old hash keeps working.
    assert.equal(await verifyPassword(PASSWORD, stored), true);
    assert.equal(needsRehash(stored), true);
    assert.equal(needsRehash(await hashPassword(PASSWORD)), false);
  });

  it('refuses a short password', async () => {
    await assert.rejects(() => hashPassword('x'.repeat(MINIMUM_LENGTH - 1)), /at least/);
  });

  it('fails a corrupted record instead of throwing a different error', async () => {
    assert.equal(await verifyPassword(PASSWORD, 'nonsense'), false);
    assert.equal(await verifyPassword(PASSWORD, 'scrypt$N=1$abc'), false);
    assert.equal(needsRehash('nonsense'), true);
  });
});

describe('sessions', () => {
  it('issues unguessable, distinct ids and CSRF tokens', () => {
    const store = new SessionStore();
    const a = store.create();
    const b = store.create();
    assert.notEqual(a.id, b.id);
    // The CSRF token is separate from the id, so leaking one does not give the other.
    assert.notEqual(a.id, a.csrfToken);
    assert.ok(a.id.length >= 43, 'session id should carry 256 bits');
  });

  it('stops returning a session once it expires', () => {
    let now = 1_000;
    const store = new SessionStore({ ttlMs: 100, now: () => now });
    const session = store.create();
    assert.ok(store.get(session.id));
    now += 101;
    assert.equal(store.get(session.id), null);
  });

  it('forgets a destroyed session', () => {
    const store = new SessionStore();
    const session = store.create();
    store.destroy(session.id);
    assert.equal(store.get(session.id), null);
  });

  it('sets HttpOnly and SameSite=Strict, and records why Secure is absent', () => {
    const store = new SessionStore();
    const cookie = store.cookieFor(store.create());
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Strict/);
    assert.match(cookie, new RegExp(`^${SESSION_COOKIE}=`));
    // Not a passing detail: the ADR requires this gap to be reported rather
    // than treated as solved, so the reasons travel with the code.
    assert.equal(cookie.includes('Secure'), false);
    assert.equal(COOKIE_LIMITATIONS.length, 2);
  });
});

describe('login throttling', () => {
  it('locks out after the configured number of failures', () => {
    let now = 0;
    const store = new SessionStore({ now: () => now });
    for (let i = 0; i < MAX_FAILED_LOGINS - 1; i += 1) store.recordFailedLogin();
    assert.equal(store.isLockedOut(), false);
    store.recordFailedLogin();
    assert.equal(store.isLockedOut(), true);
    assert.ok(store.retryAfterMs() > 0);
  });

  it('lets attempts resume once the window slides past', () => {
    let now = 0;
    const store = new SessionStore({ now: () => now });
    for (let i = 0; i < MAX_FAILED_LOGINS; i += 1) store.recordFailedLogin();
    assert.equal(store.isLockedOut(), true);
    now += LOCKOUT_WINDOW_MS + 1;
    assert.equal(store.isLockedOut(), false);
  });

  it('clears the counter on a successful login so typos are not punished', () => {
    let now = 0;
    const store = new SessionStore({ now: () => now });
    for (let i = 0; i < MAX_FAILED_LOGINS; i += 1) store.recordFailedLogin();
    store.recordSuccessfulLogin();
    assert.equal(store.isLockedOut(), false);
  });
});

describe('request guards', () => {
  const options = { allowedHosts: ['127.0.0.1:4321', 'localhost:4321'] };

  const facts = (over: Partial<Parameters<typeof guardRequest>[0]> = {}) => ({
    method: 'POST',
    host: '127.0.0.1:4321',
    origin: 'http://127.0.0.1:4321',
    sessionId: undefined as string | undefined,
    csrfToken: undefined as string | undefined,
    ...over,
  });

  it('accepts a well-formed same-origin request with a valid token', () => {
    const store = new SessionStore();
    const session = store.create();
    const result = guardRequest(
      facts({ sessionId: session.id, csrfToken: session.csrfToken }),
      store,
      options,
    );
    assert.deepEqual(result, { ok: true });
  });

  it('refuses a Host it does not answer to, which is what blocks DNS rebinding', () => {
    const store = new SessionStore();
    const session = store.create();
    const result = guardRequest(
      facts({ host: 'evil.example', sessionId: session.id, csrfToken: session.csrfToken }),
      store,
      options,
    );
    assert.equal(result.ok, false);
    assert.match(result.ok === false ? result.reason : '', /Host/);
  });

  it('refuses a cross-origin post even with a valid session', () => {
    const store = new SessionStore();
    const session = store.create();
    const result = guardRequest(
      facts({ origin: 'http://evil.example', sessionId: session.id, csrfToken: session.csrfToken }),
      store,
      options,
    );
    assert.equal(result.ok, false);
    assert.match(result.ok === false ? result.reason : '', /Origin/);
  });

  it('treats a missing Origin on a write as a refusal, not as acceptable', () => {
    const store = new SessionStore();
    const session = store.create();
    const result = guardRequest(
      facts({ origin: undefined, sessionId: session.id, csrfToken: session.csrfToken }),
      store,
      options,
    );
    assert.equal(result.ok, false);
  });

  it('refuses a write with no CSRF token', () => {
    const store = new SessionStore();
    const session = store.create();
    const result = guardRequest(facts({ sessionId: session.id }), store, options);
    assert.equal(result.ok, false);
    assert.match(result.ok === false ? result.reason : '', /CSRF/);
  });

  it('refuses another session\'s CSRF token', () => {
    const store = new SessionStore();
    const mine = store.create();
    const theirs = store.create();
    const result = guardRequest(
      facts({ sessionId: mine.id, csrfToken: theirs.csrfToken }),
      store,
      options,
    );
    assert.equal(result.ok, false);
  });

  it('does not demand Origin or CSRF on a read', () => {
    const store = new SessionStore();
    const result = guardRequest(facts({ method: 'GET', origin: undefined }), store, options);
    assert.deepEqual(result, { ok: true });
  });

  it('still checks Host on a read', () => {
    const store = new SessionStore();
    const result = guardRequest(facts({ method: 'GET', host: 'evil.example' }), store, options);
    assert.equal(result.ok, false);
  });
});

describe('cookie parsing', () => {
  it('reads the named cookie among others', () => {
    assert.equal(readCookie(`theme=dark; ${SESSION_COOKIE}=abc123; other=1`, SESSION_COOKIE), 'abc123');
  });

  it('returns undefined rather than guessing', () => {
    assert.equal(readCookie(undefined, SESSION_COOKIE), undefined);
    assert.equal(readCookie('theme=dark', SESSION_COOKIE), undefined);
    // A cookie whose name merely ends with the target name is not a match.
    assert.equal(readCookie(`not_${SESSION_COOKIE}=abc`, SESSION_COOKIE), undefined);
  });
});

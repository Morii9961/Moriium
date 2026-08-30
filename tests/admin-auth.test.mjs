import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { createAccount } from '../src/server/accounts.ts';
import {
  ACCOUNT_FAILURE_LIMIT,
  GLOBAL_FAILURE_LIMIT,
  LOGIN_WINDOW_MS,
  LoginThrottle,
} from '../src/server/auth/login-throttle.ts';
import {
  authenticateSession,
  requireAuthor,
  verifyCsrfToken,
} from '../src/server/auth/session.ts';
import {
  handleLogin,
  handleLogout,
  handleSession,
} from '../src/server/http/auth-handlers.ts';
import { openDatabase } from '../src/server/db/open.ts';

let directory;
const opened = [];

before(() => {
  directory = mkdtempSync(join(tmpdir(), 'moriium-admin-auth-'));
});

after(() => {
  while (opened.length > 0) opened.pop().close();
  rmSync(directory, { recursive: true, force: true });
});

let databaseCounter = 0;
function freshDatabase() {
  databaseCounter += 1;
  const db = openDatabase(join(directory, `auth-${databaseCounter}.db`));
  opened.push(db);
  return db;
}

class FakeSession {
  data = new Map();
  destroyed = false;
  regenerations = 0;

  async get(key) {
    return this.data.get(key);
  }

  set(key, value) {
    this.data.set(key, value);
  }

  async regenerate() {
    this.regenerations += 1;
  }

  destroy() {
    this.destroyed = true;
    this.data.clear();
  }
}

function request(path, options = {}) {
  const headers = new Headers(options.headers);
  headers.set('Host', headers.get('Host') ?? 'admin.example');
  headers.set('Origin', headers.get('Origin') ?? 'https://admin.example');
  if (options.body !== undefined) headers.set('Content-Type', 'application/json');
  return new Request(`https://admin.example${path}`, {
    method: options.method ?? 'POST',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
}

async function responseJson(response) {
  return response.status === 204 ? null : response.json();
}

describe('production login throttling', () => {
  it('locks one account without locking the other author', () => {
    const throttle = new LoginThrottle();

    for (let attempt = 0; attempt < ACCOUNT_FAILURE_LIMIT; attempt += 1) {
      assert.equal(throttle.check('Morii').allowed, true);
      throttle.recordFailure('Morii');
    }

    assert.equal(throttle.check('Morii').allowed, false);
    assert.equal(throttle.check('Enouia').allowed, true);
  });

  it('also stops enumeration spread across many account names', () => {
    const throttle = new LoginThrottle();

    for (let attempt = 0; attempt < GLOBAL_FAILURE_LIMIT; attempt += 1) {
      assert.equal(throttle.check(`unknown-${attempt}`).allowed, true);
      throttle.recordFailure(`unknown-${attempt}`);
    }

    const blocked = throttle.check('Enouia');
    assert.equal(blocked.allowed, false);
    assert.ok(blocked.retryAfterMs > 0);
  });

  it('unlocks only after the sliding window has elapsed', () => {
    let now = 1_000;
    const throttle = new LoginThrottle({ now: () => now });
    for (let attempt = 0; attempt < ACCOUNT_FAILURE_LIMIT; attempt += 1) {
      throttle.recordFailure('Morii');
    }
    assert.equal(throttle.check('Morii').allowed, false);

    now += LOGIN_WINDOW_MS;
    assert.equal(throttle.check('Morii').allowed, true);
  });
});

describe('Astro-backed author sessions', () => {
  it('regenerates the session id and stores only public author identity plus a separate CSRF token', async () => {
    const db = freshDatabase();
    await createAccount(db, { name: 'Morii', password: 'm'.repeat(30) }, () => '2026-08-30');
    const session = new FakeSession();

    const result = await authenticateSession(
      db,
      new LoginThrottle(),
      session,
      { name: 'Morii', password: 'm'.repeat(30) },
    );

    assert.equal(result.ok, true);
    assert.equal(session.regenerations, 1);
    assert.deepEqual(await requireAuthor(session), { id: 1, name: 'Morii' });
    assert.equal(typeof result.csrfToken, 'string');
    assert.ok(result.csrfToken.length >= 43);
    assert.equal(await verifyCsrfToken(session, result.csrfToken), true);
    assert.equal(await verifyCsrfToken(session, `${result.csrfToken}x`), false);
    assert.equal(JSON.stringify([...session.data.values()]).includes('mmmmmm'), false);
  });

  it('returns the same refusal for an unknown account and a wrong password', async () => {
    const db = freshDatabase();
    await createAccount(db, { name: 'Morii', password: 'm'.repeat(30) }, () => '2026-08-30');

    const wrong = await authenticateSession(
      db,
      new LoginThrottle(),
      new FakeSession(),
      { name: 'Morii', password: 'w'.repeat(30) },
    );
    const unknown = await authenticateSession(
      db,
      new LoginThrottle(),
      new FakeSession(),
      { name: 'NotAnAuthor', password: 'm'.repeat(30) },
    );

    assert.deepEqual(wrong, { ok: false, reason: 'invalid-credentials' });
    assert.deepEqual(unknown, wrong);
  });
});

describe('login and logout request boundary', () => {
  it('issues a session through JSON login and destroys it through CSRF-protected logout', async () => {
    const db = freshDatabase();
    await createAccount(db, { name: 'Enouia', password: 'e'.repeat(30) }, () => '2026-08-30');
    const session = new FakeSession();
    const throttle = new LoginThrottle();

    const login = await handleLogin(
      request('/api/login', { body: { name: 'Enouia', password: 'e'.repeat(30) } }),
      session,
      db,
      throttle,
    );
    assert.equal(login.status, 200);
    const loggedIn = await responseJson(login);
    assert.deepEqual(loggedIn.author, { id: 1, name: 'Enouia' });

    const status = await handleSession(request('/api/session', { method: 'GET' }), session);
    assert.equal(status.status, 200);
    assert.deepEqual((await responseJson(status)).author, { id: 1, name: 'Enouia' });

    const logout = await handleLogout(
      request('/api/logout', { headers: { 'X-CSRF-Token': loggedIn.csrfToken } }),
      session,
    );
    assert.equal(logout.status, 204);
    assert.equal(session.destroyed, true);
  });

  it('rejects missing or crossed Origin, a rebound Host, and a missing CSRF token', async () => {
    const db = freshDatabase();
    await createAccount(db, { name: 'Morii', password: 'm'.repeat(30) }, () => '2026-08-30');
    const throttle = new LoginThrottle();

    const crossed = request('/api/login', {
      headers: { Origin: 'https://evil.example' },
      body: { name: 'Morii', password: 'm'.repeat(30) },
    });
    assert.equal((await handleLogin(crossed, new FakeSession(), db, throttle)).status, 403);

    const rebound = request('/api/login', {
      headers: { Host: 'evil.example' },
      body: { name: 'Morii', password: 'm'.repeat(30) },
    });
    assert.equal((await handleLogin(rebound, new FakeSession(), db, throttle)).status, 403);

    const missingOrigin = request('/api/login', {
      body: { name: 'Morii', password: 'm'.repeat(30) },
    });
    missingOrigin.headers.delete('Origin');
    assert.equal((await handleLogin(missingOrigin, new FakeSession(), db, throttle)).status, 403);

    const session = new FakeSession();
    const login = await handleLogin(
      request('/api/login', { body: { name: 'Morii', password: 'm'.repeat(30) } }),
      session,
      db,
      throttle,
    );
    assert.equal(login.status, 200);
    assert.equal((await handleLogout(request('/api/logout'), session)).status, 403);
    assert.equal(session.destroyed, false);
  });

  it('refuses oversized login bodies before parsing them', async () => {
    const db = freshDatabase();
    const oversized = request('/api/login', {
      body: { name: 'Morii', password: 'x'.repeat(10_000) },
    });

    const response = await handleLogin(oversized, new FakeSession(), db, new LoginThrottle());
    assert.equal(response.status, 413);
  });
});

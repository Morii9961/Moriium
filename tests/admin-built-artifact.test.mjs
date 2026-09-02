// Regression tests for the BUILT artifact, not for the TypeScript source.
//
// Every other admin test imports a handler from src/ and calls it. That proves
// the logic and proves nothing about what `node dist/server/entry.mjs` does --
// which is what deploy/systemd/moriium-admin.service actually starts. Two
// production defects lived happily under a green suite because of that gap
// (ADR 0002 sections 21.24 and 21.26):
//
//   1. src/server/rendering/public-renderer.mjs imported astro.config.mjs, so
//      the bundler inlined Vite, Rolldown and css-tree into a request handler's
//      dependency graph. Each resolves assets relative to its own file, so all
//      of them failed from dist/server/chunks/ and every /api/articles/* route
//      answered with an empty 500.
//   2. src/server/db/open.ts read schema.sql with import.meta.dirname. The
//      bundler carries no .sql file, so a freshly deployed database could never
//      be migrated -- the first boot on a clean VPS would have failed.
//
// Both are the same mistake: a production request handler depending on
// something only the build tree has. These tests are the boundary that keeps it
// from coming back, so they run against the real bundle over real HTTP with a
// real database, in directories that exist only for this run.

import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { createAccount } from '../src/server/accounts.ts';
import { openDatabase } from '../src/server/db/open.ts';

const REPOSITORY = resolve(import.meta.dirname, '..');
const ENTRY = join(REPOSITORY, 'dist', 'server', 'entry.mjs');
const ASTRO_BIN = join(REPOSITORY, 'node_modules', 'astro', 'bin', 'astro.mjs');
const BUILD_TIMEOUT_MS = 10 * 60 * 1000;
const START_TIMEOUT_MS = 60 * 1000;

/** Newest mtime under a directory, so a stale bundle is not mistaken for a fresh one. */
function newestMtime(directory) {
  let newest = 0;
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else newest = Math.max(newest, statSync(full).mtimeMs);
    }
  };
  walk(directory);
  return newest;
}

/**
 * Builds only when the bundle is missing or older than the sources it came from.
 *
 * A regression test that silently accepts a stale `dist/` would report on a
 * build nobody made, which is the failure mode this whole file exists to close.
 * astro is spawned through node rather than through pnpm: Node refuses to
 * spawn a .cmd without a shell, and turning the shell on here would be a worse
 * trade than resolving the CLI directly.
 */
function buildIfStale() {
  const sources = Math.max(
    newestMtime(join(REPOSITORY, 'src')),
    statSync(join(REPOSITORY, 'astro.config.mjs')).mtimeMs,
  );
  if (existsSync(ENTRY) && statSync(ENTRY).mtimeMs >= sources) return 'reused';

  const result = spawnSync(process.execPath, [ASTRO_BIN, 'build'], {
    cwd: REPOSITORY,
    encoding: 'utf8',
    timeout: BUILD_TIMEOUT_MS,
    shell: false,
  });
  if (result.status !== 0) {
    throw new Error(
      `astro build failed with ${result.status}:\n${(result.stderr || result.stdout || '').slice(-2000)}`,
    );
  }
  return 'built';
}

/** Everything the server writes, in a directory that exists only for this run. */
function isolatedEnvironment(root) {
  for (const name of ['db', 'sessions', 'backups', 'media', 'content']) {
    mkdirSync(join(root, name), { recursive: true });
  }
  return {
    MORIIUM_DATABASE_PATH: join(root, 'db', 'admin.db'),
    MORIIUM_SESSION_DIRECTORY: join(root, 'sessions'),
    MORIIUM_BACKUP_ROOT: join(root, 'backups'),
    MORIIUM_MEDIA_ROOT: join(root, 'media'),
    MORIIUM_CONTENT_ROOT: join(root, 'content'),
  };
}

async function waitForServer(origin, child) {
  const deadline = Date.now() + START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`the built server exited early with ${child.exitCode}:\n${child.log}`);
    }
    try {
      await fetch(`${origin}/api/session/`);
      return;
    } catch {
      await new Promise((done) => setTimeout(done, 250));
    }
  }
  throw new Error(`the built server did not answer within ${START_TIMEOUT_MS} ms:\n${child.log}`);
}

let root;
let child;
let origin;
let credentials;
let buildMode;

before(async () => {
  buildMode = buildIfStale();
  root = mkdtempSync(join(tmpdir(), 'moriium-artifact-'));
  const environment = isolatedEnvironment(root);

  // The account is created through the same server-side function the hidden
  // input CLI uses, against the database the server is about to open. The
  // password is generated here and never becomes a command-line argument.
  const password = randomBytes(24).toString('base64url');
  const db = openDatabase(environment.MORIIUM_DATABASE_PATH);
  try {
    await createAccount(db, { name: 'ArtifactFixture', password }, () => new Date().toISOString());
  } finally {
    db.close();
  }
  credentials = { name: 'ArtifactFixture', password };

  // Port 0 would be cleaner, but the Node adapter needs the port up front.
  const port = 4390 + (process.pid % 60);
  origin = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, [ENTRY], {
    cwd: REPOSITORY,
    env: { ...process.env, ...environment, HOST: '127.0.0.1', PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.log = '';
  child.stdout.on('data', (chunk) => (child.log += chunk));
  child.stderr.on('data', (chunk) => (child.log += chunk));

  await waitForServer(origin, child);
});

after(async () => {
  // kill() only asks. On Windows the server keeps its database file open until
  // the process is actually gone, and removing the directory underneath it
  // fails with EPERM -- a green suite reported as a failure by its own cleanup.
  // So wait for the exit, then let rm retry the handles Windows releases late.
  //
  // Check first whether it has already gone. A server that crashed during
  // startup has emitted its 'exit' long before this hook runs, and awaiting an
  // event that has already fired waits forever: the suite would hang instead of
  // reporting the failure that killed the process.
  if (child && child.exitCode === null && child.signalCode === null) {
    const exited = new Promise((resolve) => child.once('exit', resolve));
    child.kill();
    await exited;
  }
  if (root) rmSync(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
});

/** Reads the body once and insists it is JSON, because an empty 500 parsed as nothing. */
async function json(response) {
  const text = await response.text();
  assert.notEqual(text.trim(), '', `${response.url} returned an empty body with ${response.status}`);
  try {
    return JSON.parse(text);
  } catch {
    throw new assert.AssertionError({
      message: `${response.url} returned ${response.status} with a non-JSON body: ${text.slice(0, 200)}`,
    });
  }
}

describe('the built server artifact', () => {
  it('was built from the current sources', () => {
    assert.ok(['built', 'reused'].includes(buildMode));
    assert.ok(existsSync(ENTRY), 'dist/server/entry.mjs must exist');
  });

  it('answers an anonymous article request with a non-empty JSON 401', async () => {
    // The exact shape of the old defect: 500 with a zero-length body, because
    // the route module could not load at all.
    const response = await fetch(`${origin}/api/articles/`);
    const body = await json(response);
    assert.equal(response.status, 401);
    assert.equal(body.error, 'Authentication required.');
  });

  it('answers every author route with JSON rather than a load failure', async () => {
    for (const path of ['/api/session/', '/api/status/', '/api/media/', '/api/articles/1/']) {
      const response = await fetch(`${origin}${path}`);
      const body = await json(response);
      assert.equal(response.status, 401, `${path} should be 401 for an anonymous caller`);
      assert.ok(body.error, `${path} should name the reason`);
    }
  });

  it('migrated a database that did not exist before this run', async () => {
    // Proves the schema travels inside the bundle. Reading it from disk beside
    // the source file left a fresh deployment unable to create its database.
    const response = await fetch(`${origin}/api/session/`);
    assert.equal(response.status, 401);
    assert.ok(existsSync(join(root, 'db', 'admin.db')));
  });

  it('lets a fixture author sign in and read the article list as JSON 200', async () => {
    const login = await fetch(`${origin}/api/login/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: origin },
      body: JSON.stringify(credentials),
    });
    const session = await json(login);
    assert.equal(login.status, 200, 'the fixture author must be able to sign in');
    assert.equal(session.author.name, 'ArtifactFixture');

    const cookie = login.headers.getSetCookie().map((entry) => entry.split(';')[0]).join('; ');
    assert.ok(cookie, 'the login must set a session cookie');

    const list = await fetch(`${origin}/api/articles/`, { headers: { Cookie: cookie } });
    const body = await json(list);
    assert.equal(list.status, 200);
    assert.ok(Array.isArray(body.articles), 'the article list must come back as an array');
  });

  it('renders a trusted preview without the build toolchain', async () => {
    // The preview is the route that used to drag astro.config.mjs, and with it
    // Vite and Rolldown, into the resident server.
    const login = await fetch(`${origin}/api/login/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: origin },
      body: JSON.stringify(credentials),
    });
    const session = await json(login);
    const cookie = login.headers.getSetCookie().map((entry) => entry.split(';')[0]).join('; ');

    const created = await fetch(`${origin}/api/articles/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: origin,
        Cookie: cookie,
        'X-CSRF-Token': session.csrfToken,
      },
      body: JSON.stringify({
        translationKey: 'artifact-probe',
        lang: 'zh',
        slug: 'zh/artifact-probe',
        title: '构建产物探针',
        summary: '只在这次测试里存在的夹具文章。',
        publishedAt: '2026-09-01T00:00:00+08:00',
        updatedAt: null,
        category: '工程夹具',
        tags: [],
        cover: null,
        coverAlt: null,
        draft: false,
        unlisted: false,
        copyProtection: false,
        markdown: '正文。\n',
        editorJson: null,
      }),
    });
    const article = await json(created);
    assert.equal(created.status, 201);

    const preview = await fetch(`${origin}/api/articles/${article.article.id}/preview/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: origin,
        Cookie: cookie,
        'X-CSRF-Token': session.csrfToken,
      },
      body: JSON.stringify({ markdown: '# 标题\n\n正文与 `code`。\n' }),
    });
    const rendered = await json(preview);
    assert.equal(preview.status, 200);
    assert.match(rendered.html, /<h1[^>]*>/);
  });
});

describe('the production render path', () => {
  it('keeps build configuration out of the resident server', () => {
    const renderer = join(REPOSITORY, 'src', 'server', 'rendering', 'public-renderer.mjs');
    const source = readFileSyncUtf8(renderer);
    assert.doesNotMatch(
      source,
      /from\s+'[^']*astro\.config/,
      'the trusted renderer must not import the Astro config',
    );
    assert.match(source, /from '\.\.\/\.\.\/markdown\/pipeline\.mjs'/);

    const pipeline = readFileSyncUtf8(join(REPOSITORY, 'src', 'markdown', 'pipeline.mjs'));
    for (const forbidden of ['astro/config', '@astrojs/node', '@astrojs/sitemap', 'astro-expressive-code', 'vite']) {
      assert.ok(
        !new RegExp(`from '${forbidden.replaceAll('/', '\\/')}'`).test(pipeline),
        `the shared pipeline must not import ${forbidden}`,
      );
    }
  });

  it('sends only version fields when saving, not version metadata', () => {
    const editor = readFileSyncUtf8(join(REPOSITORY, 'src', 'admin', 'ArticleEditor.ts'));
    // Spreading a loaded Version into the form carried id/articleId/authorId/
    // kind/createdAt onto every payload, and the API schema is .strict(), so
    // saving failed with 400 on every article the editor had opened. The type
    // system cannot see it: excess property checks do not apply to a spread.
    assert.doesNotMatch(
      editor,
      /fields\.value = \{ \.\.\.version/,
      'the editor must narrow a Version to VersionFields before it becomes a payload',
    );
    assert.match(editor, /function toFields\(version: Version\): VersionFields/);
    const assignments = editor.match(/fields\.value = toFields\(version\)/g) ?? [];
    assert.equal(assignments.length, 2, 'both load() and openVersion() must narrow');
  });

  it('does not read the schema from beside its own source file', () => {
    // Comments in this file discuss the old construct by name, so the check is
    // on code: no filesystem read at all, and the schema arrives as an import.
    const open = readFileSyncUtf8(join(REPOSITORY, 'src', 'server', 'db', 'open.ts'))
      .split('\n')
      .filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
      .join('\n');
    assert.doesNotMatch(open, /readFileSync/);
    assert.doesNotMatch(open, /import\.meta\.dirname/);
    assert.match(open, /from '\.\/schema\.ts'/);
    assert.ok(
      !existsSync(join(REPOSITORY, 'src', 'server', 'db', 'schema.sql')),
      'schema.sql was replaced by schema.ts; two copies would drift',
    );
  });
});

function readFileSyncUtf8(path) {
  return readFileSync(path, 'utf8');
}

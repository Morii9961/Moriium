import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { compileTemplate } from 'vue/compiler-sfc';
import { createAccount } from '../src/server/accounts.ts';
import { ArticleStore } from '../src/server/articles.ts';
import { createDatabaseBackup } from '../src/server/backup/database-backup.ts';
import { openDatabase } from '../src/server/db/open.ts';
import { handleStatus } from '../src/server/http/status-handlers.ts';
import {
  AWAITING_EXPORT_GRACE_MS,
  BACKUP_STALE_AFTER_MS,
  collectOperationalStatus,
} from '../src/server/status.ts';

let directory;
const opened = [];
let counter = 0;

before(() => {
  directory = mkdtempSync(join(tmpdir(), 'moriium-status-'));
});

after(() => {
  while (opened.length > 0) opened.pop().close();
  rmSync(directory, { recursive: true, force: true });
});

class FakeSession {
  constructor(author = null, csrfToken = null) {
    this.data = new Map();
    if (author) this.data.set('author', author);
    if (csrfToken) this.data.set('csrfToken', csrfToken);
  }

  async get(key) {
    return this.data.get(key);
  }

  set(key, value) {
    this.data.set(key, value);
  }

  async regenerate() {}
  destroy() {}
}

function request(path) {
  return new Request(`https://admin.example${path}`, {
    method: 'GET',
    headers: new Headers({ Host: 'admin.example', Origin: 'https://admin.example' }),
  });
}

async function context() {
  counter += 1;
  let tick = 0;
  const now = () => new Date(Date.UTC(2026, 7, 30, 0, 0, tick++)).toISOString();
  const db = openDatabase(join(directory, `status-${counter}.db`), { now });
  opened.push(db);
  const author = await createAccount(db, { name: 'Morii', password: 'a'.repeat(30) }, now);
  const root = join(directory, `backups-${counter}`);
  mkdirSync(root, { recursive: true });
  return { db, author, root, store: new ArticleStore(db, now) };
}

function backupStatus(overrides = {}) {
  return {
    running: true,
    inFlight: false,
    lastSucceededAt: null,
    lastFailedAt: null,
    lastError: null,
    ...overrides,
  };
}

function fields(overrides = {}) {
  return {
    title: '潮汐笔记',
    summary: '摘要。',
    publishedAt: '2026-03-14T21:40:00+08:00',
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
    ...overrides,
  };
}

function itemFor(status, id) {
  const found = status.items.find((item) => item.id === id);
  assert.ok(found, `expected a ${id} item`);
  return found;
}

describe('operational status', () => {
  it('flags an empty backup root and a stopped scheduler', async () => {
    const { db, root } = await context();

    const status = collectOperationalStatus({
      db,
      backupRoot: root,
      backupStatus: backupStatus({ running: false }),
    });

    assert.equal(itemFor(status, 'backups').verdict, 'attention');
    assert.match(itemFor(status, 'backups').detail, /没有可用备份/);
  });

  it('accepts a fresh backup, flags a stale one, and preserves the last failure', async () => {
    const { db, root } = await context();
    await createDatabaseBackup({ db, root });
    const now = new Date();

    const fresh = collectOperationalStatus({ db, backupRoot: root, backupStatus: backupStatus(), now });
    assert.equal(itemFor(fresh, 'backups').verdict, 'ok');

    const stale = collectOperationalStatus({
      db,
      backupRoot: root,
      backupStatus: backupStatus(),
      now: new Date(now.getTime() + BACKUP_STALE_AFTER_MS + 60_000),
    });
    assert.equal(itemFor(stale, 'backups').verdict, 'attention');

    const failed = collectOperationalStatus({
      db,
      backupRoot: root,
      backupStatus: backupStatus({
        lastFailedAt: now.toISOString(),
        lastError: 'backup-failed: simulated failure',
      }),
      now,
    });
    assert.equal(itemFor(failed, 'backups').verdict, 'attention');
    assert.match(itemFor(failed, 'backups').detail, /simulated failure/);
  });

  it('flags a published article that has waited too long for export', async () => {
    const { db, root, store, author } = await context();
    const article = store.createArticle({
      translationKey: 'tide',
      lang: 'zh',
      slug: 'zh/tide',
      authorId: author.id,
      ...fields(),
    });
    const version = store.getLatest(article.id);
    store.publish(article.id, version.id, { actorId: author.id });
    const publishedAt = new Date(store.listAudit(article.id)[0].at).getTime();

    const status = collectOperationalStatus({
      db,
      backupRoot: root,
      backupStatus: backupStatus(),
      now: new Date(publishedAt + AWAITING_EXPORT_GRACE_MS + 60_000),
    });

    assert.equal(itemFor(status, 'export').verdict, 'attention');
    assert.match(itemFor(status, 'export').detail, /超过/);
  });

  it('reports observations this process cannot make as unknown', async () => {
    const { db, root } = await context();
    const status = collectOperationalStatus({ db, backupRoot: root, backupStatus: backupStatus() });

    assert.equal(itemFor(status, 'offsite').verdict, 'unknown');
    assert.equal(itemFor(status, 'service').verdict, 'unknown');
  });
});

describe('status endpoint', () => {
  it('requires an author session', async () => {
    const { db, root } = await context();
    const response = await handleStatus(request('/api/status/'), new FakeSession(), db, {
      backupRoot: root,
      backupStatus: backupStatus(),
    });
    assert.equal(response.status, 401);
  });

  it('returns operational items to a signed-in author', async () => {
    const { db, root, author } = await context();
    const session = new FakeSession({ id: author.id, name: author.name }, 'csrf-test-token');
    const response = await handleStatus(request('/api/status/'), session, db, {
      backupRoot: root,
      backupStatus: backupStatus(),
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.ok(body.items.some((item) => item.id === 'backups'));
  });
});

describe('admin status panel', () => {
  for (const file of ['App.ts', 'ArticleEditor.ts', 'MediaLibrary.ts']) {
    it(`keeps the runtime template in ${file} compilable`, () => {
      const source = readFileSync(resolve(import.meta.dirname, '..', 'src/admin', file), 'utf8');
      const match = /template:\s*`([\s\S]*?)`,\n\}\);/.exec(source);
      assert.ok(match, `${file} must carry a runtime template`);
      const result = compileTemplate({ source: match[1], filename: file, id: file });
      assert.deepEqual(result.errors.map((error) => String(error)), []);
    });
  }

  it('renders every verdict and calls the trailing-slash endpoint', () => {
    const app = readFileSync(resolve(import.meta.dirname, '..', 'src/admin/App.ts'), 'utf8');
    const client = readFileSync(resolve(import.meta.dirname, '..', 'src/admin/api.ts'), 'utf8');

    assert.match(app, /v-for="item in status\.items"/);
    assert.match(app, /item\.verdict === 'unknown'/);
    assert.match(client, /'\/api\/status\/'/);
  });
});

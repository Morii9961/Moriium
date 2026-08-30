// The operational panel (ADR 0002 sections 12.1 and 12.2).
//
// Morii decided against alerting, so this panel is the only thing standing
// between a backup that stopped working and nobody finding out. Two of the
// assertions below are about that specifically: an observation this process
// cannot make is reported as unknown rather than omitted, and a panel that
// fails to load says so instead of rendering as silence.

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { compileTemplate } from 'vue/compiler-sfc';
import { readFileSync } from 'node:fs';
import { createAccount } from '../src/server/accounts.ts';
import { ArticleStore } from '../src/server/articles.ts';
import { backupDatabase } from '../src/server/backup/backup.ts';
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
  return { db, author, root, store: new ArticleStore(db, now), now };
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

describe('what the panel reports', () => {
  it('flags a backup root with nothing in it', async () => {
    const { db, root } = await context();

    const status = collectOperationalStatus({ db, backupRoot: root });

    assert.equal(itemFor(status, 'backups').verdict, 'attention');
    assert.match(itemFor(status, 'backups').detail, /No backup/);
  });

  it('accepts a fresh backup and flags a stale one', async () => {
    const { db, root } = await context();
    await backupDatabase({ db, root, stamp: () => new Date(Date.UTC(2026, 7, 30, 12, 0, 0)) });

    const fresh = collectOperationalStatus({ db, backupRoot: root });
    assert.equal(itemFor(fresh, 'backups').verdict, 'ok');

    // The age is measured against a clock the caller supplies, so this is the
    // real staleness path rather than a rewritten file timestamp.
    const later = new Date(Date.now() + BACKUP_STALE_AFTER_MS + 60_000);
    const stale = collectOperationalStatus({ db, backupRoot: root, now: later });
    assert.equal(itemFor(stale, 'backups').verdict, 'attention');
    assert.match(itemFor(stale, 'backups').detail, /old/);
  });

  it('says every article is live when nothing is waiting', async () => {
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
    store.markLive(article.id, version.id);

    const status = collectOperationalStatus({ db, backupRoot: root });

    assert.equal(itemFor(status, 'export').verdict, 'ok');
    assert.match(itemFor(status, 'export').detail, /live/);
  });

  it('reports a fresh publish as waiting, and an old one as needing attention', async () => {
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
    const soon = collectOperationalStatus({
      db,
      backupRoot: root,
      now: new Date(publishedAt + 60_000),
    });
    assert.equal(itemFor(soon, 'export').verdict, 'ok');
    assert.match(itemFor(soon, 'export').detail, /waiting/);

    const late = collectOperationalStatus({
      db,
      backupRoot: root,
      now: new Date(publishedAt + AWAITING_EXPORT_GRACE_MS + 60_000),
    });
    assert.equal(itemFor(late, 'export').verdict, 'attention');
    assert.match(itemFor(late, 'export').detail, /oldest for/);
  });

  it('names what it cannot observe instead of leaving it out', async () => {
    const { db, root } = await context();

    const status = collectOperationalStatus({ db, backupRoot: root });

    // A panel that silently omits the checks it does not perform reads as
    // "everything is fine", which is the exact failure this panel exists to
    // prevent (ADR 0002 section 12.2).
    assert.equal(itemFor(status, 'offsite').verdict, 'unknown');
    assert.match(itemFor(status, 'offsite').detail, /only on this machine/);
    assert.equal(itemFor(status, 'service').verdict, 'unknown');
  });

  it('reads free disk space', async () => {
    const { db, root } = await context();

    const disk = itemFor(collectOperationalStatus({ db, backupRoot: root }), 'disk');

    assert.notEqual(disk.verdict, undefined);
    if (disk.verdict !== 'unknown') assert.match(disk.detail, /free/);
  });
});

describe('the status endpoint', () => {
  it('needs an author session', async () => {
    const { db } = await context();

    const response = await handleStatus(request('/api/status/'), new FakeSession(), db);

    assert.equal(response.status, 401);
  });

  it('answers a signed-in author with the items', async () => {
    const { db, author } = await context();
    const session = new FakeSession({ id: author.id, name: author.name }, 'csrf-test-token');

    const response = await handleStatus(request('/api/status/'), session, db);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.ok(Array.isArray(body.items));
    assert.ok(body.items.some((item) => item.id === 'backups'));
    assert.match(body.checkedAt, /^\d{4}-\d{2}-\d{2}T/);
  });
});

describe('the admin templates compile', () => {
  // Block 8 taught this: the browser check said "the login shell mounts", which
  // was true and told us nothing, while every author API path 404'd. A template
  // that fails to compile fails the same quiet way -- the shell renders and the
  // panel simply is not there.
  for (const file of ['App.ts', 'ArticleEditor.ts', 'MediaLibrary.ts']) {
    it(`compiles the template in ${file}`, () => {
      const source = readFileSync(resolve(import.meta.dirname, '..', 'src/admin', file), 'utf8');
      const match = /template:\s*`([\s\S]*?)`,\n\}\);/.exec(source);
      assert.ok(match, `${file} must carry a runtime template`);

      const result = compileTemplate({ source: match[1], filename: file, id: file });
      assert.deepEqual(
        result.errors.map((error) => String(error)),
        [],
      );
    });
  }

  it('renders the status panel from the endpoint the client calls', () => {
    const app = readFileSync(resolve(import.meta.dirname, '..', 'src/admin/App.ts'), 'utf8');
    const client = readFileSync(resolve(import.meta.dirname, '..', 'src/admin/api.ts'), 'utf8');

    assert.match(app, /class="status-panel"/);
    assert.match(app, /v-for="item in status\.items"/);
    assert.match(client, /'\/api\/status\/'/);
  });
});

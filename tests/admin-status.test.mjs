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
  BACKUP_ATTENTION_AFTER_MS,
  BACKUP_STALE_AFTER_MS,
  collectOperationalStatus,
  DISK_ATTENTION_BYTES,
  EXTERNAL_READING_STALE_AFTER_MS,
  LOW_DISK_BYTES,
  STATUS_ITEM_IDS,
} from '../src/server/status.ts';

const VERDICTS = ['ok', 'attention', 'failure', 'unknown'];

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

/** Enough free space that the disk row never colours an unrelated assertion. */
function roomyDisk() {
  return () => DISK_ATTENTION_BYTES * 4;
}

function collect(overrides) {
  return collectOperationalStatus({ diskFreeBytes: roomyDisk(), ...overrides });
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

/** Publishes one article and returns the audit time the export row is judged against. */
function publishOne(store, author, overrides = {}) {
  const article = store.createArticle({
    translationKey: 'tide',
    lang: 'zh',
    slug: 'zh/tide',
    authorId: author.id,
    ...fields(),
    ...overrides,
  });
  const version = store.getLatest(article.id);
  store.publish(article.id, version.id, { actorId: author.id });
  return { article, at: new Date(store.listAudit(article.id)[0].at).getTime() };
}

describe('operational status contract', () => {
  it('reports exactly the five observations, each in one of the four states', async () => {
    const { db, root } = await context();
    const status = collect({ db, backupRoot: root, backupStatus: backupStatus() });

    assert.deepEqual(
      status.items.map((entry) => entry.id),
      [...STATUS_ITEM_IDS],
    );
    assert.equal(status.items.length, 5);
    for (const entry of status.items) {
      assert.ok(VERDICTS.includes(entry.verdict), `${entry.id} used verdict ${entry.verdict}`);
      assert.ok(entry.label.length > 0, `${entry.id} needs a label`);
      assert.ok(entry.detail.length > 0, `${entry.id} needs a detail`);
      assert.ok('observedAt' in entry, `${entry.id} must carry its own observation time`);
    }
  });

  it('produces a real case of each of the four states in one response', async () => {
    const { db, root, store, author } = await context();
    await createDatabaseBackup({ db, root });
    const { at } = publishOne(store, author);

    // A fresh backup, an article past its deadline, a disk between the two disk
    // lines, and the two rows nothing here can observe.
    const status = collect({
      db,
      backupRoot: root,
      backupStatus: backupStatus(),
      diskFreeBytes: () => LOW_DISK_BYTES + 1,
      now: new Date(at + AWAITING_EXPORT_GRACE_MS + 60_000),
    });

    assert.equal(itemFor(status, 'backups').verdict, 'ok');
    assert.equal(itemFor(status, 'export').verdict, 'failure');
    assert.equal(itemFor(status, 'disk').verdict, 'attention');
    assert.equal(itemFor(status, 'offsite').verdict, 'unknown');
    assert.deepEqual(
      [...new Set(status.items.map((entry) => entry.verdict))].sort(),
      ['attention', 'failure', 'ok', 'unknown'],
    );
  });
});

describe('backup observation', () => {
  it('treats a first backup that is still running as attention, not as normal', async () => {
    const { db, root } = await context();
    const status = collect({
      db,
      backupRoot: root,
      backupStatus: backupStatus({ inFlight: true }),
    });

    assert.equal(itemFor(status, 'backups').verdict, 'attention');
    assert.match(itemFor(status, 'backups').detail, /首次备份仍在进行/);
  });

  it('treats no backup with a stopped scheduler as a failure', async () => {
    const { db, root } = await context();
    const status = collect({
      db,
      backupRoot: root,
      backupStatus: backupStatus({ running: false }),
    });

    assert.equal(itemFor(status, 'backups').verdict, 'failure');
    assert.match(itemFor(status, 'backups').detail, /没有可用备份/);
  });

  it('grades a backup by age: fresh is ok, late is attention, missed is a failure', async () => {
    const { db, root } = await context();
    await createDatabaseBackup({ db, root });
    const now = new Date();

    const fresh = collect({ db, backupRoot: root, backupStatus: backupStatus(), now });
    assert.equal(itemFor(fresh, 'backups').verdict, 'ok');

    const late = collect({
      db,
      backupRoot: root,
      backupStatus: backupStatus(),
      now: new Date(now.getTime() + BACKUP_ATTENTION_AFTER_MS + 60_000),
    });
    assert.equal(itemFor(late, 'backups').verdict, 'attention');
    assert.match(itemFor(late, 'backups').detail, /仍在窗口内/);

    const missed = collect({
      db,
      backupRoot: root,
      backupStatus: backupStatus(),
      now: new Date(now.getTime() + BACKUP_STALE_AFTER_MS + 60_000),
    });
    assert.equal(itemFor(missed, 'backups').verdict, 'failure');
  });

  it('fails on a stopped scheduler or a failed last attempt even when the newest file is fresh', async () => {
    const { db, root } = await context();
    await createDatabaseBackup({ db, root });
    const now = new Date();

    const stopped = collect({
      db,
      backupRoot: root,
      backupStatus: backupStatus({ running: false }),
      now,
    });
    assert.equal(itemFor(stopped, 'backups').verdict, 'failure');
    assert.match(itemFor(stopped, 'backups').detail, /定时任务没有运行/);

    const failed = collect({
      db,
      backupRoot: root,
      backupStatus: backupStatus({
        lastFailedAt: now.toISOString(),
        lastError: 'backup-failed: simulated failure',
      }),
      now,
    });
    assert.equal(itemFor(failed, 'backups').verdict, 'failure');
    assert.match(itemFor(failed, 'backups').detail, /simulated failure/);
  });

  it('reports an unreadable backup directory as unknown with no observation time', async () => {
    const { db, root } = await context();
    // Injected rather than staged on disk: an unreadable directory raises
    // ENOTDIR or EACCES on Linux but ENOENT on Windows, and ENOENT is the
    // reader's answer for "no backup yet". The branch under test is the one
    // that reaches this file, not the platform's errno.
    const status = collect({
      db,
      backupRoot: root,
      backupStatus: backupStatus(),
      backupAgeMs: () => {
        throw new Error('EACCES: permission denied, scandir');
      },
    });

    assert.equal(itemFor(status, 'backups').verdict, 'unknown');
    assert.equal(itemFor(status, 'backups').observedAt, null);
    assert.match(itemFor(status, 'backups').detail, /无法读取备份目录/);
  });
});

describe('site rebuild observation', () => {
  it('is ok when nothing is waiting to go live', async () => {
    const { db, root } = await context();
    const status = collect({ db, backupRoot: root, backupStatus: backupStatus() });

    assert.equal(itemFor(status, 'export').verdict, 'ok');
  });

  it('is attention inside the grace period and a failure past it', async () => {
    const { db, root, store, author } = await context();
    const { at } = publishOne(store, author);

    const waiting = collect({
      db,
      backupRoot: root,
      backupStatus: backupStatus(),
      now: new Date(at + 60_000),
    });
    assert.equal(itemFor(waiting, 'export').verdict, 'attention');

    const overdue = collect({
      db,
      backupRoot: root,
      backupStatus: backupStatus(),
      now: new Date(at + AWAITING_EXPORT_GRACE_MS + 60_000),
    });
    assert.equal(itemFor(overdue, 'export').verdict, 'failure');
    assert.match(itemFor(overdue, 'export').detail, /超过 15 分钟/);
  });

  it('refuses to guess when a waiting article has no usable audit time', async () => {
    const { db, root, store, author } = await context();
    const { article } = publishOne(store, author);
    // The verdict is entirely a comparison against a deadline, so an unusable
    // timestamp leaves nothing to compare rather than a state to assume.
    db.prepare('UPDATE audit SET at = ? WHERE article_id = ?').run('not-a-time', article.id);

    const status = collect({ db, backupRoot: root, backupStatus: backupStatus() });

    assert.equal(itemFor(status, 'export').verdict, 'unknown');
    assert.match(itemFor(status, 'export').detail, /无法判断是否超时/);
  });
});

describe('disk observation', () => {
  it('grades free space against both lines and reports a read failure as unknown', async () => {
    const { db, root } = await context();
    const base = { db, backupRoot: root, backupStatus: backupStatus() };

    const healthy = collectOperationalStatus({ ...base, diskFreeBytes: () => DISK_ATTENTION_BYTES + 1 });
    assert.equal(itemFor(healthy, 'disk').verdict, 'ok');

    const near = collectOperationalStatus({ ...base, diskFreeBytes: () => LOW_DISK_BYTES + 1 });
    assert.equal(itemFor(near, 'disk').verdict, 'attention');
    assert.match(itemFor(near, 'disk').detail, /接近/);

    const low = collectOperationalStatus({ ...base, diskFreeBytes: () => LOW_DISK_BYTES - 1 });
    assert.equal(itemFor(low, 'disk').verdict, 'failure');

    const unreadable = collectOperationalStatus({
      ...base,
      diskFreeBytes: () => {
        throw new Error('statfs failed');
      },
    });
    assert.equal(itemFor(unreadable, 'disk').verdict, 'unknown');
    assert.equal(itemFor(unreadable, 'disk').observedAt, null);
  });
});

describe('observations this process cannot make', () => {
  it('keeps the off-site copy and service health unknown with no collector', async () => {
    const { db, root } = await context();
    const status = collect({ db, backupRoot: root, backupStatus: backupStatus() });

    for (const id of ['offsite', 'service']) {
      assert.equal(itemFor(status, id).verdict, 'unknown');
      assert.equal(itemFor(status, id).observedAt, null);
      assert.match(itemFor(status, id).detail, /(尚未配置|无法从外部观察)/);
    }
  });

  it('expires an injected reading instead of leaving the last good value on screen', async () => {
    const { db, root } = await context();
    const now = new Date();
    const base = { db, backupRoot: root, backupStatus: backupStatus(), diskFreeBytes: roomyDisk() };
    const reading = (observedAt) => ({
      observedAt: observedAt.toISOString(),
      verdict: 'ok',
      detail: '异地副本在 12 分钟前完成同步。',
    });

    const fresh = collectOperationalStatus({
      ...base,
      now,
      offsite: reading(new Date(now.getTime() - 60_000)),
    });
    assert.equal(itemFor(fresh, 'offsite').verdict, 'ok');
    assert.equal(itemFor(fresh, 'offsite').observedAt, new Date(now.getTime() - 60_000).toISOString());

    const expired = collectOperationalStatus({
      ...base,
      now,
      offsite: reading(new Date(now.getTime() - EXTERNAL_READING_STALE_AFTER_MS - 60_000)),
    });
    assert.equal(itemFor(expired, 'offsite').verdict, 'unknown');
    assert.match(itemFor(expired, 'offsite').detail, /已经过期/);

    const unparseable = collectOperationalStatus({
      ...base,
      now,
      service: { observedAt: 'not-a-time', verdict: 'ok', detail: '健康。' },
    });
    assert.equal(itemFor(unparseable, 'service').verdict, 'unknown');
  });
});

describe('observation times', () => {
  it('stamps every reading with a parseable ISO time, and null when there is none', async () => {
    const { db, root } = await context();
    await createDatabaseBackup({ db, root });
    const now = new Date();
    const status = collect({ db, backupRoot: root, backupStatus: backupStatus(), now });

    assert.equal(status.checkedAt, now.toISOString());
    for (const entry of status.items) {
      if (entry.observedAt === null) {
        assert.equal(entry.verdict, 'unknown', `${entry.id} has no reading but is not unknown`);
        continue;
      }
      assert.match(entry.observedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      assert.ok(!Number.isNaN(new Date(entry.observedAt).getTime()));
    }
  });

  it('shows unknown rather than an empty response when one collector throws', async () => {
    const { root } = await context();
    // Checklist item E4: the panel's own failure costs its row, not the page.
    const brokenDb = {
      prepare() {
        throw new Error('the database went away mid-request');
      },
    };

    const status = collect({ db: brokenDb, backupRoot: root, backupStatus: backupStatus() });

    assert.equal(status.items.length, 5);
    assert.equal(itemFor(status, 'export').verdict, 'unknown');
    assert.equal(itemFor(status, 'export').observedAt, null);
    assert.equal(itemFor(status, 'disk').verdict, 'ok');
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

  it('returns the five items to a signed-in author', async () => {
    const { db, root, author } = await context();
    const session = new FakeSession({ id: author.id, name: author.name }, 'csrf-test-token');
    const response = await handleStatus(request('/api/status/'), session, db, {
      backupRoot: root,
      backupStatus: backupStatus(),
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(
      body.items.map((entry) => entry.id),
      [...STATUS_ITEM_IDS],
    );
    for (const entry of body.items) assert.ok(VERDICTS.includes(entry.verdict));
  });

  it('carries no reader-side data', async () => {
    const { db, root, author } = await context();
    const session = new FakeSession({ id: author.id, name: author.name }, 'csrf-test-token');
    const response = await handleStatus(request('/api/status/'), session, db, {
      backupRoot: root,
      backupStatus: backupStatus(),
    });
    const text = await response.text();

    // AGENTS.md forbids analytics outright; the panel must not become its way in.
    for (const forbidden of ['visitor', 'pageview', 'userAgent', 'user-agent', 'ip', 'referrer', 'session']) {
      assert.ok(
        !text.toLowerCase().includes(forbidden),
        `the status response must not mention ${forbidden}`,
      );
    }
    const panel = readFileSync(resolve(import.meta.dirname, '..', 'src/server/status.ts'), 'utf8');
    for (const forbidden of ['userAgent', 'remoteAddress', 'x-forwarded-for', 'referrer', 'pageview']) {
      assert.ok(!panel.includes(forbidden), `the collector must not read ${forbidden}`);
    }
  });
});

describe('admin status panel', () => {
  const app = () => readFileSync(resolve(import.meta.dirname, '..', 'src/admin/App.ts'), 'utf8');
  const css = () => readFileSync(resolve(import.meta.dirname, '..', 'src/admin/style.css'), 'utf8');

  for (const file of ['App.ts', 'ArticleEditor.ts', 'MediaLibrary.ts']) {
    it(`keeps the runtime template in ${file} compilable`, () => {
      const source = readFileSync(resolve(import.meta.dirname, '..', 'src/admin', file), 'utf8');
      const match = /template:\s*`([\s\S]*?)`,\r?\n\}\);/.exec(source);
      assert.ok(match, `${file} must carry a runtime template`);
      const result = compileTemplate({ source: match[1], filename: file, id: file });
      assert.deepEqual(result.errors.map((error) => String(error)), []);
    });
  }

  it('gives each of the four verdicts its own word', () => {
    const source = app();
    for (const [verdict, label] of [
      ['ok', '正常'],
      ['attention', '需要注意'],
      ['failure', '失败'],
      ['unknown', '未观测'],
    ]) {
      assert.match(source, new RegExp(`${verdict}:\\s*'${label}'`), `${verdict} needs its own label`);
    }
    assert.match(source, /v-for="item in status\.items"/);
    assert.match(source, /'verdict-' \+ item\.verdict/);
  });

  it('never lets unknown borrow the normal label or the normal colour', () => {
    const labels = /const VERDICT_LABELS[^}]*}/.exec(app());
    assert.ok(labels, 'the verdict labels must be one table, not scattered ternaries');
    assert.doesNotMatch(labels[0], /unknown:\s*'正常'/);

    const rules = css();
    const colourOf = (name) => {
      const match = new RegExp(`\\.pill\\.verdict-${name}\\s*\\{([^}]*)\\}`).exec(rules);
      assert.ok(match, `.pill.verdict-${name} needs its own rule`);
      // Anchored so `border-color` does not answer for `color`.
      return /(?:^|[;{]|\s)color:\s*([^;]+);/.exec(match[1])?.[1]?.trim();
    };
    const ok = colourOf('ok');
    const unknown = colourOf('unknown');
    assert.ok(ok && unknown, 'both pills must set a colour');
    assert.notEqual(unknown, ok, 'unknown must not reuse the normal colour');
    for (const name of ['ok', 'attention', 'failure', 'unknown']) assert.ok(colourOf(name));
    // Hue is not the only channel: unknown is also the only dashed state.
    assert.match(rules, /\.pill\.verdict-unknown\s*\{[^}]*border-style:\s*dashed/);
    assert.match(rules, /--admin-unknown:/);
  });

  it('shows each row its own reading time, or says there is none', () => {
    const source = app();
    assert.match(source, /observedLabel\(item\.observedAt\)/);
    assert.match(source, /if \(!observedAt\) return '暂无读数';/);
    // The response-level time is labelled as the check, never as a reading.
    assert.match(source, /checkedLabel\(status\.checkedAt\)/);
    assert.match(source, /本次检查 \$\{at\.toLocaleString\(\)\}/);
  });

  it('renders one unknown row when the panel request itself fails', () => {
    const source = app();
    // The 401 branch sits between the guard and this fallback, so the match is
    // anchored on the fallback itself rather than on it following immediately.
    const handler = /id: 'panel',([\s\S]*?)\],\s*\};/.exec(source);
    assert.ok(handler, 'a failed status request must still set a renderable status');
    assert.match(handler[1], /verdict: 'unknown'/);
    assert.match(handler[1], /observedAt: null/);
    // messageForApiFailure keeps the browser's raw TypeError off the screen.
    assert.match(handler[1], /messageForApiFailure\(error, '连接不上状态接口/);
  });

  it('treats any 401 as the end of the session, not as a missing reading', () => {
    const source = app();
    // A 401 means the server already destroyed the session. Leaving the shell
    // showing "已登录" beside a stale article list claims a session that is
    // gone, and the drafts on screen belong to it.
    const ended = /function endSession\(\): void \{([\s\S]*?)\n    \}/.exec(source);
    assert.ok(ended, 'a 401 must have one place that clears author state');
    for (const cleared of [
      /author\.value = null/,
      /articles\.value = \[\]/,
      /openId\.value = null/,
      /status\.value = null/,
      /draft\.value = newArticle\(\)/,
      /tagsText\.value = ''/,
    ]) {
      assert.match(ended[1], cleared, `endSession must clear ${cleared}`);
    }

    // Both paths that can see a 401 route through it.
    assert.match(
      source,
      /function report\(error: unknown\): void \{\s*if \(error instanceof ApiError && error\.status === 401\) \{\s*endSession\(\);/,
    );
    assert.match(
      source,
      /if \(error instanceof ApiError && error\.status === 401\) \{\s*endSession\(\);\s*failure\.value = '会话已过期，请重新登录。';\s*return;\s*\}\s*status\.value = \{/,
    );
    // The English server string must not be what the author reads.
    assert.match(source, /failure\.value = '会话已过期，请重新登录。'/);
    // Signing out uses the same single definition rather than its own copy.
    assert.match(source, /await api\.logout\(\);\s*endSession\(\);/);
  });

  it('does not let a failing article list suppress the panel', () => {
    const source = app();
    // Awaiting them in sequence inside one try meant a rejected refresh() threw
    // past loadStatus(), so the panel never rendered at all -- the one view that
    // reports a silent failure, removed by a failure.
    assert.match(source, /Promise\.allSettled\(\[refresh\(\), loadStatus\(\)\]\)/);
    assert.doesNotMatch(source, /await refresh\(\);\s*await loadStatus\(\);/);
    for (const caller of ['bootstrap', 'signIn', 'backToList']) {
      const body = new RegExp(`async function ${caller}\\(\\)[\\s\\S]*?\\n    \\}`).exec(source);
      assert.ok(body, `${caller} must exist`);
      assert.match(body[0], /loadAuthorViews\(\)/, `${caller} must load both views together`);
    }
  });

  it('blocks a second re-check and ignores a late answer from an older one', () => {
    const source = app();
    assert.match(source, /:disabled="checkingStatus" @click="loadStatus"/);
    assert.match(source, /checkingStatus \? '检查中…' : '重新检查'/);
    assert.match(source, /statusRequest \+= 1;\s*const mine = statusRequest;/);
    assert.match(source, /if \(mine !== statusRequest\) return;/);
    assert.match(source, /if \(mine === statusRequest\) checkingStatus\.value = false;/);
  });

  it('keeps requesting the trailing-slash endpoint', () => {
    const client = readFileSync(resolve(import.meta.dirname, '..', 'src/admin/api.ts'), 'utf8');
    assert.match(client, /'\/api\/status\/'/);
  });
});

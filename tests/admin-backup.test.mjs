// Backups, restores and the drill (ADR 0002 section 11).
//
// Section 11.4 says a backup nobody has restored is not a backup, and asks the
// drill to be written so that it fails first. These tests are built the same
// way: the load-bearing ones hand the restore something broken and check that
// it refuses, because a verification step only ever run on a good file proves
// nothing at all.

import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import process from 'node:process';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { createAccount } from '../src/server/accounts.ts';
import { ArticleStore } from '../src/server/articles.ts';
import {
  backupDatabase,
  backupsByAge,
  inspectBackup,
  RETAINED_BACKUPS,
} from '../src/server/backup/backup.ts';
import { mirrorMedia } from '../src/server/backup/media-mirror.ts';
import { restoreDatabase } from '../src/server/backup/restore.ts';
import {
  backupStatus,
  runScheduledBackup,
  startBackupSchedule,
  stopBackupSchedule,
} from '../src/server/backup/schedule.ts';
import { openDatabase } from '../src/server/db/open.ts';
import { isAdminError } from '../src/server/errors.ts';
import { assertCorruptBackupIsRefused, corruptFile } from '../scripts/restore-drill.mjs';

let directory;
const opened = [];
let counter = 0;

before(() => {
  directory = mkdtempSync(join(tmpdir(), 'moriium-backup-'));
});

after(() => {
  stopBackupSchedule();
  while (opened.length > 0) {
    // One test closes its own connection on purpose, to make a backup fail.
    try {
      opened.pop().close();
    } catch {
      // Already closed.
    }
  }
  rmSync(directory, { recursive: true, force: true });
});

function fields(overrides = {}) {
  return {
    title: '潮汐笔记',
    summary: '为了拍到退潮后的滩涂写的推算脚本。',
    publishedAt: '2026-03-14T21:40:00+08:00',
    updatedAt: null,
    category: '工程夹具',
    tags: ['夹具'],
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

async function liveDatabase() {
  counter += 1;
  let tick = 0;
  const now = () => new Date(Date.UTC(2026, 0, 1, 0, 0, tick++)).toISOString();
  const path = join(directory, `live-${counter}.db`);
  const db = openDatabase(path, { now });
  opened.push(db);
  const morii = await createAccount(db, { name: 'Morii', password: 'a'.repeat(30) }, now);
  const store = new ArticleStore(db, now);
  store.createArticle({
    translationKey: 'tide-notes',
    lang: 'zh',
    slug: 'zh/tide-notes',
    authorId: morii.id,
    ...fields(),
  });
  return {
    db,
    morii,
    store,
    path,
    root: join(directory, `backups-${counter}`),
  };
}

/** A stamp generator that produces ordered, unique backup names. */
function stamps() {
  let tick = 0;
  return () => new Date(Date.UTC(2026, 0, 1, tick++, 0, 0));
}

describe('taking a backup', () => {
  it('copies the database and reads the copy back before keeping it', async () => {
    const context = await liveDatabase();

    const result = await backupDatabase({ db: context.db, root: context.root, stamp: stamps() });

    assert.ok(result.pages > 0);
    assert.equal(result.contents.articles, 1);
    assert.equal(result.contents.accounts, 1);
    assert.equal(result.contents.schemaVersion, 1);
    assert.deepEqual(inspectBackup(result.file), result.contents);
    assert.equal(existsSync(`${result.file}.partial`), false);
  });

  it('is a point in time: a later write is not in it', async () => {
    const context = await liveDatabase();
    const result = await backupDatabase({ db: context.db, root: context.root, stamp: stamps() });

    context.store.createArticle({
      translationKey: 'second',
      lang: 'en',
      slug: 'en/second',
      authorId: context.morii.id,
      ...fields(),
    });

    assert.equal(context.store.listArticles().length, 2);
    assert.equal(inspectBackup(result.file).articles, 1);
  });

  it('keeps the newest and never removes the one just written', async () => {
    const context = await liveDatabase();
    const stamp = stamps();
    const kept = [];
    for (let index = 0; index < 5; index += 1) {
      kept.push(await backupDatabase({ db: context.db, root: context.root, keep: 3, stamp }));
    }

    const remaining = backupsByAge(context.root);
    assert.equal(remaining.length, 3);
    assert.equal(remaining[0], kept[4].file);
    assert.equal(kept[4].removed.includes(kept[4].file), false);
    assert.equal(existsSync(kept[0].file), false);
  });

  it('does not count a leftover partial file as a backup', async () => {
    const context = await liveDatabase();
    const result = await backupDatabase({ db: context.db, root: context.root, stamp: stamps() });
    writeFileSync(join(context.root, 'admin-2026-01-01T00-00-00-000Z.db.partial'), 'x', 'utf8');
    writeFileSync(join(context.root, 'notes.txt'), 'x', 'utf8');

    assert.deepEqual(backupsByAge(context.root), [result.file]);
  });

  it('leaves nothing behind but the backup itself', async () => {
    const context = await liveDatabase();

    const result = await backupDatabase({ db: context.db, root: context.root, stamp: stamps() });

    // Verifying the staged copy opens it, which creates a -wal and a -shm. An
    // hourly schedule that left those behind would add two orphan files per run
    // until the disk filled. A live dev server found exactly that.
    assert.deepEqual(readdirSync(context.root), [result.file.split(/[\\/]/).pop()]);
  });

  it('defaults to forty-eight, which is the two days section 11.2 asks for', () => {
    assert.equal(RETAINED_BACKUPS, 48);
  });
});

describe('refusing a backup that cannot be trusted', () => {
  it('refuses a corrupted copy and says why', async () => {
    const context = await liveDatabase();
    const result = await backupDatabase({ db: context.db, root: context.root, stamp: stamps() });
    const before = readFileSync(result.file);
    corruptFile(result.file);
    assert.notEqual(Buffer.compare(before, readFileSync(result.file)), 0);

    assert.throws(() => inspectBackup(result.file), (error) => {
      assert.equal(isAdminError(error), true);
      assert.equal(error.code, 'backup-corrupt');
      assert.match(error.userMessage, /malformed|integrity|could not be read/i);
      return true;
    });
  });

  it('refuses a file that is not a database', () => {
    const file = join(directory, 'not-a-database.db');
    writeFileSync(file, 'this is not a database at all', 'utf8');

    assert.throws(() => inspectBackup(file), (error) => error.code === 'backup-corrupt');
  });

  it('refuses a database with no applied migrations', () => {
    // A real SQLite file with the right tables and no recorded migration: it
    // opens and passes an integrity check, and restoring it would produce an
    // admin whose schema version nobody can reason about.
    const bare = openDatabase(join(directory, 'bare.db'));
    bare.exec('DELETE FROM schema_migrations');
    bare.close();

    assert.throws(() => inspectBackup(join(directory, 'bare.db')), (error) => {
      assert.equal(error.code, 'backup-corrupt');
      assert.match(error.userMessage, /no applied migrations/);
      return true;
    });
  });

  it('refuses a backup that does not exist', () => {
    assert.throws(
      () => inspectBackup(join(directory, 'never-written.db')),
      (error) => error.code === 'backup-corrupt',
    );
  });
});

describe('restoring', () => {
  it('restores into a clean path and re-reads what it wrote', async () => {
    const context = await liveDatabase();
    const result = await backupDatabase({ db: context.db, root: context.root, stamp: stamps() });
    const target = join(directory, `restored-${counter}`, 'admin.db');

    const restored = restoreDatabase({ backupFile: result.file, target });

    assert.deepEqual(restored.contents, result.contents);
    const reopened = openDatabase(target);
    opened.push(reopened);
    assert.equal(new ArticleStore(reopened).listArticles().length, 1);
  });

  it('refuses to overwrite a database unless asked', async () => {
    const context = await liveDatabase();
    const result = await backupDatabase({ db: context.db, root: context.root, stamp: stamps() });

    assert.throws(() => restoreDatabase({ backupFile: result.file, target: context.path }), (error) => {
      assert.equal(error.code, 'conflict');
      assert.match(error.userMessage, /has to be asked for explicitly/);
      return true;
    });
  });

  it('refuses to overwrite a database another connection still holds', async () => {
    const context = await liveDatabase();
    const result = await backupDatabase({ db: context.db, root: context.root, stamp: stamps() });

    // Windows refuses to unlink the write-ahead log of an open connection, so
    // this is where a live service becomes visible. Linux allows the unlink,
    // which is why stopping the service stays an operational rule; the test
    // asserts the platform-specific guard only where the platform provides it.
    if (process.platform !== 'win32') return;
    assert.throws(
      () => restoreDatabase({ backupFile: result.file, target: context.path, overwrite: true }),
      (error) => {
        assert.equal(error.code, 'conflict');
        assert.match(error.userMessage, /still in use/);
        return true;
      },
    );
  });

  it('overwrites a database nothing is holding open', async () => {
    const context = await liveDatabase();
    const result = await backupDatabase({ db: context.db, root: context.root, stamp: stamps() });
    context.db.close();

    const forced = restoreDatabase({
      backupFile: result.file,
      target: context.path,
      overwrite: true,
    });

    assert.equal(forced.contents.articles, 1);
  });

  it('clears a stale write-ahead log at the target', async () => {
    const context = await liveDatabase();
    const result = await backupDatabase({ db: context.db, root: context.root, stamp: stamps() });
    const target = join(directory, `wal-${counter}`, 'admin.db');
    mkdirSync(join(directory, `wal-${counter}`), { recursive: true });
    writeFileSync(`${target}-wal`, 'stale', 'utf8');
    writeFileSync(`${target}-shm`, 'stale', 'utf8');

    const restored = restoreDatabase({ backupFile: result.file, target });

    // A write-ahead log from a different database is a second, disagreeing
    // account of the same file. Leaving one behind is how a restore corrupts.
    // Verifying the restore opens the file, which may create a fresh log of its
    // own -- so the assertion is that the stale one is gone, not that no log
    // exists.
    for (const sidecar of [`${target}-wal`, `${target}-shm`]) {
      if (existsSync(sidecar)) assert.notEqual(readFileSync(sidecar, 'utf8'), 'stale');
    }
    assert.equal(restored.contents.articles, 1);
  });

  it('refuses a corrupt backup before touching the target', async () => {
    const context = await liveDatabase();
    const result = await backupDatabase({ db: context.db, root: context.root, stamp: stamps() });
    const target = join(directory, `untouched-${counter}`, 'admin.db');
    mkdirSync(join(directory, `untouched-${counter}`), { recursive: true });
    writeFileSync(target, 'the database that was already there', 'utf8');
    corruptFile(result.file);

    assert.throws(
      () => restoreDatabase({ backupFile: result.file, target, overwrite: true }),
      (error) => error.code === 'backup-corrupt',
    );
    assert.equal(readFileSync(target, 'utf8'), 'the database that was already there');
  });
});

describe('mirroring the media root', () => {
  function mediaPair() {
    counter += 1;
    const source = join(directory, `media-source-${counter}`);
    const target = join(directory, `media-mirror-${counter}`);
    mkdirSync(join(source, 'posts', 'library'), { recursive: true });
    writeFileSync(join(source, 'posts', 'library', 'one.webp'), 'first image bytes', 'utf8');
    writeFileSync(join(source, 'posts', 'library', 'two.webp'), 'second image bytes', 'utf8');
    return { source, target };
  }

  it('copies everything, then reports the second run as unchanged', () => {
    const { source, target } = mediaPair();

    const first = mirrorMedia({ source, target });
    const second = mirrorMedia({ source, target });

    assert.equal(first.copied.length, 2);
    assert.equal(second.copied.length, 0);
    assert.equal(second.unchanged.length, 2);
    assert.equal(readFileSync(join(target, 'posts/library/one.webp'), 'utf8'), 'first image bytes');
  });

  it('re-copies a file whose bytes changed without its size changing', () => {
    const { source, target } = mediaPair();
    mirrorMedia({ source, target });
    writeFileSync(join(source, 'posts', 'library', 'one.webp'), 'FIRST image bytes', 'utf8');

    const again = mirrorMedia({ source, target });

    assert.deepEqual(again.copied, ['posts/library/one.webp']);
    assert.equal(readFileSync(join(target, 'posts/library/one.webp'), 'utf8'), 'FIRST image bytes');
  });

  it('removes a file that is gone from the source', () => {
    const { source, target } = mediaPair();
    mirrorMedia({ source, target });
    rmSync(join(source, 'posts', 'library', 'two.webp'));

    const again = mirrorMedia({ source, target });

    assert.deepEqual(again.removed, ['posts/library/two.webp']);
    assert.equal(existsSync(join(target, 'posts/library/two.webp')), false);
  });

  it('refuses a media root that does not exist', () => {
    assert.throws(
      () => mirrorMedia({ source: join(directory, 'no-media'), target: join(directory, 'mirror') }),
      (error) => error.code === 'backup-failed',
    );
  });
});

describe('the scheduled backup', () => {
  it('records a success and leaves a file behind', async () => {
    const context = await liveDatabase();

    await runScheduledBackup(context.db, context.root);

    assert.equal(backupsByAge(context.root).length, 1);
    assert.notEqual(backupStatus(context.root).lastSucceededAt, null);
    assert.equal(backupStatus(context.root).lastError, null);
  });

  it('records a failure without throwing, because a backup must not take the admin down', async () => {
    const context = await liveDatabase();
    context.db.close();

    await runScheduledBackup(context.db, context.root);

    const status = backupStatus(context.root);
    assert.notEqual(status.lastFailedAt, null);
    assert.notEqual(status.lastError, null);
    assert.equal(backupsByAge(context.root).length, 0);
  });

  it('arms once and reports that it is running', async () => {
    const context = await liveDatabase();

    const stop = startBackupSchedule(context.db, { root: context.root, intervalMs: 3_600_000 });
    assert.equal(backupStatus(context.root).running, true);
    stop();
    assert.equal(backupStatus(context.root).running, false);
  });
});

describe('the drill fails first', () => {
  it('confirms a corrupted backup is refused, and says what the refusal was', async () => {
    const context = await liveDatabase();
    const result = await backupDatabase({ db: context.db, root: context.root, stamp: stamps() });
    const working = join(directory, `drill-${counter}`);
    mkdirSync(working, { recursive: true });

    const refusal = assertCorruptBackupIsRefused(result.file, working);

    assert.match(refusal, /could not be read|malformed|integrity/i);
    // The good backup is untouched: the drill corrupts a copy, not the original.
    assert.equal(inspectBackup(result.file).articles, 1);
    assert.ok(readdirSync(working).includes('damaged.db'));
  });
});

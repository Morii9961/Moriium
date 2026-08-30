import assert from 'node:assert/strict';
import { backup as sqliteBackup, DatabaseSync } from 'node:sqlite';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import {
  createDatabaseBackup,
  RETAINED_LOCAL_BACKUPS,
  startDatabaseBackupScheduler,
} from '../src/server/backup/database-backup.ts';
import { drillDatabaseRestore } from '../src/server/backup/restore-drill.ts';
import { openDatabase } from '../src/server/db/open.ts';
import { AdminError } from '../src/server/errors.ts';
import { parseRestoreDrillCommand } from '../scripts/drill-database-restore.mjs';

let directory;
const opened = [];

before(() => {
  directory = mkdtempSync(join(tmpdir(), 'moriium-backup-'));
});

after(() => {
  while (opened.length > 0) opened.pop().close();
  rmSync(directory, { recursive: true, force: true });
});

let databaseCounter = 0;
function freshDatabase() {
  databaseCounter += 1;
  const db = openDatabase(join(directory, `source-${databaseCounter}.db`), {
    now: () => '2026-08-30T00:00:00.000Z',
  });
  opened.push(db);
  db.prepare('INSERT INTO accounts (name, password_hash, created_at) VALUES (?, ?, ?)').run(
    'Morii',
    'test-hash',
    '2026-08-30T00:00:00.000Z',
  );
  return db;
}

function backupFiles(root) {
  return readdirSync(root).filter((name) => name.startsWith('admin-') && name.endsWith('.db'));
}

describe('online database backups', () => {
  it('passes the resident connection to node:sqlite and reads the result back', async () => {
    const db = freshDatabase();
    const root = join(directory, 'online');
    let received;

    const result = await createDatabaseBackup({
      db,
      root,
      now: () => new Date('2026-08-30T01:02:03.004Z'),
      backup: async (source, path, options) => {
        received = source;
        return options ? sqliteBackup(source, path, options) : sqliteBackup(source, path);
      },
    });

    assert.equal(received, db, 'backup must use the resident DatabaseSync object');
    assert.equal(result.file, join(root, 'admin-2026-08-30T01-02-03.004Z.db'));
    assert.ok(result.pages > 0);

    const copy = new DatabaseSync(result.file, { readOnly: true });
    try {
      assert.equal(copy.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
      assert.equal(copy.prepare('SELECT name FROM accounts').get().name, 'Morii');
    } finally {
      copy.close();
    }
  });

  it('leaves previous backups unchanged when a new backup fails', async () => {
    const db = freshDatabase();
    const root = join(directory, 'failed');
    const previous = join(root, 'admin-2026-08-29T01-00-00.000Z.db');
    mkdirSync(root, { recursive: true });
    writeFileSync(previous, 'previous-good-backup-placeholder');

    await assert.rejects(
      createDatabaseBackup({
        db,
        root,
        now: () => new Date('2026-08-30T01:00:00.000Z'),
        backup: async () => {
          throw new Error('simulated disk failure');
        },
      }),
      (error) => error instanceof AdminError && error.code === 'backup-failed',
    );

    assert.equal(existsSync(previous), true);
    assert.deepEqual(readdirSync(root), ['admin-2026-08-29T01-00-00.000Z.db']);
  });

  it('keeps exactly the newest 48 completed local backups', async () => {
    const db = freshDatabase();
    const root = join(directory, 'retention');
    mkdirSync(root, { recursive: true });
    for (let hour = 0; hour < RETAINED_LOCAL_BACKUPS; hour += 1) {
      const stamp = String(hour).padStart(2, '0');
      writeFileSync(join(root, `admin-2026-08-28T${stamp}-00-00.000Z.db`), 'old');
    }

    const result = await createDatabaseBackup({
      db,
      root,
      now: () => new Date('2026-08-30T00:00:00.000Z'),
    });

    assert.equal(backupFiles(root).length, RETAINED_LOCAL_BACKUPS);
    assert.deepEqual(result.removed, ['admin-2026-08-28T00-00-00.000Z.db']);
    assert.equal(existsSync(result.file), true);
  });

  it('coalesces an immediate scheduler run with manual triggers', async () => {
    const db = freshDatabase();
    const root = join(directory, 'scheduler');
    let calls = 0;
    let release;
    const blocked = new Promise((resolve) => {
      release = resolve;
    });

    const scheduler = startDatabaseBackupScheduler({
      db,
      root,
      intervalMs: 60_000,
      now: () => new Date('2026-08-30T03:00:00.000Z'),
      backup: async (source, path, options) => {
        calls += 1;
        await blocked;
        return options ? sqliteBackup(source, path, options) : sqliteBackup(source, path);
      },
    });

    const first = scheduler.runNow();
    const second = scheduler.runNow();
    assert.equal(first, second);
    release();
    await first;
    scheduler.stop();
    assert.equal(calls, 1);
    assert.equal(backupFiles(root).length, 1);
  });
});

describe('the restore drill', () => {
  it('rejects a corrupt control before proving a persistent read/write cycle', async () => {
    const db = freshDatabase();
    const sourceRoot = join(directory, 'drill-source');
    const backup = await createDatabaseBackup({
      db,
      root: sourceRoot,
      now: () => new Date('2026-08-30T04:00:00.000Z'),
    });

    const result = await drillDatabaseRestore({
      backup: backup.file,
      parent: directory,
      now: () => new Date('2026-08-30T04:01:00.000Z'),
    });

    assert.equal(result.negativeControlRejected, true);
    assert.equal(result.migrationVersion, 1);
    assert.ok(result.durationMs >= 0);
    assert.equal(result.workspace, undefined, 'the disposable restored copy is removed by default');
  });

  it('refuses a corrupt supplied backup without changing the source file', async () => {
    const corrupt = join(directory, 'offsite-corrupt.db');
    writeFileSync(corrupt, 'not sqlite');

    await assert.rejects(
      drillDatabaseRestore({ backup: corrupt, parent: directory }),
      (error) => error instanceof AdminError && error.code === 'backup-failed',
    );
    assert.equal(existsSync(corrupt), true);
  });

  it('parses only the documented non-destructive command surface', () => {
    assert.deepEqual(
      parseRestoreDrillCommand(['--backup', 'remote.db', '--parent', 'drills', '--keep']),
      { backup: 'remote.db', parent: 'drills', keepWorkspace: true },
    );
    assert.throws(() => parseRestoreDrillCommand([]), /--backup is required/);
    assert.throws(() => parseRestoreDrillCommand(['--database', 'live.db']), /Usage/);
  });
});

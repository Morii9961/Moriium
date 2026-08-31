// Online backups for the resident admin database.
//
// ADR 0002 section 11 deliberately keeps this inside the application process:
// Node's sqlite.backup() documents that writes from another connection restart
// an in-progress backup, while writes through this same DatabaseSync object are
// incorporated. Opening the database path again from cron would lose that
// property.
//
// Source: https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html#sqlitebackupsource-path-options

import { backup as sqliteBackup, DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdir, readdir, rename, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { AdminError } from '../errors.ts';

export const BACKUP_INTERVAL_MS = 60 * 60 * 1_000;
export const RETAINED_LOCAL_BACKUPS = 48;

export const DEFAULT_BACKUP_ROOT =
  process.platform === 'win32' ? resolve('.astro/backups') : '/var/lib/moriium/backups';

const BACKUP_NAME = /^admin-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.\d{3}Z\.db$/;

type BackupFunction = typeof sqliteBackup;

export type DatabaseBackup = {
  readonly file: string;
  readonly pages: number;
  readonly removed: readonly string[];
};

export type BackupOptions = {
  readonly db: DatabaseSync;
  readonly root?: string;
  readonly now?: () => Date;
  readonly keep?: number;
  /** Test seam; production always uses node:sqlite backup(). */
  readonly backup?: BackupFunction;
};

function backupFileName(date: Date): string {
  return `admin-${date.toISOString().replaceAll(':', '-')}.db`;
}

function assertHealthyBackup(path: string): void {
  const copy = new DatabaseSync(path, { readOnly: true });
  try {
    const rows = copy.prepare('PRAGMA integrity_check').all() as Array<{ integrity_check: string }>;
    if (rows.length !== 1 || rows[0]?.integrity_check !== 'ok') {
      throw new Error('SQLite integrity_check did not return ok.');
    }

    const migration = copy
      .prepare('SELECT MAX(id) AS version FROM schema_migrations')
      .get() as { version: number | null } | undefined;
    if (migration?.version === null || migration?.version === undefined) {
      throw new Error('The backup does not contain a schema migration record.');
    }
  } finally {
    copy.close();
  }
}

async function pruneBackups(root: string, keep: number): Promise<string[]> {
  const names = (await readdir(root))
    .filter((name) => BACKUP_NAME.test(name))
    .sort()
    .reverse();
  const removed = names.slice(keep);
  for (const name of removed) await rm(join(root, name));
  return removed;
}

async function removeBackupSidecars(path: string): Promise<void> {
  await Promise.all([
    rm(`${path}-wal`, { force: true }),
    rm(`${path}-shm`, { force: true }),
  ]);
}

async function removeStagingArtifacts(path: string): Promise<void> {
  await Promise.all([rm(path, { force: true }), removeBackupSidecars(path)]);
}

/**
 * Writes, reads back, and only then promotes one online database backup.
 *
 * The staging file is in the destination directory so rename never crosses a
 * filesystem. A failed backup cannot replace a previous good file, and
 * retention runs only after the new file passes SQLite's integrity check.
 */
export async function createDatabaseBackup(options: BackupOptions): Promise<DatabaseBackup> {
  const root = options.root ?? DEFAULT_BACKUP_ROOT;
  const now = options.now ?? (() => new Date());
  const keep = options.keep ?? RETAINED_LOCAL_BACKUPS;
  const runBackup = options.backup ?? sqliteBackup;

  if (!Number.isInteger(keep) || keep < 1) {
    throw new AdminError('backup-failed', 'The local backup retention count must be positive.');
  }

  await mkdir(root, { recursive: true });
  const finalName = backupFileName(now());
  const finalPath = join(root, finalName);
  const stagingPath = join(root, `.staging-${process.pid}-${randomUUID()}.db`);

  try {
    const pages = await runBackup(options.db, stagingPath);
    assertHealthyBackup(stagingPath);
    // Opening the staged WAL-mode database for validation creates sidecars
    // beside it. They retain the random staging name after promotion, so an
    // hourly schedule would otherwise leak two files on every successful run.
    await removeBackupSidecars(stagingPath);
    await rename(stagingPath, finalPath);
    let removed: string[];
    try {
      removed = await pruneBackups(root, keep);
    } catch (error) {
      // Promotion already made a validated backup durable. Report cleanup as
      // its own state instead of claiming the backup itself failed or that the
      // directory was unchanged.
      throw new AdminError(
        'backup-failed',
        'The database backup completed, but old local backups could not be pruned.',
        { cause: error },
      );
    }
    return { file: finalPath, pages, removed };
  } catch (error) {
    await removeStagingArtifacts(stagingPath).catch(() => undefined);
    if (error instanceof AdminError) throw error;
    throw new AdminError(
      'backup-failed',
      'The database backup failed validation; the previous backups were left unchanged.',
      { cause: error },
    );
  }
}

export type BackupScheduler = {
  readonly runNow: () => Promise<DatabaseBackup>;
  readonly stop: () => void;
};

export type SchedulerOptions = BackupOptions & {
  readonly intervalMs?: number;
  readonly onSuccess?: (result: DatabaseBackup) => void;
  readonly onError?: (error: unknown) => void;
};

/** Starts one immediate backup and then one per hour without overlapping runs. */
export function startDatabaseBackupScheduler(options: SchedulerOptions): BackupScheduler {
  const intervalMs = options.intervalMs ?? BACKUP_INTERVAL_MS;
  if (!Number.isInteger(intervalMs) || intervalMs < 1) {
    throw new AdminError('backup-failed', 'The database backup interval must be positive.');
  }

  let inFlight: Promise<DatabaseBackup> | undefined;
  const runNow = (): Promise<DatabaseBackup> => {
    if (inFlight) return inFlight;
    inFlight = createDatabaseBackup(options)
      .then((result) => {
        options.onSuccess?.(result);
        return result;
      })
      .catch((error: unknown) => {
        options.onError?.(error);
        throw error;
      })
      .finally(() => {
        inFlight = undefined;
      });
    return inFlight;
  };

  const timer = setInterval(() => void runNow().catch(() => undefined), intervalMs);
  // The resident Astro server keeps itself alive. A backup timer must not keep
  // a stopped CLI, test, or failed server process alive on its own.
  // Source: https://nodejs.org/download/release/latest-v24.x/docs/api/timers.html#timeoutunref
  timer.unref();
  void runNow().catch(() => undefined);

  return { runNow, stop: () => clearInterval(timer) };
}

// Online backups of the admin database (ADR 0002 section 11).
//
// One constraint shapes this whole module. Node's own documentation says of
// `backup()`:
//
//   "The backed-up database can be used normally during the backup process.
//    Mutations coming from the same connection will be reflected in the backup
//    right away. However, mutations from other connections will cause the
//    backup process to restart."
//   -- https://nodejs.org/docs/latest-v24.x/api/sqlite.html
//
// So the backup has to run inside the process that holds the live connection,
// not from a cron job opening its own. An external backup taken while the
// author is writing restarts forever, and that failure is silent: it looks like
// a backup in progress, it just never finishes. `backupDatabase` therefore
// takes the live `DatabaseSync` rather than a path.
//
// Second rule, the same one the export and the media import follow: what is
// written is read back. A backup nobody has opened is a file, not a backup, so
// every copy is opened, integrity-checked and counted before it is allowed to
// take its final name.

import { backup, DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { AdminError } from '../errors.ts';

/** Data, so it lives outside releases/ (ADR 0002 section 15.1). */
export const DEFAULT_BACKUP_ROOT =
  process.platform === 'win32' ? resolve('.astro/backups') : '/var/lib/moriium/backups';

/** 48 hourly copies: two days of hourly history (ADR 0002 section 11.2). */
export const RETAINED_BACKUPS = 48;

const NAME_PATTERN = /^admin-[0-9TZ.:-]+\.db$/;

export function backupRoot(): string {
  return resolve(process.env.MORIIUM_BACKUP_ROOT?.trim() || DEFAULT_BACKUP_ROOT);
}

export type BackupContents = {
  readonly schemaVersion: number;
  readonly accounts: number;
  readonly articles: number;
  readonly versions: number;
  readonly mediaAssets: number;
};

export type BackupResult = {
  readonly file: string;
  /** Pages copied, as reported by node:sqlite. */
  readonly pages: number;
  readonly contents: BackupContents;
  readonly removed: readonly string[];
};

function fail(message: string, cause?: unknown): never {
  throw new AdminError('backup-failed', message, cause === undefined ? undefined : { cause });
}

function corrupt(message: string, cause?: unknown): never {
  throw new AdminError('backup-corrupt', message, cause === undefined ? undefined : { cause });
}

function countOf(db: DatabaseSync, table: string): number {
  const row = db.prepare(`SELECT COUNT(*) AS total FROM ${table}`).get() as { total: number };
  return row.total;
}

/**
 * Opens a backup file and proves it is a database, not just a file.
 *
 * `integrity_check` is what separates "the copy exists" from "the copy can be
 * restored". It is the check the quarterly drill in section 11.4 would
 * otherwise be the first thing to run -- three months late.
 */
export function inspectBackup(file: string): BackupContents {
  if (!existsSync(file)) corrupt('That backup file does not exist.');
  let db: DatabaseSync;
  try {
    db = new DatabaseSync(file, { readOnly: true });
  } catch (cause) {
    corrupt('That backup could not be opened as a database.', cause);
  }
  try {
    const rows = db.prepare('PRAGMA integrity_check').all() as Array<Record<string, unknown>>;
    const verdict = rows.length === 1 ? String(Object.values(rows[0] ?? {})[0]) : 'multiple problems';
    if (verdict !== 'ok') corrupt(`That backup failed its integrity check: ${verdict}.`);

    const version = db.prepare('SELECT MAX(id) AS version FROM schema_migrations').get() as
      | { version: number | null }
      | undefined;
    const schemaVersion = version?.version ?? 0;
    if (schemaVersion < 1) corrupt('That backup has no applied migrations.');

    return {
      schemaVersion,
      accounts: countOf(db, 'accounts'),
      articles: countOf(db, 'articles'),
      versions: countOf(db, 'versions'),
      mediaAssets: countOf(db, 'media_assets'),
    };
  } catch (cause) {
    if (cause instanceof AdminError) throw cause;
    // SQLite refuses a mangled page before `integrity_check` can report on it,
    // so the reason arrives as a thrown error rather than as a row. Passing its
    // wording through is the difference between "unreadable" and knowing the
    // file is damaged rather than, say, locked.
    const reason = cause instanceof Error ? cause.message : String(cause);
    corrupt(`That backup could not be read: ${reason}`, cause);
  } finally {
    db.close();
  }
}

/** Backups newest first. The names are ISO stamps, so they sort by themselves. */
export function backupsByAge(root: string): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile() && NAME_PATTERN.test(entry.name))
    .map((entry) => entry.name)
    .sort()
    .reverse()
    .map((name) => join(root, name));
}

/**
 * Takes one online backup, verifies it, and prunes the oldest.
 *
 * The copy is written under a temporary name and renamed only after it has been
 * opened and checked, so a half-written or unreadable file never occupies a
 * slot in the retention window -- which would quietly reduce 48 real backups to
 * 47 real ones and a decoy.
 */
export async function backupDatabase(options: {
  readonly db: DatabaseSync;
  readonly root?: string;
  readonly keep?: number;
  readonly stamp?: () => Date;
}): Promise<BackupResult> {
  const root = resolve(options.root ?? backupRoot());
  const keep = options.keep ?? RETAINED_BACKUPS;
  const at = (options.stamp ?? (() => new Date()))().toISOString().replace(/[:.]/g, '-');
  mkdirSync(root, { recursive: true });

  let file = join(root, `admin-${at}.db`);
  let suffix = 1;
  while (existsSync(file)) {
    file = join(root, `admin-${at}-${suffix}.db`);
    suffix += 1;
  }
  const staging = `${file}.partial`;
  // Opening the staged copy to verify it leaves a -wal and a -shm beside it.
  // Cleaning them is not tidiness: on an hourly schedule they would accumulate
  // two orphan files per run forever, and a backup directory that fills a disk
  // is a backup system that stops working. A live dev server found this.
  const sidecars = [`${staging}-wal`, `${staging}-shm`];
  const clearStaging = (): void => {
    rmSync(staging, { force: true });
    for (const sidecar of sidecars) rmSync(sidecar, { force: true });
  };
  clearStaging();

  let pages: number;
  try {
    pages = await backup(options.db, staging);
  } catch (cause) {
    clearStaging();
    fail('The database backup did not complete.', cause);
  }

  let contents: BackupContents;
  try {
    contents = inspectBackup(staging);
  } catch (cause) {
    clearStaging();
    throw cause;
  }
  renameSync(staging, file);
  for (const sidecar of sidecars) rmSync(sidecar, { force: true });

  const removed: string[] = [];
  for (const stale of backupsByAge(root).slice(keep)) {
    if (stale === file) continue;
    rmSync(stale, { force: true });
    removed.push(stale);
  }

  return { file, pages, contents, removed };
}

/** The age of the newest backup, in milliseconds, or null when there is none. */
export function ageOfNewestBackup(root: string, now: Date = new Date()): number | null {
  const [newest] = backupsByAge(root);
  if (!newest) return null;
  return now.getTime() - statSync(newest).mtimeMs;
}

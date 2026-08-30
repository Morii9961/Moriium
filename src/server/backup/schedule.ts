// The hourly backup, armed from inside the process that holds the connection.
//
// ADR 0002 section 11.3 rules out the obvious alternative. Node's backup
// restarts whenever another connection writes, so a cron job opening its own
// handle would restart forever while the author is writing -- and would look
// like a backup in progress the whole time. The schedule therefore lives with
// the resident connection: src/server/db/runtime.ts arms it when that
// connection is created, and it backs up that exact `DatabaseSync`.
//
// Two consequences worth naming:
//
//   * A backup failure must never take the admin down. Failures are recorded
//     and logged; the author keeps writing. An admin that refuses to load
//     because a disk is full has turned a backup problem into an outage.
//   * The status is kept in memory for the panel section 12.1 describes.
//     Morii decided against alerting, so the only way a failure becomes visible
//     is by being on a screen the author already opens.

import type { DatabaseSync } from 'node:sqlite';
import { ageOfNewestBackup, backupDatabase, backupRoot } from './backup.ts';
import { describeForLog } from '../errors.ts';

/** RPO is one hour (ADR 0002 section 11.1), so the interval is the target. */
export const BACKUP_INTERVAL_MS = 60 * 60 * 1000;

export type BackupStatus = {
  readonly running: boolean;
  readonly lastSucceededAt: string | null;
  readonly lastFailedAt: string | null;
  readonly lastError: string | null;
  /** Milliseconds since the newest backup on disk, or null when there is none. */
  readonly ageOfNewest: number | null;
};

let timer: ReturnType<typeof setInterval> | null = null;
let lastSucceededAt: string | null = null;
let lastFailedAt: string | null = null;
let lastError: string | null = null;

export function backupStatus(root = backupRoot()): BackupStatus {
  return {
    running: timer !== null,
    lastSucceededAt,
    lastFailedAt,
    lastError,
    ageOfNewest: ageOfNewestBackup(root),
  };
}

/**
 * One scheduled backup. Never throws.
 *
 * Exported because this, not the timer, is where the behaviour lives: a
 * failure has to be recorded and swallowed, and a test that could only reach it
 * by waiting an hour would not be testing it.
 */
export async function runScheduledBackup(
  db: DatabaseSync,
  root?: string | undefined,
): Promise<void> {
  try {
    await backupDatabase({ db, ...(root === undefined ? {} : { root }) });
    lastSucceededAt = new Date().toISOString();
    lastError = null;
  } catch (error) {
    lastFailedAt = new Date().toISOString();
    lastError = describeForLog(error);
    console.error(`Scheduled backup failed: ${lastError}`);
  }
}

/**
 * Arms the hourly backup and takes one immediately.
 *
 * The immediate one matters: a process that restarts more often than the
 * interval would otherwise never reach the first tick, and the gap would be
 * invisible because the schedule really is armed.
 *
 * The timer is unref'd so it never holds the process open by itself. Returns a
 * function that stops it, which is what tests use; nothing in production stops
 * it, because the process ending is what stops it.
 */
export function startBackupSchedule(
  db: DatabaseSync,
  options: { readonly root?: string; readonly intervalMs?: number } = {},
): () => void {
  if (timer !== null) return stopBackupSchedule;
  const interval = options.intervalMs ?? BACKUP_INTERVAL_MS;
  void runScheduledBackup(db, options.root);
  timer = setInterval(() => void runScheduledBackup(db, options.root), interval);
  timer.unref?.();
  return stopBackupSchedule;
}

export function stopBackupSchedule(): void {
  if (timer !== null) clearInterval(timer);
  timer = null;
}

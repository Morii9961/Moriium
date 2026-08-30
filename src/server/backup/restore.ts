// Restoring a backup (ADR 0002 section 11.4).
//
// The section this implements says a backup nobody has restored is not a
// backup. So restoring is a real code path with real refusals, not a paragraph
// in a runbook, and scripts/restore-drill.mjs exercises it end to end.
//
// Two details here are the difference between a restore and a corruption:
//
//   * The backup is inspected BEFORE anything at the target is touched. A
//     restore that discovers the backup is unreadable after overwriting the
//     live database has turned one problem into two.
//   * The target's `-wal` and `-shm` are removed. SQLite's backup API produces
//     a complete standalone database; leaving a write-ahead log from the old
//     file next to the restored one hands SQLite two disagreeing accounts of
//     the same database.

import { copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { AdminError } from '../errors.ts';
import { inspectBackup, type BackupContents } from './backup.ts';

export type RestoreResult = {
  readonly target: string;
  readonly contents: BackupContents;
};

/**
 * Copies a verified backup into place.
 *
 * `overwrite` is required to replace an existing database, and defaults to
 * false. A drill restores into an empty directory; a real recovery is a
 * deliberate act that should have to say so.
 */
export function restoreDatabase(options: {
  readonly backupFile: string;
  readonly target: string;
  readonly overwrite?: boolean;
}): RestoreResult {
  const target = resolve(options.target);
  const expected = inspectBackup(options.backupFile);

  if (existsSync(target) && options.overwrite !== true) {
    throw new AdminError(
      'conflict',
      'A database already exists at that path. Restoring over it has to be asked for explicitly.',
    );
  }

  mkdirSync(dirname(target), { recursive: true });

  // Before the copy, not after. A write-ahead log belonging to the database
  // being replaced would otherwise sit next to the restored file for a moment
  // and, on the unlucky ordering, be replayed into it.
  //
  // This is also the only portable moment where "the admin is still running"
  // becomes visible: Windows refuses to unlink a file an open connection holds,
  // so a locked -wal is a running service. Linux allows the unlink, which is
  // why stopping the service stays an operational rule rather than something
  // this function can enforce everywhere. Restoring under a live process is
  // silent corruption on any platform.
  for (const sidecar of [`${target}-wal`, `${target}-shm`]) {
    try {
      rmSync(sidecar, { force: true });
    } catch (cause) {
      throw new AdminError(
        'conflict',
        'The target database is still in use. Stop the admin service before restoring.',
        { cause },
      );
    }
  }

  copyFileSync(options.backupFile, target);

  // Read the restored file rather than trusting the copy, and compare it to
  // what the backup claimed. A copy that lost rows is a copy that succeeded.
  const restored = inspectBackup(target);
  for (const key of Object.keys(expected) as Array<keyof BackupContents>) {
    if (restored[key] !== expected[key]) {
      throw new AdminError(
        'backup-failed',
        `The restored database does not match the backup: ${key} became ${restored[key]}, expected ${expected[key]}.`,
      );
    }
  }

  return { target, contents: restored };
}

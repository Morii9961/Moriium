// Operational status for the admin panel (ADR 0002 section 12.1).
//
// Morii decided against alerting, and section 12.2 records the price: failures
// are silent until someone looks. This module is the whole mitigation. It
// collects the observations that section lists and puts them on a screen the
// author already opens to write, so a backup that stopped succeeding three
// weeks ago is visible the next time they sit down.
//
// One rule runs through it: an observation this process cannot actually make is
// reported as `unknown`, with the reason, rather than left out. A panel that
// silently omits what it cannot see reads as "everything is fine", which is the
// failure mode the panel exists to prevent.

import { statfsSync } from 'node:fs';
import type { DatabaseSync } from 'node:sqlite';
import { ArticleStore } from './articles.ts';
import { ageOfNewestBackup, backupRoot, RETAINED_BACKUPS } from './backup/backup.ts';
import { backupStatus } from './backup/schedule.ts';
import { BACKUP_INTERVAL_MS } from './backup/schedule.ts';

/** How stale the newest backup may be before it is worth mentioning. */
export const BACKUP_STALE_AFTER_MS = 2 * BACKUP_INTERVAL_MS;

/**
 * How long a published article may wait for an export before it is flagged.
 *
 * ADR 0002 section 12.1 names fifteen minutes. Publishing is meant to be
 * visible in minutes (section 4.2), so a gap this wide means an export or a
 * build is failing, not that one is in progress.
 */
export const AWAITING_EXPORT_GRACE_MS = 15 * 60 * 1000;

/** Below this, a release plus a backup round could fail on space. */
export const LOW_DISK_BYTES = 2 * 1024 * 1024 * 1024;

export type Verdict = 'ok' | 'attention' | 'unknown';

export type StatusItem = {
  readonly id: string;
  readonly label: string;
  readonly verdict: Verdict;
  /** One line an author can act on. Never a path, a token or a password. */
  readonly detail: string;
};

export type OperationalStatus = {
  readonly checkedAt: string;
  readonly items: readonly StatusItem[];
};

function humanDuration(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return 'less than a minute';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? '' : 's'}`;
  return `${Math.floor(hours / 24)} days`;
}

function humanBytes(bytes: number): string {
  const gibibytes = bytes / 1024 ** 3;
  if (gibibytes >= 1) return `${gibibytes.toFixed(1)} GB`;
  return `${Math.round(bytes / 1024 ** 2)} MB`;
}

function backupItem(root: string, now: Date): StatusItem {
  const status = backupStatus(root);
  const age = ageOfNewestBackup(root, now);

  if (age === null) {
    return {
      id: 'backups',
      label: 'Backups',
      verdict: 'attention',
      detail: status.lastError
        ? `No backup has been written. The last attempt failed: ${status.lastError}`
        : 'No backup has been written yet.',
    };
  }
  if (age > BACKUP_STALE_AFTER_MS) {
    return {
      id: 'backups',
      label: 'Backups',
      verdict: 'attention',
      detail: `The newest backup is ${humanDuration(age)} old.${
        status.lastError ? ` The last attempt failed: ${status.lastError}` : ''
      }`,
    };
  }
  return {
    id: 'backups',
    label: 'Backups',
    verdict: status.lastError ? 'attention' : 'ok',
    detail: status.lastError
      ? `The newest backup is ${humanDuration(age)} old, but the last attempt failed: ${status.lastError}`
      : `Newest backup ${humanDuration(age)} old, keeping ${RETAINED_BACKUPS}.`,
  };
}

/**
 * How long each article has been published without being live.
 *
 * The wait is measured from the audit row for the publish, not from a timer
 * somewhere: the audit is the only record of when the author actually acted,
 * and it survives a restart of this process.
 */
function awaitingExportItem(db: DatabaseSync, now: Date): StatusItem {
  const store = new ArticleStore(db);
  const waiting = store.listArticles().filter((article) => store.isAwaitingExport(article.id));
  if (waiting.length === 0) {
    return {
      id: 'export',
      label: 'Site rebuild',
      verdict: 'ok',
      detail: 'Every published article is live.',
    };
  }

  let oldest = 0;
  for (const article of waiting) {
    const [latest] = store
      .listAudit(article.id)
      .filter((entry) => entry.action === 'publish' || entry.action === 'rollback' || entry.action === 'unpublish');
    if (!latest) continue;
    oldest = Math.max(oldest, now.getTime() - new Date(latest.at).getTime());
  }

  const plural = waiting.length === 1 ? 'article is' : 'articles are';
  return {
    id: 'export',
    label: 'Site rebuild',
    verdict: oldest > AWAITING_EXPORT_GRACE_MS ? 'attention' : 'ok',
    detail:
      oldest > AWAITING_EXPORT_GRACE_MS
        ? `${waiting.length} ${plural} waiting to be exported, the oldest for ${humanDuration(oldest)}.`
        : `${waiting.length} ${plural} waiting for the next export.`,
  };
}

function diskItem(path: string): StatusItem {
  try {
    const stats = statfsSync(path);
    const free = stats.bavail * stats.bsize;
    return {
      id: 'disk',
      label: 'Disk',
      verdict: free < LOW_DISK_BYTES ? 'attention' : 'ok',
      detail: `${humanBytes(free)} free where the data lives.`,
    };
  } catch {
    return {
      id: 'disk',
      label: 'Disk',
      verdict: 'unknown',
      detail: 'Free space could not be read.',
    };
  }
}

/**
 * Collects what this process can observe, and says what it cannot.
 *
 * The service unit and the health endpoint are section 12.1 items that a
 * process cannot honestly report on itself: an admin that is answering this
 * request is trivially running, so "the service is up" would be a tautology
 * rather than an observation. They stay listed as unknown so the panel does not
 * imply it is watching them.
 */
export function collectOperationalStatus(options: {
  readonly db: DatabaseSync;
  readonly backupRoot?: string;
  readonly now?: Date;
}): OperationalStatus {
  const now = options.now ?? new Date();
  const root = options.backupRoot ?? backupRoot();

  return {
    checkedAt: now.toISOString(),
    items: [
      backupItem(root, now),
      awaitingExportItem(options.db, now),
      diskItem(root),
      {
        id: 'offsite',
        label: 'Offsite copy',
        verdict: 'unknown',
        detail: 'Not configured yet. Backups exist only on this machine.',
      },
      {
        id: 'service',
        label: 'Service and health endpoint',
        verdict: 'unknown',
        detail: 'Not observed from inside the process that would be reporting on itself.',
      },
    ],
  };
}

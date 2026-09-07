// The author-only operations panel (ADR 0002 section 12.1) and the four states
// docs/vps-acceptance-checklist.md section E requires it to be able to express.
//
// Section 12.2 accepts "failure is silent" as a residual risk of not building
// an alerting system. This panel is the only mitigation under that decision,
// which fixes two rules the rest of this file exists to honour:
//
//   1. A missing reading is `unknown`, never `ok`. A panel that paints "did not
//      read" as green gives the most reassuring picture at the moment it is
//      most wrong.
//   2. Every item carries the time of its own reading. One timestamp on the
//      response says when the request happened, not when the reading behind any
//      given row was taken, and an expired reading has to be able to say so on
//      its own line.

import { statfsSync } from 'node:fs';
import type { DatabaseSync } from 'node:sqlite';
import {
  ageOfNewestDatabaseBackup,
  BACKUP_INTERVAL_MS,
  RETAINED_LOCAL_BACKUPS,
  type DatabaseBackupStatus,
} from './backup/database-backup.ts';

/** A backup older than one scheduled interval is late but still inside the window. */
export const BACKUP_ATTENTION_AFTER_MS = BACKUP_INTERVAL_MS;

/** A backup older than two intervals means a scheduled run was missed outright. */
export const BACKUP_STALE_AFTER_MS = 2 * BACKUP_INTERVAL_MS;

/** How long a published article may wait for the rebuild before it is a failure. */
export const AWAITING_EXPORT_GRACE_MS = 15 * 60 * 1000;

/** Below this the data disk is a failure: backups and a build both need room. */
export const LOW_DISK_BYTES = 2 * 1024 ** 3;

/**
 * The warning line above LOW_DISK_BYTES.
 *
 * This is the distance at which the failure line is close enough to act on, not
 * a purchase specification. ADR 0002 section 21.21 sets the disk Moriium buys.
 */
export const DISK_ATTENTION_BYTES = 4 * 1024 ** 3;

/**
 * How long an externally collected reading stays trustworthy.
 *
 * Nothing in this repository supplies one yet. The window exists because the
 * moment something does, checklist item E3 applies to it: a collector that has
 * stopped must turn its row `unknown` rather than leave the last good value on
 * screen looking current.
 */
export const EXTERNAL_READING_STALE_AFTER_MS = 15 * 60 * 1000;

export type Verdict = 'ok' | 'attention' | 'failure' | 'unknown';

export type StatusItem = {
  readonly id: string;
  readonly label: string;
  readonly verdict: Verdict;
  readonly detail: string;
  /** When this row's reading was taken. Null means there is no reading. */
  readonly observedAt: string | null;
};

export type OperationalStatus = {
  /** When this check ran. Not a substitute for any item's own observedAt. */
  readonly checkedAt: string;
  readonly items: readonly StatusItem[];
};

/** A reading this process cannot take itself, handed in by a collector. */
export type ExternalReading = {
  readonly observedAt: string;
  readonly verdict: Exclude<Verdict, 'unknown'>;
  readonly detail: string;
};

/** The five observations of ADR 0002 section 12.1, in panel order. */
export const STATUS_ITEM_IDS = ['backups', 'export', 'disk', 'offsite', 'service'] as const;

function humanDuration(milliseconds: number): string {
  const minutes = Math.floor(milliseconds / 60_000);
  if (minutes < 1) return '不到 1 分钟';
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} 小时`;
  return `${Math.floor(hours / 24)} 天`;
}

function humanBytes(bytes: number): string {
  const gibibytes = bytes / 1024 ** 3;
  if (gibibytes >= 1) return `${gibibytes.toFixed(1)} GB`;
  return `${Math.round(bytes / 1024 ** 2)} MB`;
}

function item(
  id: string,
  label: string,
  verdict: Verdict,
  detail: string,
  observedAt: string | null,
): StatusItem {
  return { id, label, verdict, detail, observedAt };
}

/**
 * Runs one collector, turning an unexpected throw into `unknown` for that row.
 *
 * Checklist item E4 is about the panel itself failing. One collector throwing
 * must cost its own row, not the whole response: an author looking at a blank
 * page learns nothing about the four rows that were readable.
 */
function observe(id: string, label: string, collect: () => StatusItem): StatusItem {
  try {
    return collect();
  } catch {
    return item(id, label, 'unknown', '采集这一项时出错，本次没有取得读数。', null);
  }
}

function backupItem(
  root: string,
  runtime: DatabaseBackupStatus,
  now: Date,
  observedAt: string,
  read: BackupAgeReader,
): StatusItem {
  let age: number | null;
  try {
    age = read(root, now);
  } catch {
    // The directory itself could not be read, so there is no reading to age.
    return item('backups', '备份', 'unknown', '无法读取备份目录，本次没有取得读数。', null);
  }

  if (age === null) {
    if (runtime.lastError) {
      return item(
        'backups',
        '备份',
        'failure',
        `没有可用备份；最近一次尝试失败：${runtime.lastError}`,
        observedAt,
      );
    }
    if (!runtime.running) {
      return item('backups', '备份', 'failure', '没有可用备份，且定时任务没有运行。', observedAt);
    }
    return item(
      'backups',
      '备份',
      'attention',
      runtime.inFlight ? '没有可用备份；首次备份仍在进行。' : '没有可用备份；首次备份尚未完成。',
      observedAt,
    );
  }

  const since = `最新备份距今 ${humanDuration(age)}`;

  // Failure first: a stopped scheduler or a failed last attempt outranks an age
  // that still looks fine, because the next reading is the one that will not be.
  if (!runtime.running) {
    return item('backups', '备份', 'failure', `${since}，但定时任务没有运行。`, observedAt);
  }
  if (runtime.lastError) {
    return item(
      'backups',
      '备份',
      'failure',
      `${since}，但最近一次尝试失败：${runtime.lastError}`,
      observedAt,
    );
  }
  if (age > BACKUP_STALE_AFTER_MS) {
    return item('backups', '备份', 'failure', `${since}，已经错过了预定的备份。`, observedAt);
  }
  if (age > BACKUP_ATTENTION_AFTER_MS) {
    return item('backups', '备份', 'attention', `${since}，晚于计划但仍在窗口内。`, observedAt);
  }
  return item('backups', '备份', 'ok', `${since}，本地保留 ${RETAINED_LOCAL_BACKUPS} 份。`, observedAt);
}

function awaitingExportItem(db: DatabaseSync, now: Date, observedAt: string): StatusItem {
  const waiting = db
    .prepare(
      `SELECT articles.id,
              (SELECT at
                 FROM audit
                WHERE audit.article_id = articles.id
                  AND audit.action IN ('publish', 'rollback', 'unpublish')
                ORDER BY audit.id DESC
                LIMIT 1) AS changed_at
         FROM articles
        WHERE published_version_id IS NOT live_version_id`,
    )
    .all() as Array<{ id: number; changed_at: string | null }>;

  if (waiting.length === 0) {
    return item('export', '站点重建', 'ok', '所有已发布文章都已上线。', observedAt);
  }

  const ages = waiting.map((row) =>
    row.changed_at === null ? Number.NaN : now.getTime() - new Date(row.changed_at).getTime(),
  );

  // The whole verdict is a comparison against a deadline. Without a usable
  // timestamp there is nothing to compare, and guessing either way would be an
  // assertion this process cannot support.
  if (ages.some((age) => Number.isNaN(age))) {
    return item(
      'export',
      '站点重建',
      'unknown',
      `${waiting.length} 篇文章等待上线，但至少一篇缺少可用于计时的发布审计，无法判断是否超时。`,
      observedAt,
    );
  }

  const oldest = Math.max(...ages);
  const deadlineMinutes = AWAITING_EXPORT_GRACE_MS / 60_000;
  if (oldest > AWAITING_EXPORT_GRACE_MS) {
    return item(
      'export',
      '站点重建',
      'failure',
      `${waiting.length} 篇文章等待上线，最久已经 ${humanDuration(oldest)}，超过 ${deadlineMinutes} 分钟。`,
      observedAt,
    );
  }
  return item(
    'export',
    '站点重建',
    'attention',
    `${waiting.length} 篇文章正在等待下一次导出，最久 ${humanDuration(oldest)}。`,
    observedAt,
  );
}

/** Milliseconds since the newest backup, null when there is none. */
export type BackupAgeReader = (root: string, now: Date) => number | null;

/** Bytes available on the filesystem holding `path`. */
export type DiskFreeReader = (path: string) => number;

const statfsFreeBytes: DiskFreeReader = (path) => {
  const stats = statfsSync(path);
  return stats.bavail * stats.bsize;
};

function diskItem(path: string, observedAt: string, read: DiskFreeReader): StatusItem {
  let free: number;
  try {
    free = read(path);
  } catch {
    return item('disk', '磁盘', 'unknown', '无法读取剩余空间，本次没有取得读数。', null);
  }

  const remaining = `数据目录所在磁盘剩余 ${humanBytes(free)}`;
  if (free < LOW_DISK_BYTES) {
    return item(
      'disk',
      '磁盘',
      'failure',
      `${remaining}，低于 ${humanBytes(LOW_DISK_BYTES)}。`,
      observedAt,
    );
  }
  if (free < DISK_ATTENTION_BYTES) {
    return item(
      'disk',
      '磁盘',
      'attention',
      `${remaining}，已经接近 ${humanBytes(LOW_DISK_BYTES)} 这条线。`,
      observedAt,
    );
  }
  return item('disk', '磁盘', 'ok', `${remaining}。`, observedAt);
}

/**
 * Turns an injected reading into a row, or `unknown` when there is none.
 *
 * Two ways to be unknown and one way not to be: absent, or older than the
 * freshness window. Nothing in this repository collects either of these yet, so
 * on this machine both rows say so rather than reporting a healthy state no
 * process here observed.
 */
function externalItem(
  id: string,
  label: string,
  absentDetail: string,
  reading: ExternalReading | undefined,
  now: Date,
): StatusItem {
  if (!reading) return item(id, label, 'unknown', absentDetail, null);

  const observed = new Date(reading.observedAt).getTime();
  if (Number.isNaN(observed)) {
    return item(id, label, 'unknown', '采集器报告的观测时间无法解析。', null);
  }

  const age = now.getTime() - observed;
  if (age > EXTERNAL_READING_STALE_AFTER_MS) {
    return item(
      id,
      label,
      'unknown',
      `最近一次读数距今 ${humanDuration(age)}，已经过期；采集可能已经停止。`,
      reading.observedAt,
    );
  }
  return item(id, label, reading.verdict, reading.detail, reading.observedAt);
}

export function collectOperationalStatus(options: {
  readonly db: DatabaseSync;
  readonly backupRoot: string;
  readonly backupStatus: DatabaseBackupStatus;
  readonly now?: Date;
  /** Supplied by an off-machine collector. Absent here, and therefore unknown. */
  readonly offsite?: ExternalReading | undefined;
  readonly service?: ExternalReading | undefined;
  /**
   * Test seams; production always reads the real filesystem.
   *
   * Both disk thresholds are otherwise only reachable by filling the machine's
   * disk, so without a seam the two branches that matter most would be the two
   * branches no test ever runs. The backup reader has the same problem for one
   * branch: an unreadable backup directory raises ENOTDIR or EACCES on Linux,
   * but the same path on Windows raises ENOENT, which the reader answers with
   * "no backup yet". Making the directory genuinely unreadable on both would
   * take ACL surgery on the developer's own machine.
   */
  readonly diskFreeBytes?: DiskFreeReader | undefined;
  readonly backupAgeMs?: BackupAgeReader | undefined;
}): OperationalStatus {
  const now = options.now ?? new Date();
  const checkedAt = now.toISOString();
  return {
    checkedAt,
    items: [
      observe('backups', '备份', () =>
        backupItem(
          options.backupRoot,
          options.backupStatus,
          now,
          checkedAt,
          options.backupAgeMs ?? ageOfNewestDatabaseBackup,
        ),
      ),
      observe('export', '站点重建', () => awaitingExportItem(options.db, now, checkedAt)),
      observe('disk', '磁盘', () =>
        diskItem(options.backupRoot, checkedAt, options.diskFreeBytes ?? statfsFreeBytes),
      ),
      observe('offsite', '异地副本', () =>
        externalItem(
          'offsite',
          '异地副本',
          '尚未配置异地采集；当前进程只能看到本机副本。',
          options.offsite,
          now,
        ),
      ),
      observe('service', '服务与健康检查', () =>
        externalItem(
          'service',
          '服务与健康检查',
          '当前进程无法从外部观察自身服务状态。',
          options.service,
          now,
        ),
      ),
    ],
  };
}

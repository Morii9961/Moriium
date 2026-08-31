import { statfsSync } from 'node:fs';
import type { DatabaseSync } from 'node:sqlite';
import {
  ageOfNewestDatabaseBackup,
  BACKUP_INTERVAL_MS,
  RETAINED_LOCAL_BACKUPS,
  type DatabaseBackupStatus,
} from './backup/database-backup.ts';

export const BACKUP_STALE_AFTER_MS = 2 * BACKUP_INTERVAL_MS;
export const AWAITING_EXPORT_GRACE_MS = 15 * 60 * 1000;
export const LOW_DISK_BYTES = 2 * 1024 * 1024 * 1024;

export type Verdict = 'ok' | 'attention' | 'unknown';

export type StatusItem = {
  readonly id: string;
  readonly label: string;
  readonly verdict: Verdict;
  readonly detail: string;
};

export type OperationalStatus = {
  readonly checkedAt: string;
  readonly items: readonly StatusItem[];
};

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

function backupItem(root: string, runtime: DatabaseBackupStatus, now: Date): StatusItem {
  let age: number | null;
  try {
    age = ageOfNewestDatabaseBackup(root, now);
  } catch {
    return {
      id: 'backups',
      label: '备份',
      verdict: 'unknown',
      detail: '无法读取备份目录。',
    };
  }

  if (age === null) {
    return {
      id: 'backups',
      label: '备份',
      verdict: 'attention',
      detail: runtime.lastError
        ? `没有可用备份；最近一次尝试失败：${runtime.lastError}`
        : runtime.inFlight
          ? '没有可用备份；首次备份仍在进行。'
          : '没有可用备份。',
    };
  }
  if (!runtime.running) {
    return {
      id: 'backups',
      label: '备份',
      verdict: 'attention',
      detail: `最新备份距今 ${humanDuration(age)}，但定时任务没有运行。`,
    };
  }
  if (age > BACKUP_STALE_AFTER_MS) {
    return {
      id: 'backups',
      label: '备份',
      verdict: 'attention',
      detail: `最新备份距今 ${humanDuration(age)}，已超过预期。${runtime.lastError ? ` 最近一次尝试失败：${runtime.lastError}` : ''}`,
    };
  }
  if (runtime.lastError) {
    return {
      id: 'backups',
      label: '备份',
      verdict: 'attention',
      detail: `最新备份距今 ${humanDuration(age)}，但最近一次尝试失败：${runtime.lastError}`,
    };
  }
  return {
    id: 'backups',
    label: '备份',
    verdict: 'ok',
    detail: `最新备份距今 ${humanDuration(age)}，本地保留 ${RETAINED_LOCAL_BACKUPS} 份。`,
  };
}

function awaitingExportItem(db: DatabaseSync, now: Date): StatusItem {
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
    return {
      id: 'export',
      label: '站点重建',
      verdict: 'ok',
      detail: '所有已发布文章都已上线。',
    };
  }

  if (waiting.some((row) => row.changed_at === null)) {
    return {
      id: 'export',
      label: '站点重建',
      verdict: 'attention',
      detail: `${waiting.length} 篇文章等待上线，其中至少一篇缺少可用于计时的发布审计。`,
    };
  }

  const ages = waiting
    .map((row) => now.getTime() - new Date(row.changed_at as string).getTime())
    .filter((age) => !Number.isNaN(age));
  const oldest = Math.max(...ages);
  const overdue = oldest > AWAITING_EXPORT_GRACE_MS;
  return {
    id: 'export',
    label: '站点重建',
    verdict: overdue ? 'attention' : 'ok',
    detail: overdue
      ? `${waiting.length} 篇文章等待上线，最久已超过 ${humanDuration(oldest)}。`
      : `${waiting.length} 篇文章正在等待下一次导出。`,
  };
}

function diskItem(path: string): StatusItem {
  try {
    const stats = statfsSync(path);
    const free = stats.bavail * stats.bsize;
    return {
      id: 'disk',
      label: '磁盘',
      verdict: free < LOW_DISK_BYTES ? 'attention' : 'ok',
      detail: `数据目录所在磁盘剩余 ${humanBytes(free)}。`,
    };
  } catch {
    return {
      id: 'disk',
      label: '磁盘',
      verdict: 'unknown',
      detail: '无法读取剩余空间。',
    };
  }
}

export function collectOperationalStatus(options: {
  readonly db: DatabaseSync;
  readonly backupRoot: string;
  readonly backupStatus: DatabaseBackupStatus;
  readonly now?: Date;
}): OperationalStatus {
  const now = options.now ?? new Date();
  return {
    checkedAt: now.toISOString(),
    items: [
      backupItem(options.backupRoot, options.backupStatus, now),
      awaitingExportItem(options.db, now),
      diskItem(options.backupRoot),
      {
        id: 'offsite',
        label: '异地副本',
        verdict: 'unknown',
        detail: '尚未配置；当前副本只在本机。',
      },
      {
        id: 'service',
        label: '服务与健康检查',
        verdict: 'unknown',
        detail: '当前进程无法从外部观察自身服务状态。',
      },
    ],
  };
}

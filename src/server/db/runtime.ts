// The resident production connection. Data must never live inside a release
// directory: releases are immutable and only six are retained (ADR 0002 15.1).

import type { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  DEFAULT_BACKUP_ROOT,
  startDatabaseBackupScheduler,
  type BackupScheduler,
} from '../backup/database-backup.ts';
import { describeForLog } from '../errors.ts';
import { openDatabase } from './open.ts';

export const DEFAULT_DATABASE_PATH =
  process.platform === 'win32' ? resolve('.astro/admin.db') : '/var/lib/moriium/admin.db';

let database: DatabaseSync | undefined;
let backupScheduler: BackupScheduler | undefined;

export function getDatabase(): DatabaseSync {
  if (database) return database;
  const path = process.env.MORIIUM_DATABASE_PATH?.trim() || DEFAULT_DATABASE_PATH;
  mkdirSync(dirname(path), { recursive: true });
  database = openDatabase(path);
  const backupRoot = process.env.MORIIUM_BACKUP_ROOT?.trim() || DEFAULT_BACKUP_ROOT;
  backupScheduler ??= startDatabaseBackupScheduler({
    db: database,
    root: backupRoot,
    onError: (error) => console.error(describeForLog(error)),
  });
  return database;
}

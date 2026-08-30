// The resident production connection. Data must never live inside a release
// directory: releases are immutable and only six are retained (ADR 0002 15.1).

import type { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { startBackupSchedule } from '../backup/schedule.ts';
import { openDatabase } from './open.ts';

export const DEFAULT_DATABASE_PATH =
  process.platform === 'win32' ? resolve('.astro/admin.db') : '/var/lib/moriium/admin.db';

let database: DatabaseSync | undefined;

export function getDatabase(): DatabaseSync {
  if (database) return database;
  const path = process.env.MORIIUM_DATABASE_PATH?.trim() || DEFAULT_DATABASE_PATH;
  mkdirSync(dirname(path), { recursive: true });
  database = openDatabase(path);
  // The hourly backup has to share this connection: Node's backup restarts
  // whenever a different one writes (ADR 0002 section 11.3). Arming it here
  // rather than at some startup hook means the schedule cannot outlive, or
  // start without, the connection it is supposed to copy.
  if (process.env.MORIIUM_DISABLE_BACKUPS?.trim() !== '1') startBackupSchedule(database);
  return database;
}

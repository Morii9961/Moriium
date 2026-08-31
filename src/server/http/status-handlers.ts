import type { DatabaseSync } from 'node:sqlite';
import type { AuthorSession } from '../auth/session.ts';
import type { DatabaseBackupStatus } from '../backup/database-backup.ts';
import { databaseBackupRoot, getDatabaseBackupStatus } from '../db/runtime.ts';
import { collectOperationalStatus } from '../status.ts';
import { adminJson, authorizeRequest, responseForError } from './boundary.ts';

export async function handleStatus(
  request: Request,
  session: AuthorSession,
  db: DatabaseSync,
  options: {
    readonly backupRoot?: string;
    readonly backupStatus?: DatabaseBackupStatus;
  } = {},
): Promise<Response> {
  const authorized = await authorizeRequest(request, session, false);
  if (!authorized.ok) return authorized.response;

  try {
    return adminJson(
      collectOperationalStatus({
        db,
        backupRoot: options.backupRoot ?? databaseBackupRoot(),
        backupStatus: options.backupStatus ?? getDatabaseBackupStatus(),
      }),
      200,
    );
  } catch (error) {
    return responseForError(error);
  }
}

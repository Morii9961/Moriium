// GET /api/status -- the operational panel's data (ADR 0002 section 12.1).
//
// Author-only, like everything else under /api. It is a read, so it needs a
// session and nothing more; the shared guard in boundary.ts decides that, and
// this module does not restate the order.
//
// Nothing here is a reader-facing metric. Section 12.1 draws that line
// explicitly: these are operational observations about backups, the export gap
// and disk, never anything about who read what.

import type { DatabaseSync } from 'node:sqlite';
import type { AuthorSession } from '../auth/session.ts';
import { collectOperationalStatus } from '../status.ts';
import { adminJson, authorizeRequest, responseForError } from './boundary.ts';

export async function handleStatus(
  request: Request,
  session: AuthorSession,
  db: DatabaseSync,
): Promise<Response> {
  const authorized = await authorizeRequest(request, session, false);
  if (!authorized.ok) return authorized.response;

  try {
    return adminJson(collectOperationalStatus({ db }), 200);
  } catch (error) {
    return responseForError(error);
  }
}

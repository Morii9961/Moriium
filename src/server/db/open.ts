// Opening the admin database.
//
// ADR 0002 section 6.2 keeps node:sqlite for production and names the two
// settings the Phase 1 spike never configured. Both are here, and both are
// asserted by a test, because a pragma that silently failed to apply looks
// exactly like one that applied.
//
// This module must never be imported by a public route. scripts/check-render-split.mjs
// fails the build if `node:sqlite` reaches the public output.

import { DatabaseSync } from 'node:sqlite';
import { AdminError } from '../errors.ts';
// Imported, not read from disk. A request handler must not resolve an asset
// relative to its own source location: the bundler inlines this module into
// dist/server/chunks/ and carries no .sql file with it, so the former
// readFileSync(import.meta.dirname + 'schema.sql') left a freshly deployed
// production database impossible to migrate (ADR 0002 section 21.26).
import { SCHEMA_SQL } from './schema.ts';

/**
 * Milliseconds SQLite waits for a write lock before giving up.
 *
 * The spike had no busy timeout at all, so the ADR 0001 13.20 drill saw an
 * immediate failure under contention. Five seconds is long enough that the
 * publish transaction and an autosave never collide in practice, and short
 * enough that a genuinely stuck writer surfaces rather than hanging the
 * request.
 */
export const BUSY_TIMEOUT_MS = 5_000;

export type Migration = {
  readonly id: number;
  readonly name: string;
  readonly sql: () => string;
};

/** Forward only. ADR 0002 section 6.4: rolling back is restoring a backup. */
export const MIGRATIONS: readonly Migration[] = [
  { id: 1, name: 'initial-schema', sql: () => SCHEMA_SQL },
];

function applyPragmas(db: DatabaseSync): void {
  // WAL lets a reader run while a writer holds the lock, which is what keeps
  // the public export from blocking the author mid-sentence.
  db.exec('PRAGMA journal_mode = WAL');
  db.exec(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS}`);
  // node:sqlite already defaults this on, unlike sqlite3 itself. Setting it
  // anyway means the REFERENCES clauses in schema.sql are guaranteed by this
  // file rather than by a driver default that could change or be overridden by
  // a stray `enableForeignKeyConstraints: false`. It has to happen here, before
  // any transaction: SQLite ignores this pragma while one is open.
  db.exec('PRAGMA foreign_keys = ON');
}

function currentVersion(db: DatabaseSync): number {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (id INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL) STRICT');
  const row = db.prepare('SELECT MAX(id) AS version FROM schema_migrations').get() as
    | { version: number | null }
    | undefined;
  return row?.version ?? 0;
}

/**
 * Brings the database up to the newest migration.
 *
 * Each migration runs inside its own transaction with its bookkeeping row, so a
 * migration that throws leaves the database at the previous version rather than
 * half-applied and labelled as done.
 */
export function migrate(db: DatabaseSync, now: () => string): number[] {
  const applied: number[] = [];
  for (const migration of MIGRATIONS) {
    if (migration.id <= currentVersion(db)) continue;
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(migration.sql());
      db.prepare('INSERT INTO schema_migrations (id, name, applied_at) VALUES (?, ?, ?)').run(
        migration.id,
        migration.name,
        now(),
      );
      db.exec('COMMIT');
      applied.push(migration.id);
    } catch (error) {
      db.exec('ROLLBACK');
      throw new AdminError(
        'transaction-failed',
        `Migration ${migration.id} (${migration.name}) failed; the database is still at version ${currentVersion(db)}.`,
        { cause: error },
      );
    }
  }
  return applied;
}

export type OpenOptions = {
  /** Injected so tests can pin timestamps. */
  now?: () => string;
};

/** Opens the database, applies pragmas, and migrates it forward. */
export function openDatabase(path: string, options: OpenOptions = {}): DatabaseSync {
  const now = options.now ?? (() => new Date().toISOString());
  const db = new DatabaseSync(path);
  applyPragmas(db);
  migrate(db, now);
  return db;
}

// A restore drill never replaces the production database. It copies one
// supplied backup into a fresh directory, proves the verifier rejects a broken
// control first, then opens, reads, writes, closes, reopens and reads the copy.

import { DatabaseSync } from 'node:sqlite';
import { copyFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { MIGRATIONS, openDatabase } from '../db/open.ts';
import { AdminError } from '../errors.ts';

export type RestoreDrillOptions = {
  readonly backup: string;
  readonly parent?: string;
  readonly keepWorkspace?: boolean;
  readonly now?: () => Date;
};

export type RestoreDrillResult = {
  readonly backup: string;
  readonly durationMs: number;
  readonly migrationVersion: number;
  readonly negativeControlRejected: true;
  readonly workspace?: string;
};

function integrityCheck(db: DatabaseSync): void {
  const rows = db.prepare('PRAGMA integrity_check').all() as Array<{ integrity_check: string }>;
  if (rows.length !== 1 || rows[0]?.integrity_check !== 'ok') {
    throw new Error('SQLite integrity_check did not return ok.');
  }
}

function verifyReadable(path: string): void {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    integrityCheck(db);
    db.prepare('SELECT id, name, applied_at FROM schema_migrations ORDER BY id').all();
  } finally {
    db.close();
  }
}

async function proveNegativeControl(directory: string): Promise<true> {
  const path = join(directory, 'deliberately-corrupt.db');
  await writeFile(path, 'this is not a sqlite database');
  try {
    verifyReadable(path);
  } catch {
    return true;
  }
  throw new Error('The restore verifier accepted a deliberately corrupted database.');
}

/** Runs a non-destructive restore drill against a copied backup. */
export async function drillDatabaseRestore(options: RestoreDrillOptions): Promise<RestoreDrillResult> {
  const started = performance.now();
  const parent = options.parent ? resolve(options.parent) : tmpdir();
  const workspace = await mkdtemp(join(parent, 'moriium-restore-drill-'));
  const restored = join(workspace, 'admin.db');
  const marker = `drill-${(options.now ?? (() => new Date()))().toISOString()}`;

  try {
    await proveNegativeControl(workspace);
    await copyFile(resolve(options.backup), restored);
    verifyReadable(restored);

    const db = openDatabase(restored);
    let migrationVersion = 0;
    try {
      integrityCheck(db);
      migrationVersion = Number(
        (db.prepare('SELECT MAX(id) AS version FROM schema_migrations').get() as { version: number })
          .version,
      );
      const expectedVersion = MIGRATIONS.at(-1)?.id ?? 0;
      if (migrationVersion !== expectedVersion) {
        throw new Error(`Expected schema version ${expectedVersion}, received ${migrationVersion}.`);
      }

      db.exec(
        'CREATE TABLE restore_drill_probe (marker TEXT PRIMARY KEY, written_at TEXT NOT NULL) STRICT',
      );
      db.prepare('INSERT INTO restore_drill_probe (marker, written_at) VALUES (?, ?)').run(
        marker,
        new Date().toISOString(),
      );
    } finally {
      db.close();
    }

    const reopened = new DatabaseSync(restored, { readOnly: true });
    try {
      integrityCheck(reopened);
      const row = reopened
        .prepare('SELECT marker FROM restore_drill_probe WHERE marker = ?')
        .get(marker) as { marker: string } | undefined;
      if (row?.marker !== marker) throw new Error('The restore drill write did not survive reopen.');
    } finally {
      reopened.close();
    }

    const durationMs = Math.round((performance.now() - started) * 100) / 100;
    return {
      backup: resolve(options.backup),
      durationMs,
      migrationVersion,
      negativeControlRejected: true,
      ...(options.keepWorkspace ? { workspace } : {}),
    };
  } catch (error) {
    if (error instanceof AdminError) throw error;
    throw new AdminError(
      'backup-failed',
      'The restore drill failed; no production database was changed.',
      { cause: error },
    );
  } finally {
    if (!options.keepWorkspace) await rm(workspace, { recursive: true, force: true });
  }
}

// The restore drill (ADR 0002 section 11.4).
//
// That section asks for two things this script exists to produce:
//
//   * a MEASURED restore time, not the sentence "the drill passed". The number
//     printed at the end is what goes in the record; if it drifts past the
//     30-minute RTO, the target was wrong or the recovery got harder, and both
//     are worth knowing before the day it matters.
//   * a drill written to the ADR 0001 section 5 standard: make it fail first.
//     So the drill deliberately corrupts a backup and refuses to continue
//     unless the restore rejects it. A restore that accepts a corrupt backup is
//     worse than no drill, because it produces a confident wrong answer.
//
//   node scripts/restore-drill.mjs           take a backup, corrupt it, restore it
//   node scripts/restore-drill.mjs --keep    leave the drill directory behind
//
// Nothing here touches the live database except to read it. The restore, the
// read and the write all happen inside a temporary directory that is removed at
// the end.

import { randomBytes } from 'node:crypto';
import { closeSync, copyFileSync, mkdtempSync, openSync, rmSync, writeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import process from 'node:process';
import { createAccount } from '../src/server/accounts.ts';
import { ArticleStore } from '../src/server/articles.ts';
import { backupDatabase, inspectBackup } from '../src/server/backup/backup.ts';
import { mirrorMedia } from '../src/server/backup/media-mirror.ts';
import { restoreDatabase } from '../src/server/backup/restore.ts';
import { openDatabase } from '../src/server/db/open.ts';
import { DEFAULT_DATABASE_PATH } from '../src/server/db/runtime.ts';
import { describeForLog, isAdminError } from '../src/server/errors.ts';
import { mediaRoot } from '../src/server/media/storage.ts';

/** Enough of the schema b-tree to make integrity_check disagree with itself. */
const CORRUPTION_OFFSET = 512;
const CORRUPTION_LENGTH = 4096;

export function parseDrillCommand(args) {
  const keep = args.includes('--keep');
  const rest = args.filter((argument) => argument !== '--keep');
  if (rest.length > 0) throw new Error('Usage: node scripts/restore-drill.mjs [--keep]');
  return { keep };
}

/** Overwrites a stretch of the file so the copy is a database that lies. */
export function corruptFile(file) {
  const handle = openSync(file, 'r+');
  try {
    writeSync(handle, Buffer.alloc(CORRUPTION_LENGTH, 0xff), 0, CORRUPTION_LENGTH, CORRUPTION_OFFSET);
  } finally {
    closeSync(handle);
  }
}

/**
 * Proves the restore refuses a backup that cannot be trusted.
 *
 * Runs before the real restore on purpose. If this step ever stops throwing,
 * the drill stops here rather than reporting a restore time for a check that
 * is no longer checking anything.
 */
export function assertCorruptBackupIsRefused(backupFile, workingDirectory) {
  const damaged = join(workingDirectory, 'damaged.db');
  copyFileSync(backupFile, damaged);
  corruptFile(damaged);

  try {
    inspectBackup(damaged);
  } catch (error) {
    if (isAdminError(error) && error.code === 'backup-corrupt') return error.userMessage;
    throw error;
  }
  throw new Error(
    'The drill corrupted a backup and the restore accepted it. Stop: the verification is not verifying.',
  );
}

/** A read and a write against the restored copy, which is what "restored" means. */
async function exerciseRestored(target) {
  const db = openDatabase(target);
  try {
    const store = new ArticleStore(db);
    const articles = store.listArticles();
    for (const article of articles) {
      if (article.publishedVersionId !== null) store.getVersion(article.publishedVersionId);
    }

    // The write goes into the throwaway copy, never the live database. A
    // restore that can be read but not written to is a restore that has not
    // finished, and the difference only shows up when it is attempted.
    let authorId = null;
    const existing = db.prepare('SELECT id FROM accounts ORDER BY id LIMIT 1').get();
    if (existing) authorId = existing.id;
    else {
      const account = await createAccount(db, {
        name: 'Morii',
        password: randomBytes(24).toString('hex'),
      });
      authorId = account.id;
    }

    const fields = {
      title: 'Restore drill',
      summary: 'Written by the restore drill into a temporary copy.',
      publishedAt: new Date().toISOString(),
      updatedAt: null,
      category: 'Drill',
      tags: [],
      cover: null,
      coverAlt: null,
      draft: true,
      unlisted: true,
      copyProtection: false,
      markdown: 'Drill.\n',
      editorJson: null,
      authorId,
    };

    const [first] = articles;
    if (first) store.autosave(first.id, fields);
    else {
      store.createArticle({
        translationKey: `restore-drill-${Date.now()}`,
        lang: 'zh',
        slug: `zh/restore-drill-${Date.now()}`,
        ...fields,
      });
    }

    return { articles: articles.length };
  } finally {
    db.close();
  }
}

export async function main(args = process.argv.slice(2)) {
  const command = parseDrillCommand(args);
  const databasePath = process.env.MORIIUM_DATABASE_PATH?.trim() || DEFAULT_DATABASE_PATH;
  const working = mkdtempSync(join(tmpdir(), 'moriium-drill-'));
  const write = (message) => process.stdout.write(message);

  const live = openDatabase(databasePath);
  let result;
  try {
    write('Taking an online backup from the live connection...\n');
    const taken = await backupDatabase({ db: live, root: join(working, 'backups'), keep: 48 });
    write(
      `  ${taken.pages} page(s); ${taken.contents.articles} article(s), ` +
        `${taken.contents.versions} version(s), ${taken.contents.mediaAssets} image(s), ` +
        `schema ${taken.contents.schemaVersion}\n`,
    );

    write('Corrupting a copy and confirming the restore refuses it...\n');
    write(`  refused: ${assertCorruptBackupIsRefused(taken.file, working)}\n`);

    write('Restoring into a clean directory...\n');
    const startedAt = process.hrtime.bigint();
    const restored = restoreDatabase({
      backupFile: taken.file,
      target: join(working, 'restored', 'admin.db'),
    });
    const exercised = await exerciseRestored(restored.target);
    const seconds = Number(process.hrtime.bigint() - startedAt) / 1e9;

    let media = null;
    try {
      media = mirrorMedia({ source: mediaRoot(), target: join(working, 'media') });
      write(
        `Mirrored media: ${media.copied.length} copied, ${media.unchanged.length} unchanged, ` +
          `${media.removed.length} removed.\n`,
      );
    } catch (error) {
      write(`Media mirror skipped: ${describeForLog(error)}\n`);
    }

    write('\nDrill complete.\n');
    write(`  measured restore time: ${seconds.toFixed(2)}s (RTO target: 30 minutes)\n`);
    write(`  restored: ${exercised.articles} article(s), read and written\n`);
    result = { seconds, restored: restored.contents, media };
    return result;
  } finally {
    live.close();
    if (command.keep) write(`Drill directory kept at ${working}\n`);
    else rmSync(working, { recursive: true, force: true });
  }
}

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (entryUrl === import.meta.url) {
  try {
    await main();
  } catch (error) {
    console.error(describeForLog(error));
    process.exitCode = 1;
  }
}

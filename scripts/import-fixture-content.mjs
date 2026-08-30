// Imports only the approved fixture and reader-test articles as database
// drafts. It cannot read an arbitrary content path and does not publish.
//
//   pnpm content:migrate-fixtures Morii

import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import process from 'node:process';
import { findAccount } from '../src/server/accounts.ts';
import { ArticleStore } from '../src/server/articles.ts';
import { openDatabase } from '../src/server/db/open.ts';
import { DEFAULT_DATABASE_PATH } from '../src/server/db/runtime.ts';
import { describeForLog } from '../src/server/errors.ts';
import { importFixtureContent } from '../src/server/import/fixture-content.ts';

const AUTHOR_NAMES = new Set(['Morii', 'Enouia']);

export function parseFixtureImportCommand(args) {
  if (args.length !== 1 || !AUTHOR_NAMES.has(args[0])) {
    throw new Error('Usage: pnpm content:migrate-fixtures <Morii|Enouia>');
  }
  return { name: args[0] };
}

export function importForAuthor({ db, name, write }) {
  const account = findAccount(db, name);
  if (!account || account.disabledAt !== null) {
    throw new Error(`No active author account named ${name} exists.`);
  }

  const result = importFixtureContent({ store: new ArticleStore(db), authorId: account.id });
  write(`Imported ${result.imported.length} fixture/test article(s); skipped ${result.skipped.length}.\n`);
  for (const article of result.imported) write(`  draft  ${article.slug}\n`);
  for (const slug of result.skipped) write(`  kept   ${slug}\n`);
  write('Nothing was published or marked live.\n');
  return result;
}

export function main(args = process.argv.slice(2)) {
  const command = parseFixtureImportCommand(args);
  const databasePath = process.env.MORIIUM_DATABASE_PATH?.trim() || DEFAULT_DATABASE_PATH;
  mkdirSync(dirname(databasePath), { recursive: true });
  const db = openDatabase(databasePath);

  try {
    return importForAuthor({ db, name: command.name, write: (message) => process.stdout.write(message) });
  } finally {
    db.close();
  }
}

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (entryUrl === import.meta.url) {
  try {
    main();
  } catch (error) {
    console.error(describeForLog(error));
    process.exitCode = 1;
  }
}

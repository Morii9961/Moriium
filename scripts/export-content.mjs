// Exports every published article and the media it references.
//
// This is step one of the release sequence in ADR 0002 section 15.3, and it is
// deliberately the only step this script performs. It does not build, it does
// not switch `current`, and it does not write `live_version_id`: the site is
// not serving anything new yet, and recording that it is would make the "one
// pointer says published, the other says live" distinction meaningless.
//
//   node scripts/export-content.mjs            export, print a summary
//   node scripts/export-content.mjs --json     the same, as JSON on stdout
//
// It exits non-zero on refusal and leaves the previous export untouched, so a
// failed release can be retried without the author republishing anything.

import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import process from 'node:process';
import { ArticleStore } from '../src/server/articles.ts';
import { openDatabase } from '../src/server/db/open.ts';
import { DEFAULT_DATABASE_PATH } from '../src/server/db/runtime.ts';
import { describeForLog } from '../src/server/errors.ts';
import { contentRoot, exportPublished } from '../src/server/export/content-export.ts';
import { MediaStore } from '../src/server/media/assets.ts';

export function parseExportCommand(args) {
  const json = args.includes('--json');
  const rest = args.filter((argument) => argument !== '--json');
  if (rest.length > 0) {
    throw new Error('Usage: node scripts/export-content.mjs [--json]');
  }
  return { json };
}

export async function main(args = process.argv.slice(2)) {
  const command = parseExportCommand(args);
  const databasePath = process.env.MORIIUM_DATABASE_PATH?.trim() || DEFAULT_DATABASE_PATH;
  mkdirSync(dirname(databasePath), { recursive: true });
  const db = openDatabase(databasePath);

  try {
    const result = await exportPublished({
      store: new ArticleStore(db),
      media: new MediaStore(db),
      root: contentRoot(),
    });
    if (command.json) {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    } else {
      process.stdout.write(
        `Exported ${result.articles.length} published article(s) and ${result.media.length} image(s) to ${result.directory}\n`,
      );
      for (const article of result.articles) {
        process.stdout.write(`  ${article.slug}  version ${article.versionId}  ${article.file}\n`);
      }
      process.stdout.write(
        'Nothing is live yet. Build, switch, verify, then record live versions.\n',
      );
    }
    return result;
  } finally {
    db.close();
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

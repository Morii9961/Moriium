// Runs one release: export, stage, build, check, switch, probe, record, prune.
//
// This is the command an operator runs on the VPS, and the command the admin
// will call once ADR 0002 section 15.4 puts a service around it. It is safe to
// run twice: the database is the truth and this is the projection catching up,
// so a failed attempt is retried by running it again, never by asking the
// author to publish a second time.
//
//   node scripts/release-site.mjs --url https://morii9961.top/zh/
//   node scripts/release-site.mjs --id 37af11d --root /var/www/moriium --keep 6
//
// It is deliberately not wired into CI. ADR 0002 section 15.2 moves the build
// to the VPS because the content lives in a database CI cannot read, and that
// rewiring is part of the deployment block, not this one.

import { pathToFileURL } from 'node:url';
import process from 'node:process';
import { join } from 'node:path';
import { ArticleStore } from '../src/server/articles.ts';
import { openDatabase } from '../src/server/db/open.ts';
import { DEFAULT_DATABASE_PATH } from '../src/server/db/runtime.ts';
import { describeForLog } from '../src/server/errors.ts';
import { MediaStore } from '../src/server/media/assets.ts';
import { nodeReleaseHost } from '../src/server/release/host.ts';
import { releaseSite, RETAINED_RELEASES } from '../src/server/release/release.ts';

export const DEFAULT_RELEASE_ROOT = '/var/www/moriium';

const FLAGS = new Set(['--id', '--root', '--url', '--keep', '--workspace']);

/**
 * Parses the command line.
 *
 * The release id defaults to a UTC timestamp rather than being required. A
 * release triggered by an author has no commit to name itself after, and a
 * directory called `2026-08-30T13-05-00Z` is at least honest about that.
 */
export function parseReleaseCommand(args, env = process.env, stamp = () => new Date()) {
  const values = new Map();
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (!FLAGS.has(flag)) throw new Error(`Unknown argument ${flag}. See the header of this file.`);
    const value = args[index + 1];
    if (value === undefined || FLAGS.has(value)) throw new Error(`${flag} needs a value.`);
    values.set(flag, value);
    index += 1;
  }

  const root = values.get('--root') ?? env.MORIIUM_RELEASE_ROOT?.trim() ?? DEFAULT_RELEASE_ROOT;
  const probeUrl = values.get('--url') ?? env.MORIIUM_PROBE_URL?.trim() ?? '';
  if (!probeUrl) {
    throw new Error('A probe URL is required: pass --url or set MORIIUM_PROBE_URL.');
  }
  const keep = values.has('--keep') ? Number(values.get('--keep')) : RETAINED_RELEASES;
  if (!Number.isInteger(keep) || keep < 1) throw new Error('--keep must be a positive integer.');

  return {
    id: values.get('--id') ?? stamp().toISOString().replace(/[:.]/g, '-'),
    probeUrl,
    keep,
    paths: {
      workspace: values.get('--workspace') ?? join(root, 'workspace'),
      releases: join(root, 'releases'),
      current: join(root, 'current'),
    },
  };
}

export async function main(args = process.argv.slice(2)) {
  const command = parseReleaseCommand(args);
  const databasePath = process.env.MORIIUM_DATABASE_PATH?.trim() || DEFAULT_DATABASE_PATH;
  const db = openDatabase(databasePath);

  try {
    const result = await releaseSite({
      store: new ArticleStore(db),
      media: new MediaStore(db),
      host: nodeReleaseHost(),
      paths: command.paths,
      id: command.id,
      probeUrl: command.probeUrl,
      keep: command.keep,
    });
    process.stdout.write(`Release ${result.id} is live with ${result.articles.length} article(s).\n`);
    for (const article of result.articles) {
      process.stdout.write(`  ${article.slug}  version ${article.versionId}\n`);
    }
    if (result.removed.length > 0) {
      process.stdout.write(`Removed ${result.removed.length} release(s) beyond the retained ${command.keep}.\n`);
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

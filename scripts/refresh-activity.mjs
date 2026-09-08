// Collect the activity snapshot, then keep a dated copy outside the repository.
//
// Every upstream source deletes its own history: Claude Code prunes transcripts,
// Codex rotates session logs, and the Codex account endpoint only returns the page
// the server still keeps. `src/data/activity.json` is therefore the archive of
// record, and this command is what keeps it current and recoverable.
//
//   pnpm activity:refresh              # all sources
//   pnpm activity:refresh codex        # one source
//
// The archive directory defaults to a sibling of the repository and can be moved
// with MORIIUM_ACTIVITY_ARCHIVE. Nothing here commits, pushes, deploys, or builds:
// publishing stays a deliberate act. See docs/activity.md.
//
// Every run also appends one line to `refresh.log` in that directory. This runs as a
// silent scheduled task with no console, so a failure that only reached stderr would
// never be seen; the log is the only place a broken week becomes visible.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { appendFile, copyFile, mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { SOURCES, dateInShanghai, validateActivity } from '../src/lib/activity.ts';

const exec = promisify(execFile);
const root = resolve(import.meta.dirname, '..');
const snapshot = resolve(root, 'src/data/activity.json');
const archive = process.env.MORIIUM_ACTIVITY_ARCHIVE
  ? resolve(process.env.MORIIUM_ACTIVITY_ARCHIVE)
  : resolve(root, '..', 'Moriium_ActivityArchive');
const selected = process.argv[2] ?? 'all';
if (!['all', ...SOURCES].includes(selected) || process.argv.length > 3) {
  console.error('Usage: pnpm activity:refresh [all|github|codex|claude]');
  process.exit(1);
}

const read = async () => validateActivity(JSON.parse(await readFile(snapshot, 'utf8')));
const measure = (data) => Object.fromEntries(SOURCES.map((source) => {
  const days = data.sources[source]?.days ?? [];
  return [source, { days: days.length, total: days.reduce((sum, day) => sum + day.value, 0) }];
}));

const before = measure(await read());
let failed = false;
try {
  const { stdout } = await exec(process.execPath, [resolve(root, 'scripts/collect-activity.mjs'), selected], { cwd: root, windowsHide: true, timeout: 300_000 });
  process.stdout.write(stdout);
} catch (error) {
  // The collector already printed a source-scoped, path-free reason.
  process.stdout.write(error.stdout ?? '');
  process.stderr.write(error.stderr ?? '');
  failed = true;
}

const after = measure(await read());
for (const source of SOURCES) {
  const [a, b] = [before[source], after[source]];
  const days = b.days - a.days;
  const tokens = b.total - a.total;
  console.log(`${source}: ${b.days} days, ${b.total.toLocaleString('en-US')} total (${days >= 0 ? '+' : ''}${days} days, ${tokens >= 0 ? '+' : ''}${tokens.toLocaleString('en-US')})`);
  // A shrinking archive means history was dropped, which no source can hand back.
  if (days < 0) console.error(`${source}: WARNING - the archive lost ${-days} recorded days.`);
}

// Copy even on partial failure: the retained sources still moved forward.
await mkdir(archive, { recursive: true });
const copy = resolve(archive, `activity-${dateInShanghai()}.json`);
await copyFile(snapshot, copy);
console.log(`archived ${copy}`);

const summary = SOURCES.map((source) => `${source} ${after[source].days}d/${after[source].total}`).join(' ');
const gained = SOURCES.some((source) => after[source].days > before[source].days || after[source].total > before[source].total);
const status = failed ? 'PARTIAL' : gained ? 'updated' : 'unchanged';
// Best effort: a log that cannot be written must not lose the collection itself.
await appendFile(resolve(archive, 'refresh.log'), `${new Date().toISOString()} ${status} ${selected} ${summary}
`, 'utf8').catch(() => {});
if (failed) {
  console.error('At least one source failed; its previous snapshot was retained.');
  process.exitCode = 1;
}

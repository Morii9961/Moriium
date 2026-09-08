import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, readdir, writeFile, rename } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { SOURCES, validateActivity, dateInShanghai, shiftDate } from '../src/lib/activity.ts';
import { importUsage, importGitHub } from './lib/activity-import.ts';
import { coworkConfigDirs } from './lib/cowork.ts';
import { importCodexUsage, readCodexUsage } from './lib/codex-usage.ts';

const exec = promisify(execFile);
const root = resolve(import.meta.dirname, '..');
const output = resolve(root, 'src/data/activity.json');
const selected = process.argv[2] ?? 'all';
if (!['all', ...SOURCES].includes(selected) || process.argv.length > 3) {
  console.error('Usage: pnpm activity:collect [all|github|codex|claude]');
  process.exit(1);
}
const data = validateActivity(JSON.parse(await readFile(output, 'utf8')));
const updatedAt = new Date().toISOString();
const end = dateInShanghai(new Date(updatedAt));
// GitHub's contribution calendar accepts at most one year per query.
const start = shiftDate(end, -364);
// The snapshot is the archive of record: every source deletes its own logs
// eventually, so a collected day is never dropped for age. See docs/activity.md.
const ARCHIVE_START = '2026-01-01';
// Keep the complete GitHub lookback even where it reaches before the archive floor.
const RETAIN_FROM = ARCHIVE_START < start ? ARCHIVE_START : start;

async function ccusageCLI() {
  const cache = resolve(root, '.cache/npm-activity/_npx');
  const candidates = process.env.MORIIUM_CCUSAGE_CLI ? [resolve(process.env.MORIIUM_CCUSAGE_CLI)] :
    (await readdir(cache).catch(() => [])).map((entry) => resolve(cache, entry, 'node_modules/ccusage/src/cli.js'));
  for (const candidate of candidates) {
    try {
      const pkg = JSON.parse(await readFile(resolve(dirname(candidate), '../package.json'), 'utf8'));
      if (pkg.name === 'ccusage' && pkg.version === '20.0.20') return candidate;
    } catch { /* Try the next cache entry. */ }
  }
  throw new Error('Install the pinned ccusage tool using docs/activity.md.');
}

let changed = false;
for (const source of selected === 'all' ? SOURCES : [selected]) {
  try {
    let snapshot;
    if (source === 'github') {
      // Official schema: https://docs.github.com/en/graphql/reference/users#contributioncalendar
      const query = `query($login:String!,$from:DateTime!,$to:DateTime!){user(login:$login){contributionsCollection(from:$from,to:$to){contributionCalendar{weeks{contributionDays{date contributionCount}}}}}}`;
      const variables = { login: 'Morii9961', from: `${start}T00:00:00Z`, to: `${end}T23:59:59Z` };
      const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
      let report;
      if (token) {
        const response = await fetch('https://api.github.com/graphql', {
          method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'User-Agent': 'Moriium-activity' },
          body: JSON.stringify({ query, variables }), signal: AbortSignal.timeout(30_000),
        });
        if (!response.ok) throw new Error('GitHub request failed.');
        report = await response.json();
      } else {
        const args = ['api', 'graphql', '-f', `query=${query}`, ...Object.entries(variables).flatMap(([key, value]) => ['-f', `${key}=${value}`])];
        const { stdout } = await exec('gh', args, { cwd: root, windowsHide: true, timeout: 40_000, maxBuffer: 4 * 1024 * 1024 });
        report = JSON.parse(stdout);
      }
      snapshot = importGitHub(report, updatedAt);
    } else if (source === 'codex') {
      // Server-side account activity, so the iOS app and Codex Cloud are included.
      snapshot = importCodexUsage(await readCodexUsage(), updatedAt);
    } else {
      // Run locally with cached pricing. Raw stdout/stderr stays in memory.
      // https://ccusage.com/guide/json-output and /guide/codex/
      const args = [await ccusageCLI(), source, 'daily', '--json', '--offline', '--timezone', 'Asia/Shanghai'];
      const run = async (configDir) => {
        const env = configDir ? { ...process.env, CLAUDE_CONFIG_DIR: configDir } : process.env;
        const { stdout } = await exec(process.execPath, args, { cwd: root, env, windowsHide: true, timeout: 120_000, maxBuffer: 32 * 1024 * 1024 });
        return importUsage(JSON.parse(stdout), source, updatedAt);
      };
      // Cowork gives every task its own store, so the default run sees none of them.
      // The stores hold disjoint conversations; ccusage deduplicates within each one.
      const stores = [undefined, ...await coworkConfigDirs()];
      const totals = new Map();
      for (const store of stores) for (const day of (await run(store)).days) totals.set(day.date, (totals.get(day.date) ?? 0) + day.value);
      snapshot = { updatedAt, timezone: 'Asia/Shanghai', metric: 'tokens', days: [...totals].map(([date, value]) => ({ date, value })) };
    }
    snapshot.days = snapshot.days.filter((day) => day.date >= RETAIN_FROM && day.date <= end);
    if (!snapshot.days.length) throw new Error('No daily data found.');
    // Retain previously collected days when the source later cleans up its logs.
    const merged = new Map(data.sources[source]?.days.map((day) => [day.date, day]));
    for (const day of snapshot.days) merged.set(day.date, day);
    snapshot.days = [...merged.values()].filter((day) => day.date >= RETAIN_FROM && day.date <= end);
    const candidate = validateActivity({ version: 1, sources: { ...data.sources, [source]: snapshot } });
    data.sources[source] = candidate.sources[source];
    changed = true;
    console.log(`${source}: saved ${snapshot.days.length} daily aggregates.`);
  } catch {
    // CLI errors can contain local paths, report snippets or credentials.
    console.error(`${source}: collection failed; previous snapshot retained. See docs/activity.md.`);
    process.exitCode = 1;
  }
}
if (changed) {
  await writeFile(`${output}.tmp`, `${JSON.stringify(validateActivity(data), null, 2)}\n`, 'utf8');
  await rename(`${output}.tmp`, output);
}

import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ACTIVITY_START_YEAR, activityYears, calendarDays, activityStats, validateActivity, intensity, dateInShanghai } from '../src/lib/activity.ts';
import { importUsage, importGitHub } from '../scripts/lib/activity-import.ts';
import { coworkConfigDirs } from '../scripts/lib/cowork.ts';
import { importCodexUsage } from '../scripts/lib/codex-usage.ts';

const updatedAt = '2026-09-07T08:00:00.000Z';
const row = { date: '2026-09-07', inputTokens: 10, cacheReadTokens: 100, cacheCreationTokens: 20, outputTokens: 30, reasoningOutputTokens: 15, totalTokens: 160 };
const empty = () => ({ version: 1, sources: { github: null, codex: null, claude: null } });

test('pinned ccusage reports include cache once and never add reasoning twice', () => {
  const result = importUsage({ daily: [row] }, 'claude', updatedAt);
  assert.deepEqual(result.days, [{ date: row.date, value: 160 }]);
  assert.equal(result.timezone, 'Asia/Shanghai');
  assert.throws(() => importUsage({ daily: [{ ...row, totalTokens: 175 }] }, 'claude', updatedAt));
  // Codex reports in its own zone, so a ccusage series must never be filed under it.
  assert.throws(() => importUsage({ daily: [row] }, 'codex', updatedAt));
});

test('malformed, duplicate and unsafe reports fail rather than silently produce zero', () => {
  for (const daily of [[{ ...row, date: '2026-02-30' }], [row, row], [{ ...row, totalTokens: -1 }], [{ ...row, totalTokens: Number.MAX_SAFE_INTEGER + 1 }]]) {
    assert.throws(() => importUsage({ daily }, 'claude', updatedAt));
  }
  assert.throws(() => importUsage({}, 'claude', updatedAt));
  assert.throws(() => importGitHub({ errors: [{ message: 'unavailable' }] }, updatedAt));
});

test('public serialization strips all unapproved fields at each level', () => {
  const raw = empty();
  raw.privateField = 'DO_NOT_EXPORT';
  raw.sources.claude = { ...importUsage({ daily: [{ ...row, projectPath: 'DO_NOT_EXPORT' }] }, 'claude', updatedAt), rawReport: 'DO_NOT_EXPORT' };
  raw.sources.claude.days[0].sessionTitle = 'DO_NOT_EXPORT';
  const result = validateActivity(raw);
  assert.doesNotMatch(JSON.stringify(result), /DO_NOT_EXPORT|projectPath|sessionTitle|rawReport/);
});

test('calendar renders complete natural years with leap days and whole-week padding', () => {
  for (const [year, days] of [[2023, 365], [2024, 366], [2026, 365]]) {
    const { cells, start, end } = calendarDays(null, year);
    assert.equal(start, `${year}-01-01`);
    assert.equal(end, `${year}-12-31`);
    assert.equal(cells.length % 7, 0);
    assert.equal(new Date(cells[0].date).getUTCDay(), 1);
    assert.equal(new Date(cells.at(-1).date).getUTCDay(), 0);
    assert.equal(cells.filter((cell) => cell.state !== 'outside').length, days);
    assert.equal(cells.find((cell) => cell.state !== 'outside').date, start);
    assert.equal(cells.findLast((cell) => cell.state !== 'outside').date, end);
  }
  assert(calendarDays(null, 2024).cells.some((cell) => cell.date === '2024-02-29'));
  assert.throws(() => calendarDays(null, 26));
});

test('year choices start at the archive floor and grow newest-first', () => {
  assert.equal(ACTIVITY_START_YEAR, 2026);
  assert.deepEqual(activityYears('2026-01-01'), [2026]);
  assert.deepEqual(activityYears('2028-12-31'), [2028, 2027, 2026]);
  assert.deepEqual(activityYears('2025-12-31'), []);
  assert.throws(() => activityYears('not-a-date'));
});

test('calendar fills missing elapsed dates with zero while excluding future and padding', () => {
  const snapshot = { updatedAt, timezone: 'Asia/Shanghai', metric: 'tokens', days: [
    { date: '2026-09-07', value: 0 }, { date: '2026-09-09', value: 50 },
  ] };
  const { cells } = calendarDays(snapshot, 2026, '2026-09-08');
  const cell = (date) => cells.find((item) => item.date === date);
  assert.deepEqual(cell('2026-09-07'), { date: '2026-09-07', value: 0, state: 'known' });
  assert.deepEqual(cell('2026-09-06'), { date: '2026-09-06', value: 0, state: 'known' });
  assert.equal(cell('2026-09-08').state, 'known');
  assert.deepEqual(cell('2026-09-09'), { date: '2026-09-09', value: null, state: 'future' });
  assert.equal(cell('2026-12-31').state, 'future');
  assert.equal(cell('2025-12-29').state, 'outside');
  assert.equal(cell('2027-01-03').state, 'outside');
  assert.throws(() => calendarDays(snapshot, 2026, 'invalid'));
  assert.equal(dateInShanghai(new Date('2026-09-06T16:01:00Z')), '2026-09-07');
});

test('statistics use an inclusive 30-day window across years and exclude future records', () => {
  const snapshot = { updatedAt, timezone: 'Asia/Shanghai', metric: 'tokens', days: [
    { date: '2026-12-10', value: 500 }, { date: '2026-12-11', value: 30 },
    { date: '2027-01-01', value: 10 }, { date: '2027-01-02', value: 20 },
    { date: '2027-01-03', value: 0 }, { date: '2027-01-09', value: 20 },
    { date: '2027-01-10', value: 900 },
  ] };
  const stats = activityStats(snapshot, 2027, '2027-01-09');
  assert.equal(stats.recentStart, '2026-12-11');
  assert.equal(stats.recentActive, 4);
  assert.equal(stats.total, 50);
  assert.equal(stats.active, 3);
  assert.equal(stats.average, 50 / 3);
  assert.equal(stats.peak.date, '2027-01-02');
  assert.equal(stats.peak.value, 20);
  assert.equal(stats.days.length, 9);
});

test('empty and zero-only snapshots do not fabricate averages or peaks', () => {
  for (const snapshot of [null, { updatedAt, timezone: 'Asia/Shanghai', metric: 'tokens', days: [{ date: '2026-09-07', value: 0 }] }]) {
    const stats = activityStats(snapshot, 2026, '2026-09-08');
    assert.equal(stats.total, 0);
    assert.equal(stats.active, 0);
    assert.equal(stats.recentActive, 0);
    assert.equal(stats.average, null);
    assert.equal(stats.peak, null);
  }
});

test('both AI calendars use the same intensity thresholds', () => {
  for (const value of [null, 0, 1, 100_000, 1_000_000, 10_000_000, 100_000_000]) assert.equal(intensity(value, 'codex'), intensity(value, 'claude'));
  assert.equal(intensity(0, 'github'), 0);
  assert.equal(intensity(25, 'github'), 4);
});

test('the checked-in snapshot already satisfies the public allowlist', async () => {
  const raw = JSON.parse(await readFile(new URL('../src/data/activity.json', import.meta.url), 'utf8'));
  assert.deepEqual(raw, validateActivity(raw));
});

test('collected days are retained by a fixed archive floor, not a rolling window', async () => {
  const source = await readFile(new URL('../scripts/collect-activity.mjs', import.meta.url), 'utf8');
  assert.equal(ACTIVITY_START_YEAR, 2026);
  // Sources delete their own logs, so the snapshot is the archive: dropping a
  // collected day for age would destroy history no source can hand back.
  assert.match(source, /const ARCHIVE_START = '2026-01-01';/);
  // The floor must never evict a day the current GitHub lookback just returned.
  assert.match(source, /const RETAIN_FROM = ARCHIVE_START < start \? ARCHIVE_START : start;/);
  assert.equal(source.match(/day\.date >= RETAIN_FROM && day\.date <= end/g)?.length, 2);
  assert.doesNotMatch(source, /day\.date >= start &&/);
  // The one-year window survives only where GitHub's calendar query requires it.
  assert.match(source, /from: `\$\{start\}T00:00:00Z`/);
});

test('Cowork discovery claims both store names and only tasks that recorded usage', { skip: process.platform === 'darwin' && 'the macOS path derives from the home directory' }, async () => {
  const base = await mkdtemp(join(tmpdir(), 'moriium-cowork-'));
  const task = (store, name) => join(base, 'Claude', store, 'workspace', 'profile', name);
  // The desktop app renamed the store once without migrating, so both must be read.
  await mkdir(join(task('local-agent-mode-sessions', 'local_a'), '.claude/projects/encoded-cwd'), { recursive: true });
  await writeFile(join(task('local-agent-mode-sessions', 'local_a'), '.claude/projects/encoded-cwd/session.jsonl'), '');
  await mkdir(join(task('claude-code-sessions', 'local_b'), '.claude/projects/encoded-cwd'), { recursive: true });
  await writeFile(join(task('claude-code-sessions', 'local_b'), '.claude/projects/encoded-cwd/session.jsonl'), '');
  // A task whose transcripts live in the shared store would make ccusage count it twice.
  await mkdir(join(task('local-agent-mode-sessions', 'local_c'), '.claude/projects/encoded-cwd'), { recursive: true });
  await mkdir(join(task('local-agent-mode-sessions', 'local_d'), '.claude'), { recursive: true });

  const key = process.platform === 'win32' ? 'APPDATA' : 'XDG_CONFIG_HOME';
  const previous = process.env[key];
  process.env[key] = base;
  try {
    const found = await coworkConfigDirs();
    assert.deepEqual(found, [join(task('claude-code-sessions', 'local_b'), '.claude'), join(task('local-agent-mode-sessions', 'local_a'), '.claude')]);
  } finally {
    if (previous === undefined) delete process.env[key]; else process.env[key] = previous;
    await rm(base, { recursive: true, force: true });
  }
});

test('Codex account activity is filed in its own zone and must reconcile with the lifetime total', () => {
  const buckets = [{ startDate: '2026-05-12', tokens: 318879 }, { startDate: '2026-09-07', tokens: 121 }];
  const summary = { lifetimeTokens: 319000 };
  const result = importCodexUsage({ summary, dailyUsageBuckets: buckets }, updatedAt);
  assert.deepEqual(result.days, [{ date: '2026-05-12', value: 318879 }, { date: '2026-09-07', value: 121 }]);
  // Codex reports the server's day boundaries; claiming Asia/Shanghai here would be a lie.
  assert.equal(result.timezone, 'Codex');
  assert.equal(result.metric, 'tokens');
  // A truncated page would otherwise read as a genuine collapse in usage.
  assert.throws(() => importCodexUsage({ summary, dailyUsageBuckets: [buckets[0]] }, updatedAt));
  for (const broken of [{}, { summary, dailyUsageBuckets: [] }, { summary, dailyUsageBuckets: [{ startDate: '2026-02-30', tokens: 1 }] },
    { dailyUsageBuckets: [buckets[0], buckets[0]] }, { dailyUsageBuckets: [{ startDate: '2026-05-12', tokens: -1 }] }]) {
    assert.throws(() => importCodexUsage(broken, updatedAt));
  }
  // Without a lifetime figure the buckets stand on their own rather than failing closed.
  assert.equal(importCodexUsage({ dailyUsageBuckets: buckets }, updatedAt).days.length, 2);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { zstdCompressSync } from 'node:zlib';
import { readLocalCodexUsage } from '../scripts/lib/codex-local-usage.ts';

const counters = (input = 100, cached = 80, output = 10) => ({ input_tokens: input,
  cached_input_tokens: cached, cache_write_input_tokens: 0, output_tokens: output,
  reasoning_output_tokens: 2, total_tokens: input + output });
const meta = (id = 'synthetic-session', extra = {}) => ({ type: 'session_meta', payload: {
  id, timestamp: '2026-10-17T00:00:00Z', cwd: 'DO_NOT_EXPORT', ...extra } });
const event = (at, total, last = total) => ({ type: 'event_msg', timestamp: at,
  payload: { type: 'token_count', info: { total_token_usage: total, last_token_usage: last } } });
async function fixture(t) {
  const home = await mkdtemp(join(tmpdir(), 'codex-local-usage-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  const put = async (name, rows) => {
    const path = join(home, name);
    await mkdir(join(path, '..'), { recursive: true });
    const content = rows.map(row => typeof row === 'string' ? row : JSON.stringify(row)).join('\n') + '\n';
    await writeFile(path, name.endsWith('.zst') ? zstdCompressSync(content) : content);
  };
  return { home, put };
}

test('local audit reads compressed archives, joins resumed files and counts cache and reasoning once', async t => {
  const { home, put } = await fixture(t);
  const a = event('2026-10-17T23:59:00Z', counters());
  const b = event('2026-10-18T00:01:00Z', { ...counters(200, 160, 20), reasoning_output_tokens: 4 }, counters());
  // Archive is intentionally discovered after the later resumed file.
  await put('sessions/resumed.jsonl', [meta(), a, b, { ...b, timestamp: '2026-10-18T00:02:00Z' }]);
  await put('archived_sessions/old.jsonl.zst', [meta(), a]);
  const report = await readLocalCodexUsage(home);
  assert.equal(report.sessionsWithUsage, 1);
  assert.equal(report.totals.total_tokens, 220);
  assert.equal(report.totals.cached_input_tokens, 160);
  assert.equal(report.totals.reasoning_output_tokens, 4);
  assert.equal(report.crossCheck.totalDifference, 0);
  assert.deepEqual(report.crossCheck.totals, report.totals);
  assert.deepEqual(report.range, { firstEventAt: '2026-10-17T23:59:00.000Z', lastEventAt: '2026-10-18T00:01:00.000Z' });
  assert.deepEqual(report.days.map(day => [day.date, day.total_tokens]), [['2026-10-17', 110], ['2026-10-18', 110]]);
  assert.equal(report.diagnostics.duplicateEvents, 1);
  assert.equal(report.diagnostics.repeatedCounters, 1);
  assert.equal(report.diagnostics.compressedFiles, 1);
  assert.equal(report.timezone, 'UTC');
  assert.doesNotMatch(JSON.stringify(report), /DO_NOT_EXPORT|synthetic-session|cwd|session_meta|last_token_usage/);
});

test('full-history audit exposes the difference when cumulative counters bridge a missing event', async t => {
  const { home, put } = await fixture(t);
  await put('sessions/gap.jsonl', [meta(),
    event('2026-10-17T01:00:00Z', counters()),
    event('2026-10-18T01:00:00Z', { ...counters(300, 240, 30), reasoning_output_tokens: 6 }, counters()),
  ]);
  const report = await readLocalCodexUsage(home);
  assert.equal(report.totals.total_tokens, 330);
  assert.equal(report.crossCheck.totals.total_tokens, 220);
  assert.equal(report.crossCheck.totalDifference, 110);
  assert.equal(report.diagnostics.counterGaps, 1);
});

test('rollback uses the last call and establishes a new baseline; missing history is not assigned to one day', async t => {
  const { home, put } = await fixture(t);
  await put('sessions/rollback.jsonl', [meta(),
    event('2026-10-17T01:00:00Z', counters(1000, 800, 100), counters()),
    event('2026-10-17T02:00:00Z', counters(200, 100, 20), counters(50, 20, 5)),
    event('2026-10-17T03:00:00Z', counters(300, 180, 30), counters()),
  ]);
  const report = await readLocalCodexUsage(home);
  assert.equal(report.totals.total_tokens, 275);
  assert.equal(report.diagnostics.initialGaps, 1);
  assert.equal(report.diagnostics.counterResets, 1);
});

test('forked history, malformed lines and invalid counters are reported without exporting private records', async t => {
  const { home, put } = await fixture(t);
  await put('sessions/child.jsonl', [meta('private-child', { parent_thread_id: 'private-parent', timestamp: '2026-10-18T00:00:00Z' }),
    event('2026-10-17T23:00:00Z', counters()), '{"secret":"DO_NOT_EXPORT',
    event('2026-10-18T00:01:00Z', { ...counters(), total_tokens: 999 }),
    event('2026-10-18T00:02:00Z', counters()),
    event('2026-10-18T00:03:00Z', { ...counters(), input_tokens: Number.MAX_SAFE_INTEGER + 1 }),
  ]);
  const report = await readLocalCodexUsage(home);
  assert.equal(report.totals.total_tokens, 110);
  assert.equal(report.diagnostics.inheritedEvents, 1);
  assert.equal(report.diagnostics.malformedLines, 1);
  assert.equal(report.diagnostics.invalidEvents, 2);
  assert.doesNotMatch(JSON.stringify(report), /DO_NOT_EXPORT|private-child|private-parent/);
});

test('corrupt compressed input fails with a path-free error; missing history fails rather than inventing zero', async t => {
  const { home, put } = await fixture(t);
  await assert.rejects(readLocalCodexUsage(home), /No usable local/);
  await put('sessions/broken.jsonl.zst', [meta(), event('2026-10-18T00:00:00Z', counters())]);
  await writeFile(join(home, 'sessions/broken.jsonl.zst'), 'invalid zstd frame');
  await assert.rejects(readLocalCodexUsage(home), /^Error: Local Codex rollout could not be read\.$/);
});

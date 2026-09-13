import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { advanceProbe, summarizeHistory, runtimeStatus, publishStatus, validateConfig } from '../scripts/status-publish.mjs';
import { receiveBatch } from '../scripts/status-receive.mjs';
import { validateBatch } from '../scripts/lib/status-batch.mjs';
import { withLock } from '../scripts/lib/status-store.mjs';
import { atomicJson } from '../scripts/lib/status-store.mjs';
import { effectiveState, sourceState, emptyManifest, validateManifest, PROBE_TTL, ACTIVITY_TTL } from '../src/lib/status.ts';
import { renderActivityChart } from '../src/lib/activity-markup.ts';
import { renderStatus } from '../src/lib/status-markup.ts';

const now = Date.parse('2026-09-12T10:00:00.000Z');
const iso = n => new Date(n).toISOString();
const config = { version: 1, sites: { moriium: { url: 'https://example.test/', marker: 'Moriium' }, gallery: null }, runtimeEnabled: false };
const batch = (sequence = 1, time = now) => ({ version: 1, producer: 'morii-workstation', sequence, createdAt: iso(time), sources: Object.fromEntries(['github', 'codex', 'claude'].map(id => [id, { attemptedAt: iso(time), result: 'success' }])), data: { version: 1, sources: Object.fromEntries(['github', 'codex', 'claude'].map(id => [id, { updatedAt: iso(time), timezone: { github: 'GitHub', codex: 'Codex', claude: 'Asia/Shanghai' }[id], metric: id === 'github' ? 'contributions' : 'tokens', days: [{ date: '2026-09-12', value: 0 }] }])) } });
const temporary = async t => { const dir = await mkdtemp(join(tmpdir(), 'moriium-status-')); t.after(() => rm(dir, { recursive: true, force: true })); return dir; };

test('three failures confirm interruption, two successes recover, gaps reset evidence', () => {
  let state;
  for (const [i, ok] of [true, true, false, false, false, true, true].entries()) {
    state = advanceProbe(state, ok, now + i * 300_000);
    assert.equal(state.state, ['checking', 'operational', 'checking', 'checking', 'down', 'checking', 'operational'][i]);
    if (i === 4) assert.equal(state.event.state, 'down');
    if (i === 6) assert.equal(state.event.state, 'operational');
  }
  state = advanceProbe(state, false, now + 4_000_000);
  assert.equal(state.failure, 1); assert.equal(state.confirmed, 'unknown');
});
test('stale HTTP 200 snapshots expire independently of fetching; zero tokens stay fresh', () => {
  const component = { id: 'moriium', state: 'operational', validUntil: iso(now + PROBE_TTL) };
  assert.equal(effectiveState(component, now + PROBE_TTL + 1), 'unknown');
  assert.equal(sourceState({ succeededAt: iso(now), result: 'success' }, now), 'operational');
  assert.equal(sourceState({ succeededAt: iso(now), result: 'failed' }, now), 'degraded');
  assert.equal(sourceState({ succeededAt: iso(now), result: 'success' }, now + ACTIVITY_TTL + 1), 'stale');
});
test('history never fills unknown days or monitoring gaps with healthy data', () => {
  const midnight = Date.parse('2026-09-12T00:00:00+08:00');
  const end = midnight + 600_000;
  const sample = { at: midnight, until: end, state: 'operational' };
  assert.equal(summarizeHistory([], end).at(-1).state, 'empty');
  assert.equal(summarizeHistory([sample], end).at(-1).state, 'normal');
  assert.equal(summarizeHistory([{ ...sample, at: midnight + 1 }], end).at(-1).state, 'incomplete');
  assert.equal(summarizeHistory([{ ...sample, until: end - 1 }], end).at(-1).state, 'incomplete');
  assert.equal(summarizeHistory([{ ...sample, state: 'down' }], end).at(-1).state, 'incident');
});
test('ninety-day history retains older observations and spans year boundaries', async t => {
  const root = await temporary(t);
  const priorDay = Date.parse('2026-07-01T00:00:00+08:00');
  const sample = { at: priorDay, until: priorDay + 86_400_000, state: 'operational' };
  await atomicJson(join(root, 'state.json'), { version: 1, sequence: 0, probes: {}, samples: { moriium: [sample] }, events: {}, activity: null, lastNow: priorDay });
  const manifest = await publishStatus({ root, config, now, check: async () => true });
  const history = manifest.components[0].history;
  assert.equal(history.length, 90);
  assert.equal(history[0].date, '2026-06-15');
  assert.equal(history.find(day => day.date === '2026-07-01').state, 'normal');
  assert.equal(history[0].state, 'empty');
  assert.ok(JSON.parse(await readFile(join(root, 'state.json'))).samples.moriium.some(s => s.at === priorDay));
  const crossYear = emptyManifest(Date.parse('2027-01-01T10:00:00Z')).components[0].history;
  assert.equal(crossYear[0].date, '2026-10-04');
  assert.equal(crossYear.at(-1).date, '2027-01-01');
});
test('runtime idle and paused are intentional states, missing or expired heartbeats are unknown', () => {
  for (const state of ['waiting', 'paused', 'running']) assert.equal(runtimeStatus({ version: 1, state, observedAt: iso(now) }, now).state, state);
  assert.equal(runtimeStatus({ version: 1, state: 'running', observedAt: iso(now) }, now + 181_000).state, 'unknown');
  assert.equal(runtimeStatus({ version: 1, state: 'running', observedAt: iso(now + 120_000) }, now).state, 'unknown');
});
test('confirmed interruptions survive an observation gap and record eventual recovery', () => {
  let state;
  for (let i = 0; i < 3; i++) state = advanceProbe(state, false, now + i * 300_000);
  state = advanceProbe(state, true, now + 4_000_000);
  assert.equal(state.confirmed, 'unknown');
  state = advanceProbe(state, true, now + 4_300_000);
  assert.equal(state.event.state, 'operational');
});
test('a refused activity regression does not block site or runtime monitoring', async t => {
  const root = await temporary(t); let probes = 0;
  await receiveBatch(join(root, 'inbox'), batch(), now);
  const first = await publishStatus({ root, config, now, check: async () => { probes++; return true; } });
  const invalid = batch(2, now + 60_000); invalid.data.sources.codex.days = [];
  await receiveBatch(join(root, 'inbox'), invalid, now + 60_000);
  await atomicJson(join(root, 'runtime.json'), { version: 1, observedAt: iso(now + 60_000), state: 'waiting', private: 'DO_NOT_EXPORT' });
  const runtimeConfig = { ...config, runtimeEnabled: true };
  const next = await publishStatus({ root, config: runtimeConfig, now: now + 60_000, check: async () => { probes++; return true; } });
  assert.equal(probes, 1);
  assert.equal(next.activity.hash, first.activity.hash);
  assert.equal(next.components.find(c => c.id === 'activity').state, 'degraded');
  assert.equal(next.components.find(c => c.id === 'runtime').state, 'waiting');
  assert.doesNotMatch(JSON.stringify(next), /DO_NOT_EXPORT/);
  for (let i = 2; i <= 5; i++) {
    await atomicJson(join(root, 'runtime.json'), { version: 1, observedAt: iso(now + i * 60_000), state: 'waiting' });
    const current = await publishStatus({ root, config: runtimeConfig, now: now + i * 60_000, check: async () => { probes++; return true; } });
    assert.equal(effectiveState(current.components.find(c => c.id === 'runtime'), now + i * 60_000 + 59_000), 'waiting');
  }
  assert.equal(probes, 2);
});
test('expired history uses the same labels in strips and detail rows', () => {
  const data = emptyManifest(now); data.components[0].state = 'operational';
  data.components[0].history.at(-1).state = 'normal';
  const html = renderStatus(data, 'en', now + 60_000);
  assert.doesNotMatch(html, /2026-09-12 · Normal observations/);
  assert.match(html, /2026-09-12 · Incomplete observations/);
});
test('batch serializer strips private fields and rejects future dates, bad source outcomes and sequence', () => {
  const raw = batch(); raw.secret = 'PRIVATE'; raw.data.sources.claude.path = 'PRIVATE';
  const clean = validateBatch(raw, now);
  assert.doesNotMatch(JSON.stringify(clean), /PRIVATE|secret|path/);
  assert.throws(() => validateBatch({ ...raw, sequence: 0 }, now));
  assert.throws(() => validateBatch({ ...raw, createdAt: iso(now + 301_000) }, now));
  const wrong = batch(); wrong.data.sources.codex.updatedAt = iso(now - 1000);
  assert.throws(() => validateBatch(wrong, now));
  const partial = batch(); partial.sources.claude.result = 'failed'; partial.data.sources.claude.updatedAt = iso(now - 1000);
  assert.equal(validateBatch(partial, now).sources.claude.result, 'failed');
});
test('restricted receiver is idempotent and does not regress on an older retry', async t => {
  const root = await temporary(t);
  assert.equal(await receiveBatch(root, batch(2), now), true);
  assert.equal(await receiveBatch(root, batch(1), now), false);
  assert.equal(await receiveBatch(root, batch(2), now), false);
  assert.equal(JSON.parse(await readFile(join(root, 'pending.json'))).batch.sequence, 2);
});
test('concurrent publishers cannot both enter the critical section', async t => {
  const root = await temporary(t); let release;
  const first = withLock(join(root, 'lock'), () => new Promise(resolve => { release = resolve; }));
  while (!release) await new Promise(resolve => setTimeout(resolve, 1));
  await assert.rejects(withLock(join(root, 'lock'), async () => {}), { code: 'EEXIST' });
  release(); await first;
});
test('publisher serves immutable matching data and recovers after interrupted manifest replacement', async t => {
  const root = await temporary(t);
  await receiveBatch(join(root, 'inbox'), batch(1), now);
  const one = await publishStatus({ root, config, now, check: async () => true });
  const bytes = await readFile(join(root, `public/activity/${one.activity.hash}.json`));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), one.activity.hash);
  assert.equal(one.components.find(c => c.id === 'gallery').state, 'unconfigured');
  const next = batch(2, now + 300_000); next.data.sources.codex.days[0].value = 300;
  await receiveBatch(join(root, 'inbox'), next, now + 300_000);
  await assert.rejects(publishStatus({ root, config, now: now + 300_000, check: async () => true, beforeManifest: async () => { throw new Error('Crash'); } }));
  assert.equal(JSON.parse(await readFile(join(root, 'public/current.json'))).activity.hash, one.activity.hash);
  const recovered = await publishStatus({ root, config, now: now + 600_000, check: async () => true });
  assert.notEqual(recovered.activity.hash, one.activity.hash);
  assert.equal(recovered.activity.publishedAt, iso(now + 600_000));
  assert.equal(recovered.components.find(c => c.id === 'moriium').state, 'operational');
  const late = await publishStatus({ root, config, now: now + ACTIVITY_TTL + 900_000, check: async () => true });
  assert.equal(late.components.find(c => c.id === 'activity').state, 'stale');
  assert.equal(late.components.find(c => c.id === 'moriium').state, 'checking');
});
test('public manifest allowlist and HTML renderer exclude untrusted extra fields', () => {
  const raw = emptyManifest(now); raw.secret = '<script>PRIVATE</script>';
  raw.components[0].secret = raw.secret;
  const clean = validateManifest(raw);
  assert.doesNotMatch(JSON.stringify(clean), /PRIVATE|script/);
  for (const lang of ['zh', 'ja', 'en']) {
    const html = renderStatus(clean, lang, now);
    assert.equal((html.match(/data-status-id=/g) ?? []).length, 4);
    assert.equal((html.match(/class="status-day"/g) ?? []).length, 360);
    assert.doesNotMatch(html, /PRIVATE|<script/);
  }
  assert.throws(() => validateConfig({ ...config, sites: { ...config.sites, moriium: { url: 'http://example.test', marker: 'test' } } }));
});
test('shared activity renderer includes complete new years, leap dates, accessible daily records and totals', () => {
  const snapshot = batch().data.sources.codex;
  snapshot.days = [{ date: '2026-12-31', value: 100 }, { date: '2027-01-01', value: 200 }];
  for (const lang of ['zh', 'ja', 'en']) {
    const html = renderActivityChart('codex', snapshot, lang, '2027-01-01');
    assert.match(html, /data-activity-year="2027"/);
    assert.match(html, /data-activity-year="2026"/);
    assert.match(html, /<td>200<\/td>/);
    assert.match(html, /data-date="2027-01-01"/);
    assert.doesNotMatch(html, /data-date="2027-01-02"/);
    assert.match(html, /aria-live="off"/);
  }
  assert.match(renderActivityChart('codex', snapshot, 'en', '2028-03-01'), /data-date="2028-02-29"/);
});

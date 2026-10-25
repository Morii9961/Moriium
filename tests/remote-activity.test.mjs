import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { collectRemoteActivity } from '../scripts/collect-remote-activity.mjs';
import { parseTokens, parseGitHub, validateFeed, validateFeedPointer, updateFeed, fetchJson, TOKENS_URL, MAX_BYTES } from '../scripts/lib/remote-activity.mjs';
import { withLock, atomicJson } from '../scripts/lib/status-store.mjs';

const now = Date.parse('2026-01-02T12:00:00.000Z');
const at = new Date(now).toISOString();
const tokens = () => ({ user: { username: 'Morii9961', isPrivate: false }, updatedAt: at, clients: ['codex', 'claude'], stats: { totalTokens: 34 },
  contributions: [{ date: '2026-01-02', totals: { tokens: 34 }, clients: ['codex', 'claude'].map(client => ({ client,
    tokens: { input: 2, output: 1, cacheRead: 9, cacheWrite: 1, reasoning: 4 }, models: { 'not-exported': { tokens: 17 } } })) }] });
const github = () => ({ data: { user: { contributionsCollection: { contributionCalendar: { weeks: [{ contributionDays: [
  { date: '2026-01-01', contributionCount: 0 }, { date: '2026-01-02', contributionCount: 2 },
] }] } } } } });
const legacy = () => ({ version: 1, sources: { github: null, codex: { updatedAt: at, timezone: 'Codex', metric: 'tokens', days: [{ date: '2025-05-12', value: 999 }] }, claude: null } });
const reference = { hash: 'a'.repeat(64), url: `/status-data/activity/${'a'.repeat(64)}.json` };
const attempts = () => ({ github: { updatedAt: at, days: [{ date: '2026-01-02', value: 0 }] }, ...parseTokens(tokens(), now) });
const fixture = async t => { const dir = await mkdtemp(join(tmpdir(), 'moriium-remote-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const legacyFile = join(dir, 'legacy.json'); await writeFile(legacyFile, JSON.stringify(legacy())); return { root: dir, legacyFile, now, githubToken: 'synthetic-not-a-key' }; };
const request = async url => structuredClone(url === TOKENS_URL ? tokens() : github());

test('tokens sums its disjoint cache/output/reasoning buckets once and excludes private fields', () => {
  const data = parseTokens(tokens(), now);
  assert.equal(data.codex.days[0].value, 17); assert.equal(data.claude.days[0].value, 17);
  assert(!JSON.stringify(data).includes('not-exported'));
  const zero = tokens(); zero.stats.totalTokens = 0; zero.contributions[0].totals.tokens = 0;
  for (const c of zero.contributions[0].clients) for (const k of Object.keys(c.tokens)) c.tokens[k] = 0;
  assert.equal(parseTokens(zero, now).codex.days[0].value, 0);
});
test('tokens rejects incomplete totals, duplicate dates/clients, unsafe counts, future time and unknown counts', () => {
  for (const change of [
    x => x.stats.totalTokens++, x => x.contributions.push(x.contributions[0]),
    x => x.contributions[0].clients.push(x.contributions[0].clients[0]),
    x => x.contributions[0].clients[0].tokens.input = Number.MAX_SAFE_INTEGER,
    x => x.contributions[0].clients[0].tokens.input = null,
    x => x.contributions[0].clients[0].tokens.reasoning = -1,
    x => x.updatedAt = new Date(now + 400_000).toISOString(),
    x => x.user.username = 'another-user', x => x.user.isPrivate = true,
  ]) { const raw = tokens(); change(raw); assert.throws(() => parseTokens(raw, now)); }
});
test('GitHub preserves measured zeros and refuses partial calendars and GraphQL errors', () => {
  assert.deepEqual(parseGitHub(github(), now, '2026-01-01', '2026-01-02').map(d => d.value), [0, 2]);
  const partial = github(); partial.data.user.contributionsCollection.contributionCalendar.weeks[0].contributionDays.shift();
  assert.throws(() => parseGitHub(partial, now, '2026-01-01', '2026-01-02'));
  assert.throws(() => parseGitHub({ ...github(), errors: [{}] }, now, '2026-01-01', '2026-01-02'));
});
test('failed or stale sources retain exact history, corrections can decrease, and fetch time never replaces upstream time', () => {
  const first = updateFeed(null, attempts(), reference, now);
  const failed = updateFeed(first, {}, reference, now + 3_600_000);
  assert.deepEqual(failed.sources.codex.snapshot, first.sources.codex.snapshot);
  const next = attempts(); next.codex.days[0].value = 1;
  const corrected = updateFeed(first, next, reference, now + 3_600_000);
  assert.equal(corrected.sources.codex.snapshot.days[0].value, 1);
  assert.equal(corrected.sources.codex.snapshot.updatedAt, at);
  assert.notEqual(corrected.sources.codex.snapshot.fetchedAt, at);
  next.codex.days = [];
  assert.equal(updateFeed(first, next, reference, now + 3_600_000).sources.codex.result, 'failed');
  next.codex.updatedAt = new Date(now - 1).toISOString();
  assert.equal(updateFeed(first, next, reference, now + 3_600_000).sources.codex.result, 'failed');
  assert.throws(() => updateFeed(first, {}, reference, now - 1));
});
test('feed and pointer rebuild only public allowlists and reject invented timezones/unsafe paths', () => {
  const first = updateFeed(null, attempts(), reference, now);
  const clean = validateFeed({ ...first, secret: 'private' }, now);
  assert(!JSON.stringify(clean).includes('private'));
  const wrong = structuredClone(first); wrong.sources.codex.dayBoundary = 'Asia/Shanghai';
  assert.throws(() => validateFeed(wrong, now));
  assert.throws(() => validateFeedPointer({ version: 2, generatedAt: at, hash: 'a'.repeat(64), url: 'https://outside.test/data' }));
});
test('collector produces hash-addressed files with frozen v1 history, keeps legacy namespace and never exports token', async t => {
  const opts = await fixture(t); const result = await collectRemoteActivity({ ...opts, request });
  const bytes = await readFile(join(opts.root, `public/activity-v2/${result.pointer.hash}.json`));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), result.pointer.hash);
  assert.deepEqual(JSON.parse(bytes), result.feed);
  const old = JSON.parse(await readFile(join(opts.root, `public/activity/${result.feed.legacy.hash}.json`)));
  assert.equal(old.sources.codex.days[0].value, 999);
  assert(!bytes.includes(Buffer.from(opts.githubToken)));
  const second = await collectRemoteActivity({ ...opts, now: now + 3_600_000, request: async () => { throw Error('private report'); } });
  assert.deepEqual(second.feed.legacy, result.feed.legacy);
  assert.deepEqual(second.feed.sources.codex.snapshot, result.feed.sources.codex.snapshot);
  assert.equal(second.feed.sources.github.result, 'failed');
  assert(!JSON.stringify(second.feed).includes('private report'));
});
test('crash before pointer switch preserves previous publication and lock contention never overwrites it', async t => {
  const opts = await fixture(t); await collectRemoteActivity({ ...opts, request });
  const path = join(opts.root, 'public/activity-v2/current.json'); const before = await readFile(path, 'utf8');
  await assert.rejects(collectRemoteActivity({ ...opts, now: now + 1, request, beforePointer: () => { throw Error('synthetic failure'); } }));
  assert.equal(await readFile(path, 'utf8'), before);
  await withLock(join(opts.root, 'activity-feed.lock'), async () => {
    await assert.rejects(collectRemoteActivity({ ...opts, request }), { code: 'EEXIST' });
  });
  assert.equal(await readFile(path, 'utf8'), before);
});
test('latest deployed v1 snapshot wins over repository fallback; corrupt feed hash blocks overwrites', async t => {
  const opts = await fixture(t); const old = legacy(); old.sources.codex.days[0].value = 1000;
  const hash = createHash('sha256').update(`${JSON.stringify(old)}\n`).digest('hex');
  await atomicJson(join(opts.root, `public/activity/${hash}.json`), old);
  // Construct the full existing manifest with its validator's canonical component defaults.
  const { emptyManifest } = await import('../src/lib/status.ts');
  const manifest = emptyManifest(now); manifest.activity = { hash, url: `/status-data/activity/${hash}.json`, publishedAt: at, receivedAt: at,
    sources: Object.fromEntries(['github', 'codex', 'claude'].map(id => [id, { attemptedAt: at, succeededAt: id === 'codex' ? at : null, result: 'unknown' }])) };
  await atomicJson(join(opts.root, 'public/current.json'), manifest);
  const { feed, pointer } = await collectRemoteActivity({ ...opts, request });
  assert.equal(feed.legacy.hash, hash);
  await writeFile(join(opts.root, `public/activity-v2/${pointer.hash}.json`), '{}');
  await assert.rejects(collectRemoteActivity({ ...opts, request }));
});
test('HTTP boundary refuses redirects, non-JSON, oversized bodies and never reflects raw upstream errors', async () => {
  let options;
  const value = await fetchJson('https://example.test', { fetcher: async (_, opts) => { options = opts; return Response.json({ ok: true }); } });
  assert.equal(value.ok, true); assert.equal(options.redirect, 'error'); assert(options.signal);
  await assert.rejects(fetchJson('https://example.test', { fetcher: async () => new Response('private error', { status: 500 }) }));
  await assert.rejects(fetchJson('https://example.test', { fetcher: async () => new Response('{}', { headers: { 'content-type': 'text/html' } }) }));
  await assert.rejects(fetchJson('https://example.test', { fetcher: async () => new Response(' '.repeat(MAX_BYTES + 1), { headers: { 'content-type': 'application/json' } }) }));
});

// Public counts only. This is a different measurement series from ActivityData v1.
import { SOURCES, validDate, validateActivity } from '../../src/lib/activity.ts';
import { timestamp } from '../../src/lib/status.ts';

export const USERNAME = 'Morii9961';
export const TOKENS_URL = `https://tokens.ci/api/users/${USERNAME}?period=all`;
export const MAX_BYTES = 4 * 1024 * 1024;
const count = n => Number.isSafeInteger(n) && n >= 0;
const fail = () => { throw new Error('Invalid remote activity.'); };
const sum = values => values.reduce((a, b) => count(a + b) ? a + b : fail(), 0);
const iso = n => new Date(n).toISOString();
const providers = { github: 'github', codex: 'tokens.ci', claude: 'tokens.ci' };

function days(input, now) {
  if (!Array.isArray(input) || input.length > 100_000) return fail();
  const seen = new Set();
  const latest = iso(now + 86_400_000).slice(0, 10); // upstream device date, not a claimed UTC bucket
  const result = input.map(d => {
    if (!d || !validDate(d.date) || d.date > latest || seen.has(d.date) || !count(d.value)) return fail();
    seen.add(d.date); return { date: d.date, value: d.value };
  }).sort((a, b) => a.date.localeCompare(b.date));
  sum(result.map(d => d.value));
  return result;
}

export function parseTokens(raw, now) {
  if (raw?.user?.username !== USERNAME || raw.banned || raw.user.isPrivate !== false || !timestamp(raw.updatedAt)
    || Date.parse(raw.updatedAt) > now + 300_000 || !Array.isArray(raw.clients)
    || !Array.isArray(raw.contributions) || !count(raw.stats?.totalTokens)) return fail();
  const output = { codex: [], claude: [] }; const dates = new Set();
  const totals = [];
  for (const day of raw.contributions) {
    if (!validDate(day?.date) || dates.has(day.date) || !count(day.totals?.tokens) || !Array.isArray(day.clients)) return fail();
    dates.add(day.date); const clients = new Set(); const clientTotals = [];
    for (const c of day.clients) {
      if (typeof c?.client !== 'string' || clients.has(c.client)) return fail();
      clients.add(c.client);
      const t = c.tokens;
      if (!t || !['input', 'output', 'cacheRead', 'cacheWrite', 'reasoning'].every(k => count(t[k]))) return fail();
      // Tokens exposes disjoint buckets: its Codex parser subtracts cache from input
      // and reasoning from output before aggregating. This differs from raw Codex logs.
      // Verified against missuo/tokens@496e1174, sessions/codex.rs:219-238 and the live API.
      const value = sum([t.input, t.output, t.cacheRead, t.cacheWrite, t.reasoning]);
      clientTotals.push(value);
      if (Object.hasOwn(output, c.client)) output[c.client].push({ date: day.date, value });
    }
    if (sum(clientTotals) !== day.totals.tokens) return fail();
    totals.push(day.totals.tokens);
  }
  // A partial/rolling response must not impersonate all-history collection.
  if (sum(totals) !== raw.stats.totalTokens) return fail();
  return Object.fromEntries(['codex', 'claude'].map(id => [id,
    raw.clients.includes(id) ? { updatedAt: raw.updatedAt, days: days(output[id], now) } : null]));
}

export function parseGitHub(raw, now, from, to) {
  const calendar = raw?.data?.user?.contributionsCollection?.contributionCalendar;
  if (raw?.errors || !Array.isArray(calendar?.weeks)) return fail();
  const records = calendar.weeks.flatMap(w => {
    if (!Array.isArray(w.contributionDays)) return fail();
    return w.contributionDays.map(d => ({ date: d.date, value: d.contributionCount }));
  });
  const result = days(records, now);
  if (!result.length || result[0].date !== from || result.at(-1).date !== to
    || result.length !== (Date.parse(to) - Date.parse(from)) / 86_400_000 + 1) return fail();
  return result;
}

export function validateFeed(raw, now = Date.now()) {
  if (raw?.version !== 2 || !timestamp(raw.generatedAt) || Date.parse(raw.generatedAt) > now + 300_000) return fail();
  const sources = {};
  for (const id of SOURCES) {
    const s = raw.sources?.[id];
    if (!s || s.provider !== providers[id] || s.dayBoundary !== (id === 'github' ? 'GitHub' : 'tokens.ci device configuration')
      || !timestamp(s.attemptedAt) || Date.parse(s.attemptedAt) > Date.parse(raw.generatedAt)
      || !['success', 'failed'].includes(s.result)) return fail();
    const data = s.snapshot;
    let snapshot = null;
    if (data !== null) {
      if (!timestamp(data?.updatedAt) || !timestamp(data.fetchedAt) || Date.parse(data.updatedAt) > Date.parse(data.fetchedAt) + 300_000
        || Date.parse(data.fetchedAt) > Date.parse(s.attemptedAt)) return fail();
      snapshot = { updatedAt: data.updatedAt, fetchedAt: data.fetchedAt, days: days(data.days, now) };
    }
    if (s.result === 'success' && (!snapshot || snapshot.fetchedAt !== s.attemptedAt)) return fail();
    sources[id] = { provider: providers[id], dayBoundary: s.dayBoundary, attemptedAt: s.attemptedAt, result: s.result, snapshot };
  }
  const l = raw.legacy;
  if (!l || !/^[a-f0-9]{64}$/.test(l.hash) || l.url !== `/status-data/activity/${l.hash}.json`) return fail();
  return { version: 2, generatedAt: raw.generatedAt, sources, legacy: { hash: l.hash, url: l.url } };
}

export function validateFeedPointer(raw) {
  if (raw?.version !== 2 || !timestamp(raw.generatedAt) || !/^[a-f0-9]{64}$/.test(raw.hash)
    || raw.url !== `/status-data/activity-v2/${raw.hash}.json`) return fail();
  return { version: 2, generatedAt: raw.generatedAt, hash: raw.hash, url: raw.url };
}

export function updateFeed(previous, attempts, legacy, now) {
  if (previous && Date.parse(previous.generatedAt) > now) return fail();
  const sources = {};
  for (const id of SOURCES) {
    const prior = previous?.sources[id]?.snapshot ?? null;
    let snapshot = prior; let result = 'failed';
    const next = attempts[id];
    if (next && timestamp(next.updatedAt) && Date.parse(next.updatedAt) <= now + 300_000) {
      const incoming = days(next.days, now);
      // Accept corrected values, but require a complete same-source history.
      // Never combine the old account/ccusage snapshots with the new series.
      if ((!prior || Date.parse(next.updatedAt) >= Date.parse(prior.updatedAt))
        && (!prior || prior.days.every(d => incoming.some(n => n.date === d.date)))) {
        snapshot = { updatedAt: next.updatedAt, fetchedAt: iso(now), days: incoming }; result = 'success';
      }
    }
    sources[id] = { provider: providers[id], dayBoundary: id === 'github' ? 'GitHub' : 'tokens.ci device configuration',
      attemptedAt: iso(now), result, snapshot };
  }
  return validateFeed({ version: 2, generatedAt: iso(now), sources, legacy }, now);
}

export function validateLegacy(raw) { return validateActivity(raw); }

export async function fetchJson(url, { fetcher = fetch, method = 'GET', headers = {}, body } = {}) {
  const response = await fetcher(url, { method, headers: { ...headers, 'User-Agent': 'Moriium-Activity/2.0' }, body,
    redirect: 'error', signal: AbortSignal.timeout(30_000) });
  if (!response.ok || !response.body || !response.headers.get('content-type')?.includes('application/json')) {
    await response.body?.cancel(); throw new Error('Remote activity unavailable.');
  }
  let size = 0; const chunks = [];
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > MAX_BYTES) throw new Error('Remote activity too large.');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

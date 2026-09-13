import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { readJson, atomicJson, withLock } from './lib/status-store.mjs';
import { validateBatch } from './lib/status-batch.mjs';
import { COMPONENTS, HISTORY_DAYS, PROBE_TTL, ACTIVITY_TTL, RUNTIME_TTL, iso, emptyHistory, timestamp, sourceState, validateManifest } from '../src/lib/status.ts';
import { SOURCES, shiftDate, dateInShanghai } from '../src/lib/activity.ts';

const SITE_IDS = ['moriium', 'gallery'];
export function validateConfig(raw) {
  if (raw?.version !== 1 || typeof raw.runtimeEnabled !== 'boolean') throw new Error('Invalid status configuration.');
  const sites = {};
  for (const id of SITE_IDS) {
    const item = raw.sites?.[id];
    if (item === null) { sites[id] = null; continue; }
    const url = new URL(item?.url);
    if (url.protocol !== 'https:' || url.username || url.password || url.hash || typeof item.marker !== 'string' || item.marker.length < 3 || item.marker.length > 200) throw new Error('Invalid probe target.');
    sites[id] = { url: url.href, marker: item.marker };
  }
  return { version: 1, sites, runtimeEnabled: raw.runtimeEnabled };
}
export async function probe(target) {
  try {
    // Canonical URLs only: redirects must not escape the configured target.
    const response = await fetch(target.url, { redirect: 'error', signal: AbortSignal.timeout(10_000), headers: { 'User-Agent': 'Moriium-Status/1.0', 'Cache-Control': 'no-cache' } });
    if (!response.ok || !response.headers.get('content-type')?.includes('text/html') || !response.body) { await response.body?.cancel(); return false; }
    let body = ''; let size = 0;
    const decoder = new TextDecoder();
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > 1024 * 1024) return false;
      body += decoder.decode(chunk, { stream: true });
    }
    return (body + decoder.decode()).includes(target.marker);
  } catch { return false; }
}
export function advanceProbe(previous, ok, now) {
  const contiguous = previous && now - previous.at <= PROBE_TTL && now >= previous.at;
  const success = ok ? (contiguous ? previous.success : 0) + 1 : 0;
  const failure = ok ? 0 : (contiguous ? previous.failure : 0) + 1;
  const confirmed = ok && success >= 2 ? 'operational' : !ok && failure >= 3 ? 'down' : (contiguous ? previous.confirmed : 'unknown');
  const state = ok && success >= 2 ? 'operational' : !ok && failure >= 3 ? 'down' : 'checking';
  const priorConfirmed = previous?.lastConfirmed ?? previous?.confirmed ?? 'unknown';
  const lastConfirmed = ['operational', 'down'].includes(confirmed) ? confirmed : priorConfirmed;
  const event = confirmed !== priorConfirmed && (confirmed === 'down' || confirmed === 'operational' && priorConfirmed === 'down') ? { at: iso(now), state: confirmed } : null;
  return { at: now, success, failure, confirmed, lastConfirmed, state, event };
}
export function summarizeHistory(samples, now) {
  return emptyHistory(now).map(day => {
    const start = Date.parse(`${day.date}T00:00:00+08:00`);
    const end = Math.min(start + 86_400_000, now);
    const relevant = samples.filter(s => s.at < end && s.until > start);
    if (!relevant.length) return day;
    if (relevant.some(s => ['down', 'degraded', 'stale'].includes(s.state))) return { ...day, state: 'incident' };
    let covered = start;
    for (const sample of relevant) {
      if (sample.at > covered || ['unknown', 'checking', 'unconfigured'].includes(sample.state)) return { ...day, state: 'incomplete' };
      covered = Math.max(covered, sample.until);
    }
    return { ...day, state: covered >= end ? 'normal' : 'incomplete' };
  });
}
export function runtimeStatus(raw, now) {
  if (!raw || raw.version !== 1 || !timestamp(raw.observedAt) || Date.parse(raw.observedAt) > now + 60_000 || !['waiting', 'running', 'paused', 'degraded'].includes(raw.state)) return { state: 'unknown', observedAt: null, validUntil: null };
  const validUntil = iso(Date.parse(raw.observedAt) + RUNTIME_TTL);
  return { state: now > Date.parse(validUntil) ? 'unknown' : raw.state, observedAt: raw.observedAt, validUntil };
}
export async function publishStatus({ root, inbox = resolve(root, 'inbox'), config, now = Date.now(), check = probe, beforeManifest = async () => {} }) {
  config = validateConfig(config);
  return withLock(resolve(root, 'publisher.lock'), async () => {
    const statePath = resolve(root, 'state.json');
    const state = await readJson(statePath, { version: 1, sequence: 0, probes: {}, samples: {}, events: {}, activity: null, lastNow: 0 });
    if (state.version !== 1 || now < state.lastNow) throw new Error('Invalid publisher state or clock rollback.');
    let intakeFailed = false;
    try {
      const pending = await readJson(resolve(inbox, 'pending.json'), null);
      if (pending) {
        const batch = validateBatch(pending.batch, now);
        if (!timestamp(pending.receivedAt) || Date.parse(pending.receivedAt) > now + 300_000) throw new Error('Invalid receipt time.');
        if (batch.sequence > state.sequence) {
          // A failed source must retain all previously published dates. The local
          // archive is authoritative for corrections, but cannot delete history.
          if (state.activity) {
            const previous = await readJson(resolve(root, `public/activity/${state.activity.hash}.json`), null);
            for (const id of SOURCES) {
              const prior = previous?.sources[id]; const next = batch.data.sources[id];
              if (prior && (!next || Date.parse(next.updatedAt) < Date.parse(prior.updatedAt) || prior.days.some(d => !next.days.some(n => n.date === d.date)))) throw new Error('Activity archive would regress.');
            }
          }
          const serialized = `${JSON.stringify(batch.data)}\n`;
          const hash = createHash('sha256').update(serialized).digest('hex');
          await atomicJson(resolve(root, `public/activity/${hash}.json`), batch.data);
          state.activity = { hash, url: `/status-data/activity/${hash}.json`, publishedAt: iso(now), receivedAt: pending.receivedAt, sources: batch.sources };
          state.sequence = batch.sequence;
        }
      }
    } catch {
      // An invalid activity batch must not stop unrelated site observations.
      // Keep the last valid version until a valid replacement reaches the inbox.
      intakeFailed = true;
    }
    const results = await Promise.all(SITE_IDS.map(async id => {
      const cached = state.probes[id];
      const target = JSON.stringify(config.sites[id]);
      const due = !cached || cached.target !== target || now - cached.at >= 300_000;
      return { id, checked: Boolean(config.sites[id]) && due, ok: config.sites[id] ? (due ? await check(config.sites[id]) : undefined) : null };
    }));
    const current = {};
    for (const { id, ok, checked } of results) {
      if (ok === null) { delete state.probes[id]; current[id] = { state: 'unconfigured', observedAt: null, validUntil: null }; continue; }
      const target = JSON.stringify(config.sites[id]);
      const result = checked ? advanceProbe(state.probes[id]?.target === target ? state.probes[id] : null, ok, now) : state.probes[id];
      result.target = target;
      state.probes[id] = result;
      if (checked && result.event) (state.events[id] ??= []).push(result.event);
      current[id] = { state: result.state, observedAt: iso(result.at), validUntil: iso(result.at + PROBE_TTL) };
    }
    if (state.activity) {
      const sources = Object.values(state.activity.sources);
      const statuses = sources.map(s => sourceState(s, now));
      const stateValue = statuses.includes('stale') ? 'stale' : intakeFailed || statuses.includes('degraded') ? 'degraded' : 'operational';
      current.activity = { state: stateValue, observedAt: state.activity.publishedAt,
        validUntil: iso(Math.min(now + PROBE_TTL, ...sources.map(s => s.succeededAt ? Date.parse(s.succeededAt) + ACTIVITY_TTL : now))) };
    } else current.activity = intakeFailed ? { state: 'degraded', observedAt: iso(now), validUntil: iso(now + PROBE_TTL) } : { state: 'unconfigured', observedAt: null, validUntil: null };
    current.runtime = config.runtimeEnabled ? runtimeStatus(await readJson(resolve(root, 'runtime.json'), null), now) : { state: 'unconfigured', observedAt: null, validUntil: null };
    const floor = Date.parse(`${shiftDate(dateInShanghai(new Date(now)), -HISTORY_DAYS)}T00:00:00+08:00`);
    const components = COMPONENTS.map(id => {
      const c = current[id];
      const samples = (state.samples[id] ?? []).filter(s => s.until > floor);
      // One observation owns at most its validity interval. Missing runs leave gaps.
      const last = samples.at(-1);
      if (last) last.until = Math.min(last.until, now);
      if (c.state !== 'unconfigured') samples.push({ at: now, until: Math.min(now + PROBE_TTL, c.validUntil ? Math.max(now + 1, Date.parse(c.validUntil)) : now + PROBE_TTL), state: c.state });
      state.samples[id] = samples;
      state.events[id] = (state.events[id] ?? []).filter(e => Date.parse(e.at) >= floor);
      return { id, ...c, history: summarizeHistory(samples, now + 1), events: state.events[id] };
    });
    const publicPrevious = await readJson(resolve(root, 'public/current.json'), null);
    if (state.activity && (publicPrevious?.activity?.receivedAt !== state.activity.receivedAt || publicPrevious?.activity?.hash !== state.activity.hash)) {
      state.activity.publishedAt = iso(now);
      components.find(c => c.id === 'activity').observedAt = iso(now);
    }
    const manifest = validateManifest({ version: 1, generatedAt: iso(now), validUntil: iso(now + PROBE_TTL), components, activity: state.activity });
    state.lastNow = now;
    await atomicJson(statePath, state);
    await beforeManifest();
    await atomicJson(resolve(root, 'public/current.json'), manifest);
    return manifest;
  });
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    const root = process.env.MORIIUM_STATUS_ROOT || '/var/lib/moriium-status';
    await publishStatus({ root, config: await readJson(process.env.MORIIUM_STATUS_CONFIG || '/etc/moriium/status-sites.json', null) });
    console.log('Public status snapshot published.');
  } catch { console.error('Status publication failed; previous public snapshot retained.'); process.exitCode = 1; }
}

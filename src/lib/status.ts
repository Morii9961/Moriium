import { dateInShanghai, shiftDate, validDate, SOURCES, type ActivitySource } from './activity.ts';

export const COMPONENTS = ['moriium', 'gallery', 'activity', 'runtime'] as const;
export type ComponentId = typeof COMPONENTS[number];
export const STATES = ['operational', 'checking', 'down', 'unknown', 'unconfigured', 'stale', 'degraded', 'waiting', 'running', 'paused'] as const;
export type StatusState = typeof STATES[number];
export const HISTORY_DAYS = 90;
export const PROBE_TTL = 15 * 60_000;
export const ACTIVITY_TTL = 3 * 60 * 60_000;
export const RUNTIME_TTL = 3 * 60_000;
export interface SourceStatus { attemptedAt: string | null; succeededAt: string | null; result: 'success' | 'failed' | 'unknown' }
export interface StatusDay { date: string; state: 'normal' | 'incident' | 'incomplete' | 'empty' }
export interface StatusEvent { at: string; state: 'down' | 'operational' }
export interface StatusComponent {
  id: ComponentId; state: StatusState; observedAt: string | null; validUntil: string | null;
  history: StatusDay[]; events: StatusEvent[];
}
export interface StatusManifest {
  version: 1; generatedAt: string; validUntil: string;
  components: StatusComponent[];
  activity: { hash: string; url: string; publishedAt: string; receivedAt: string; sources: Record<ActivitySource, SourceStatus> } | null;
}
export const iso = (ms: number) => new Date(ms).toISOString();
export function timestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}
export function emptyHistory(now: number): StatusDay[] {
  const today = dateInShanghai(new Date(now));
  return Array.from({ length: HISTORY_DAYS }, (_, i) => ({ date: shiftDate(today, i - (HISTORY_DAYS - 1)), state: 'empty' }));
}
export function emptyManifest(now = Date.now()): StatusManifest {
  return { version: 1, generatedAt: iso(now), validUntil: iso(now), activity: null,
    components: COMPONENTS.map(id => ({ id, state: id === 'moriium' ? 'unknown' : 'unconfigured', observedAt: null, validUntil: null, history: emptyHistory(now), events: [] })) };
}
export function sourceState(source: SourceStatus, now: number): StatusState {
  if (!source.succeededAt || now - Date.parse(source.succeededAt) > ACTIVITY_TTL) return 'stale';
  return source.result === 'failed' ? 'degraded' : 'operational';
}
export function effectiveState(component: StatusComponent, now: number): StatusState {
  if (component.state === 'unconfigured') return 'unconfigured';
  if (!component.validUntil || now > Date.parse(component.validUntil)) return component.id === 'activity' ? 'stale' : 'unknown';
  return component.state;
}

/** Reconstruct the public allowlist; neither producers nor JSON fields become HTML. */
export function validateManifest(input: unknown): StatusManifest {
  const fail = (): never => { throw new Error('Invalid public status manifest.'); };
  if (!input || typeof input !== 'object') return fail();
  const raw = input as StatusManifest;
  if (raw.version !== 1 || !timestamp(raw.generatedAt) || !timestamp(raw.validUntil) || !Array.isArray(raw.components) || raw.components.length !== COMPONENTS.length) return fail();
  if (Date.parse(raw.validUntil) > Date.parse(raw.generatedAt) + PROBE_TTL) return fail();
  const components = COMPONENTS.map(id => {
    const matches = raw.components.filter(c => c?.id === id);
    if (matches.length !== 1) return fail();
    const c = matches[0]!;
    if (!STATES.includes(c.state) || (c.observedAt !== null && !timestamp(c.observedAt)) || (c.validUntil !== null && !timestamp(c.validUntil)) || !Array.isArray(c.history) || c.history.length !== HISTORY_DAYS || !Array.isArray(c.events) || c.events.length > 10_000) return fail();
    if (c.observedAt && Date.parse(c.observedAt) > Date.parse(raw.generatedAt) + 300_000 || c.validUntil && Date.parse(c.validUntil) > Date.parse(raw.generatedAt) + PROBE_TTL) return fail();
    const dates = new Set<string>();
    const history = c.history.map(d => {
      if (!d || !validDate(d.date) || dates.has(d.date) || !['normal', 'incident', 'incomplete', 'empty'].includes(d.state)) return fail();
      dates.add(d.date); return { date: d.date, state: d.state };
    });
    const events = c.events.map(e => {
      if (!e || !timestamp(e.at) || !['down', 'operational'].includes(e.state)) return fail();
      return { at: e.at, state: e.state };
    });
    return { id, state: c.state, observedAt: c.observedAt, validUntil: c.validUntil, history, events };
  });
  let activity: StatusManifest['activity'] = null;
  if (raw.activity !== null) {
    const a = raw.activity;
    if (!a || !/^[a-f0-9]{64}$/.test(a.hash) || a.url !== `/status-data/activity/${a.hash}.json` || !timestamp(a.publishedAt) || !timestamp(a.receivedAt)) return fail();
    const sources = {} as Record<ActivitySource, SourceStatus>;
    for (const id of SOURCES) {
      const s = a.sources?.[id];
      if (!s || (s.attemptedAt !== null && !timestamp(s.attemptedAt)) || (s.succeededAt !== null && !timestamp(s.succeededAt)) || !['success', 'failed', 'unknown'].includes(s.result)) return fail();
      if (s.attemptedAt && Date.parse(s.attemptedAt) > Date.parse(raw.generatedAt) + 300_000 || s.succeededAt && (!s.attemptedAt || Date.parse(s.succeededAt) > Date.parse(s.attemptedAt))) return fail();
      sources[id] = { attemptedAt: s.attemptedAt, succeededAt: s.succeededAt, result: s.result };
    }
    activity = { hash: a.hash, url: a.url, publishedAt: a.publishedAt, receivedAt: a.receivedAt, sources };
  }
  return { version: 1, generatedAt: raw.generatedAt, validUntil: raw.validUntil, components, activity };
}

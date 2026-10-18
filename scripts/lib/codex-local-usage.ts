import { createReadStream } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { createZstdDecompress } from 'node:zlib';
import { validDate } from '../../src/lib/activity.ts';

const fields = ['input_tokens', 'cached_input_tokens', 'cache_write_input_tokens', 'output_tokens', 'reasoning_output_tokens', 'total_tokens'] as const;
type Usage = Record<typeof fields[number], number>;
type Event = { timestamp: number; total: Usage; last: Usage };
const zero = (): Usage => Object.fromEntries(fields.map(key => [key, 0])) as Usage;

function usage(raw: unknown): Usage {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid local token counters.');
  const row = raw as Record<string, unknown>;
  const result = zero();
  for (const key of fields) {
    const value = row[key] === undefined && (key === 'cache_write_input_tokens' || key === 'reasoning_output_tokens') ? 0 : row[key];
    if (!Number.isSafeInteger(value) || Number(value) < 0) throw new Error('Invalid local token counters.');
    result[key] = Number(value);
  }
  if (!Number.isSafeInteger(result.input_tokens + result.output_tokens)
    || result.total_tokens !== result.input_tokens + result.output_tokens
    || result.cached_input_tokens + result.cache_write_input_tokens > result.input_tokens
    || result.reasoning_output_tokens > result.output_tokens) throw new Error('Inconsistent local token counters.');
  return result;
}

function timestamp(value: unknown): number {
  if (typeof value !== 'string' || !validDate(value.slice(0, 10)) || !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return NaN;
  return Date.parse(value);
}

function add(a: Usage, b: Usage) {
  for (const key of fields) {
    const value = a[key] + b[key];
    if (!Number.isSafeInteger(value)) throw new Error('Local token sum exceeds the safe integer range.');
    a[key] = value;
  }
}

/** Offline audit only. Never combine these UTC buckets with account-side buckets. */
export async function readLocalCodexUsage(home = process.env.CODEX_HOME || join(homedir(), '.codex')) {
  const sessions = new Map<string, Event[]>();
  const diagnostics = { plainFiles: 0, compressedFiles: 0, malformedLines: 0, invalidEvents: 0,
    inheritedEvents: 0, duplicateEvents: 0, repeatedCounters: 0, counterResets: 0, counterGaps: 0, initialGaps: 0 };
  for (const directory of ['sessions', 'archived_sessions']) {
    let entries;
    try { entries = await readdir(join(home, directory), { recursive: true, withFileTypes: true }); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw new Error('Local Codex directory is unreadable.');
    }
    const paths = new Set(entries.filter(entry => entry.isFile()).map(entry => join(entry.parentPath, entry.name)));
    for (const path of [...paths].sort()) {
      if (!/\.jsonl(?:\.zst)?$/.test(path) || (path.endsWith('.zst') && paths.has(path.slice(0, -4)))) continue;
      const compressed = path.endsWith('.zst');
      diagnostics[compressed ? 'compressedFiles' : 'plainFiles']++;
      const raw = createReadStream(path);
      const decoder = compressed ? createZstdDecompress() : undefined;
      const input = decoder ?? raw;
      if (decoder) { raw.on('error', error => decoder.destroy(error)); raw.pipe(decoder); }
      const lines = createInterface({ input, crlfDelay: Infinity });
      let session: string | undefined;
      let created = NaN;
      let child = false;
      try {
        for await (const line of lines) {
          if (!line.trim()) continue;
          let record;
          try { record = JSON.parse(line); }
          catch { diagnostics.malformedLines++; continue; }
          if (record?.type === 'session_meta') {
            session = typeof record.payload?.id === 'string' && record.payload.id ? record.payload.id : undefined;
            created = timestamp(record.payload?.timestamp);
            child = typeof record.payload?.parent_thread_id === 'string';
            continue;
          }
          if (record?.type !== 'event_msg' || record.payload?.type !== 'token_count' || record.payload.info == null) continue;
          const at = timestamp(record.timestamp);
          if (!session || !Number.isFinite(at) || !Number.isFinite(created)) { diagnostics.invalidEvents++; continue; }
          // Forked children may carry parent history; it is already owned by the parent.
          if (child && at < created) { diagnostics.inheritedEvents++; continue; }
          try {
            const event = { timestamp: at, total: usage(record.payload.info.total_token_usage), last: usage(record.payload.info.last_token_usage) };
            const events = sessions.get(session) ?? [];
            events.push(event);
            sessions.set(session, events);
          } catch { diagnostics.invalidEvents++; }
        }
      } catch { throw new Error('Local Codex rollout could not be read.'); }
      finally { lines.close(); input.destroy(); raw.destroy(); }
    }
  }
  const days = new Map<string, Usage>();
  const lastCallTotals = zero();
  let firstEvent = Infinity;
  let lastEvent = -Infinity;
  let eventCount = 0;
  for (const events of sessions.values()) {
    events.sort((a, b) => a.timestamp - b.timestamp);
    const seen = new Set<string>();
    let previous: Usage | undefined;
    for (const event of events) {
      const key = JSON.stringify(event);
      if (seen.has(key)) { diagnostics.duplicateEvents++; continue; }
      seen.add(key);
      if (previous && fields.every(field => event.total[field] === previous![field])) { diagnostics.repeatedCounters++; continue; }
      let delta = event.last;
      if (previous) {
        const difference = Object.fromEntries(fields.map(field => [field, event.total[field] - previous![field]]));
        try { delta = usage(difference); }
        catch { diagnostics.counterResets++; }
        // After rollback, count only the reported last call and reset the baseline.
        if (delta !== event.last && delta.total_tokens !== event.last.total_tokens) diagnostics.counterGaps++;
      } else if (event.total.total_tokens !== event.last.total_tokens) {
        // Earlier calls are missing. Do not attribute a lifetime counter to this day.
        diagnostics.initialGaps++;
      }
      previous = event.total;
      add(lastCallTotals, event.last);
      firstEvent = Math.min(firstEvent, event.timestamp);
      lastEvent = Math.max(lastEvent, event.timestamp);
      const date = new Date(event.timestamp).toISOString().slice(0, 10);
      const total = days.get(date) ?? zero();
      add(total, delta);
      days.set(date, total);
      eventCount++;
    }
  }
  if (!eventCount) throw new Error('No usable local Codex token events found.');
  const totals = zero();
  for (const day of days.values()) add(totals, day);
  // Explicit allowlist: no identifiers, filenames, titles, models or raw records.
  return { version: 1, basis: 'codex-local-observed-v1', timezone: 'UTC', coverage: 'local-retained-history',
    range: { firstEventAt: new Date(firstEvent).toISOString(), lastEventAt: new Date(lastEvent).toISOString() },
    sessionsWithUsage: sessions.size, countedEvents: eventCount, diagnostics, totals,
    crossCheck: { method: 'deduplicated-last-token-usage', totals: lastCallTotals,
      totalDifference: totals.total_tokens - lastCallTotals.total_tokens },
    days: [...days].sort(([a], [b]) => a.localeCompare(b)).map(([date, tokens]) => ({ date, ...tokens })) };
}

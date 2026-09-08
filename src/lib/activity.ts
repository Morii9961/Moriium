/** Public activity contract. Never pass raw CLI reports to the renderer. */
export const SOURCES = ['github', 'codex', 'claude'] as const;
export type ActivitySource = typeof SOURCES[number];
export const ACTIVITY_START_YEAR = 2026;
/** Each source buckets days in its own zone; the label records whose, never a guess. */
export const TIMEZONES = { github: 'GitHub', codex: 'Codex', claude: 'Asia/Shanghai' } as const;
export type ActivityTimezone = typeof TIMEZONES[ActivitySource];
export interface ActivityDay { date: string; value: number }
export interface ActivitySnapshot {
  updatedAt: string;
  timezone: ActivityTimezone;
  metric: 'contributions' | 'tokens';
  days: ActivityDay[];
}
export interface ActivityData {
  version: 1;
  sources: Record<ActivitySource, ActivitySnapshot | null>;
}
export type CalendarCell =
  | { date: string; value: number; state: 'known' }
  | { date: string; value: null; state: 'outside' | 'future' | 'unknown' };

export function validDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}

export function activityYears(asOf: string): number[] {
  if (!validDate(asOf)) throw new Error('Invalid activity date.');
  const currentYear = Number(asOf.slice(0, 4));
  return Array.from({ length: Math.max(0, currentYear - ACTIVITY_START_YEAR + 1) }, (_, index) => currentYear - index);
}

export function validateActivity(input: unknown): ActivityData {
  const fail = (): never => { throw new Error('Invalid public activity snapshot.'); };
  if (!input || typeof input !== 'object') return fail();
  const raw = input as ActivityData;
  if (raw.version !== 1 || !raw.sources || typeof raw.sources !== 'object') return fail();
  const sources = {} as ActivityData['sources'];
  for (const source of SOURCES) {
    const snapshot = raw.sources[source];
    if (snapshot === null) { sources[source] = null; continue; }
    if (!snapshot || typeof snapshot.updatedAt !== 'string' || !Number.isFinite(Date.parse(snapshot.updatedAt))
      || snapshot.timezone !== TIMEZONES[source]
      || snapshot.metric !== (source === 'github' ? 'contributions' : 'tokens') || !Array.isArray(snapshot.days)) return fail();
    const seen = new Set<string>();
    const days = snapshot.days.map((day) => {
      if (!validDate(day.date) || !Number.isSafeInteger(day.value) || day.value < 0 || seen.has(day.date)) return fail();
      seen.add(day.date);
      return { date: day.date, value: day.value };
    }).sort((a, b) => a.date.localeCompare(b.date));
    // Reconstruct the allowlist; discard titles, paths, models, costs and identifiers.
    sources[source] = { updatedAt: snapshot.updatedAt, timezone: snapshot.timezone, metric: snapshot.metric, days };
  }
  return { version: 1, sources };
}

export function dateInShanghai(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
export function shiftDate(date: string, days: number): string {
  const result = new Date(`${date}T00:00:00Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

/** Keep whole weeks, distinguishing reported zeroes from unrecorded and future days. */
export function calendarDays(snapshot: ActivitySnapshot | null, year: number, asOf = dateInShanghai()) {
  if (!Number.isInteger(year) || year < 1000 || year > 9999) throw new Error('Invalid calendar year.');
  if (!validDate(asOf)) throw new Error('Invalid activity date.');
  const start = `${year}-01-01`;
  const end = `${year}-12-31`;
  const first = shiftDate(start, -((new Date(start).getUTCDay() + 6) % 7));
  const last = shiftDate(end, 6 - ((new Date(end).getUTCDay() + 6) % 7));
  const values = new Map(snapshot?.days.map((day) => [day.date, day.value]));
  const cells: CalendarCell[] = [];
  for (let date = first; date <= last; date = shiftDate(date, 1)) {
    const outside = date < start || date > end;
    cells.push(outside
      ? { date, value: null, state: 'outside' }
      : date > asOf ? { date, value: null, state: 'future' }
      : values.has(date) ? { date, value: values.get(date)!, state: 'known' }
      : { date, value: null, state: 'unknown' });
  }
  return { start, end, cells };
}

export function activityStats(snapshot: ActivitySnapshot | null, year: number, asOf: string) {
  const calendar = calendarDays(snapshot, year, asOf);
  const days = calendar.cells.filter((cell) => cell.state === 'known');
  const activeDays = days.filter((cell) => cell.value > 0);
  const total = days.reduce((sum, cell) => sum + cell.value, 0);
  const recentStart = shiftDate(asOf, -29);
  const recentDays = snapshot?.days.filter((day) => day.date >= recentStart && day.date <= asOf) ?? [];
  const recentActive = recentDays.filter((day) => day.value > 0).length;
  const peak = activeDays.reduce<(typeof activeDays)[number] | null>((best, day) => !best || day.value > best.value ? day : best, null);
  return { ...calendar, days, total, active: activeDays.length, recentStart, recentActive, recentRecorded: recentDays.length,
    average: activeDays.length ? total / activeDays.length : null, peak };
}

export const TOKEN_THRESHOLDS = [1_000_000, 50_000_000, 150_000_000] as const;
export const CONTRIBUTION_THRESHOLDS = [3, 10, 25] as const;
export function intensity(value: number | null, source: ActivitySource): number {
  if (value === null || value === 0) return 0;
  const thresholds = source === 'github' ? CONTRIBUTION_THRESHOLDS : TOKEN_THRESHOLDS;
  return 1 + thresholds.filter((threshold) => value >= threshold).length;
}

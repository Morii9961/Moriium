import { validDate, type ActivityDay, type ActivitySnapshot } from '../../src/lib/activity.ts';

/**
 * ccusage 20.0.20 focused daily JSON. Fail closed on incompatible report shapes.
 * Claude only: Codex now comes from its own server-side account activity, whose day
 * boundaries are not Asia/Shanghai and must never be summed into a ccusage series.
 */
export function importUsage(report: unknown, source: 'claude', updatedAt: string): ActivitySnapshot {
  if (source !== 'claude') throw new Error('Unsupported usage source.');
  if (!report || typeof report !== 'object' || !Array.isArray((report as { daily?: unknown }).daily)) throw new Error('Expected ccusage daily JSON.');
  const rows = (report as { daily: Record<string, unknown>[] }).daily;
  const dates = new Set<string>();
  const days: ActivityDay[] = rows.map((row) => {
    if (!validDate(row.date) || dates.has(row.date) || !Number.isSafeInteger(row.totalTokens) || Number(row.totalTokens) < 0) throw new Error('Invalid or repeated ccusage day.');
    // ccusage 20.0.20 normalizes both reports to non-cached input plus separate
    // cache fields. Reasoning output is already part of outputTokens.
    const keys = ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheCreationTokens'];
    if (keys.some((key) => !Number.isSafeInteger(row[key]) || Number(row[key]) < 0)) throw new Error('Invalid token components.');
    const total = keys.reduce((sum, key) => sum + Number(row[key]), 0);
    if (total !== row.totalTokens) throw new Error('Token totals do not match the pinned report contract.');
    dates.add(row.date);
    return { date: row.date, value: total };
  });
  return { updatedAt, timezone: 'Asia/Shanghai', metric: 'tokens', days };
}

export function importGitHub(report: unknown, updatedAt: string): ActivitySnapshot {
  const raw = report as { errors?: unknown; data?: { user?: { contributionsCollection?: { contributionCalendar?: { weeks?: { contributionDays: { date: string; contributionCount: number }[] }[] } } } } };
  const weeks = raw?.data?.user?.contributionsCollection?.contributionCalendar?.weeks;
  if (raw?.errors || !Array.isArray(weeks) || !weeks.length) throw new Error('GitHub returned no contribution calendar.');
  const days = weeks.flatMap((week) => week.contributionDays.map((day) => ({ date: day.date, value: day.contributionCount })));
  return { updatedAt, timezone: 'GitHub', metric: 'contributions', days };
}

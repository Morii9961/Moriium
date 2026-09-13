import { statusCopy } from '../data/status-copy';
import type { Language } from '../data/site';
import { validateManifest, emptyManifest, effectiveState, sourceState } from '../lib/status';
import { renderStatus, statusSummary, formatTime } from '../lib/status-markup';
import { validateActivity, SOURCES, activityYears, dateInShanghai, type ActivityData } from '../lib/activity';
import { renderActivityChart } from '../lib/activity-markup';
import { enhanceActivity } from './activity';

function refreshActivity(root: HTMLElement, data: ActivityData, lang: Language, today: string) {
  const charts = root.querySelector<HTMLElement>('[id="about-activity-charts"]');
  const select = root.querySelector<HTMLSelectElement>('[data-activity-year-select]');
  if (!charts || !select) return;
  const years = activityYears(today); const selectedYear = select.value;
  const open = new Set(Array.from(charts.querySelectorAll('details[open]')).map(d => `${d.closest<HTMLElement>('[data-source]')?.dataset.source}/${d.closest<HTMLElement>('[data-activity-year]')?.dataset.activityYear}`));
  const dates = new Map(Array.from(charts.querySelectorAll<HTMLInputElement>('[data-date-input]')).map(i => [i.id, i.value]));
  const focused = document.activeElement instanceof HTMLElement && charts.contains(document.activeElement) ? document.activeElement : null;
  const focusKey = focused ? { id: focused.id, source: focused.closest<HTMLElement>('[data-source]')?.dataset.source, year: focused.closest<HTMLElement>('[data-activity-year]')?.dataset.activityYear, kind: ['summary', '[data-activity-calendar]', '.activity-chart__table'].find(selector => focused.matches(selector)) ?? '' } : null;
  charts.innerHTML = SOURCES.map(source => renderActivityChart(source, data.sources[source], lang, today)).join('');
  select.replaceChildren(...years.map(year => { const option = document.createElement('option'); option.value = String(year); option.textContent = String(year); return option; }));
  select.value = years.includes(Number(selectedYear)) ? selectedYear : String(years[0]);
  charts.querySelectorAll<HTMLDetailsElement>('details').forEach(d => { d.open = open.has(`${d.closest<HTMLElement>('[data-source]')?.dataset.source}/${d.closest<HTMLElement>('[data-activity-year]')?.dataset.activityYear}`); });
  charts.querySelectorAll<HTMLInputElement>('[data-date-input]').forEach(i => { const value = dates.get(i.id); if (value && value >= i.min && value <= i.max) i.value = value; });
  enhanceActivity(root);
  if (focusKey) {
    const target = focusKey.id ? document.getElementById(focusKey.id) : focusKey.kind ? charts.querySelector<HTMLElement>(`[data-source="${focusKey.source}"] [data-activity-year="${focusKey.year}"] ${focusKey.kind}`) : null;
    target?.focus({ preventScroll: true });
  }
}

const root = document.querySelector<HTMLElement>('[data-status-root]');
if (root) {
  const lang = root.dataset.lang as Language;
  const c = statusCopy[lang];
  const list = root.querySelector<HTMLElement>('[data-status-list]')!;
  const summary = root.querySelector<HTMLElement>('[data-status-summary]')!;
  const note = root.querySelector<HTMLElement>('[data-status-note]')!;
  const live = root.querySelector<HTMLElement>('[data-status-live]')!;
  const activityRoot = document.querySelector<HTMLElement>('[data-activity-root]');
  let manifest = emptyManifest(); let activity: ActivityData | null = null;
  let hash = ''; let renderedDay = ''; let signature = ''; let html = list.innerHTML;
  let busy = false; let lastRun = 0; let loaded = false;
  const render = () => {
    const now = Date.now();
    const nextSignature = JSON.stringify([manifest.components.map(item => effectiveState(item, now)), manifest.activity ? SOURCES.map(id => sourceState(manifest.activity!.sources[id], now)) : []]);
    const nextHtml = renderStatus(manifest, lang, now);
    if (html !== nextHtml) {
      const opened = new Set(Array.from(list.querySelectorAll('details[open]')).map(d => d.closest<HTMLElement>('[data-status-id]')?.dataset.statusId));
      const focused = document.activeElement instanceof HTMLElement && list.contains(document.activeElement) ? document.activeElement : null;
      const focusId = focused?.closest<HTMLElement>('[data-status-id]')?.dataset.statusId;
      const href = focused?.getAttribute('href');
      const historyFocused = focused?.matches('.status-history-list');
      const historyScroll = focused?.scrollTop ?? 0;
      list.innerHTML = nextHtml; html = nextHtml;
      list.querySelectorAll<HTMLDetailsElement>('details').forEach(d => { d.open = opened.has(d.closest<HTMLElement>('[data-status-id]')?.dataset.statusId); });
      if (focusId) {
        const row = list.querySelector<HTMLElement>(`[data-status-id="${focusId}"]`);
        const target = href ? Array.from(row?.querySelectorAll<HTMLAnchorElement>('a') ?? []).find(a => a.getAttribute('href') === href) : row?.querySelector<HTMLElement>(historyFocused ? '.status-history-list' : 'summary');
        target?.focus({ preventScroll: true });
        if (target && historyFocused) target.scrollTop = historyScroll;
      }
    }
    summary.textContent = statusSummary(manifest, lang, now);
    if (signature && signature !== nextSignature) live.textContent = `${c.changed} ${summary.textContent}`;
    signature = nextSignature;
  };
  const json = async (url: string) => {
    const response = await fetch(url, { cache: 'no-cache', credentials: 'omit', signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error('Snapshot unavailable.');
    const text = await response.text();
    if (text.length > 4 * 1024 * 1024) throw new Error('Snapshot too large.');
    return { text, value: JSON.parse(text) as unknown };
  };
  const tick = async () => {
    render();
    if (document.hidden || busy || Date.now() - lastRun < 55_000) return;
    busy = true; lastRun = Date.now();
    try {
      const candidate = validateManifest((await json('/status-data/current.json')).value);
      if (Date.parse(candidate.generatedAt) > Date.now() + 300_000 || loaded && Date.parse(candidate.generatedAt) < Date.parse(manifest.generatedAt) || hash && !candidate.activity) throw new Error('Out-of-order snapshot.');
      let nextActivity = activity;
      if (candidate.activity && candidate.activity.hash !== hash) {
        const result = await json(candidate.activity.url);
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(result.text));
        const actualHash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
        if (actualHash !== candidate.activity.hash) throw new Error('Activity hash mismatch.');
        nextActivity = validateActivity(result.value);
        for (const id of SOURCES) if ((nextActivity.sources[id]?.updatedAt ?? null) !== candidate.activity.sources[id].succeededAt) throw new Error('Activity timestamp mismatch.');
      }
      const today = dateInShanghai();
      const changed = candidate.activity && (candidate.activity.hash !== hash || renderedDay !== today);
      if (changed && nextActivity && activityRoot) refreshActivity(activityRoot, nextActivity, lang, today);
      manifest = candidate; activity = nextActivity; hash = candidate.activity?.hash ?? ''; renderedDay = today; loaded = true;
      note.textContent = `${c.updated} · ${formatTime(manifest.generatedAt, lang)}`;
      const freshness = activityRoot?.querySelector<HTMLElement>('[data-activity-freshness]');
      if (freshness && manifest.activity) freshness.textContent = `${c.published} · ${formatTime(manifest.activity.publishedAt, lang)}`;
      render();
      if (changed) live.textContent = c.activityChanged;
    } catch {
      note.textContent = c.unavailable;
      const freshness = activityRoot?.querySelector<HTMLElement>('[data-activity-freshness]');
      if (freshness) freshness.textContent = c.unavailable;
      render();
    } finally { busy = false; }
  };
  void tick();
  window.setInterval(() => { void tick(); }, 60_000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { lastRun = 0; void tick(); } });
  window.addEventListener('pageshow', () => { lastRun = 0; void tick(); });
}

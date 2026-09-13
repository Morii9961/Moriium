import type { Language } from '../data/site.ts';
import { statusCopy } from '../data/status-copy.ts';
import { effectiveState, sourceState, emptyHistory, HISTORY_DAYS, type StatusManifest } from './status.ts';
import { SOURCES, dateInShanghai } from './activity.ts';

export const escapeHtml = (value: string | number) => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
export const localeFor = (lang: Language) => ({ zh: 'zh-CN', ja: 'ja-JP', en: 'en-US' })[lang];
export function formatTime(value: string | null, lang: Language): string {
  if (!value) return '—';
  return `${new Intl.DateTimeFormat(localeFor(lang), { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value))} UTC+8`;
}
export function statusSummary(manifest: StatusManifest, lang: Language, now: number) {
  const c = statusCopy[lang];
  const states = manifest.components.map(item => effectiveState(item, now)).filter(s => s !== 'unconfigured');
  return !states.length || states.every(s => s === 'unknown') ? c.none : states.every(s => ['operational', 'waiting', 'running', 'paused'].includes(s)) ? c.healthy : c.attention;
}
export function renderStatus(manifest: StatusManifest, lang: Language, now: number): string {
  const c = statusCopy[lang]; const e = escapeHtml;
  return manifest.components.map(item => {
    const state = effectiveState(item, now);
    const days = emptyHistory(now).map(empty => item.history.find(day => day.date === empty.date) ?? empty).map(day => {
      // A returned but expired manifest is still an old observation.
      const kind = state !== 'unconfigured' && Date.parse(manifest.validUntil) < now && day.date >= dateInShanghai(new Date(manifest.generatedAt)) ? (day.state === 'incident' ? 'incident' : 'incomplete') : day.state;
      return { date: day.date, state: kind };
    });
    const history = days.map(day => `<span class="status-day" data-kind="${day.state}" title="${day.date} · ${e(c.days[day.state])}" aria-label="${day.date} · ${e(c.days[day.state])}" role="listitem"></span>`).join('');
    const events = item.events.length ? `<ol class="status-events">${item.events.toReversed().map(event => `<li><time datetime="${event.at}">${e(formatTime(event.at, lang))}</time> ${event.state === 'down' ? c.detected : c.recovered}</li>`).join('')}</ol>` : `<p>${c.noEvents}</p>`;
    const sources = item.id === 'activity' ? `<ul class="status-sources">${SOURCES.map(id => {
      const source = manifest.activity?.sources[id];
      return `<li><a href="#activity-${id}-title">${{ github: 'GitHub', codex: 'Codex', claude: 'Claude Code' }[id]}</a><span>${c.states[source ? sourceState(source, now) : 'unconfigured']}</span><small>${c.collected} · ${e(formatTime(source?.succeededAt ?? null, lang))}<br>${source ? c[source.result === 'success' ? 'success' : source.result === 'failed' ? 'failed' : 'unknown'] : c.unknown}</small></li>`;
    }).join('')}</ul>${manifest.activity ? `<p>${c.published} · ${e(formatTime(manifest.activity.publishedAt, lang))}</p>` : ''}` : '';
    return `<li class="status-item" data-status-id="${item.id}"><details><summary><span class="status-name">${c.names[item.id]}</span><span class="status-state" data-state="${state}"><i aria-hidden="true"></i>${c.states[state]}</span><span class="status-timeline"><span class="status-strip" style="--status-history-days:${HISTORY_DAYS}" role="list" aria-label="${e(c.history)}">${history}</span><span class="status-range"><time datetime="${days[0]!.date}">${days[0]!.date}</time><span>${c.history}</span><time datetime="${days.at(-1)!.date}">${days.at(-1)!.date}</time></span></span><span class="status-time">${c.updated} · ${e(formatTime(item.observedAt, lang))}</span><span class="status-disclosure">${c.details} <span aria-hidden="true">⌄</span></span></summary><div class="status-detail">${item.id === 'runtime' && state === 'unconfigured' ? `<p>${c.runtime}</p>` : ''}${sources}${events}<ul class="status-history-list" tabindex="0" aria-label="${c.history}">${days.toReversed().map(day => `<li>${day.date} · ${c.days[day.state]}</li>`).join('')}</ul></div></details></li>`;
  }).join('');
}

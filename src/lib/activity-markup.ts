import type { Language } from '../data/site.ts';
import { activityCopy } from '../data/activity-copy.ts';
import { activityStats, activityYears, intensity, TOKEN_THRESHOLDS, type ActivitySnapshot, type ActivitySource, type CalendarCell } from './activity.ts';
import { escapeHtml as e, formatTime, localeFor } from './status-markup.ts';

/** Shared build/browser renderer. Only escaped labels and validated aggregates enter HTML. */
export function renderActivityChart(source: ActivitySource, snapshot: ActivitySnapshot | null, lang: Language, asOf: string): string {
  const c = activityCopy[lang]; const locale = localeFor(lang);
  const number = new Intl.NumberFormat(locale);
  const compact = new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 });
  const month = new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' });
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'narrow', timeZone: 'UTC' });
  const title = { github: 'GitHub', codex: 'Codex', claude: 'Claude Code' }[source];
  const id = `activity-${source}`;
  const unit = source === 'github' ? c.contributions : c.tokens;
  const labels = source === 'github' ? ['1–2', '3–9', '10–24', '≥25'] : [`1–<${compact.format(TOKEN_THRESHOLDS[0])}`, `${compact.format(TOKEN_THRESHOLDS[0])}–<${compact.format(TOKEN_THRESHOLDS[1])}`, `${compact.format(TOKEN_THRESHOLDS[1])}–<${compact.format(TOKEN_THRESHOLDS[2])}`, `≥${compact.format(TOKEN_THRESHOLDS[2])}`];
  const label = (cell: CalendarCell) => `${cell.date} · ${number.format(cell.value ?? 0)} ${unit}`;
  const years = activityYears(asOf).map(year => {
    const stats = activityStats(snapshot, year, asOf);
    const { cells, start, end, days, total, active, recentStart, recentActive, average, peak } = stats;
    const split = Math.ceil(cells.length / 7 / 2) * 7;
    const parts = [cells.slice(0, split), cells.slice(split)];
    const selectable = cells.filter(cell => cell.state === 'known');
    const selectionEnd = selectable.at(-1)?.date ?? start;
    const current = year === Number(asOf.slice(0, 4));
    const yearId = `${id}-${year}`;
    const calendar = parts.map((part, partIndex) => {
      const months = Array.from({ length: part.length / 7 }, (_, week) => {
        const firstOfMonth = part.slice(week * 7, week * 7 + 7).find(cell => cell.date.startsWith(`${year}-`) && cell.date.endsWith('-01'));
        const day = firstOfMonth ?? (week === 0 ? part[0] : undefined);
        return day ? `<span class="${partIndex > 0 && week === 0 && !firstOfMonth ? 'activity-calendar__continued-month' : ''} ${partIndex === 0 && week === part.length / 7 - 1 ? 'activity-calendar__edge-month' : ''}" style="grid-column:${week + 1}">${e(month.format(new Date(day.date)))}</span>` : '';
      }).join('');
      const weekdays = Array.from({ length: 7 }, (_, day) => `<span>${day % 2 === 0 && day < 5 ? e(weekday.format(new Date(`2026-09-${String(7 + day).padStart(2, '0')}T00:00:00Z`))) : ''}</span>`).join('');
      const squares = part.map(cell => `<span class="activity-cell activity-cell--${cell.state}${cell.state === 'outside' && cell.date > end && end > asOf ? ' activity-cell--future' : ''}" data-level="${intensity(cell.value, source)}"${cell.state === 'known' ? ` data-date="${cell.date}" data-label="${e(label(cell))}" title="${e(label(cell))}"` : ''}></span>`).join('');
      return `<div class="activity-calendar__part" style="--weeks:${part.length / 7}"><div class="activity-calendar__months" aria-hidden="true">${months}</div><div class="activity-calendar__weekdays" aria-hidden="true">${weekdays}</div><div class="activity-calendar__cells" aria-hidden="true">${squares}</div></div>`;
    }).join('');
    return `<section class="activity-chart__year" data-activity-year="${year}" aria-labelledby="${yearId}-title"><header class="activity-chart__year-heading"><h4 id="${yearId}-title">${year}</h4><p><span aria-label="${e(c.total)}: ${e(number.format(total))} ${e(unit)}" title="${e(number.format(total))} ${e(unit)}">${e(compact.format(total))} <small>${unit}</small></span><span>${active} <small>${c.active}</small></span>${current ? `<span title="${recentStart} – ${asOf}">${recentActive} <small>${c.recent}</small></span>` : ''}</p></header>
      <div class="activity-calendar" data-activity-calendar role="group" aria-label="${title} · ${c.range} ${start} – ${end}" aria-describedby="${yearId}-hint">${calendar}</div>
      <div class="activity-chart__legend" aria-label="${title} · ${unit}"><span><i class="activity-cell" data-level="0"></i>0</span>${labels.map((text, index) => `<span><i class="activity-cell" data-level="${index + 1}"></i>${e(text)}</span>`).join('')}</div>
      <output class="activity-chart__readout" for="${yearId}-date" data-output aria-live="off" aria-atomic="true" hidden data-interaction>${c.initial}</output>
      <footer class="activity-chart__footer"><p>${c.updated} · ${snapshot ? `<time datetime="${snapshot.updatedAt}">${e(formatTime(snapshot.updatedAt, lang))}</time>` : '—'}</p><details><summary>${c.details}</summary>
      <dl class="activity-chart__statistics" aria-label="${c.statistics}"><div><dt>${c.average}</dt><dd>${average === null ? '—' : `${e(compact.format(average))} ${unit}`}</dd></div><div><dt>${c.peak}</dt><dd>${peak ? `${e(number.format(peak.value))} ${unit} · ${peak.date}` : '—'}</dd></div></dl>
      <p class="activity-chart__method">${c.method}</p>${current ? `<p class="activity-chart__method">${c.recent}: ${recentStart} – ${asOf} · ${c.asOf} ${asOf} UTC+8</p>` : ''}
      <div class="activity-chart__interaction" hidden data-interaction><label for="${yearId}-date">${c.date}<input id="${yearId}-date" type="date" min="${start}" max="${selectionEnd}" data-date-input /></label></div>
      <p id="${yearId}-hint" class="activity-chart__hint" hidden data-interaction>${c.hint}</p><div class="activity-chart__table" tabindex="0" role="region" aria-label="${title} · ${year} · ${c.details}"><table><caption>${title} · ${start} – ${end}</caption><thead><tr><th scope="col">${c.date}</th><th scope="col">${unit}</th></tr></thead><tbody>${days.toReversed().map(cell => `<tr><th scope="row"><time datetime="${cell.date}">${cell.date}</time></th><td>${e(number.format(cell.value))}</td></tr>`).join('')}</tbody></table></div></details></footer></section>`;
  }).join('');
  return `<article class="activity-chart" data-activity-chart data-source="${source}" aria-labelledby="${id}-title"><header class="activity-chart__heading"><h3 id="${id}-title"><span class="activity-chart__mark" aria-hidden="true"></span>${title}</h3></header>${years}</article>`;
}

// Astro bundles this module only on pages that render ActivityHeatmap.
// https://docs.astro.build/en/guides/client-side-scripts/
const enhanceCalendar = (calendar: HTMLElement) => {
  const panel = calendar.closest<HTMLElement>('[data-activity-year]');
  const input = panel?.querySelector<HTMLInputElement>('[data-date-input]');
  const output = panel?.querySelector<HTMLOutputElement>('[data-output]');
  const cells = Array.from(calendar.querySelectorAll<HTMLElement>('[data-date]'));
  if (!panel || !input || !output || !cells.length) return;

  let selected = Math.max(0, cells.findIndex((cell) => cell.dataset.date === input.value));
  const show = (index: number, announce = true) => {
    selected = Math.max(0, Math.min(cells.length - 1, index));
    const cell = cells[selected]!;
    for (const item of cells) item.classList.toggle('is-selected', item === cell);
    input.value = cell.dataset.date!;
    output.setAttribute('aria-live', announce ? 'polite' : 'off');
    output.textContent = cell.dataset.label ?? '';
  };

  panel.querySelectorAll<HTMLElement>('[data-interaction]').forEach((item) => { item.hidden = false; });
  calendar.tabIndex = 0;
  calendar.addEventListener('keydown', (event) => {
    const offset: Record<string, number> = { ArrowUp: -1, ArrowDown: 1, ArrowLeft: -7, ArrowRight: 7 };
    if (event.key in offset) { event.preventDefault(); show(selected + offset[event.key]!); }
    else if (event.key === 'Home' || event.key === 'End') { event.preventDefault(); show(event.key === 'Home' ? 0 : cells.length - 1); }
  });
  calendar.addEventListener('focus', () => show(selected));
  const selectTarget = (event: Event, announce: boolean) => {
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-date]') : null;
    if (target && cells.includes(target)) show(cells.indexOf(target), announce);
  };
  calendar.addEventListener('pointerover', (event) => { if (event.pointerType === 'mouse') selectTarget(event, false); });
  calendar.addEventListener('click', (event) => selectTarget(event, true));
  input.addEventListener('change', () => {
    const index = cells.findIndex((cell) => cell.dataset.date === input.value);
    if (index >= 0) show(index);
  });
};

for (const root of document.querySelectorAll<HTMLElement>('[data-activity-root]')) {
  const yearControl = root.querySelector<HTMLElement>('[data-activity-year-control]');
  const yearSelect = root.querySelector<HTMLSelectElement>('[data-activity-year-select]');
  const yearPanels = Array.from(root.querySelectorAll<HTMLElement>('[data-activity-year]'));
  if (yearControl && yearSelect && yearPanels.length) {
    const showYear = () => {
      for (const panel of yearPanels) panel.hidden = panel.dataset.activityYear !== yearSelect.value;
    };
    yearControl.hidden = false;
    yearSelect.addEventListener('change', showYear);
    showYear();
  }
  root.querySelectorAll<HTMLElement>('[data-activity-calendar]').forEach(enhanceCalendar);
}

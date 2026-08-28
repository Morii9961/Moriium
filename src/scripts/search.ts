type SearchRecord = {
  title: string;
  summary: string;
  category: string;
  tags: string[];
  date: string;
  url: string;
};

type SearchState = {
  records: SearchRecord[] | null;
  trigger: HTMLElement | null;
  status: 'idle' | 'loading' | 'ready' | 'error';
  render: () => void;
};

const indexCache = new Map<string, Promise<SearchRecord[]>>();
const dialogStates = new WeakMap<HTMLDialogElement, SearchState>();

function normalized(value: string, locale: string) {
  return value.normalize('NFKC').toLocaleLowerCase(locale);
}

export function filterRecords(records: SearchRecord[], query: string, locale: string) {
  const needle = normalized(query.trim(), locale);
  if (!needle) return [];

  return records.filter((record) =>
    normalized([record.title, record.summary, record.category, ...record.tags].join(' '), locale).includes(needle));
}

function loadIndex(path: string) {
  const cached = indexCache.get(path);
  if (cached) return cached;

  const request = fetch(path, { headers: { Accept: 'application/json' } })
    .then(async (response) => {
      if (!response.ok) throw new Error(`Search index returned ${response.status}`);
      return response.json() as Promise<SearchRecord[]>;
    })
    .catch((error) => {
      indexCache.delete(path);
      throw error;
    });
  indexCache.set(path, request);
  return request;
}

function createResult(record: SearchRecord) {
  const item = document.createElement('li');
  const link = document.createElement('a');
  const category = document.createElement('span');
  const title = document.createElement('strong');
  const date = document.createElement('time');

  link.href = record.url;
  category.textContent = record.category;
  title.textContent = record.title;
  date.textContent = record.date;
  link.append(category, title, date);
  item.append(link);
  return item;
}

function bindDialog(dialog: HTMLDialogElement, state: SearchState) {
  const input = dialog.querySelector<HTMLInputElement>('[data-search-input]');
  const close = dialog.querySelector<HTMLButtonElement>('[data-search-close]');
  const results = dialog.querySelector<HTMLOListElement>('[data-search-results]');
  const summary = dialog.querySelector<HTMLElement>('[data-search-summary]');
  const empty = dialog.querySelector<HTMLElement>('[data-search-empty]');
  const locale = dialog.dataset.searchLocale ?? 'en-US';

  if (!input || !close || !results || !summary || !empty) return () => {};

  const render = () => {
    results.replaceChildren();
    if (state.status === 'loading' || state.status === 'error') {
      summary.textContent = state.status === 'loading'
        ? dialog.dataset.searchLoading ?? ''
        : dialog.dataset.searchError ?? '';
      empty.hidden = true;
      return;
    }

    const query = input.value.trim();
    if (!query) {
      summary.textContent = dialog.dataset.searchIdle ?? '';
      empty.hidden = true;
      return;
    }

    const matches = filterRecords(state.records ?? [], query, locale);
    results.append(...matches.map(createResult));
    summary.textContent = `${dialog.dataset.searchResultPrefix ?? ''}${matches.length}${dialog.dataset.searchResultSuffix ?? ''}`;
    empty.hidden = matches.length > 0;
  };

  input.addEventListener('input', render);
  input.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowDown') return;
    const firstResult = results.querySelector<HTMLAnchorElement>('a');
    if (!firstResult) return;
    event.preventDefault();
    firstResult.focus();
  });
  results.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const links = [...results.querySelectorAll<HTMLAnchorElement>('a')];
    const current = links.indexOf(document.activeElement as HTMLAnchorElement);
    if (current < 0) return;
    event.preventDefault();
    const next = event.key === 'ArrowDown' ? current + 1 : current - 1;
    (links[next] ?? (next < 0 ? input : links[0]))?.focus();
  });
  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener('close', () => {
    input.value = '';
    results.replaceChildren();
    summary.textContent = dialog.dataset.searchIdle ?? '';
    empty.hidden = true;
    state.trigger?.focus();
  });

  return render;
}

export async function openSearch(dialog: HTMLDialogElement, trigger: HTMLElement | null = null) {
  let state = dialogStates.get(dialog);
  if (!state) {
    state = { records: null, trigger, status: 'idle', render: () => {} };
    dialogStates.set(dialog, state);
    state.render = bindDialog(dialog, state);
  } else {
    state.trigger = trigger;
  }

  if (!dialog.open) dialog.showModal();
  const input = dialog.querySelector<HTMLInputElement>('[data-search-input]');
  requestAnimationFrame(() => input?.focus());

  if (state.records) return;
  const indexPath = dialog.dataset.searchIndex;
  if (!indexPath) throw new Error('Search dialog is missing its index path.');
  state.status = 'loading';
  state.render();

  try {
    state.records = await loadIndex(indexPath);
    state.status = 'ready';
    state.render();
  } catch (error) {
    console.error('Unable to load Moriium search index.', error);
    state.status = 'error';
    state.render();
  }
}

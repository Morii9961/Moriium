// Site search, as a field that opens in place.
//
// It used to be a modal dialog. The surface is now the header itself: the icon
// keeps its position, the field unfurls beside it, and results drop into a
// panel under it. What has not changed is the part the reader pays for -- the
// index is fetched the first time the field opens, never on page load, and the
// module that does the fetching is imported at the same moment.

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
  close: (moveFocus: boolean) => void;
};

const indexCache = new Map<string, Promise<SearchRecord[]>>();
const surfaceStates = new WeakMap<HTMLElement, SearchState>();

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

/** Whether the field is open, said in the three places that have to agree. */
function setOpen(surface: HTMLElement, open: boolean) {
  surface.dataset.searchState = open ? 'open' : 'closed';
  surface.querySelector('[data-search-open]')?.setAttribute('aria-expanded', String(open));
  // Closing hides the panel outright; opening leaves it to render(), which
  // knows whether there is anything to show yet.
  const panel = surface.querySelector<HTMLElement>('[data-search-panel]');
  if (panel && !open) panel.hidden = true;
}

function bindSurface(surface: HTMLElement, state: SearchState) {
  const input = surface.querySelector<HTMLInputElement>('[data-search-input]');
  const toggle = surface.querySelector<HTMLButtonElement>('[data-search-open]');
  const results = surface.querySelector<HTMLOListElement>('[data-search-results]');
  const summary = surface.querySelector<HTMLElement>('[data-search-summary]');
  const empty = surface.querySelector<HTMLElement>('[data-search-empty]');
  const locale = surface.dataset.searchLocale ?? 'en-US';

  if (!input || !toggle || !results || !summary || !empty) {
    return { render: () => {}, close: () => {} };
  }

  const render = () => {
    results.replaceChildren();
    // The panel only exists when it has something in it. The idle copy is empty
    // in some languages, and an empty box under the header says nothing while
    // still covering the page.
    const panel = surface.querySelector<HTMLElement>('[data-search-panel]');
    if (panel) {
      const speaks = state.status === 'loading' || state.status === 'error' || input.value.trim().length > 0;
      panel.hidden = surface.dataset.searchState !== 'open' || !speaks;
    }
    if (state.status === 'loading' || state.status === 'error') {
      summary.textContent = state.status === 'loading'
        ? surface.dataset.searchLoading ?? ''
        : surface.dataset.searchError ?? '';
      empty.hidden = true;
      return;
    }

    const query = input.value.trim();
    if (!query) {
      summary.textContent = surface.dataset.searchIdle ?? '';
      empty.hidden = true;
      return;
    }

    const matches = filterRecords(state.records ?? [], query, locale);
    results.append(...matches.map(createResult));
    summary.textContent = `${surface.dataset.searchResultPrefix ?? ''}${matches.length}${surface.dataset.searchResultSuffix ?? ''}`;
    empty.hidden = matches.length > 0;
  };

  const close = (moveFocus: boolean) => {
    if (surface.dataset.searchState !== 'open') return;
    input.value = '';
    setOpen(surface, false);
    render();
    if (moveFocus) (state.trigger ?? toggle).focus();
  };

  input.addEventListener('input', render);

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close(true);
      return;
    }
    if (event.key !== 'ArrowDown') return;
    const firstResult = results.querySelector<HTMLAnchorElement>('a');
    if (!firstResult) return;
    event.preventDefault();
    firstResult.focus();
  });

  // An empty field left behind folds away, the way the writing index's does. A
  // field with something in it stays, because its results are still on screen.
  input.addEventListener('blur', (event) => {
    if (input.value) return;
    const next = event.relatedTarget;
    if (next instanceof Node && surface.contains(next)) return;
    close(false);
  });

  results.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close(true);
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const links = [...results.querySelectorAll<HTMLAnchorElement>('a')];
    const current = links.indexOf(document.activeElement as HTMLAnchorElement);
    if (current < 0) return;
    event.preventDefault();
    const next = event.key === 'ArrowDown' ? current + 1 : current - 1;
    (links[next] ?? (next < 0 ? input : links[0]))?.focus();
  });

  document.addEventListener('click', (event) => {
    const target = event.target;
    if (target instanceof Node && surface.contains(target)) return;
    close(false);
  });

  return { render, close };
}

export async function openSearch(surface: HTMLElement, trigger: HTMLElement | null = null) {
  let state = surfaceStates.get(surface);
  if (!state) {
    state = { records: null, trigger, status: 'idle', render: () => {}, close: () => {} };
    surfaceStates.set(surface, state);
    const bound = bindSurface(surface, state);
    state.render = bound.render;
    state.close = bound.close;
  } else {
    state.trigger = trigger;
  }

  setOpen(surface, true);
  state.render();
  const input = surface.querySelector<HTMLInputElement>('[data-search-input]');
  requestAnimationFrame(() => input?.focus());

  if (state.records) return;
  const indexPath = surface.dataset.searchIndex;
  if (!indexPath) throw new Error('Search surface is missing its index path.');
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

export function closeSearch(surface: HTMLElement, moveFocus = true) {
  surfaceStates.get(surface)?.close(moveFocus);
}

/**
 * What the icon does.
 *
 * The icon is one control with two directions, and only one place may decide
 * which: when the layout opened it and the module closed it, a single click ran
 * both and the field opened and shut again in the same gesture.
 */
export async function toggleSearch(surface: HTMLElement, trigger: HTMLElement | null = null) {
  if (surface.dataset.searchState === 'open') {
    closeSearch(surface, true);
    return;
  }
  await openSearch(surface, trigger);
}

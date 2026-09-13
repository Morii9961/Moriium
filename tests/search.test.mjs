import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

async function read(relativePath) {
  return readFile(new URL(relativePath, root), 'utf8');
}

test('search index is generated per language from listed public metadata', async () => {
  const endpoint = await read('src/pages/search/[lang].json.ts');

  assert.match(endpoint, /SITE\.languages\.map/);
  assert.match(endpoint, /getListedPosts\(lang\)/);
  assert.match(endpoint, /title:\s*post\.data\.title/);
  assert.match(endpoint, /summary:\s*post\.data\.summary/);
  assert.match(endpoint, /category:\s*post\.data\.category/);
  assert.match(endpoint, /tags:\s*post\.data\.tags/);
  assert.match(endpoint, /url:\s*postPath\(post\)/);
  assert.doesNotMatch(endpoint, /render\(|body:|password|ciphertext|content:/);
});

test('the production shell opens search in place and still fetches the index only then', async () => {
  const [layout, script, styles] = await Promise.all([
    read('src/layouts/BaseLayout.astro'),
    read('src/scripts/search.ts'),
    read('src/styles/public.css'),
  ]);

  for (const marker of ['data-search-surface', 'data-search-open', 'data-search-input', 'data-search-panel', 'data-search-results', 'data-search-summary']) {
    assert.match(layout, new RegExp(marker));
  }

  // The modal is gone: the field and its results belong to the header now.
  assert.doesNotMatch(layout, /<dialog/);
  assert.doesNotMatch(script, /showModal/);

  // The part a reader pays for has not changed. The index is fetched the first
  // time the field opens, and the module that fetches it is imported then too.
  assert.match(layout, /import\('\.\.\/scripts\/search'\)/);
  assert.doesNotMatch(layout, /^import .*scripts\/search/m);
  assert.match(script, /fetch\(path/);
  assert.match(layout, /event\.ctrlKey && !event\.metaKey/);

  // Open and closed are stated everywhere that has to agree, and closing hands
  // focus back to the control that opened it.
  assert.match(script, /surface\.dataset\.searchState = open \? 'open' : 'closed'/);
  assert.match(script, /setAttribute\('aria-expanded', String\(open\)\)/);
  // The panel is shown only while open and only once it has something to say:
  // an empty box under the header covers the page and says nothing.
  assert.match(script, /panel\.hidden = surface\.dataset\.searchState !== 'open' \|\| !speaks/);
  assert.match(script, /\(state\.trigger \?\? toggle\)\.focus\(\)/);
  assert.match(script, /event\.key === 'ArrowDown'/);

  // The field unfurls rather than appearing: it lies in the actions grid from
  // its own column to the end, over the two controls, and opens by clip.
  assert.match(styles, /\.site-actions\s*{[^}]*display:\s*grid;[^}]*justify-content:\s*end/s);
  assert.match(styles, /\.site-search__input\s*{[^}]*grid-column:\s*3 \/ -1;[^}]*clip-path:\s*inset\(0 100% 0 0\)/s);
  assert.match(styles, /\[data-search-state='open'\] \.site-search__input\s*{[^}]*clip-path:\s*inset\(0\)/s);

  // The results panel is the one the filter and the calendar pickers use.
  assert.match(styles, /\.a-writing-filter__menu,\s*\.aperture-calendar__picker-menu,\s*\.site-search__panel\s*{/);
  assert.match(styles, /\.site-search__results a:focus-visible strong/);

  // Language and appearance are always in the header. They were once hidden
  // outright by mistake; they step aside only while the field is open.
  assert.doesNotMatch(layout, /<nav class="language-nav"[^>]*hidden>/);
  assert.doesNotMatch(layout, /<button class="theme-toggle"[^>]*hidden>/);
  assert.match(
    styles,
    /\.site-actions:has\(\.site-search\[data-search-state='open'\]\) > :is\(\.language-nav, \.theme-toggle\)\s*{[^}]*visibility:\s*hidden/s,
  );
});

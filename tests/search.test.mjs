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

  // The field unfurls rather than appearing, and the row is packed to the start
  // so that it grows to the right rather than pushing the icon leftwards.
  assert.match(styles, /\.site-actions\s*{[^}]*justify-content:\s*flex-start/s);
  assert.match(styles, /\.site-search__input\s*{[^}]*flex:\s*0 0 0[^}]*transition:\s*flex-basis/s);
  assert.match(styles, /\[data-search-state='open'\] \.site-search__input\s*{[^}]*flex-basis:/s);

  // The results panel is the one the filter and the calendar pickers use.
  assert.match(styles, /\.a-writing-filter__menu,\s*\.aperture-calendar__picker-menu,\s*\.site-search__panel\s*{/);
  assert.match(styles, /\.site-search__results a:focus-visible strong/);

  // Folded away for now, deliberately: language stays reachable in the footer,
  // and the appearance script keeps working on the hidden control.
  assert.match(layout, /<nav class="language-nav"[\s\S]*?hidden>/);
  assert.match(layout, /<button class="theme-toggle"[^>]*hidden>/);
  // The attribute alone did not hide them: their own display values outrank the
  // UA [hidden] rule, and both stayed on screen until this was added.
  assert.match(styles, /\.language-nav\[hidden\],\s*\.public-site \.theme-toggle\[hidden\]\s*{\s*display:\s*none;/);
});

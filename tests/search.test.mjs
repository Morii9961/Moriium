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

test('production shell lazily opens an accessible native search dialog', async () => {
  const [layout, dialog, script, styles] = await Promise.all([
    read('src/layouts/BaseLayout.astro'),
    read('src/components/SearchDialog.astro'),
    read('src/scripts/search.ts'),
    read('src/styles/content.css'),
  ]);

  // The trigger lives in the masthead, the markup in its own component, and the
  // index and the module that reads it are fetched only on first open.
  assert.match(layout, /data-search-open/);
  for (const marker of ['data-search-dialog', 'data-search-input', 'data-search-results', 'data-search-summary']) {
    assert.match(dialog, new RegExp(marker));
  }
  assert.match(dialog, /<dialog/);
  assert.match(dialog, /data-search-index=\{`\/search\/\$\{lang\}\.json`\}/);
  assert.match(layout, /import\('\.\.\/scripts\/search'\)/);
  assert.doesNotMatch(layout, /^import .*scripts\/search/m);
  assert.match(layout, /event\.ctrlKey && !event\.metaKey/);

  assert.match(script, /fetch\(path/);
  assert.match(script, /dialog\.showModal\(\)/);
  assert.match(script, /event\.key === 'ArrowDown'/);
  assert.match(script, /state\.trigger\?\.focus\(\)/);
  assert.match(styles, /\.search-panel::backdrop/);
  assert.match(styles, /\.search-panel__results a:hover strong,\s*\.search-panel__results a:focus-visible strong/);
});

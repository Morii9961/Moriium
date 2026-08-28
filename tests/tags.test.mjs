import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

async function read(relativePath) {
  return readFile(new URL(relativePath, root), 'utf8');
}

test('production tag directory uses A layout with frequency-ranked taxonomy data', async () => {
  const tags = await read('src/pages/[lang]/tags/index.astro');

  assert.match(tags, /bodyClass="concept-a"/);
  assert.match(tags, /import type \{ GetStaticPaths \} from 'astro'/);
  assert.match(tags, /getListedPosts\(lang\)/);
  assert.match(tags, /uniqueTaxonomy\(posts, 'tags'\)/);
  assert.match(tags, /\.sort\(\(a, b\) => b\.count - a\.count/);
  assert.match(tags, /tagEntries\.map/);
  assert.match(tags, /href=\{`\/\$\{lang\}\/tags\/\$\{encodeURIComponent\(name\)\}\/`\}/);
  assert.match(tags, /style=\{`--tag-rank: \$\{index\}`\}/);
  assert.match(tags, /aria-label=\{c\.label\(name, count\)\}/);
  assert.doesNotMatch(tags, /taxonomy-grid|site-shell page-heading|client:/);
});

test('production tag directory has localized empty states and responsive A styles', async () => {
  const [tags, styles] = await Promise.all([
    read('src/pages/[lang]/tags/index.astro'),
    read('src/styles/prototypes.css'),
  ]);

  assert.match(tags, /tagEntries\.length > 0/);
  for (const text of ['还没有标签', 'タグはまだありません', 'No tags yet']) {
    assert.match(tags, new RegExp(text));
  }
  assert.match(tags, /a-tag-field--quiet/);
  assert.match(styles, /\.concept-a \.a-tag-field--quiet\s*\{[^}]*border-top:[^}]*border-bottom:/s);
  assert.match(styles, /@media \(max-width: 64rem\)[\s\S]*\.concept-a \.a-tag-field\s*\{[^}]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/s);
  assert.match(styles, /@media \(max-width: 46rem\)[\s\S]*\.concept-a \.a-tag-field\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/s);
  assert.match(styles, /\.a-tag-field a:focus-visible/);
});

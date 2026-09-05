import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

async function read(relativePath) {
  return readFile(new URL(relativePath, root), 'utf8');
}

test('production tag directory uses the public editorial layout with frequency-ranked taxonomy data', async () => {
  const tags = await read('src/pages/[lang]/tags/index.astro');

  assert.doesNotMatch(tags, /bodyClass=|prototypes\.css/);
  assert.match(tags, /import type \{ GetStaticPaths \} from 'astro'/);
  assert.match(tags, /getListedPosts\(lang\)/);
  assert.match(tags, /uniqueTaxonomy\(posts, 'tags'\)/);
  assert.match(tags, /\.sort\(\(a, b\) => b\.count - a\.count/);
  assert.match(tags, /tagEntries\.map/);
  assert.match(tags, /href=\{`\/\$\{lang\}\/tags\/\$\{encodeURIComponent\(name\)\}\/`\}/);
  assert.doesNotMatch(tags, /--tag-rank/);
  assert.match(tags, /aria-label=\{c\.label\(name, count\)\}/);
  assert.doesNotMatch(tags, /taxonomy-grid|site-shell page-heading|client:/);
});

test('production tag directory has localized empty states and responsive public styles', async () => {
  const [tags, styles] = await Promise.all([
    read('src/pages/[lang]/tags/index.astro'),
    read('src/styles/public.css'),
  ]);

  assert.match(tags, /tagEntries\.length > 0/);
  for (const text of ['还没有标签', 'タグはまだありません', 'No tags yet']) {
    assert.match(tags, new RegExp(text));
  }
  assert.match(tags, /a-tag-field--quiet/);
  assert.match(styles, /\.a-tag-field\s*\{[^}]*display:\s*flex[^}]*flex-direction:\s*column/s);
  assert.match(styles, /\.a-tag-field > a\s*\{[^}]*min-height:\s*7rem[^}]*padding-inline:\s*1\.25rem/s);
  assert.doesNotMatch(styles, /--tag-rank/);
  assert.match(styles, /\.a-tag-field > a small\s*\{[^}]*color:\s*var\(--ink-muted\)[^}]*font-size:\s*0\.7rem/s);
  assert.match(styles, /@media \(max-width: 48rem\)[\s\S]*\.a-tag-field > a\s*\{[^}]*min-height:\s*6rem[^}]*padding-inline:\s*0\.6rem/s);
  assert.match(styles, /\.a-tag-field > a:focus-visible/);
});

test('production tag detail uses the shared localized taxonomy article list', async () => {
  const [tag, list] = await Promise.all([
    read('src/pages/[lang]/tags/[tag].astro'),
    read('src/components/TaxonomyPostList.astro'),
  ]);

  assert.doesNotMatch(tag, /bodyClass=|prototypes\.css/);
  assert.match(tag, /import type \{ GetStaticPaths \} from 'astro'/);
  assert.match(tag, /getListedPosts\(lang\).*filter\(\(post\) => post\.data\.tags\.includes\(tag\)\)/s);
  assert.match(tag, /formatDate\(latest\.data\.publishedAt, ui\.locale\)/);
  assert.match(tag, /<TaxonomyPostList/);
  assert.match(tag, /heading=\{`# \$\{tag\}`\}/);
  for (const text of ['返回全部标签', 'タグ一覧へ戻る', 'Back to all tags']) {
    assert.match(tag, new RegExp(text));
  }
  assert.match(list, /aria-labelledby="taxonomy-posts-title"/);
  assert.match(list, /formatDate\(post\.data\.publishedAt, ui\.locale\)/);
  assert.doesNotMatch(tag, /<PostList|site-shell page-heading|client:/);
});

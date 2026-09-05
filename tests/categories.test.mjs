import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

async function read(relativePath) {
  return readFile(new URL(relativePath, root), 'utf8');
}

test('production category directory uses the public editorial layout with real taxonomy data', async () => {
  const categories = await read('src/pages/[lang]/categories/index.astro');

  assert.doesNotMatch(categories, /bodyClass=|prototypes\.css/);
  assert.match(categories, /getListedPosts\(lang\)/);
  assert.match(categories, /uniqueTaxonomy\(posts, 'category'\)/);
  assert.match(categories, /categoryEntries\.map/);
  assert.match(categories, /href=\{`\/\$\{lang\}\/categories\/\$\{encodeURIComponent\(name\)\}\/`\}/);
  assert.match(categories, /latestTitle:\s*latest\.data\.title/);
  assert.doesNotMatch(categories, /PROTOTYPE_CATEGORIES|taxonomy-grid|style=/);
});

test('production category directory has localized empty states and mobile-safe public styles', async () => {
  const [categories, styles] = await Promise.all([
    read('src/pages/[lang]/categories/index.astro'),
    read('src/styles/public.css'),
  ]);

  assert.match(categories, /categoryEntries\.length > 0/);
  for (const text of ['还没有分类', 'カテゴリーはまだありません', 'No categories yet']) {
    assert.match(categories, new RegExp(text));
  }
  assert.match(categories, /a-category-directory--quiet/);
  assert.match(styles, /\.a-category-directory\s*{[^}]*border-top:\s*1px solid var\(--ink\)/s);
  assert.match(styles, /@media \(max-width: 48rem\)[\s\S]*\.a-category-directory > a\s*{[^}]*grid-template-columns:\s*1\.4rem minmax\(0, 1fr\) auto[^}]*min-height:\s*8rem[^}]*padding-inline:\s*0\.6rem/s);
  assert.match(styles, /\.a-category-directory > a:focus-visible::before/);
});

test('production category detail uses the public layout with a static, localized article list', async () => {
  const [category, list, styles] = await Promise.all([
    read('src/pages/[lang]/categories/[category].astro'),
    read('src/components/TaxonomyPostList.astro'),
    read('src/styles/public.css'),
  ]);

  assert.doesNotMatch(category, /bodyClass=|prototypes\.css/);
  assert.match(category, /import type \{ GetStaticPaths \} from 'astro'/);
  assert.match(category, /getListedPosts\(lang\).*filter\(\(post\) => post\.data\.category === category\)/s);
  assert.match(category, /formatDate\(latest\.data\.publishedAt, ui\.locale\)/);
  assert.match(category, /<TaxonomyPostList/);
  assert.match(list, /postPath\(post\)/);
  assert.match(list, /class="a-taxonomy-detail"/);
  assert.match(list, /class="a-taxonomy-posts"/);
  assert.match(list, /post\.data\.summary/);
  assert.match(list, /post\.data\.tags\.join\(' · '\)/);
  for (const text of ['返回全部分类', 'カテゴリー一覧へ戻る', 'Back to all categories']) {
    assert.match(category, new RegExp(text));
  }
  assert.doesNotMatch(category, /<PostList|site-shell page-heading|client:/);

  assert.match(styles, /\.a-taxonomy-posts > li > a\s*{[^}]*grid-template-columns:\s*5\.75rem minmax\(16rem, 1fr\) minmax\(8rem, 0\.4fr\) 8rem auto[^}]*min-height:\s*10rem[^}]*padding-inline:\s*1\.25rem/s);
  assert.match(styles, /@media \(max-width: 48rem\)[\s\S]*\.a-taxonomy-posts > li > a\s*{[^}]*grid-template-columns:\s*1\.4rem minmax\(0, 1fr\) auto[^}]*min-height:\s*9rem[^}]*padding-inline:\s*0\.6rem/s);
  assert.match(styles, /\.a-taxonomy-posts > li > a:focus-visible::before/);
});

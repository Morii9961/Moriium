import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

async function read(relativePath) {
  return readFile(new URL(relativePath, root), 'utf8');
}

test('production category directory uses A layout with real taxonomy data', async () => {
  const categories = await read('src/pages/[lang]/categories/index.astro');

  assert.match(categories, /bodyClass="concept-a"/);
  assert.match(categories, /getListedPosts\(lang\)/);
  assert.match(categories, /uniqueTaxonomy\(posts, 'category'\)/);
  assert.match(categories, /categoryEntries\.map/);
  assert.match(categories, /href=\{`\/\$\{lang\}\/categories\/\$\{encodeURIComponent\(name\)\}\/`\}/);
  assert.match(categories, /latestTitle:\s*latest\.data\.title/);
  assert.doesNotMatch(categories, /PROTOTYPE_CATEGORIES|taxonomy-grid|style=/);
});

test('production category directory has localized empty states and mobile-safe A styles', async () => {
  const [categories, styles] = await Promise.all([
    read('src/pages/[lang]/categories/index.astro'),
    read('src/styles/prototypes.css'),
  ]);

  assert.match(categories, /categoryEntries\.length > 0/);
  for (const text of ['还没有分类', 'カテゴリーはまだありません', 'No categories yet']) {
    assert.match(categories, new RegExp(text));
  }
  assert.match(categories, /a-category-directory--quiet/);
  assert.match(styles, /\.concept-a \.a-category-directory--quiet\s*{[^}]*border-top:[^}]*border-bottom:/s);
  assert.match(styles, /@media \(max-width: 46rem\)[\s\S]*\.concept-a \.a-category-directory > a\s*{[^}]*grid-template-columns:\s*2rem minmax\(0, 1fr\) 1\.25rem[^}]*min-height:\s*7\.25rem/s);
  assert.match(styles, /\.concept-a \.a-category-directory strong\s*{[^}]*grid-column:\s*2/s);
});

test('production category detail uses A layout with a static, localized article list', async () => {
  const [category, styles] = await Promise.all([
    read('src/pages/[lang]/categories/[category].astro'),
    read('src/styles/prototypes.css'),
  ]);

  assert.match(category, /bodyClass="concept-a"/);
  assert.match(category, /import type \{ GetStaticPaths \} from 'astro'/);
  assert.match(category, /getListedPosts\(lang\).*filter\(\(post\) => post\.data\.category === category\)/s);
  assert.match(category, /postPath\(post\)/);
  assert.match(category, /formatDate\(latest\.data\.publishedAt, ui\.locale\)/);
  assert.match(category, /class="a-category-detail"/);
  assert.match(category, /class="a-category-posts"/);
  assert.match(category, /post\.data\.summary/);
  assert.match(category, /post\.data\.tags\.join\(' · '\)/);
  for (const text of ['返回全部分类', 'カテゴリー一覧へ戻る', 'Back to all categories']) {
    assert.match(category, new RegExp(text));
  }
  assert.doesNotMatch(category, /<PostList|site-shell page-heading|client:/);

  assert.match(styles, /\.concept-a \.a-category-posts > li > a\s*{[^}]*grid-template-columns:\s*8\.5rem minmax\(0, 1fr\) minmax\(8rem, 0\.35fr\) 1\.5rem[^}]*min-height:\s*10rem/s);
  assert.match(styles, /@media \(max-width: 46rem\)[\s\S]*\.concept-a \.a-category-posts > li > a\s*{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) 1\.25rem[^}]*min-height:\s*9rem/s);
  assert.match(styles, /\.a-category-posts > li > a:focus-visible h3/);
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

async function read(relativePath) {
  return readFile(new URL(relativePath, root), 'utf8');
}

test('production category directory is built from real taxonomy data', async () => {
  const categories = await read('src/pages/[lang]/categories/index.astro');

  assert.match(categories, /getListedPosts\(lang\)/);
  assert.match(categories, /uniqueTaxonomy\(posts, 'category'\)/);
  assert.match(categories, /categoryEntries\.map/);
  assert.match(categories, /href=\{`\/\$\{lang\}\/categories\/\$\{encodeURIComponent\(name\)\}\/`\}/);
  assert.match(categories, /latestTitle:\s*latest\.data\.title/);
  assert.doesNotMatch(categories, /PROTOTYPE_CATEGORIES|taxonomy-grid|concept-a|prototypes\.css|style=/);
});

test('production category directory has localized empty states and a ruled index', async () => {
  const [categories, layout] = await Promise.all([
    read('src/pages/[lang]/categories/index.astro'),
    read('src/styles/layout.css'),
  ]);

  assert.match(categories, /categoryEntries\.length > 0/);
  for (const text of ['还没有分类', 'カテゴリーはまだありません', 'No categories yet']) {
    assert.match(categories, new RegExp(text));
  }
  assert.match(categories, /class="measure measure--media band empty-state"/);
  // Both the populated and the empty state keep the route to tags.
  assert.match(categories, /class="crosslink"[\s\S]*class="crosslink"/);

  // A ruled index rather than a grid of cards: rows separated by a hairline,
  // with the count aligned to the name's own line.
  assert.match(layout, /\.category-index li \{\s*border-top: var\(--hairline\)/);
  assert.match(layout, /\.category-index__count \{[^}]*grid-row: 1;[^}]*grid-column: 2/s);
  assert.match(layout, /\.category-index a:hover \.category-index__name,\s*\.category-index a:focus-visible \.category-index__name/);
});

test('production category detail reuses the shared post ledger', async () => {
  const [category, ledger, layout] = await Promise.all([
    read('src/pages/[lang]/categories/[category].astro'),
    read('src/components/PostLedger.astro'),
    read('src/styles/layout.css'),
  ]);

  assert.match(category, /import type \{ GetStaticPaths \} from 'astro'/);
  assert.match(category, /getListedPosts\(lang\).*filter\(\(post\) => post\.data\.category === category\)/s);
  assert.match(category, /formatDate\(latest\.data\.publishedAt, ui\.locale\)/);
  assert.match(category, /<PostLedger posts=\{posts\} lang=\{lang\} showTags/);
  for (const text of ['返回全部分类', 'カテゴリー一覧へ戻る', 'Back to all categories']) {
    assert.match(category, new RegExp(text));
  }
  assert.doesNotMatch(category, /<PostList|TaxonomyPostList|concept-a|client:/);

  // One ledger serves home, Writing, and both taxonomy details, which is what
  // keeps their rhythm identical. Its title stays a heading inside the row link
  // so the list can still be walked by heading.
  assert.match(ledger, /postPath\(post\)/);
  assert.match(ledger, /<h3 class="ledger__title">\{post\.data\.title\}<\/h3>/);
  assert.match(ledger, /post\.data\.summary/);
  assert.match(ledger, /showTags && post\.data\.tags\.length > 0/);

  assert.match(layout, /\.ledger a \{[^}]*grid-template-columns: 8\.5rem minmax\(0, 1fr\)/s);
  assert.match(
    layout,
    /@media \(max-width: 46rem\)[\s\S]*\.ledger a \{[^}]*grid-template-columns: minmax\(0, 1fr\)/,
  );
  assert.match(layout, /\.ledger a:hover \.ledger__title,\s*\.ledger a:focus-visible \.ledger__title/);
});

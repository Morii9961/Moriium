import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

async function read(relativePath) {
  return readFile(new URL(relativePath, root), 'utf8');
}

test('production tag directory ranks real tags by frequency', async () => {
  const tags = await read('src/pages/[lang]/tags/index.astro');

  assert.match(tags, /export function getStaticPaths\(\)/);
  assert.match(tags, /getListedPosts\(lang\)/);
  assert.match(tags, /uniqueTaxonomy\(posts, 'tags'\)/);
  assert.match(tags, /\.sort\(\(a, b\) => b\.count - a\.count/);
  assert.match(tags, /tagEntries\.map/);
  assert.match(tags, /href=\{`\/\$\{lang\}\/tags\/\$\{encodeURIComponent\(name\)\}\/`\}/);
  // Frequency is shown as size, and the count is also stated for anyone who
  // cannot compare sizes.
  assert.match(tags, /style=\{`--tag-size: \$\{tagSize\(count\)\}`\}/);
  assert.match(tags, /aria-label=\{c\.label\(name, count\)\}/);
  assert.doesNotMatch(tags, /taxonomy-grid|concept-a|prototypes\.css/);
});

test('the tag scale stays inside a readable range', async () => {
  const tags = await read('src/pages/[lang]/tags/index.astro');

  // The rarest tag never falls below the site's small reading size, and the
  // most used one never becomes a headline.
  assert.match(tags, /0\.9375 \+ 0\.3125 \*/);
  assert.match(tags, /Math\.max\(1, busiest - 1\)/);
});

test('production tag directory has localized empty states and a wrapping field', async () => {
  const [tags, layout] = await Promise.all([
    read('src/pages/[lang]/tags/index.astro'),
    read('src/styles/layout.css'),
  ]);

  assert.match(tags, /tagEntries\.length > 0/);
  for (const text of ['还没有标签', 'タグはまだありません', 'No tags yet']) {
    assert.match(tags, new RegExp(text));
  }
  assert.match(tags, /class="measure measure--media band empty-state"/);
  assert.match(tags, /class="crosslink"[\s\S]*class="crosslink"/);

  // The field wraps on its own at any width, and each chip is a real touch target.
  assert.match(layout, /\.tag-field \{[^}]*display: flex;[^}]*flex-wrap: wrap/s);
  assert.match(layout, /\.tag-field a \{[^}]*min-height: 2\.5rem/s);
  assert.match(layout, /\.tag-field a \{[^}]*font-size: var\(--tag-size, 0\.9375rem\)/s);
  assert.match(layout, /\.tag-field a:hover \{[^}]*border-color: var\(--color-accent-mark\)/s);
});

test('production tag detail reuses the shared localized ledger', async () => {
  const [tag, ledger] = await Promise.all([
    read('src/pages/[lang]/tags/[tag].astro'),
    read('src/components/PostLedger.astro'),
  ]);

  assert.match(tag, /import type \{ GetStaticPaths \} from 'astro'/);
  assert.match(tag, /getListedPosts\(lang\).*filter\(\(post\) => post\.data\.tags\.includes\(tag\)\)/s);
  assert.match(tag, /formatDate\(latest\.data\.publishedAt, ui\.locale\)/);
  assert.match(tag, /<PostLedger posts=\{posts\} lang=\{lang\} showTags/);
  assert.match(tag, /label=\{`# \$\{tag\}`\}/);
  for (const text of ['返回全部标签', 'タグ一覧へ戻る', 'Back to all tags']) {
    assert.match(tag, new RegExp(text));
  }
  assert.match(ledger, /formatDate|Intl\.DateTimeFormat/);
  assert.doesNotMatch(tag, /<PostList|TaxonomyPostList|concept-a|client:/);
});

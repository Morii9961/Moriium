import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

async function read(relativePath) {
  return readFile(new URL(relativePath, root), 'utf8');
}

test('production archive groups real posts by descending year', async () => {
  const archive = await read('src/pages/[lang]/archive/index.astro');

  assert.match(archive, /getListedPosts\(lang\)/);
  assert.match(archive, /Map\.groupBy\(posts/);
  assert.match(archive, /sort\(\(\[a\], \[b\]\) => b - a\)/);
  assert.match(archive, /entries\.map\(\(post\)/);
  assert.match(archive, /href=\{postPath\(post\)\}/);
  assert.match(archive, /datetime=\{post\.data\.publishedAt\.toISOString\(\)\}/);
  assert.match(archive, /class="measure measure--media archive-year"/);
  assert.doesNotMatch(archive, /PostList|PROTOTYPE_POSTS|concept-a|prototypes\.css|style=/);
});

test('production archive has localized empty states and a scannable, tappable list', async () => {
  const [archive, layout] = await Promise.all([
    read('src/pages/[lang]/archive/index.astro'),
    read('src/styles/layout.css'),
  ]);

  assert.match(archive, /yearGroups\.length > 0/);
  for (const text of ['还没有文章', '記事はまだありません', 'No posts yet']) assert.match(archive, new RegExp(text));
  assert.match(archive, /class="measure measure--media band empty-state"/);

  // The year sits beside the entries on desktop and above them on a phone.
  assert.match(layout, /\.archive-year \{[^}]*grid-template-columns: 8\.5rem minmax\(0, 1fr\)/s);
  assert.match(
    layout,
    /@media \(max-width: 46rem\)[\s\S]*\.archive-year \{[^}]*grid-template-columns: minmax\(0, 1fr\)/,
  );
  assert.match(
    layout,
    /@media \(max-width: 46rem\)[\s\S]*\.archive-list a \{[^}]*grid-template-columns: 3\.5rem minmax\(0, 1fr\)/,
  );
  // Rows stay a comfortable touch target and show a keyboard state.
  assert.match(layout, /\.archive-list a \{[^}]*min-height: 2\.75rem/s);
  assert.match(layout, /\.archive-list a:hover \.archive-list__title,\s*\.archive-list a:focus-visible \.archive-list__title/);
});

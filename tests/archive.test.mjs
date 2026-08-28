import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

async function read(relativePath) {
  return readFile(new URL(relativePath, root), 'utf8');
}

test('production archive uses A layout with real posts in descending year order', async () => {
  const archive = await read('src/pages/[lang]/archive/index.astro');

  assert.match(archive, /bodyClass="concept-a"/);
  assert.match(archive, /getListedPosts\(lang\)/);
  assert.match(archive, /Map\.groupBy\(posts/);
  assert.match(archive, /sort\(\(\[a\], \[b\]\) => b - a\)/);
  assert.match(archive, /entries\.map\(\(post\)/);
  assert.match(archive, /href=\{postPath\(post\)\}/);
  assert.match(archive, /datetime=\{post\.data\.publishedAt\.toISOString\(\)\}/);
  assert.doesNotMatch(archive, /PostList|PROTOTYPE_POSTS|style=/);
});

test('production archive has localized empty states and mobile-safe A styles', async () => {
  const [archive, styles] = await Promise.all([
    read('src/pages/[lang]/archive/index.astro'),
    read('src/styles/prototypes.css'),
  ]);

  assert.match(archive, /yearGroups\.length > 0/);
  for (const text of ['还没有文章', '記事はまだありません', 'No posts yet']) assert.match(archive, new RegExp(text));
  assert.match(archive, /a-archive--quiet/);
  assert.match(styles, /@media \(max-width: 46rem\)[\s\S]*\.concept-a \.a-archive li\s*{[^}]*grid-template-columns:\s*4rem minmax\(0, 1fr\)/);
  assert.match(styles, /\.concept-a \.a-archive li > span\s*{[^}]*grid-column:\s*2[^}]*text-align:\s*left/s);
  assert.match(styles, /\.concept-a \.a-archive a\s*{[^}]*min-height:\s*2\.75rem/s);
});

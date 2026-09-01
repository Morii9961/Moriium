import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

async function read(relativePath) {
  return readFile(new URL(relativePath, root), 'utf8');
}

test('production archive uses the public editorial layout with real posts in descending year order', async () => {
  const archive = await read('src/pages/[lang]/archive/index.astro');

  assert.doesNotMatch(archive, /bodyClass=|prototypes\.css/);
  assert.match(archive, /getListedPosts\(lang\)/);
  assert.match(archive, /Map\.groupBy\(posts/);
  assert.match(archive, /sort\(\(\[a\], \[b\]\) => b - a\)/);
  assert.match(archive, /entries\.map\(\(post\)/);
  assert.match(archive, /href=\{postPath\(post\)\}/);
  assert.match(archive, /datetime=\{post\.data\.publishedAt\.toISOString\(\)\}/);
  assert.doesNotMatch(archive, /PostList|PROTOTYPE_POSTS|style=/);
});

test('production archive has localized empty states and mobile-safe public styles', async () => {
  const [archive, styles] = await Promise.all([
    read('src/pages/[lang]/archive/index.astro'),
    read('src/styles/public.css'),
  ]);

  assert.match(archive, /yearGroups\.length > 0/);
  for (const text of ['还没有文章', '記事はまだありません', 'No posts yet']) assert.match(archive, new RegExp(text));
  assert.match(archive, /a-archive--quiet/);
  assert.match(styles, /@media \(max-width: 48rem\)[\s\S]*\.a-archive li\s*{[^}]*grid-template-columns:\s*4rem minmax\(0, 1fr\)/);
  assert.match(styles, /@media \(max-width: 48rem\)[\s\S]*\.a-archive li > span\s*{[^}]*grid-column:\s*2/s);
  assert.match(styles, /\.a-archive li\s*{[^}]*min-height:\s*5\.2rem/s);
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

async function read(relativePath) {
  return readFile(new URL(relativePath, root), 'utf8');
}

test('production public article route supplies static headings and adjacent posts', async () => {
  const route = await read('src/pages/[lang]/posts/[slug].astro');

  assert.match(route, /import type \{ GetStaticPaths \} from 'astro'/);
  assert.match(route, /const \{ Content, headings \} = await render\(post\)/);
  assert.match(route, /getListedPosts\(post\.data\.lang\)/);
  assert.match(route, /listedPosts\.findIndex/);
  assert.match(route, /listedCategories\.has\(post\.data\.category\)/);
  assert.match(route, /listedTags\.has\(tag\)/);
  assert.match(route, /previous/);
  assert.match(route, /next/);
  assert.match(route, /headings=\{headings\}/);
  assert.doesNotMatch(route, /client:/);
});

test('production article layout uses A reading structure and real metadata', async () => {
  const article = await read('src/layouts/ArticleLayout.astro');

  assert.match(article, /bodyClass="concept-a"/);
  for (const marker of ['a-article__hero', 'a-article__facts', 'a-article__outline', 'a-article__body', 'a-article__context', 'a-article__end']) {
    assert.match(article, new RegExp(`class="[^"]*${marker}`));
  }
  assert.match(article, /post\.data\.updatedAt/);
  assert.match(article, /formatDate\(post\.data\.publishedAt, ui\.locale\)/);
  assert.match(article, /post\.data\.category/);
  assert.match(article, /post\.data\.tags\.map/);
  assert.match(article, /linkCategory \?/);
  assert.match(article, /linkedTags\.includes\(tag\) \?/);
  assert.match(article, /SITE\.languages\.map/);
  assert.match(article, /translations\.find/);
  assert.match(article, /c\.unavailable/);
  assert.match(article, /postPath\(previous\)/);
  assert.match(article, /postPath\(next\)/);
  assert.match(article, /<ReaderEnhancements features=\{features\}/);
  assert.doesNotMatch(article, /末次共振|PROTOTYPE_POSTS/);
});

test('production article layout keeps responsive reading columns and keyboard states', async () => {
  const [styles, base] = await Promise.all([
    read('src/styles/prototypes.css'),
    read('src/styles/base.css'),
  ]);

  assert.match(styles, /\.concept-a \.a-reading-grid\s*{[^}]*grid-template-columns:\s*minmax\(9rem, 0\.55fr\) minmax\(0, 2fr\) minmax\(11rem, 0\.65fr\)/s);
  assert.match(styles, /@media \(max-width: 64rem\)[\s\S]*\.concept-a \.a-reading-grid\s*{[^}]*grid-template-columns:\s*10rem minmax\(0, 1fr\)/s);
  assert.match(styles, /@media \(max-width: 46rem\)[\s\S]*\.concept-a \.a-reading-grid\s*{[^}]*display:\s*block/s);
  assert.match(styles, /\.a-article__outline nav a:focus-visible/);
  assert.match(styles, /\.a-article__end nav a:focus-visible strong/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(base, /\.video-consent\s*{[^}]*width:\s*100%[^}]*min-height:\s*0[^}]*aspect-ratio:/s);
});

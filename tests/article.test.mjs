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

test('production article layout alternates widths and carries real metadata', async () => {
  const article = await read('src/layouts/ArticleLayout.astro');

  // The composition of the page is the width sequence: prose for reading,
  // media for the photograph and the closing navigation.
  assert.match(article, /class="article__head measure measure--prose"/);
  assert.match(article, /class="plate article__cover measure measure--media"/);
  assert.match(article, /class="article__body measure measure--prose"/);
  assert.match(article, /class="article__colophon measure measure--prose"/);
  assert.match(article, /class="adjacent measure measure--media"/);
  assert.match(article, /class="article__outline measure measure--prose"/);

  assert.match(article, /post\.data\.updatedAt/);
  assert.match(article, /formatDate\(post\.data\.publishedAt, ui\.locale\)/);
  assert.match(article, /post\.data\.category/);
  assert.match(article, /post\.data\.tags\.map/);
  assert.match(article, /linkCategory \?/);
  assert.match(article, /linkedTags\.includes\(tag\)/);
  assert.match(article, /SITE\.languages\.map/);
  assert.match(article, /translations\.find/);
  assert.match(article, /c\.unavailable/);
  assert.match(article, /postPath\(previous\)/);
  assert.match(article, /postPath\(next\)/);
  assert.match(article, /<ReaderEnhancements features=\{features\}/);
  assert.doesNotMatch(article, /末次共振|PROTOTYPE_POSTS|concept-a|prototypes\.css/);
});

test('the reading measure follows the document language', async () => {
  const content = await read('src/styles/content.css');

  // 42em is roughly 42 Chinese characters; the same width in English runs well
  // past a comfortable line, so English gets its own value.
  assert.match(content, /:root \{\s*--layout-prose: 42em;/);
  assert.match(content, /:root:lang\(en\) \{\s*--layout-prose: 37em;/);
  assert.match(content, /\.measure--prose \{\s*--measure-width: var\(--layout-prose\)/);
});

test('article media steps out of the prose column without breaking the page', async () => {
  const content = await read('src/styles/content.css');

  // Pictures and video widen to the media measure; code, diagrams, and cards
  // stay in the reading column.
  assert.match(content, /\.article-body > figure:not\(\.frame\):not\(\.music-card\)/);
  assert.match(content, /\.article-body > \.video-card \{[\s\S]{0,220}--breakout: min\(var\(--layout-media\), calc\(100vw - 2 \* var\(--layout-gutter\)\)\)/);
  // The breakout is bounded by the viewport, so it can never cause a sideways scroll.
  assert.match(content, /--breakout: calc\(100vw - 2 \* var\(--layout-gutter\)\)/);
});

test('the article outline stays out of the prose column and keyboard states remain visible', async () => {
  const [content, base] = await Promise.all([
    read('src/styles/content.css'),
    read('src/styles/base.css'),
  ]);

  // Below the wide breakpoint the outline is a jump strip; above it, it moves
  // into the margin rather than narrowing the text.
  assert.match(
    content,
    /@media \(min-width: 84rem\)[\s\S]*\.article__outline \{[^}]*position: absolute[^}]*left: calc\(50% \+ var\(--layout-prose\) \/ 2 \+ var\(--space-7\)\)/,
  );
  assert.match(content, /@media \(min-width: 84rem\)[\s\S]*\.article__outline-inner \{[^}]*position: sticky/);
  assert.match(content, /\.article__outline li\[data-depth='3'\] \{\s*display: none/);

  assert.match(base, /:focus-visible \{[^}]*outline: 2px solid var\(--color-accent-ink\)/s);
  assert.match(base, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(content, /\.article-body a:hover \{[^}]*color: var\(--color-accent-ink\)/s);
});

test('the reading indicator is scroll-linked and survives reduced motion', async () => {
  const content = await read('src/styles/content.css');

  // It costs no JavaScript, and it reports position rather than moving on its
  // own — so neutralising its duration would make it read as full at the top.
  assert.match(content, /\.reading-progress \{[^}]*animation-timeline: scroll\(root block\)/s);
  assert.match(content, /@supports not \(animation-timeline: scroll\(root block\)\)[\s\S]*display: none/);
  assert.match(
    content,
    /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.reading-progress \{\s*animation-duration: auto !important/,
  );
});

test('the video block stays inert until the reader asks for it', async () => {
  const content = await read('src/styles/content.css');

  assert.match(content, /\.video-consent \{[^}]*aspect-ratio: var\(--video-ratio, 16 \/ 9\)/s);
  assert.match(content, /\.video-card iframe,\s*\.video-card video \{[^}]*width: 100%/s);
});

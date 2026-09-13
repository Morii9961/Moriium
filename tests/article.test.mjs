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

test('production article layout uses the public reading structure and real metadata', async () => {
  const article = await read('src/layouts/ArticleLayout.astro');

  assert.doesNotMatch(article, /bodyClass=|prototypes\.css/);
  assert.match(article, /import '\.\.\/styles\/public-reading\.css'/);
  for (const marker of ['a-article__hero', 'a-article__facts', 'a-article__outline', 'a-article__body', 'a-article__tags', 'a-article__end']) {
    assert.match(article, new RegExp(`class="[^"]*${marker}`));
  }
  assert.match(article, /post\.data\.updatedAt/);
  assert.match(article, /formatDate\(post\.data\.publishedAt, ui\.locale\)/);
  assert.match(article, /post\.data\.category/);
  assert.match(article, /post\.data\.tags\.map/);
  assert.match(article, /linkCategory \?/);
  // A tag with no listed posts behind it stays text rather than becoming a link
  // to an empty page.
  assert.match(article, /linkedTags\.includes\(tag\)\s*\n?\s*\?/);
  assert.match(article, /<span># \{tag\}<\/span>/);
  assert.match(article, /<ReaderEnhancements features=\{features\}/);
  assert.doesNotMatch(article, /末次共振|PROTOTYPE_POSTS/);
  // The layout borrowed its class names from the /design study. Those pages are
  // still served, so the names must not leak back into production markup.
  assert.doesNotMatch(article, /class="[^"]*prototype-/);
});

test('the article page carries no rail the reader cannot act on', async () => {
  const [article, styles] = await Promise.all([
    read('src/layouts/ArticleLayout.astro'),
    read('src/styles/public-reading.css'),
  ]);

  // The context rail is gone: the panel naming which reader modules loaded was
  // written for acceptance, not for a reader, and the tags moved to the end.
  assert.doesNotMatch(article, /a-article__context/);
  assert.doesNotMatch(styles, /a-article__context/);
  assert.doesNotMatch(article, /readerNote|enabledFeatures|c\.feature/);
  // The visible language list is gone with it, but the relationship between the
  // three variants is still declared to machines.
  assert.doesNotMatch(article, /SITE\.languages\.map/);
  assert.match(article, /rel="alternate" hreflang=\{UI\[entry\.data\.lang\]\.locale\}/);
  assert.match(article, /translations\.map/);
});

test('the article page declares itself to aggregators without tracking a reader', async () => {
  const article = await read('src/layouts/ArticleLayout.astro');

  assert.match(article, /type="application\/ld\+json"/);
  assert.match(article, /'@type': 'BlogPosting'/);
  assert.match(article, /mainEntityOfPage/);
  // The only character that can close the surrounding script element.
  assert.match(article, /replaceAll\('<', '\\\\u003c'\)/);
});

test('the article facts name the author where the reading time used to be', async () => {
  const article = await read('src/layouts/ArticleLayout.astro');
  const facts = article.slice(article.indexOf('<dl class="a-article__facts">'), article.indexOf('</dl>'));

  // The minute estimate is gone, not hidden: no row, no copy, no counter.
  assert.doesNotMatch(article, /readingMinutes|c\.reading|c\.minutes|阅读时间|読了目安|Reading time/);
  // Published, then updated, then the byline, then the category.
  const order = ['c.published', 'c.updated', 'c.author', 'c.category'].map((key) => facts.indexOf(`{${key}}`));
  assert.ok(order.every((index) => index >= 0), `a fact row is missing: ${order}`);
  assert.deepEqual([...order].sort((a, b) => a - b), order);
});

test('the reading grid centres the prose and hangs the outline in the margin', async () => {
  const styles = await read('src/styles/public-reading.css');

  assert.match(
    styles,
    /\.a-reading-grid\s*{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) min\(var\(--layout-reading\), 100%\) minmax\(0, 1fr\)/s,
  );
  assert.match(styles, /\.a-article__outline\s*{[^}]*position:\s*sticky/s);
  // The rule that used to run down the middle of the prose is gone with the
  // three-rail grid it was measured against.
  assert.doesNotMatch(styles, /\.a-reading-grid::before/);
});

test('the article opening is sized by its content', async () => {
  const styles = await read('src/styles/public-reading.css');
  const hero = styles.slice(styles.indexOf('.a-article__hero {'), styles.indexOf('.a-article__hero::before'));

  // The 48rem floor was reserving room for a cover that most posts do not have.
  assert.doesNotMatch(hero, /min-height/);

  // A Han glyph fills its em box, so a heading line height under 1 overlaps.
  const title = styles.slice(styles.indexOf('.a-article__title h1 {'), styles.indexOf('.a-article__title h1:lang(en)'));
  const lineHeight = Number(/line-height:\s*([\d.]+)/.exec(title)?.[1]);
  assert.ok(lineHeight >= 1, `CJK title line-height must not be below 1, got ${lineHeight}`);
});

test('the prose stylesheet covers everything the pipeline can emit', async () => {
  const styles = await read('src/styles/public-reading.css');

  for (const selector of [
    'article-table',
    'table',
    'thead th',
    'footnotes',
    'task-list-item',
    'contains-task-list',
    'article-figure',
    'figcaption',
    'kbd',
    'mark',
    'abbr\\[title\\]',
    'details',
    'summary',
    'hr',
    'blockquote',
    'li::marker',
    '> h4',
    '> h5',
    '> h6',
    'katex-display',
  ]) {
    assert.match(styles, new RegExp(selector), `no rule for ${selector}`);
  }
});

test('remark names a footnote heading the site has to define, and gates smooth scrolling', async () => {
  const base = await read('src/styles/base.css');

  // Undefined, remark's `.sr-only` heading rendered at full article-h2 size, in
  // English, in the middle of a Chinese post.
  assert.match(base, /\.visually-hidden,\s*\n\s*\.sr-only \{/);
  // `html` is outside `.public-site`, so the site-wide reduced-motion reset
  // never reached it; smooth scrolling is opted into instead.
  assert.match(base, /@media \(prefers-reduced-motion: no-preference\) \{\s*\n\s*html \{\s*\n\s*scroll-behavior: smooth/);
  assert.doesNotMatch(base, /^\s{4}scroll-behavior: smooth;$/m);
});

test('the article layout keeps responsive reading columns and keyboard states', async () => {
  const [styles, base] = await Promise.all([
    read('src/styles/public-reading.css'),
    read('src/styles/base.css'),
  ]);

  assert.match(
    styles,
    /@media \(max-width: 70rem\)[\s\S]*\.a-reading-grid\s*{[^}]*grid-template-columns:\s*minmax\(0, var\(--layout-reading\)\)[^}]*justify-content:\s*center/s,
  );
  assert.match(styles, /@media \(max-width: 48rem\)[\s\S]*\.a-article__outline nav\s*{[^}]*grid-template-columns:\s*1fr/s);
  assert.match(styles, /\.a-article__outline nav a:focus-visible/);
  assert.match(styles, /\.a-article__outline nav a\[aria-current='true'\]/);
  assert.match(styles, /\.a-article__end nav a:focus-visible strong/);
  assert.match(styles, /@media print/);
  assert.match(styles, /break-inside: avoid/);
  assert.match(base, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(base, /\.video-card iframe,\s*\.video-card video\s*{[^}]*width:\s*100%[^}]*aspect-ratio:\s*var\(--video-ratio/s);
});

test('one Expressive Code configuration drives every renderer', async () => {
  const [shared, config, priv] = await Promise.all([
    read('src/markdown/expressive-code.mjs'),
    read('astro.config.mjs'),
    read('scripts/lib/render-markdown.mjs'),
  ]);

  assert.match(config, /expressiveCode\(expressiveCodeOptions\)/);
  assert.match(priv, /\[rehypeExpressiveCode, expressiveCodeOptions\]/);
  // The block's surface follows the site into dark mode instead of carrying
  // GitHub's chrome into it.
  assert.match(shared, /codeBackground: 'var\(--surface-raised\)'/);
  assert.match(shared, /borderColor: 'var\(--line\)'/);
  assert.match(shared, /frameBoxShadowCssValue: 'none'/);
  assert.match(shared, /editorActiveTabIndicatorTopColor: 'var\(--accent-field\)'/);
});

test('a concealed spoiler is one solid mask and fades rather than switches', async () => {
  const styles = await read('src/styles/public-reading.css');

  // Inline code paints its own background, which sat on the mask as a grey
  // patch the shape of the hidden word. While concealed nothing inside paints.
  assert.match(
    styles,
    /\.spoiler:not\(:hover, :focus, \[data-revealed='true'\]\) \*\s*{[^}]*background-color:\s*transparent;[^}]*color:\s*transparent;/s,
  );
  // The reveal is a colour change in fast time, on the spoiler and on what it
  // holds, so inline code does not snap in while the words around it fade.
  assert.match(
    styles,
    /\.article-body \.spoiler,\s*\.public-site \.article-body \.spoiler \*\s*{[^}]*transition:[^}]*background-color var\(--motion-fast\) ease[^}]*color var\(--motion-fast\) ease/s,
  );
});

test('each admonition kind has its own quiet hue, in both themes', async () => {
  const [tokens, reading] = await Promise.all([
    read('src/styles/public.css'),
    read('src/styles/public-reading.css'),
  ]);

  const kinds = ['note', 'tip', 'important', 'warning', 'caution'];
  const light = tokens.slice(0, tokens.indexOf(":root[data-theme='dark']"));
  const dark = tokens.slice(tokens.indexOf(":root[data-theme='dark']"));
  for (const kind of kinds) {
    // Declared for both themes, and low in chroma: none of them above 0.1.
    for (const [name, block] of [['light', light], ['dark', dark]]) {
      const match = new RegExp(String.raw`--admonition-${kind}:\s*oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)`).exec(block);
      assert.ok(match, `--admonition-${kind} is missing from the ${name} tokens`);
      assert.ok(Number(match[2]) <= 0.1, `--admonition-${kind} is too saturated in ${name}`);
    }
    assert.match(
      reading,
      new RegExp(String.raw`\.admonition--${kind}\s*{\s*border-left-color:\s*var\(--admonition-${kind}\);`),
    );
  }
  // Five kinds used to read as two: every warning and caution shared one red.
  assert.doesNotMatch(reading, /admonition--warning, \.admonition--caution\) {\s*border-left-color:\s*var\(--danger\)/);
});

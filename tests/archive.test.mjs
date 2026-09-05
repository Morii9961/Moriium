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
  assert.match(archive, /Map\.groupBy\(entries/);
  assert.match(archive, /sort\(\(\[a\], \[b\]\) => b - a\)/);
  assert.match(archive, /monthEntries\.map\(\(post\)/);
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
  assert.match(styles, /@media \(max-width: 48rem\)[\s\S]*\.a-archive\s*{[^}]*--archive-date:\s*4\.5rem/);
  assert.match(styles, /@media \(max-width: 48rem\)[\s\S]*\.a-archive__days > li\s*{[^}]*grid-template-columns:\s*var\(--archive-date\) minmax\(0, 1fr\)/);
  assert.match(styles, /@media \(max-width: 48rem\)[\s\S]*\.a-archive__days > li > span\s*{[^}]*grid-column:\s*2/s);
  assert.match(styles, /\.a-archive__days > li\s*{[^}]*min-height:\s*4\.75rem/s);
});

test('the archive listing reads as one year-month-day axis', async () => {
  const [archive, styles] = await Promise.all([
    read('src/pages/[lang]/archive/index.astro'),
    read('src/styles/public.css'),
  ]);

  // Year, month and day are three nested levels, each carrying a real machine
  // readable time so the axis stays meaningful without its styling.
  assert.match(archive, /<h2 id=\{`archive-\$\{year\}`\}>\{year\}<\/h2>/);
  assert.match(archive, /<h3 class="a-archive__month-mark">/);
  assert.match(archive, /datetime=\{`\$\{year\}-\$\{pad\(month \+ 1\)\}`\}/);
  assert.match(archive, /\{pad\(post\.data\.publishedAt\.getDate\(\)\)\}/);

  // A single hairline carries the whole year, with each month marked on it.
  assert.match(styles, /\.a-archive__months::before\s*{[^}]*background:\s*var\(--line\)/s);
  assert.match(styles, /\.a-archive__month-mark::before\s*{[^}]*background:\s*var\(--accent\)/s);

  // Every date mark stands in one left-hand column, stepping down in size from
  // the year so the hierarchy survives without colour or indentation alone.
  assert.match(styles, /\.a-archive__month-mark\s*{[^}]*padding-left:\s*var\(--archive-rail\)/s);
  assert.match(styles, /\.a-archive__days time\s*{[^}]*padding-left:\s*calc\(var\(--archive-rail\)/s);
  assert.match(styles, /\.a-archive__days > li\s*{[^}]*grid-template-columns:\s*var\(--archive-date\)/s);
  for (const selector of ['.a-archive__year h2', '.a-archive__month-mark', '.a-archive__days time']) {
    const rule = styles.slice(styles.indexOf(`${selector} {`));
    assert.match(rule.slice(0, rule.indexOf('}')), /font-family:\s*var\(--font-wordmark\)/);
  }
});

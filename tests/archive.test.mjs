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
  assert.match(styles, /@media \(max-width: 48rem\)[\s\S]*\.a-archive\s*{[^}]*--archive-date:\s*3\.5rem/);
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

  // One hairline stands at the end of the date column, so it divides time from
  // text rather than fencing the whole section.
  assert.match(styles, /\.a-archive__months::before\s*{[^}]*left:\s*var\(--archive-date\)[^}]*background:\s*var\(--line\)/s);

  // An axis nothing touches is only a border: every entry is marked on the
  // line, the month heavily in accent and the day as a quiet hairline.
  assert.match(styles, /\.a-archive__month-mark::before\s*{[^}]*height:\s*2px[^}]*background:\s*var\(--accent\)/s);
  assert.match(styles, /\.a-archive__days > li::before\s*{[^}]*left:\s*calc\(var\(--archive-date\)[^}]*background:\s*var\(--ink-faint\)/s);
  assert.match(styles, /\.a-archive__days > li:has\(a:focus-visible\)::before\s*{[^}]*background:\s*var\(--accent\)/s);

  // Both figures range right onto the axis, and the rules start past it so the
  // line stays a spine instead of becoming the left edge of a table.
  assert.match(styles, /\.a-archive__month-mark\s*{[^}]*width:\s*var\(--archive-date\)[^}]*padding-right:\s*0\.85rem/s);
  assert.match(styles, /\.a-archive__days time\s*{[^}]*padding-right:\s*0\.85rem[^}]*text-align:\s*right/s);
  assert.match(styles, /\.a-archive__days::before,\s*\.a-archive__days > li::after\s*{[^}]*left:\s*calc\(var\(--archive-date\) \+ var\(--archive-gap\)\)/s);
  assert.match(styles, /\.a-archive__days > li\s*{[^}]*grid-template-columns:\s*var\(--archive-date\)/s);
  for (const selector of ['.a-archive__year h2', '.a-archive__month-mark', '.a-archive__days time']) {
    const rule = styles.slice(styles.indexOf(`${selector} {`));
    assert.match(rule.slice(0, rule.indexOf('}')), /font-family:\s*var\(--font-wordmark\)/);
  }
});

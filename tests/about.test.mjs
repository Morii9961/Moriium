import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

async function read(relativePath) {
  return readFile(new URL(relativePath, root), 'utf8');
}

test('production about page keeps only the approved public statement and destinations', async () => {
  const about = await read('src/pages/[lang]/about/index.astro');

  assert.doesNotMatch(about, /bodyClass=|prototypes\.css/);
  assert.match(about, /import type \{ GetStaticPaths \} from 'astro'/);
  assert.match(about, /class="a-about-page__statement"/);
  assert.doesNotMatch(about, /about-kinds|about-colophon|kindList|facts: \[/);

  // Every identity Morii approved is present, and the superseded About-page
  // feed controls are not duplicated now that RSS lives in the footer.
  assert.match(about, /https:\/\/github\.com\/Morii9961/);
  assert.match(about, /https:\/\/x\.com\/morii9961/);
  assert.match(about, /https:\/\/space\.bilibili\.com\/670549003/);
  assert.doesNotMatch(about, /rss\.xml|feedBody|feedLabel|Feeds and elsewhere/);

  for (const text of ['写下的、拍下的，慢慢留下', '書いたもの、撮ったものを、少しずつ残す', 'What is written and photographed is kept here over time']) {
    assert.match(about, new RegExp(text));
  }

  // The page publishes nothing personal that Morii has not cleared, and stays
  // a static route with no client component.
  assert.doesNotMatch(about, /Dalian|大连|所在地|site-shell page-heading|client:/);
});

test('the About statement describes the actual reader and author runtime boundary', async () => {
  const about = await read('src/pages/[lang]/about/index.astro');

  for (const term of ['Astro', 'TypeScript', 'HTML/CSS', 'Vue 3', 'Tiptap', 'Node', 'SQLite']) {
    assert.match(about, new RegExp(term));
  }
  assert.match(about, /公开页面和搜索索引都在构建时生成/);
  assert.match(about, /公開ページと検索索引はビルド時に生成され/);
  assert.match(about, /Public pages and search indexes are generated at build time/);
});

test('About destinations are icon-led whole-row links before the activity record', async () => {
  const [about, icon, styles] = await Promise.all([
    read('src/pages/[lang]/about/index.astro'),
    read('src/components/AboutChannelIcon.astro'),
    read('src/styles/public.css'),
  ]);

  assert(about.indexOf('a-about-page__channels') < about.indexOf('<AboutActivity'), 'destinations must precede activity');
  assert.match(about, /<ul class="a-about-page__channels">[\s\S]*<li>[\s\S]*<a href=\{channel\.href\} rel="me">/);
  assert.match(about, /<AboutChannelIcon name=\{channel\.name\} \/>/);
  for (const name of ['GitHub', 'X', 'Bilibili']) assert.match(icon, new RegExp(`${name}:`));
  assert.match(icon, /<svg viewBox="0 0 24 24" aria-hidden="true">/);

  assert.match(styles, /\.a-about-page__channels\s*{[^}]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/s);
  assert.match(styles, /\.a-about-page__channels a\s*{[^}]*min-height:[^}]*padding:/s);
  assert.match(styles, /\.a-about-page__channels a:hover,[\s\S]*?\.a-about-page__channels a:focus-visible\s*{[^}]*background:\s*var\(--accent-field\)/s);
  assert.match(styles, /@media \(max-width: 48rem\)[\s\S]*\.a-about-page__channels\s*{[^}]*grid-template-columns:\s*1fr/s);
  assert.doesNotMatch(styles, /\.a-about-page__channels a\s*{[^}]*(border-radius|box-shadow)/s);
  assert.match(styles, /\.public-site :focus-visible/);
});

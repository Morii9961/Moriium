import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

async function read(relativePath) {
  return readFile(new URL(relativePath, root), 'utf8');
}

test('production about page uses the public editorial layout and confirmed public facts', async () => {
  const about = await read('src/pages/[lang]/about/index.astro');

  assert.doesNotMatch(about, /bodyClass=|prototypes\.css/);
  assert.match(about, /import type \{ GetStaticPaths \} from 'astro'/);
  assert.match(about, /class="a-about-page__statement"/);
  assert.match(about, /class="a-about-page__band a-about-page__colophon"/);
  assert.match(about, /c\.facts\.map/);
  assert.doesNotMatch(about, /a-about-page__principles|recordList|RECORD_DATES/);

  // Every channel Morii approved, and no other outbound identity.
  assert.match(about, /https:\/\/github\.com\/Morii9961/);
  assert.match(about, /https:\/\/x\.com\/morii9961/);
  assert.match(about, /https:\/\/space\.bilibili\.com\/670549003/);

  // One feed per interface language, generated from SITE.languages rather than
  // hard-coded, so a fourth language cannot ship with a missing feed link.
  assert.match(about, /SITE\.languages\.map\(\(code\) => \(/);
  assert.match(about, /href=\{`\/\$\{code\}\/rss\.xml`\}/);

  for (const text of ['写下的、拍下的，慢慢留下', '書いたもの、撮ったものを、少しずつ残す', 'What is written and photographed is kept here over time']) {
    assert.match(about, new RegExp(text));
  }

  // The page publishes nothing personal that Morii has not cleared, and stays a
  // static route with no client component.
  assert.doesNotMatch(about, /Dalian|大连|所在地|site-shell page-heading|client:/);
});

test('the public colophon stays factual and omits a recent engineering timeline', async () => {
  const about = await read('src/pages/[lang]/about/index.astro');

  assert.doesNotMatch(about, /RECORD_DATES|recordList|about-record|Since 2026/);
  // Each language supplies the same four public facts: type, build, access,
  // and rights, without turning implementation choices into a manifesto.
  for (const block of ['zh', 'ja', 'en']) {
    const section = about.slice(about.indexOf(`  ${block}: {`));
    const start = section.indexOf('facts: [');
    const list = section.slice(start, section.indexOf('    ],', start));
    assert.equal(list.split('\n').filter((line) => line.trim().startsWith("['")).length, 4, `${block} facts`);
  }
});

test('about page bands share one left axis and keep responsive collapse and visible focus', async () => {
  const [about, styles] = await Promise.all([
    read('src/pages/[lang]/about/index.astro'),
    read('src/styles/public.css'),
  ]);

  assert.match(about, /c\.kindList\.map/);
  assert.match(about, /c\.facts\.map/);

  // One label track drives the content rows and fact blocks.
  assert.match(styles, /\.a-about-page__rows li\s*{[^}]*grid-template-columns:\s*var\(--about-label, 7rem\)/s);
  assert.match(styles, /\.a-about-page__inset div\s*{[^}]*grid-template-columns:\s*var\(--about-label, 7rem\)/s);

  // The rule between rows starts after the label column; that inset is what
  // makes the numbers read as a margin instead of a first cell.
  assert.match(styles, /\.a-about-page__rows li \+ li::before\s*{[^}]*left:\s*calc\(var\(--about-label, 7rem\) \+ 2rem\)/s);

  // A fact block is subordinated by width, never by a container.
  assert.match(styles, /\.a-about-page__inset\s*{[^}]*max-inline-size:\s*34em/s);
  assert.doesNotMatch(styles, /\.a-about-page__inset\s*{[^}]*(background|border-radius|box-shadow)/s);

  // The old three-tile ending is gone in favour of one way back.
  assert.doesNotMatch(styles, /\.a-about-page__links/);
  assert.doesNotMatch(about, /a-about-page__links/);

  assert.match(styles, /@media \(max-width: 48rem\)[\s\S]*\.a-about-page__statement\s*{[^}]*grid-template-columns:\s*1fr/s);
  assert.match(styles, /@media \(max-width: 48rem\)[\s\S]*--about-indent:\s*0rem/s);
  assert.match(styles, /\.public-site :focus-visible/);
});

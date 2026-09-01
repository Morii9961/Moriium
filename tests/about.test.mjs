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
  assert.match(about, /class="a-about-page__principles"/);
  assert.match(about, /class="a-about-page__links"/);
  assert.match(about, /SITE\.author/);
  assert.match(about, /https:\/\/github\.com\/Morii9961/);
  assert.match(about, /href=\{`\/\$\{lang\}\/rss\.xml`\}/);
  for (const text of ['把值得保留的东西', '残しておきたいもの', 'A place to keep what matters']) {
    assert.match(about, new RegExp(text));
  }
  assert.doesNotMatch(about, /Dalian|大连|所在地|site-shell page-heading|client:/);
});

test('production about page keeps responsive principles and visible link focus', async () => {
  const [about, styles] = await Promise.all([
    read('src/pages/[lang]/about/index.astro'),
    read('src/styles/public.css'),
  ]);

  assert.match(about, /c\.rules\.map/);
  assert.match(styles, /\.a-about-page__links\s*{[^}]*grid-template-columns:\s*repeat\(3, 1fr\)/s);
  assert.match(styles, /@media \(max-width: 48rem\)[\s\S]*\.a-about-page__statement\s*{[^}]*grid-template-columns:\s*1fr/s);
  assert.match(styles, /@media \(max-width: 48rem\)[\s\S]*\.a-about-page__links\s*{[^}]*grid-template-columns:\s*1fr/s);
  assert.match(styles, /\.public-site :focus-visible/);
});

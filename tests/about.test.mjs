import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

async function read(relativePath) {
  return readFile(new URL(relativePath, root), 'utf8');
}

test('production about page states confirmed public facts on the reading measure', async () => {
  const about = await read('src/pages/[lang]/about/index.astro');

  assert.match(about, /import type \{ GetStaticPaths \} from 'astro'/);
  // The one prose page on the site reads at the article's own measure.
  assert.match(about, /class="measure measure--prose page-head"/);
  assert.match(about, /class="measure measure--prose band" aria-labelledby="about-statement"/);
  assert.match(about, /class="measure measure--prose band" aria-labelledby="about-principles"/);
  assert.match(about, /aria-labelledby="about-links"/);
  assert.match(about, /SITE\.author/);
  assert.match(about, /https:\/\/github\.com\/Morii9961/);
  assert.match(about, /href=\{`\/\$\{lang\}\/rss\.xml`\}/);
  for (const text of ['把值得保留的东西', '残しておきたいもの', 'A place to keep what matters']) {
    assert.match(about, new RegExp(text));
  }
  // No location, no prototype shell, no client-side framework on a static page.
  assert.doesNotMatch(about, /Dalian|大连|所在地|concept-a|prototypes\.css|client:/);
});

test('production about page keeps its principles ordered, responsive, and focusable', async () => {
  const [about, layout] = await Promise.all([
    read('src/pages/[lang]/about/index.astro'),
    read('src/styles/layout.css'),
  ]);

  assert.match(about, /c\.rules\.map/);
  // The numbering is a real ordering, so it comes from a counter rather than
  // from a hand-written label per item.
  assert.match(layout, /\.principles \{[^}]*counter-reset: principle/s);
  assert.match(layout, /\.principles > li::before \{[^}]*content: counter\(principle, decimal-leading-zero\)/s);
  // The entry list is a fluid grid, so it collapses to one column on its own.
  assert.match(layout, /\.entries \{[^}]*grid-template-columns: repeat\(auto-fit, minmax\(14rem, 1fr\)\)/s);
  assert.match(layout, /\.entries a:hover strong,\s*\.entries a:focus-visible strong/);
});

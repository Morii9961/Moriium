// The writing index's filter, as a contract rather than as code.
//
// It narrows on two axes at once, which is a behaviour a reader can lose
// silently: a panel that still looks right while it filters on one axis, or
// closes after the first choice, or forgets a choice on reload, is not
// obviously broken until someone tries to use two of them together. These
// assertions state each half of that behaviour against the source the page
// ships, the way the other output contracts in this suite do.

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

async function read(relativePath) {
  return readFile(new URL(relativePath, root), 'utf8');
}

test('the filter panel gives each axis its own column and keeps the links real', async () => {
  const [page, styles] = await Promise.all([
    read('src/pages/[lang]/writing/index.astro'),
    read('src/styles/public.css'),
  ]);

  // One column per axis, each labelled as a group so the two lists are not one
  // undifferentiated run of options to a screen reader.
  assert.match(page, /<span class="a-writing-filter__group" id="writing-filter-categories">/);
  assert.match(page, /<span class="a-writing-filter__group" id="writing-filter-tags">/);
  assert.match(page, /role="group" aria-labelledby="writing-filter-categories"/);
  assert.match(page, /role="group" aria-labelledby="writing-filter-tags"/);
  assert.equal((page.match(/class="a-writing-filter__column"/g) ?? []).length, 2);

  // Every option stays an anchor to the page it names. Without the module the
  // panel is still a disclosure full of working category and tag links, and a
  // modified click still opens one.
  assert.match(page, /href=\{`\/\$\{lang\}\/categories\/\$\{encodeURIComponent\(name\)\}\/`\}/);
  assert.match(page, /href=\{`\/\$\{lang\}\/tags\/\$\{encodeURIComponent\(name\)\}\/`\}/);

  assert.match(styles, /\.a-writing-filter__menu\s*{[^}]*grid-template-columns:\s*repeat\(2, minmax\(9\.5rem, 1fr\)\)/s);
  assert.match(styles, /\.a-writing-filter__option--all\s*{[^}]*grid-column:\s*1 \/ -1/s);
  // Each axis scrolls on its own, or a long tag list pushes the categories out
  // of reach.
  assert.match(styles, /\.a-writing-filter__options\s*{[^}]*overflow-y:\s*auto[^}]*max-height:/s);
});

test('the filter narrows on both axes at once and says which are chosen', async () => {
  const page = await read('src/pages/[lang]/writing/index.astro');

  // Within an axis the choices are alternatives; across axes they narrow each
  // other. Both halves are asserted, because either one alone reads as working.
  assert.match(
    page,
    /\(selected\.category\.size === 0 \|\| selected\.category\.has\(entry\.category\)\) &&\s*\n?\s*\(selected\.tag\.size === 0 \|\| entry\.tags\.some\(\(tag\) => selected\.tag\.has\(tag\)\)\)/,
  );

  // Choosing does not close the panel: choosing more than one is the point.
  const menuClick = page.slice(page.indexOf("menu.addEventListener('click'"));
  const handler = menuClick.slice(0, menuClick.indexOf('});'));
  assert.match(handler, /toggleOption\(option, true\)/);
  assert.doesNotMatch(handler, /close\(/);

  // State a reader can see: the pressed options, the summary line, and a URL
  // that carries every choice rather than only the last one.
  assert.match(page, /option\.setAttribute\('aria-pressed', String\(pressed\)\)/);
  assert.match(page, /url\.searchParams\.set\(axis, \[\.\.\.selected\[axis\]\]\.join\(','\)\)/);
  assert.match(page, /for \(const value of raw\.split\(','\)\)/);

  // An option that no longer exists must not filter the list away to nothing.
  assert.match(page, /if \(known\) selected\[axis\]\.add\(value\)/);

  // role="button" promises the space bar, which an anchor does not give.
  assert.match(page, /option\.setAttribute\('role', 'button'\)/);
  assert.match(page, /event\.key !== ' ' && event\.key !== 'Spacebar'/);
});

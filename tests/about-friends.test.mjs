import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test("the about page's friends list carries Enouia's site, described in all three languages", async () => {
  const friends = await read('src/data/friends.ts');
  const entry = /\{\s*name: 'Enouia',[\s\S]*?\n  \}/.exec(friends)?.[0];
  assert.ok(entry, 'Enouia is missing from FRIENDS');
  assert.match(entry, /url: 'https:\/\/enouia\.morii9961\.top\/'/);
  for (const lang of ['zh', 'ja', 'en']) {
    assert.match(entry, new RegExp(`${lang}: '[^']+'`), `no ${lang} description`);
  }
});

test('friends are cells in the same directory strip as the channels, not a list of underlined names', async () => {
  const component = await read('src/components/AboutFriends.astro');

  // Whole cells as links, three to a row, each with a mark, name, note and host.
  assert.match(component, /\.about-friends \{[^}]*display: grid;[^}]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/s);
  assert.match(component, /<span class="about-friends__mark" aria-hidden="true">/);
  assert.match(component, /friend\.avatar \? <img/);
  assert.doesNotMatch(component, /text-decoration: underline/);
  // The blue field on hover, with the mark turned over so it stays visible.
  assert.match(component, /\.about-friends a:hover \.about-friends__mark,[^{]*\{[^}]*background: var\(--accent-field-ink\);/s);
});

test("Enouia's cell uses the small site's own icon, served from this site", async () => {
  const [friends, copied, original] = await Promise.all([
    read('src/data/friends.ts'),
    read('public/friends/enouia.svg'),
    read('enouia/public/favicon.svg'),
  ]);
  assert.match(friends, /avatar: '\/friends\/enouia\.svg'/);
  assert.equal(copied, original, 'the copy has drifted from the small site favicon');
  assert.doesNotMatch(copied, /<script|href=|url\(/i);
});

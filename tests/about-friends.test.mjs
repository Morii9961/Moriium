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

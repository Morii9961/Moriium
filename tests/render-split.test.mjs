import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';

const root = new URL('../', import.meta.url);

async function read(relativePath) {
  return readFile(new URL(relativePath, root), 'utf8');
}

// scripts/check-render-split.mjs checks the built tree, which is the real
// proof. These run before the build instead, so a configuration mistake is
// caught in seconds rather than after a full build, and so the reason each
// setting exists is recorded next to the assertion.

test('the config keeps static as the default and admits the adapter for on-demand routes only', async () => {
  const config = await read('astro.config.mjs');
  // The config's own comment explains why `output: 'server'` is wrong, so the
  // negative assertion has to read code rather than prose.
  const code = config.replace(/^\s*\/\/.*$/gm, '');

  // `output: 'server'` would invert the default and put every public route
  // behind the Node process. ADR 0002 section 4 forbids that.
  assert.match(code, /output:\s*'static'/);
  assert.doesNotMatch(code, /output:\s*'server'/);
  assert.match(code, /adapter:\s*node\(\{\s*mode:\s*'standalone'\s*\}\)/);
});

test('every admin and api page opts out of prerendering', async () => {
  const pages = new URL('src/pages/', root);
  const checked = [];

  for (const prefix of ['admin', 'api']) {
    let entries;
    try {
      entries = await readdir(new URL(`${prefix}/`, pages), { recursive: true, withFileTypes: true });
    } catch {
      continue; // the prefix does not exist yet
    }
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (!/\.(astro|ts|js)$/.test(entry.name)) continue;
      const relativePath = join('src/pages', prefix, entry.parentPath.split(/src[\\/]pages[\\/]/)[1] ?? '', entry.name);
      const source = await readFile(join(entry.parentPath, entry.name), 'utf8');
      assert.match(
        source,
        /export const prerender = false/,
        `${relativePath} must declare "export const prerender = false"; without it the route is prerendered and its session logic never runs`,
      );
      checked.push(relativePath);
    }
  }

  // The suite would pass vacuously if the directories were empty or renamed,
  // which is exactly how this kind of check rots.
  assert.ok(checked.length > 0, 'no admin or api pages were found to check');
});

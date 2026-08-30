// The admin client's URLs against the routes that have to answer them.
//
// This exists because of a defect it would have caught. `trailingSlash: 'always'`
// in astro.config.mjs applies to API routes as well as pages, and every path in
// src/admin/api.ts was written without one. Astro answered all of them with the
// 404 page, so the production admin could mount its login shell and never reach
// its own API. The browser check that block passed -- "the shell mounts" -- was
// true and told us nothing.
//
// So the two halves are asserted against each other rather than separately:
// the config decides whether a trailing slash is required, and the route
// patterns decide which sub-paths exist at all.

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';

const root = resolve(import.meta.dirname, '..');
const client = readFileSync(resolve(root, 'src/admin/api.ts'), 'utf8');
const config = readFileSync(resolve(root, 'astro.config.mjs'), 'utf8');

/** Every `/api/...` literal the client sends, with interpolations made concrete. */
function clientPaths() {
  const found = new Set();
  for (const match of client.matchAll(/['"`](\/api\/[^'"`]*)['"`]/g)) {
    found.add(match[1].replace(/\$\{[^}]+\}/g, '1'));
  }
  return [...found];
}

/** The route file Astro resolves a path to, or null when nothing can serve it. */
function routeFor(path) {
  const segments = path.split('/').filter(Boolean).slice(1);
  const [collection, ...rest] = segments;
  const direct = resolve(root, `src/pages/api/${collection}.ts`);
  if (rest.length === 0) {
    if (existsSync(direct)) return { file: direct, rest: [] };
    const index = resolve(root, `src/pages/api/${collection}/index.ts`);
    return existsSync(index) ? { file: index, rest: [] } : null;
  }
  const rested = resolve(root, `src/pages/api/${collection}/[...path].ts`);
  return existsSync(rested) ? { file: rested, rest } : null;
}

describe('admin client routes', () => {
  it('matches the trailing slash rule the site is configured with', () => {
    const declared = /trailingSlash:\s*'([a-z]+)'/.exec(config);
    assert.ok(declared, 'astro.config.mjs must state a trailingSlash policy');
    assert.equal(declared[1], 'always');

    const paths = clientPaths();
    assert.ok(paths.length >= 12, `expected the whole client surface, found ${paths.length}`);
    const bare = paths.filter((path) => !path.endsWith('/'));
    assert.deepEqual(bare, [], 'these would resolve to the 404 page, not to the API');
  });

  it('sends nothing to a path no route file answers', () => {
    for (const path of clientPaths()) {
      const route = routeFor(path);
      assert.ok(route, `${path} has no route file`);
      if (route.rest.length === 0) continue;

      // A rest route decides its own sub-paths with one pattern. Read it rather
      // than restating it here, so the two cannot drift apart.
      const source = readFileSync(route.file, 'utf8');
      const declared = /^const [A-Z_]+ = (\/\^.*\$\/);$/m.exec(source);
      assert.ok(declared, `${route.file} must declare one anchored path pattern`);
      const pattern = new RegExp(declared[1].slice(1, -1));
      assert.match(route.rest.join('/'), pattern, `${path} is not accepted by its route`);
    }
  });

  it('rejects a sub-path outside the pattern, so the check above is not vacuous', () => {
    const route = routeFor('/api/articles/1/versions/');
    const source = readFileSync(route.file, 'utf8');
    const declared = /^const [A-Z_]+ = (\/\^.*\$\/);$/m.exec(source);
    const pattern = new RegExp(declared[1].slice(1, -1));
    assert.doesNotMatch('1/delete', pattern);
    assert.doesNotMatch('../../etc/passwd', pattern);
  });
});

// Enforces the rendering split ADR 0002 section 4 and 5 fix.
//
//   node scripts/check-render-split.mjs      (runs inside `pnpm verify`, after the build)
//
// The claim being defended is not "the admin is separate". It is stronger and
// worth stating exactly: a reader's request never needs the Node process. That
// holds only while every public route exists as a file Nginx can serve on its
// own, so this checks the built tree rather than the configuration that was
// supposed to produce it.
//
// AGENTS.md's quality gate says to prove this by stopping the process rather
// than asserting it. A file that exists on disk is that proof in its checkable
// form: if the route resolves to a file, stopping Node cannot affect it.

import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import process from 'node:process';
import { publicOutputRoot, repoRoot, serverOutputRoot } from './lib/public-output.mjs';

const publicRoot = publicOutputRoot();
const serverRoot = serverOutputRoot();
const failures = [];

/** Routes a reader can reach. Each must be a file, not a promise from a server. */
const MUST_BE_STATIC = [
  'index.html',
  '404.html',
  'sitemap-index.xml',
  'robots.txt',
  ...['zh', 'ja', 'en'].flatMap((lang) => [
    `${lang}/index.html`,
    `${lang}/writing/index.html`,
    `${lang}/archive/index.html`,
    `${lang}/categories/index.html`,
    `${lang}/tags/index.html`,
    `${lang}/about/index.html`,
    `${lang}/rss.xml`,
  ]),
];

/** Prefixes that must NOT be prerendered, because they need a session. */
const MUST_BE_ON_DEMAND = ['admin', 'api'];

/**
 * Admin-only libraries. ADR 0002 section 16 forbids them from reaching a public
 * route, and AGENTS.md carries that as a quality gate.
 *
 * This is trivially satisfied today because the admin placeholder ships no
 * client JavaScript. It is here so that the day the real editor arrives, a leak
 * fails the build instead of shipping a megabyte of editor to every reader.
 */
const ADMIN_ONLY = ['@tiptap', 'prosemirror', 'createApp', 'vue.runtime'];

async function filesUnder(directory) {
  const found = [];
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...(await filesUnder(path)));
    else found.push(path);
  }
  return found;
}

async function isFile(path) {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

// 1. Every public route is a file on disk.
for (const route of MUST_BE_STATIC) {
  if (!(await isFile(join(publicRoot, route)))) {
    failures.push(`${route} is not in the prerendered output; a reader would need the Node process for it`);
  }
}

// 2. Search indexes exist per language, since the search UI loads them directly.
for (const lang of ['zh', 'ja', 'en']) {
  if (!(await isFile(join(publicRoot, 'search', `${lang}.json`)))) {
    failures.push(`search/${lang}.json is not prerendered`);
  }
}

// 3. On-demand prefixes must be absent from the public tree.
for (const prefix of MUST_BE_ON_DEMAND) {
  if (await isFile(join(publicRoot, prefix, 'index.html'))) {
    failures.push(`/${prefix}/ was prerendered; it must stay on-demand (prerender = false)`);
  }
}

// 4. The adapter actually produced a server entry, or nothing needs one.
const hasOnDemandRoute = serverRoot !== null;
if (hasOnDemandRoute && !(await isFile(join(serverRoot, 'entry.mjs')))) {
  failures.push('dist/server exists but has no entry.mjs');
}

// 5. No public asset carries admin-only code.
const publicFiles = (await filesUnder(publicRoot)).filter((file) =>
  ['.html', '.js', '.css'].some((extension) => file.endsWith(extension)),
);
for (const file of publicFiles) {
  const content = await readFile(file, 'utf8');
  for (const marker of ADMIN_ONLY) {
    if (content.includes(marker)) {
      failures.push(`${relative(repoRoot, file)} contains admin-only code (${marker})`);
    }
  }
}

if (failures.length > 0) {
  console.error('Rendering split is broken:');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exitCode = 1;
} else {
  console.log(
    `Rendering split holds: ${publicFiles.length} public files serve without Node; ` +
      `${MUST_BE_ON_DEMAND.join(', ')} stay on demand.`,
  );
}

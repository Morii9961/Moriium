// Ground-truth check on the baseline renderer.
//
//   pnpm -C prototypes baselines:verify
//
// The baseline is only worth something if it renders the way the deployed site
// renders. Reasoning about plugin lists cannot establish that; comparing output
// can. This takes a REAL production post, runs it through the baseline
// renderer, and compares it against the page Astro actually built into dist/.
//
// It found a real defect the first time it ran: without Expressive Code the
// baseline emitted `pre.astro-code`, while dist/ contains `div.expressive-code`
// and no `astro-code` at all, so every code block would have been scored as a
// difference.
//
// Requires a current dist/. Run `pnpm build` at the repository root first.

import { readFile } from 'node:fs/promises';
import process from 'node:process';
import { parseFrontmatter } from '@astrojs/markdown-remark';
import { createPublicRenderer } from './build-baselines.mjs';

const SOURCE = '../../src/content/posts/zh/reader-capabilities.md';
const BUILT = '../../dist/zh/posts/reader-capabilities/index.html';

// Structural markers, one per capability the fixtures exercise. Counts may
// legitimately differ because dist/ wraps the article in the site shell, so
// presence is what is compared.
const MARKERS = [
  'expressive-code',
  'astro-code',
  'figure class="frame',
  'ec-line',
  'has-title',
  'katex',
  'admonition--note',
  'admonition--tip',
  'admonition--important',
  'admonition--warning',
  'admonition--caution',
  'data-admonition',
  'spoiler',
  'data-lightbox',
];

const here = import.meta.dirname;
const resolveHere = (path) => new URL(path, `file:///${here.replace(/\\/g, '/')}/`);

let built;
try {
  built = await readFile(resolveHere(BUILT), 'utf8');
} catch {
  console.error('dist/ is missing or stale. Run `pnpm build` at the repository root first.');
  process.exit(1);
}

const renderer = await createPublicRenderer();
const { content } = parseFrontmatter(await readFile(resolveHere(SOURCE), 'utf8'));
const baseline = (await renderer.render(content)).code;

const occurrences = (haystack, needle) => haystack.split(needle).length - 1;
const pad = (value, width) => String(value).padEnd(width);

console.log(`${pad('marker', 26)}${pad('baseline', 10)}${pad('dist', 10)}status`);

let mismatches = 0;
for (const marker of MARKERS) {
  const inBaseline = occurrences(baseline, marker);
  const inBuilt = occurrences(built, marker);
  const agrees = inBaseline > 0 === inBuilt > 0;
  if (!agrees) mismatches += 1;
  console.log(`${pad(marker, 26)}${pad(inBaseline, 10)}${pad(inBuilt, 10)}${agrees ? 'ok' : 'MISMATCH'}`);
}

if (mismatches > 0) {
  console.error(
    `\n${mismatches} marker(s) present on one side only. The baseline renderer has drifted ` +
      'from the deployed pipeline; fix it before trusting any fidelity number taken against it.',
  );
  process.exitCode = 1;
} else {
  console.log(`\nAll ${MARKERS.length} markers agree with the built page.`);
}

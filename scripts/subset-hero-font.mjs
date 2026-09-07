// Regenerates the home hero's display Mincho subset.
//
// The hero sets a fixed, short piece of Japanese in a high-contrast display
// Mincho. Shipping the whole face would cost 1.4 MB for roughly forty glyphs,
// so this tool cuts Shippori Mincho down to exactly the characters the hero
// renders and writes a matching `unicode-range`. Anything outside that range
// falls through to the platform Mincho fallbacks in `--font-mincho`.
//
// This is a manual, dev-only step. It is deliberately NOT part of `pnpm build`:
// CI must not need Python. Re-run it after changing the hero's Japanese copy —
// `tests/design-fonts.test.mjs` fails if the shipped subset stops covering it.
//
//   python -m pip install fonttools brotli
//   node scripts/subset-hero-font.mjs
//
// Source of truth for the face: the pinned `@fontsource/shippori-mincho`
// devDependency, so the subset stays reproducible from a known upstream build.

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
// 600 sets the two statements; 400 sets the vertical notes and the background
// fragments. Both cover the same glyph set, so either can render any of it.
const WEIGHTS = [400, 600];
const source = (weight) =>
  `node_modules/@fontsource/shippori-mincho/files/shippori-mincho-japanese-${weight}-normal.woff2`;
const outFont = (weight) => `public/fonts/shippori-mincho-hero-${weight}.woff2`;
// The manifest records what the subset covers. It stays out of `public/` so
// it is never served; only the two WOFF2 files reach the site.
const OUT_MANIFEST = 'scripts/hero-font-subset.json';

// Everything the hero renders in `--font-mincho`: the two statements, the two
// vertical marginal notes, and the background fragments.
const heroSource = readFileSync(new URL('src/pages/[lang]/index.astro', root), 'utf8');

function charsOf(pattern, group = 1) {
  return [...heroSource.matchAll(pattern)].map((match) => match[group]).join('');
}

const displayText = [
  charsOf(/char: '([^']+)'/g),
  charsOf(/leftNote: '([^']+)'/g),
  charsOf(/rightNote: '([^']+)'/g),
].join('');

const points = [...new Set([...displayText])].map((c) => c.codePointAt(0)).sort((a, b) => a - b);
if (points.length === 0) throw new Error('No hero display characters found; the source shape changed.');

// Contiguous runs collapse into ranges so the @font-face declaration stays short.
const ranges = [];
for (const point of points) {
  const last = ranges.at(-1);
  if (last && point === last[1] + 1) last[1] = point;
  else ranges.push([point, point]);
}
const hex = (n) => n.toString(16).toUpperCase().padStart(4, '0');
const unicodeRange = ranges
  .map(([from, to]) => (from === to ? `U+${hex(from)}` : `U+${hex(from)}-${hex(to)}`))
  .join(', ');

mkdirSync(fileURLToPath(new URL('public/fonts/', root)), { recursive: true });

const sizes = [];
for (const weight of WEIGHTS) {
  execFileSync(
    'python',
    [
      '-m',
      'fontTools.subset',
      fileURLToPath(new URL(source(weight), root)),
      `--unicodes=${points.map((p) => hex(p)).join(',')}`,
      '--flavor=woff2',
      '--layout-features=',
      '--no-hinting',
      '--desubroutinize',
      `--output-file=${fileURLToPath(new URL(outFont(weight), root))}`,
    ],
    { cwd: fileURLToPath(root), stdio: ['ignore', 'inherit', 'inherit'] },
  );
  sizes.push([weight, statSync(new URL(source(weight), root)).size, statSync(new URL(outFont(weight), root)).size]);
}

writeFileSync(
  new URL(OUT_MANIFEST, root),
  `${JSON.stringify(
    {
      source: '@fontsource/shippori-mincho 5.3.0, japanese subsets',
      family: 'Shippori Mincho',
      weights: WEIGHTS,
      characters: [...displayText].filter((c, i, all) => all.indexOf(c) === i).sort().join(''),
      unicodeRange,
    },
    null,
    2,
  )}\n`,
  'utf8',
);

for (const [weight, before, after] of sizes) {
  console.log(`Hero Mincho ${weight}: ${points.length} glyphs, ${after} bytes (from ${before} bytes).`);
}
console.log(`unicode-range: ${unicodeRange}`);

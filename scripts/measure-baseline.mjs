// Records what the public build weighs, and fails when it grows past a budget.
//
//   node scripts/measure-baseline.mjs                 (report and check the budgets)
//   node scripts/measure-baseline.mjs --report        (report only; never fails)
//   node scripts/measure-baseline.mjs --root <dir>    (measure a tree elsewhere)
//
// --root exists so the budget failure itself can be tested against a synthetic
// tree. A check nobody has watched fail is a check nobody knows the shape of.
//
// The vNext plan (docs/enouia-todo.md section 00) asks for a baseline the
// rebuild must not regress against. A number written into a document is not
// that: nobody re-measures it, and prose cannot go red. So the measurement and
// the budget live together here, and the budget is the part that fails.
//
// The budgets are deliberately uneven, because the claims behind them are.
//
// The eager-JavaScript budget is the strict one. AGENTS.md requires that an
// ordinary page not download Mermaid, PhotoSwipe, music, video, or decryption
// code, and the existing checks defend that structurally — a module loads only
// when its content marker exists. This defends it by weight instead, which
// catches the case the marker rules cannot: a bundler decision that quietly
// merges an advanced module into the shared chunk. The smallest of those
// modules is an order of magnitude above the budget, so any such merge fails
// here immediately.
//
// The remaining budgets are recorded values with headroom. They exist to make
// growth visible and deliberate, not to be tight. Raising one is a normal
// edit; doing it without saying why in the commit message is not.
//
// Measurement rules, fixed so two runs are comparable:
//
//   - Only the public tree counts. dist/server/ is not something a reader
//     fetches, and ADR 0002 section 4 keeps it out of the reader's path.
//   - "Eager" means referenced by src= or href= in the HTML. A dynamic
//     import() is excluded by construction; that exclusion is the whole point.
//   - Sizes are reported raw and gzip -6, because gzip level 6 is what
//     deploy/nginx/moriium.conf actually sends for text.
//   - The /design/ study tree is measured separately and excluded from the
//     production totals. It is isolated research with no visual authorization
//     (AGENTS.md, clean-room visual contract), so its churn must not move a
//     production baseline.
//   - That exclusion has to follow the assets, not just the page paths. A study
//     page lives under design/, but the stylesheet and font files it pulls in
//     land in the shared _astro/ directory like any other asset. Splitting on
//     the path alone therefore left every study-only byte inside the production
//     total: when this was written that was 226 files and 12.7 MB, roughly half
//     the reported production weight. So an _astro/ asset is attributed by who
//     reaches it. Reachable from a production page, it is production. Reachable
//     only from a study page, directly or through another asset, it is study.
//     Reachable from neither, it stays in the production total and is reported,
//     because an orphan in the public tree is a fact worth seeing.

import { gzipSync } from 'node:zlib';
import { readdir, readFile, stat } from 'node:fs/promises';
import { extname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import process from 'node:process';
import { publicOutputRoot } from './lib/public-output.mjs';

const rootFlag = process.argv.indexOf('--root');
if (rootFlag !== -1 && process.argv[rootFlag + 1] === undefined) {
  console.error('Moriium baseline: --root needs a directory.');
  process.exit(1);
}
const publicRoot = rootFlag === -1 ? publicOutputRoot() : resolve(process.argv[rootFlag + 1]);
const reportOnly = process.argv.includes('--report');

/** The study tree, excluded from production totals. */
const STUDY_PREFIX = 'design';

/** Where the bundler puts shared output, regardless of which page asked for it. */
const ASSET_PREFIX = '_astro/';

/** Extensions worth reading for references. Font and image files carry none. */
const SCANNABLE = new Set(['.html', '.css', '.js', '.mjs', '.json', '.xml', '.txt']);

const ASSET_REFERENCE = /_astro\/[A-Za-z0-9._-]+/g;

/**
 * Pages measured individually.
 *
 * "ordinary" carries no advanced content marker and is what almost every
 * reader loads. "capability" is the acceptance article that deliberately uses
 * every advanced block, so it is the upper bound rather than the typical case.
 */
export const SAMPLES = [
  { kind: 'ordinary', path: 'zh/index.html', label: 'home (zh)' },
  { kind: 'ordinary', path: 'en/index.html', label: 'home (en)' },
  { kind: 'ordinary', path: 'ja/index.html', label: 'home (ja)' },
  { kind: 'ordinary', path: 'zh/writing/index.html', label: 'writing index (zh)' },
  { kind: 'ordinary', path: 'zh/posts/moriium-reconstruction/index.html', label: 'plain article (zh)' },
  { kind: 'capability', path: 'zh/posts/reader-capabilities/index.html', label: 'capability article (zh)' },
];

/**
 * Budgets, in bytes. Measured 2026-08-31 against the values in the header.
 *
 * Exported so a test can assert the strict one still sits far below every
 * advanced module it is meant to catch.
 */
export const BUDGETS = {
  /** Strict. The smallest advanced module is many times this. */
  ordinaryEagerJs: 8 * 1024,
  /** The acceptance article legitimately loads the reader enhancements. */
  capabilityEagerJs: 24 * 1024,
  /** Recorded with headroom; dominated by the CJK @font-face declarations. */
  eagerCssGzip: 120 * 1024,
  /** Recorded with headroom; grows with the article count. */
  searchIndexGzip: 256 * 1024,
};

const failures = [];
const notes = [];

function kib(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function mib(bytes) {
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

/** Every file under a directory, as paths relative to the public root. */
async function walk(directory) {
  const found = [];
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...(await walk(full)));
    else if (entry.isFile()) found.push(relative(publicRoot, full).split('\\').join('/'));
  }
  return found;
}

async function gzipSize(relativePath) {
  return gzipSync(await readFile(join(publicRoot, relativePath)), { level: 6 }).byteLength;
}

/**
 * The assets a browser fetches before it can render the page.
 *
 * Reads the markup rather than the build manifest: the manifest describes what
 * the bundler produced, and the question here is what the document asks for.
 */
async function eagerAssets(pagePath) {
  let html;
  try {
    html = await readFile(join(publicRoot, pagePath), 'utf8');
  } catch {
    // A sample that is not in the build is a failure to report, not a crash.
    // A route disappearing is exactly the regression worth catching.
    return null;
  }
  const references = new Set();
  for (const match of html.matchAll(/(?:src|href)="\/(_astro\/[^"]+)"/g)) {
    references.add(match[1]);
  }

  const assets = { js: [], css: [] };
  for (const reference of [...references].sort()) {
    let size;
    try {
      size = (await stat(join(publicRoot, reference))).size;
    } catch {
      continue;
    }
    const entry = { path: reference, size, gzip: await gzipSize(reference) };
    if (reference.endsWith('.js')) assets.js.push(entry);
    else if (reference.endsWith('.css')) assets.css.push(entry);
  }
  return assets;
}

function total(entries, field) {
  return entries.reduce((sum, entry) => sum + entry[field], 0);
}

function check(label, actual, budget) {
  if (actual > budget) {
    failures.push(`${label} is ${kib(actual)}, over the ${kib(budget)} budget.`);
    return;
  }
  notes.push(`${label}: ${kib(actual)} of ${kib(budget)}`);
}

async function bytes(list) {
  let sum = 0;
  for (const file of list) sum += (await stat(join(publicRoot, file))).size;
  return sum;
}

/**
 * Every _astro/ path named inside one file.
 *
 * Reads the text rather than the build manifest, for the same reason
 * eagerAssets does: the question is what a document actually asks for. It also
 * catches the case the manifest hides, which is a font reached only through a
 * stylesheet's url().
 */
async function assetReferences(relativePath) {
  if (!SCANNABLE.has(extname(relativePath).toLowerCase())) return [];
  let text;
  try {
    text = await readFile(join(publicRoot, relativePath), 'utf8');
  } catch {
    return [];
  }
  return [...new Set(text.match(ASSET_REFERENCE) ?? [])];
}

/**
 * Assets reachable from a set of entry files, following references between
 * assets as far as they go. A stylesheet naming a font makes that font
 * reachable; so does a chunk naming another chunk.
 */
async function reachableAssets(entryFiles, assets) {
  const seen = new Set();
  const pending = [];
  for (const file of entryFiles) pending.push(...(await assetReferences(file)));

  while (pending.length > 0) {
    const asset = pending.pop();
    if (seen.has(asset) || !assets.has(asset)) continue;
    seen.add(asset);
    pending.push(...(await assetReferences(asset)));
  }
  return seen;
}

async function main() {
  const files = await walk(publicRoot);
  if (files.length === 0) {
    console.error('Moriium baseline: the public build is missing. Run pnpm build first.');
    process.exit(1);
  }

  const assets = new Set(files.filter((file) => file.startsWith(ASSET_PREFIX)));
  const studyPages = files.filter((file) => file.startsWith(`${STUDY_PREFIX}/`));
  const productionPages = files.filter(
    (file) => !file.startsWith(`${STUDY_PREFIX}/`) && !assets.has(file),
  );

  // An asset belongs to whoever can reach it. Production wins ties: an asset a
  // reader can fetch is production weight even when a study page also uses it.
  const reachedByProduction = await reachableAssets(productionPages, assets);
  const reachedByStudy = await reachableAssets(studyPages, assets);
  const studyOnlyAssets = new Set(
    [...reachedByStudy].filter((asset) => !reachedByProduction.has(asset)),
  );
  const orphanAssets = [...assets].filter(
    (asset) => !reachedByProduction.has(asset) && !reachedByStudy.has(asset),
  );

  const study = [...studyPages, ...studyOnlyAssets];
  const production = files.filter(
    (file) => !file.startsWith(`${STUDY_PREFIX}/`) && !studyOnlyAssets.has(file),
  );

  console.log('Moriium public build baseline\n');
  console.log(`  production files      ${production.length}`);
  console.log(`  production pages      ${production.filter((f) => f.endsWith('.html')).length} HTML`);
  console.log(`  production bytes      ${mib(await bytes(production))}`);
  console.log(`  design study pages    ${studyPages.filter((f) => f.endsWith('.html')).length} HTML (excluded from totals)`);
  console.log(`  design study bytes    ${mib(await bytes(study))} (excluded from totals)`);
  console.log(`  study-only assets     ${studyOnlyAssets.size} under ${ASSET_PREFIX} (excluded from totals)`);
  if (orphanAssets.length > 0) {
    console.log(`  unreferenced assets   ${orphanAssets.length} under ${ASSET_PREFIX} (counted as production)`);
  }

  console.log('\n  Per page, before any interaction:\n');
  let worstOrdinaryJs = 0;
  let worstCapabilityJs = 0;
  let worstCssGzip = 0;

  for (const sample of SAMPLES) {
    const assets = await eagerAssets(sample.path);
    if (assets === null) {
      failures.push(`${sample.path} is missing from the build.`);
      continue;
    }
    const js = total(assets.js, 'size');
    const cssGzip = total(assets.css, 'gzip');
    if (sample.kind === 'ordinary') worstOrdinaryJs = Math.max(worstOrdinaryJs, js);
    else worstCapabilityJs = Math.max(worstCapabilityJs, js);
    worstCssGzip = Math.max(worstCssGzip, cssGzip);

    console.log(
      `    ${sample.label.padEnd(24)} js ${kib(js).padStart(9)}` +
        `  css ${kib(total(assets.css, 'size')).padStart(9)} (${kib(cssGzip)} gz)`,
    );
  }

  const indexes = production.filter((file) => file.startsWith('search/') && file.endsWith('.json'));
  let worstIndexGzip = 0;
  for (const index of indexes) worstIndexGzip = Math.max(worstIndexGzip, await gzipSize(index));
  console.log(`\n  search index          ${indexes.length} languages, largest ${kib(worstIndexGzip)} gz (loaded on open)`);

  check('ordinary page eager JavaScript', worstOrdinaryJs, BUDGETS.ordinaryEagerJs);
  check('capability page eager JavaScript', worstCapabilityJs, BUDGETS.capabilityEagerJs);
  check('eager CSS, gzipped', worstCssGzip, BUDGETS.eagerCssGzip);
  check('search index, gzipped', worstIndexGzip, BUDGETS.searchIndexGzip);

  console.log('\n  Budgets:\n');
  for (const note of notes) console.log(`    ${note}`);

  if (failures.length > 0 && !reportOnly) {
    console.error('\nMoriium baseline: the public build grew past its budget.\n');
    for (const failure of failures) console.error(`  - ${failure}`);
    console.error('\nRaise the budget in scripts/measure-baseline.mjs only with a reason in the commit message.');
    process.exit(1);
  }

  if (failures.length > 0) {
    console.log('\n  Over budget (not failing, --report):\n');
    for (const failure of failures) console.log(`    - ${failure}`);
  }

  console.log('');
}

// Only measure when run as a command. The test imports the budgets and the
// sample list to build its fixture, and must not trigger a measurement of the
// real build to do it.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}

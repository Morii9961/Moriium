import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, it, after } from 'node:test';

import { BUDGETS, SAMPLES } from '../scripts/measure-baseline.mjs';

const command = new URL('../scripts/measure-baseline.mjs', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

// ADR 0001 section 5: a check that has never been watched fail is not known to
// work. These build synthetic public trees and run the real command against
// them with --root, so the failure is observed rather than assumed.

const temporary = [];

after(() => {
  for (const directory of temporary) rmSync(directory, { recursive: true, force: true });
});

/**
 * Writes a minimal public tree the command can measure.
 *
 * Every sample page is created, because a missing sample is itself a failure
 * and would make a budget test pass for the wrong reason.
 */
function buildTree({ ordinaryJsBytes, capabilityJsBytes = 1024, study = null, orphanBytes = 0 }) {
  const root = mkdtempSync(join(tmpdir(), 'moriium-baseline-'));
  temporary.push(root);

  const write = (relativePath, contents) => {
    const full = join(root, relativePath);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, contents);
  };

  // Incompressible bytes, so a gzip budget cannot accidentally rescue a file
  // that is over the raw budget.
  const filler = (size) => Buffer.from(Array.from({ length: size }, (_, i) => (i * 37 + 11) % 256));

  write('_astro/ordinary.js', filler(ordinaryJsBytes));
  write('_astro/capability.js', filler(capabilityJsBytes));
  write('_astro/site.css', 'body{color:#000}');
  write('search/zh.json', '[]');

  for (const [index, sample] of SAMPLES.entries()) {
    const script = sample.kind === 'ordinary' ? 'ordinary.js' : 'capability.js';
    // When the study asset is shared, exactly one production page pulls it in.
    // One is enough, and using one proves attribution follows a reference
    // rather than a majority.
    const shared = study?.sharedWithProduction && index === 0
      ? '<link rel="stylesheet" href="/_astro/study.css">'
      : '';
    write(
      sample.path,
      `<!doctype html><html><head><link rel="stylesheet" href="/_astro/site.css">${shared}` +
        `<script type="module" src="/_astro/${script}"></script></head><body></body></html>`,
    );
  }

  if (study) {
    // The shape of the real bug: the study page names a stylesheet, and only
    // the stylesheet names the font. Attribution that reads pages alone, or
    // that splits on the path, misses the bytes that actually matter.
    write('_astro/study-font.woff2', filler(study.assetBytes));
    write('_astro/study.css', '@font-face{src:url(/_astro/study-font.woff2)}');
    write(
      'design/jiege/zh/index.html',
      '<!doctype html><html><head><link rel="stylesheet" href="/_astro/study.css">' +
        '</head><body></body></html>',
    );
  }

  if (orphanBytes > 0) write('_astro/orphan.js', filler(orphanBytes));

  return root;
}

function run(root, ...flags) {
  return spawnSync(process.execPath, [command, '--root', root, ...flags], { encoding: 'utf8' });
}

describe('the public build baseline', () => {
  it('passes when an ordinary page stays under the eager JavaScript budget', () => {
    const root = buildTree({ ordinaryJsBytes: 2 * 1024 });
    const result = run(root);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /ordinary page eager JavaScript: 2\.0 KB of 8\.0 KB/);
  });

  // The negative test the rest of the file depends on. Without it, a budget
  // that silently never fires would look exactly like a build that never grew.
  it('fails when an ordinary page grows past the eager JavaScript budget', () => {
    const root = buildTree({ ordinaryJsBytes: BUDGETS.ordinaryEagerJs + 1 });
    const result = run(root);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /grew past its budget/);
    assert.match(result.stderr, /ordinary page eager JavaScript is 8\.0 KB, over the 8\.0 KB budget/);
  });

  it('reports without failing under --report', () => {
    const root = buildTree({ ordinaryJsBytes: BUDGETS.ordinaryEagerJs * 4 });
    const result = run(root, '--report');

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Over budget \(not failing, --report\)/);
  });

  it('separates the ordinary budget from the capability article', () => {
    // The acceptance article carries every advanced block, so it is allowed
    // more. Giving it the ordinary budget would make the strict number
    // meaningless; sharing one budget would make it unenforceable.
    assert.ok(BUDGETS.capabilityEagerJs > BUDGETS.ordinaryEagerJs);

    const root = buildTree({
      ordinaryJsBytes: 1024,
      capabilityJsBytes: BUDGETS.capabilityEagerJs + 1,
    });
    const result = run(root);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /capability page eager JavaScript is/);
    assert.doesNotMatch(result.stderr, /ordinary page eager JavaScript is/);
  });

  it('treats a missing sample page as a failure rather than a clean run', () => {
    const root = buildTree({ ordinaryJsBytes: 1024 });
    rmSync(join(root, SAMPLES[0].path), { force: true });
    const result = run(root);

    assert.equal(result.status, 1);
    assert.match(result.stderr, new RegExp(`${SAMPLES[0].path.replace(/\//g, '\\/')} is missing`));
  });

  // The /design/ tree is excluded from the production totals, but its pages
  // pull shared output into _astro/ like any other page. Splitting on the path
  // alone left 12.7 MB of study-only fonts and stylesheets inside the reported
  // production weight. These three cases pin the attribution down: excluded
  // when only the study reaches it, counted when production reaches it too,
  // and counted when nothing reaches it at all.
  it('excludes a study-only asset reached through a study stylesheet', () => {
    const root = buildTree({ ordinaryJsBytes: 1024, study: { assetBytes: 3 * 1024 * 1024 } });
    const result = run(root);

    assert.equal(result.status, 0, result.stderr);
    // The stylesheet and the font it names, neither reachable from production.
    assert.match(result.stdout, /study-only assets {5}2 under _astro\/ \(excluded from totals\)/);
    assert.match(result.stdout, /design study bytes {4}3\.0 MB/);
    assert.match(result.stdout, /production bytes {6}0\.0 MB/);
  });

  // The negative case, and the reason the exclusion is safe to have at all.
  // Without it, moving a heavy asset behind a study reference would be a way to
  // drop real production weight out of the baseline.
  it('counts a study asset as production as soon as a production page uses it', () => {
    const root = buildTree({
      ordinaryJsBytes: 1024,
      study: { assetBytes: 3 * 1024 * 1024, sharedWithProduction: true },
    });
    const result = run(root);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /study-only assets {5}0 under _astro\/ \(excluded from totals\)/);
    assert.match(result.stdout, /production bytes {6}3\.0 MB/);
    assert.match(result.stdout, /design study bytes {4}0\.0 MB/);
  });

  // The other direction: an asset nothing references is not study output, so it
  // stays in the production total and is named rather than quietly dropped.
  it('keeps an unreferenced asset in the production total and reports it', () => {
    const root = buildTree({ ordinaryJsBytes: 1024, orphanBytes: 2 * 1024 * 1024 });
    const result = run(root);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /unreferenced assets {3}1 under _astro\/ \(counted as production\)/);
    assert.match(result.stdout, /production bytes {6}2\.0 MB/);
  });

  it('keeps the strict budget far below every advanced reader module', () => {
    // The budget only defends AGENTS.md's rule while it stays well under the
    // smallest module it is meant to catch. KaTeX, Mermaid and cytoscape are
    // each hundreds of kilobytes; 8 KB leaves no way for one to slip in.
    assert.ok(BUDGETS.ordinaryEagerJs < 16 * 1024);
  });
});

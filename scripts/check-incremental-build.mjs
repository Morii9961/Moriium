// Compare complete static output, not just cached article bodies. No source is edited.
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';

const root = resolve(import.meta.dirname, '..');
const samples = Number(process.argv[2] ?? 2);
if (!Number.isInteger(samples) || samples < 1 || samples > 20) throw new Error('Sample count must be from 1 to 20.');
const snapshot = (directory, prefix = '') => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const file = join(directory, entry.name), name = prefix + entry.name;
  if (entry.isDirectory()) return snapshot(file, `${name}/`);
  if (!entry.isFile()) throw new Error('Unexpected non-regular static output.');
  return [[name, createHash('sha256').update(readFileSync(file)).digest('hex')]];
}).sort(([a], [b]) => a.localeCompare(b, 'en'));
const build = (force) => {
  const started = performance.now();
  const result = spawnSync(process.execPath, [join(root, 'node_modules/astro/bin/astro.mjs'), 'build', ...(force ? ['--force'] : [])],
    { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 180_000, env: { ...process.env, ASTRO_TELEMETRY_DISABLED: '1' } });
  if (result.error || result.status !== 0) throw new Error(result.error?.message ?? (result.stderr || result.stdout).slice(-2000));
  return { seconds: (performance.now() - started) / 1000,
    cachedLines: result.stdout.split('\n').filter((line) => /cached|restored|reused|skipped/i.test(line)),
    files: snapshot(join(root, 'dist/client')) };
};

const fresh = build(true);
const timings = [];
for (let i = 0; i < samples; i++) {
  const warm = build(false);
  if (!warm.cachedLines.length) throw new Error('No keyed page reused the incremental cache.');
  if (JSON.stringify(warm.files) !== JSON.stringify(fresh.files)) {
    const expected = new Map(fresh.files), actual = new Map(warm.files);
    const different = [...new Set([...expected.keys(), ...actual.keys()])].filter((file) => expected.get(file) !== actual.get(file));
    throw new Error(`Cached output differs from a clean build: ${different.slice(0, 8).join(', ')}`);
  }
  timings.push(warm.seconds);
  console.log(`warm ${i + 1}: ${warm.seconds.toFixed(2)}s, ${warm.files.length} files identical; ${warm.cachedLines.join(' | ')}`);
}
const final = build(true);
if (JSON.stringify(final.files) !== JSON.stringify(fresh.files)) throw new Error('The final clean build changed its static output.');
timings.sort((a, b) => a - b);
console.log(JSON.stringify({ samples, cleanSeconds: fresh.seconds, warmP95Seconds: timings[Math.ceil(samples * 0.95) - 1],
  files: fresh.files.length, claim: 'Identical static output and local build duration only; excludes CI, queue, fetch and publication.' }));

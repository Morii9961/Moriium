// Read only local usage counters. The report is an audit, not ActivityData v1.
import { mkdir, writeFile, rename } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { readLocalCodexUsage } from './lib/codex-local-usage.ts';

try {
  const report = { collectedAt: new Date().toISOString(), ...await readLocalCodexUsage() };
  const path = resolve(import.meta.dirname, '../.cache/activity-codex-local.json');
  await mkdir(dirname(path), { recursive: true });
  await writeFile(`${path}.tmp`, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await rename(`${path}.tmp`, path);
  console.log(JSON.stringify({ collectedAt: report.collectedAt, basis: report.basis, range: report.range,
    recordedDates: report.days.length, totals: report.totals, crossCheck: report.crossCheck, diagnostics: report.diagnostics }));
  console.log('Local-only aggregate audit saved to .cache/activity-codex-local.json; public snapshot unchanged.');
} catch {
  console.error('Local Codex audit failed; no public data changed. See docs/activity.md.');
  process.exitCode = 1;
}

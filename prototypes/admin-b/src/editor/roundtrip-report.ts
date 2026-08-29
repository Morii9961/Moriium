import { readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { measureMarkdownRoundTrip, measureMoriiumMarkdownRoundTrip } from './roundtrip.ts';

const fixtures = [
  resolve(import.meta.dirname, '../../../fixtures/posts/zh/zh-tide-notes.md'),
  resolve(import.meta.dirname, '../../../fixtures/posts/ja/ja-tide-notes.md'),
];

function bodyOf(file: string): string {
  const parts = readFileSync(file, 'utf8').split(/^---\r?$/m);
  if (parts.length < 3) throw new Error(`${basename(file)} has no frontmatter boundary.`);
  return parts.slice(2).join('---').trimStart();
}

const rows = fixtures.flatMap((file) => {
  const body = bodyOf(file);
  return [
    ['unextended', measureMarkdownRoundTrip(body)] as const,
    ['moriium-nodes', measureMoriiumMarkdownRoundTrip(body)] as const,
  ].map(([mode, report]) => ({
    fixture: basename(file),
    mode,
    inputBlocks: report.inputBlockIds.length,
    preserved: report.blockResults.filter((result) => result.preserved).length,
    lost: report.lostBlockIds.length,
    lostIds: report.lostBlockIds.join(', ') || 'none',
    characters: `${report.inputCharacters} -> ${report.outputCharacters}`,
  }));
});

console.table(rows);
console.log('The unextended row is the Beta baseline; moriium-nodes must close losses without exemptions.');

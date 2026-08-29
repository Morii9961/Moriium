import { readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { measureMarkdownRoundTrip } from './roundtrip.ts';

const fixtures = [
  resolve(import.meta.dirname, '../../../fixtures/posts/zh/zh-tide-notes.md'),
  resolve(import.meta.dirname, '../../../fixtures/posts/ja/ja-tide-notes.md'),
];

function bodyOf(file: string): string {
  const parts = readFileSync(file, 'utf8').split(/^---\r?$/m);
  if (parts.length < 3) throw new Error(`${basename(file)} has no frontmatter boundary.`);
  return parts.slice(2).join('---').trimStart();
}

const rows = fixtures.map((file) => {
  const report = measureMarkdownRoundTrip(bodyOf(file));
  return {
    fixture: basename(file),
    inputBlocks: report.inputBlockIds.length,
    preserved: report.blockResults.filter((result) => result.preserved).length,
    lost: report.lostBlockIds.length,
    lostIds: report.lostBlockIds.join(', ') || 'none',
    characters: `${report.inputCharacters} -> ${report.outputCharacters}`,
  };
});

console.table(rows);
console.log('This is the unextended Tiptap Markdown baseline; losses are evidence, not exemptions.');

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';
import { CONTENT_BLOCKS } from '../../../shared/content-blocks.ts';
import { measureMarkdownRoundTrip } from './roundtrip.ts';

function fixtureBody(language: 'zh' | 'ja'): string {
  const file = resolve(import.meta.dirname, `../../../fixtures/posts/${language}/${language}-tide-notes.md`);
  const raw = readFileSync(file, 'utf8');
  const parts = raw.split(/^---\r?$/m);
  assert.ok(parts.length >= 3, 'fixture must contain frontmatter');
  return parts.slice(2).join('---').trimStart();
}

describe('Tiptap Markdown round-trip baseline', () => {
  it('preserves ordinary mixed-script Markdown as editable structure', () => {
    const input = '# 潮位ノート Tide notes\n\n中文、日文と English **bold**。\n';
    const report = measureMarkdownRoundTrip(input);

    assert.equal(report.lostBlockIds.length, 0);
    assert.match(report.markdown, /^# 潮位ノート Tide notes/m);
    assert.match(report.markdown, /中文、日文と English \*\*bold\*\*/);
    assert.deepEqual(report.editorJson.content?.map((node) => node.type), ['heading', 'paragraph']);
  });

  for (const language of ['zh', 'ja'] as const) {
    it(`measures the unextended ${language} fixture without hiding losses`, () => {
      const report = measureMarkdownRoundTrip(fixtureBody(language));

      assert.deepEqual(report.inputBlockIds, CONTENT_BLOCKS.map((block) => block.id));
      assert.deepEqual(report.lostBlockIds, ['image', 'admonition-github-callout', 'spoiler']);
      assert.deepEqual(report.introducedBlockIds, []);
      assert.equal(report.blockResults.filter((result) => result.preserved).length, 8);
      assert.equal(report.blockResults.filter((result) => result.lost).length, 3);
      assert.ok(report.outputCharacters > 0);
    });
  }
});

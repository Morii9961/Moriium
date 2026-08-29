import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';
import { CONTENT_BLOCKS } from '../../../shared/content-blocks.ts';
import { measureMarkdownRoundTrip, measureMoriiumMarkdownRoundTrip } from './roundtrip.ts';

function fixtureBody(language: 'zh' | 'ja'): string {
  const file = resolve(import.meta.dirname, `../../../fixtures/posts/${language}/${language}-tide-notes.md`);
  const parts = readFileSync(file, 'utf8').split(/^---\r?$/m);
  assert.ok(parts.length >= 3);
  return parts.slice(2).join('---').trimStart();
}

describe('Moriium source nodes', () => {
  it('preserves opaque block and inline syntax verbatim', () => {
    const snippets = [
      '![alt](/media/fixture.svg "caption")',
      '$$\nE = mc^2\n$$',
      ':::warning{title="Keep this"}\nDo not rewrite **this**.\n:::',
      '> [!TIP]\n> Keep the marker.',
      '::github{repo="Morii9961/Moriium"}',
      '::video{provider="youtube" id="fixture" title="Fixture" ratio="16/9"}',
      '::music{title="Fixture" artist="Fixture" audio="/fixture.m4a"}',
    ];
    const input = `${snippets.join('\n\n')}\n\nInline $H_0$ and :spoiler[保留括号]。\n`;
    const report = measureMoriiumMarkdownRoundTrip(input);

    for (const snippet of snippets) assert.ok(report.markdown.includes(snippet), snippet);
    assert.match(report.markdown, /Inline \$H_0\$ and :spoiler\[保留括号\]/);
    assert.equal(report.lostBlockIds.length, 0);
    assert.equal(report.introducedBlockIds.length, 0);
  });

  for (const language of ['zh', 'ja'] as const) {
    it(`round-trips all ${language} fixture syntax without an exemption`, () => {
      const report = measureMoriiumMarkdownRoundTrip(fixtureBody(language));

      assert.deepEqual(report.inputBlockIds, CONTENT_BLOCKS.map((block) => block.id));
      assert.deepEqual(report.outputBlockIds, report.inputBlockIds);
      assert.deepEqual(report.lostBlockIds, []);
      assert.deepEqual(report.introducedBlockIds, []);
      assert.equal(report.blockResults.filter((result) => result.preserved).length, 11);

      const nodeTypes = new Set(report.editorJson.content?.map((node) => node.type));
      assert.ok(nodeTypes.has('moriiumSourceBlock'));
      assert.ok(nodeTypes.has('paragraph'));
      assert.ok(
        JSON.stringify(report.editorJson).includes('moriiumSourceInline'),
        'inline math and spoiler must not survive only by serializer accident',
      );
    });
  }

  for (const language of ['zh', 'ja'] as const) {
    it(`returns the ${language} fixture byte for byte apart from the trailing newline`, () => {
      const body = fixtureBody(language);
      const report = measureMoriiumMarkdownRoundTrip(body);

      // The block inventory only proves each syntax family survived somewhere.
      // This is the stronger claim, and it names the single real difference:
      // the serializer emits no final newline, so a save path has to restore
      // it or every file would pick up a spurious one-line diff.
      assert.equal(`${report.markdown}\n`, body);
      assert.equal(report.markdown.length, body.length - 1);
    });
  }

  it('does not leak custom tokenizers into a later baseline editor', () => {
    measureMoriiumMarkdownRoundTrip(fixtureBody('zh'));
    const baseline = measureMarkdownRoundTrip(fixtureBody('ja'));

    assert.deepEqual(baseline.lostBlockIds, [
      'image',
      'admonition-github-callout',
      'spoiler',
    ]);
  });
});

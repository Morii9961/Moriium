import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { reassemble, splitForTranslation } from '../src/server/translation/markdown.ts';

/** The translatable text a split produced, in order. */
function translatable(pieces) {
  return pieces.filter((piece) => piece.translatable).map((piece) => piece.text);
}

/** Stands in for the service: marks every piece it was actually given. */
function fakeTranslate(texts) {
  return texts.map((text) => `<ja>${text}</ja>`);
}

describe('markdown segmentation for translation', () => {
  it('never sends a fenced code block to the translator', () => {
    const markdown = [
      '第一段。',
      '',
      '```ts title="features.ts" showLineNumbers {3} collapse={1-2}',
      'const greeting = "你好";',
      'export default greeting;',
      '```',
      '',
      '第二段。',
    ].join('\n');

    const pieces = splitForTranslation(markdown);

    assert.deepEqual(translatable(pieces), ['第一段。', '第二段。']);
    for (const piece of pieces.filter((entry) => !entry.translatable)) {
      assert.doesNotMatch(piece.text, /^第/);
    }
    // The fence, its attributes and the code survive byte for byte.
    const rebuilt = reassemble(pieces, fakeTranslate(translatable(pieces)));
    assert.match(rebuilt, /```ts title="features\.ts" showLineNumbers \{3\} collapse=\{1-2\}/);
    assert.match(rebuilt, /const greeting = "你好";/);
  });

  it('keeps a mermaid block out of the translator', () => {
    // Translating node labels would produce a diagram that no longer parses.
    const markdown = ['```mermaid', 'graph TD;', '  A-->B;', '```'].join('\n');

    assert.deepEqual(translatable(splitForTranslation(markdown)), []);
  });

  it('protects display math but translates the prose around it', () => {
    const markdown = ['说明如下。', '', '$$', 'E = mc^2', '$$', '', '结束。'].join('\n');

    assert.deepEqual(translatable(splitForTranslation(markdown)), ['说明如下。', '结束。']);
  });

  it('translates a container directive body while leaving its markers alone', () => {
    // The body is prose the reader reads; the marker line is syntax, and its
    // attributes carry quoting the translator would not preserve.
    const markdown = [':::note{title="注记"}', '这是一条注记。', ':::'].join('\n');

    const pieces = splitForTranslation(markdown);

    assert.deepEqual(translatable(pieces), ['这是一条注记。']);
    const rebuilt = reassemble(pieces, fakeTranslate(translatable(pieces)));
    assert.match(rebuilt, /^:::note\{title="注记"\}$/m);
    assert.match(rebuilt, /^:::$/m);
  });

  it('never sends a leaf directive, whose attributes are its whole meaning', () => {
    const markdown = [
      '::github{repo="Morii9961/Moriium"}',
      '',
      '::video{provider="youtube" id="aqz-KE-bpKQ" title="视频加载验收" ratio="16/9"}',
    ].join('\n');

    assert.deepEqual(translatable(splitForTranslation(markdown)), []);
  });

  it('reassembles into the original when the translator is the identity', () => {
    const markdown = [
      '# 标题',
      '',
      '正文一段，带 `inline code` 和 [链接](https://example.com/)。',
      '',
      '```sh',
      'pnpm build',
      '```',
      '',
      ':::tip{title="小提示"}',
      '提示正文。',
      ':::',
      '',
      '::music{title="Final Resonance" artist="ARForest"}',
      '',
      '最后一段。',
    ].join('\n');

    const pieces = splitForTranslation(markdown);
    const identity = reassemble(pieces, translatable(pieces));

    assert.equal(identity, markdown);
  });

  it('refuses a translation that lost or gained pieces', () => {
    // The service returns an array positionally. A short array would silently
    // shift every later piece onto the wrong slot, so it must throw instead.
    const pieces = splitForTranslation('一段。\n\n二段。');

    assert.throws(() => reassemble(pieces, ['only one']), /expected 2/i);
  });
});

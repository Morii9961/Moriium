import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';
import { Markdown } from '@tiptap/markdown';
import StarterKit from '@tiptap/starter-kit';
import { getSchema } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { MoriiumImage } from './image-node.ts';
import { MoriiumSourceBlock, MoriiumSourceInline } from './source-nodes.ts';
import { measureMoriiumMarkdownRoundTrip } from './roundtrip.ts';

const schema = getSchema([StarterKit, MoriiumImage, MoriiumSourceBlock, MoriiumSourceInline, Markdown]);

function docOf(markdown: string): PMNode {
  return schema.nodeFromJSON(measureMoriiumMarkdownRoundTrip(markdown).editorJson);
}

function firstOfType(markdown: string, type: string): PMNode {
  let found: PMNode | null = null;
  docOf(markdown).descendants((node) => {
    if (found === null && node.type.name === type) found = node;
    return found === null;
  });
  assert.ok(found, `no ${type} in the document`);
  return found;
}

function fixtureBody(language: 'zh' | 'ja'): string {
  const file = resolve(import.meta.dirname, `../../../fixtures/posts/${language}/${language}-tide-notes.md`);
  return readFileSync(file, 'utf8').split(/^---\r?$/m).slice(2).join('---').trimStart();
}

describe('the image node', () => {
  it('holds the path, alt and caption as separate attributes rather than raw text', () => {
    const image = firstOfType(fixtureBody('zh'), 'moriiumImage');

    assert.equal(image.attrs.src, '/media/fixtures/tide-flats.svg');
    assert.equal(image.attrs.alt, '滩涂在退潮后露出的纹路，由细线与留白构成的示意图');
    assert.equal(image.attrs.title, '退潮后约二十分钟的滩涂');
  });

  it('shows the author an image, not the Markdown that produced it', () => {
    const image = firstOfType(fixtureBody('zh'), 'moriiumImage');
    const dom = schema.nodes.moriiumImage?.spec.toDOM?.(image) as readonly unknown[];

    assert.equal(dom[0], 'figure');
    const img = dom[2] as readonly unknown[];
    assert.equal(img[0], 'img');
    assert.deepEqual(img[1], {
      src: '/media/fixtures/tide-flats.svg',
      alt: '滩涂在退潮后露出的纹路，由细线与留白构成的示意图',
    });
    const caption = dom[3] as readonly unknown[];
    assert.equal(caption[0], 'figcaption');
    assert.equal(caption[2], '退潮后约二十分钟的滩涂');
  });

  it('writes an image with no caption back without an empty quoted title', () => {
    const report = measureMoriiumMarkdownRoundTrip('![只有 alt](/media/a.svg)\n');

    assert.equal(report.markdown, '![只有 alt](/media/a.svg)\n');
    assert.deepEqual(report.lostBlockIds, []);
  });

  it('is a single unit, so a stray keystroke cannot land inside the path', () => {
    const image = firstOfType(fixtureBody('zh'), 'moriiumImage');

    assert.equal(image.isAtom, true);
    assert.equal(image.isText, false);
  });

  // A known limitation, pinned rather than left to be rediscovered. Moriium
  // writes images on their own line, so only block images are claimed; an image
  // inside a sentence still goes through the unextended Beta path, which keeps
  // the alt text and drops the file. Widening BLOCK_IMAGE to inline is the fix
  // if this ever needs to work.
  it('does not claim an image sitting inside a sentence', () => {
    const report = measureMoriiumMarkdownRoundTrip('前面 ![图](/media/a.svg) 后面。\n');

    assert.equal(report.markdown.includes('/media/a.svg'), false);
    assert.deepEqual(report.lostBlockIds, ['image']);
  });
});

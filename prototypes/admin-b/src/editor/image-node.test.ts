import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';
import { Markdown } from '@tiptap/markdown';
import StarterKit from '@tiptap/starter-kit';
import { Editor, getSchema } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { moriiumExtensions } from './extensions.ts';
import { selectedImageAttributes, updateSelectedImage } from './image-properties.ts';
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

  it('updates the selected image attributes without losing its path or trailing newline', () => {
    const editor = new Editor({
      extensions: moriiumExtensions(),
      content: '![Old alt](/media/a.svg "Old caption")\n',
      contentType: 'markdown',
    });
    editor.commands.setNodeSelection(0);

    assert.deepEqual(selectedImageAttributes(editor), {
      src: '/media/a.svg',
      alt: 'Old alt',
      title: 'Old caption',
    });
    assert.equal(
      updateSelectedImage(editor, {
        src: '/media/a.svg',
        alt: 'New alt',
        title: '',
      }),
      true,
    );
    assert.equal(editor.getMarkdown(), '![New alt](/media/a.svg)\n');
    editor.destroy();
  });

  // Regression, found by rendering the editor's own Markdown through the
  // production pipeline: the preview of every fixture carried one more <img>
  // than the article did. The extension was priority 1100, above paragraph, so
  // ProseMirror filled an empty document with an image, and setContent left
  // that filler at the end. Autosave then wrote `![]()` back into the article.
  it('lets paragraph, not an image, fill an empty document', () => {
    const filled = getSchema(moriiumExtensions()).topNodeType.createAndFill();

    assert.ok(filled);
    assert.equal(filled.firstChild?.type.name, 'paragraph');
  });

  it('does not update an image when the selection is ordinary text', () => {
    const editor = new Editor({
      extensions: moriiumExtensions(),
      content: 'Paragraph.\n\n![Old alt](/media/a.svg)\n',
      contentType: 'markdown',
    });
    editor.commands.setTextSelection(1);

    assert.equal(selectedImageAttributes(editor), null);
    assert.equal(
      updateSelectedImage(editor, { src: '/media/b.svg', alt: 'Wrong image', title: null }),
      false,
    );
    assert.match(editor.getMarkdown(), /\/media\/a\.svg/);
    editor.destroy();
  });
});

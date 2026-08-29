// A real image node, so an image looks like an image while it is being edited.
//
// Every other Moriium-specific syntax family is held as opaque source text
// (source-nodes.ts). Images get the extra work because they are the block an
// author touches most, and because the unextended Beta bridge destroyed them
// outright rather than merely escaping them: the path and the caption were
// dropped and only the alt text survived, as ordinary prose. See ADR 13.10.
//
// `src`, `alt` and `title` are structured attributes rather than raw text, so a
// properties panel can edit them once prototype B has a UI. Serialization stays
// exact: the round-trip test compares the whole fixture byte for byte.

import {
  Node,
  type JSONContent,
  type MarkdownParseHelpers,
  type MarkdownToken,
  type MarkdownTokenizer,
} from '@tiptap/core';
import { splitTrailingNewline } from './source-nodes.ts';

/**
 * A whole-line Markdown image: `![alt](src "title")`.
 *
 * Only block-level images are claimed here. An image sitting inside a sentence
 * is left to Tiptap, which still drops it; image-node.test.ts pins that gap so
 * it stays a known limitation rather than a surprise.
 */
const BLOCK_IMAGE = /^!\[([^\]\r\n]*)\]\(([^\s)]+)(?:\s+"([^"\r\n]*)")?\)[ \t]*(?:\r?\n|$)/;

type ImageToken = MarkdownToken & { src: string; alt: string; title: string | null };

const imageTokenizer: MarkdownTokenizer = {
  name: 'moriiumImage',
  level: 'block',
  start: (source) => source.search(/^!\[/m),
  tokenize(source) {
    const match = BLOCK_IMAGE.exec(source);
    if (!match) return undefined;
    return {
      type: 'moriiumImage',
      raw: match[0],
      alt: match[1] ?? '',
      src: match[2] ?? '',
      title: match[3] ?? null,
    } as ImageToken;
  },
};

/** Rebuilds the Markdown for an image node, quoting the title only when there is one. */
export function renderImageMarkdown(node: JSONContent): string {
  const attrs = node.attrs ?? {};
  const alt = String(attrs.alt ?? '');
  const src = String(attrs.src ?? '');
  const title = attrs.title == null ? '' : ` "${String(attrs.title)}"`;
  return `![${alt}](${src}${title})${String(attrs.trailing ?? '')}`;
}

export const MoriiumImage = Node.create({
  name: 'moriiumImage',
  priority: 1_100,
  group: 'block',
  atom: true,
  draggable: true,
  addAttributes() {
    return {
      src: { default: '' },
      alt: { default: '' },
      title: { default: null },
      trailing: { default: '', rendered: false },
    };
  },
  parseHTML() {
    return [{ tag: 'figure[data-moriium-image]' }];
  },
  renderHTML({ node }) {
    const figure: unknown[] = [
      'figure',
      { 'data-moriium-image': '' },
      ['img', { src: String(node.attrs.src ?? ''), alt: String(node.attrs.alt ?? '') }],
    ];
    if (node.attrs.title != null) {
      figure.push(['figcaption', {}, String(node.attrs.title)]);
    }
    return figure as never;
  },
  markdownTokenName: 'moriiumImage',
  markdownTokenizer: imageTokenizer,
  parseMarkdown: (token: MarkdownToken, helpers: MarkdownParseHelpers): JSONContent => {
    const image = token as ImageToken;
    const { trailing } = splitTrailingNewline(image.raw ?? '');
    return helpers.createNode('moriiumImage', {
      src: image.src ?? '',
      alt: image.alt ?? '',
      title: image.title ?? null,
      trailing,
    });
  },
  renderMarkdown: (node: JSONContent) => renderImageMarkdown(node),
});

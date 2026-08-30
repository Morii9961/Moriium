// A real block image node with an editable preview and exact Markdown output.

import {
  Node,
  type JSONContent,
  type MarkdownParseHelpers,
  type MarkdownToken,
  type MarkdownTokenizer,
} from '@tiptap/core';
import { splitTrailingNewline } from './source-nodes.ts';

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

export function renderImageMarkdown(node: JSONContent): string {
  const attrs = node.attrs ?? {};
  const title = attrs.title == null ? '' : ` "${String(attrs.title)}"`;
  return `![${String(attrs.alt ?? '')}](${String(attrs.src ?? '')}${title})${String(attrs.trailing ?? '')}`;
}

export const MoriiumImage = Node.create({
  name: 'moriiumImage',
  priority: 1_000,
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
    if (node.attrs.title != null) figure.push(['figcaption', {}, String(node.attrs.title)]);
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

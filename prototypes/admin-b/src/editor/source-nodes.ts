// Opaque source nodes for Moriium syntax that Tiptap does not model natively.
//
// Tiptap's Markdown extension documents custom tokenizers plus parseMarkdown /
// renderMarkdown as the supported extension boundary:
// https://tiptap.dev/docs/editor/markdown/guides/integrate-markdown-in-your-extension
//
// These nodes intentionally do not interpret their payload. They make the raw
// source visible and editable as one atomic unit while guaranteeing that the
// Beta serializer cannot escape, normalize, or drop syntax it does not own.

import {
  Node,
  type JSONContent,
  type MarkdownParseHelpers,
  type MarkdownToken,
  type MarkdownTokenizer,
} from '@tiptap/core';

type SourceKind =
  | 'image'
  | 'math-block'
  | 'directive'
  | 'admonition'
  | 'github-callout'
  | 'math-inline'
  | 'spoiler';

type SourceToken = MarkdownToken & { kind: SourceKind };

const BLOCK_PATTERNS: readonly { kind: SourceKind; pattern: RegExp }[] = [
  {
    kind: 'admonition',
    pattern:
      /^:::(?:note|tip|important|warning|caution)(?:\{[^\r\n]*\})?[^\r\n]*\r?\n[\s\S]*?\r?\n:::[ \t]*(?:\r?\n|$)/,
  },
  {
    kind: 'github-callout',
    pattern:
      /^>\s*\[!(?:NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][^\r\n]*(?:\r?\n>[^\r\n]*)*(?:\r?\n|$)/,
  },
  { kind: 'math-block', pattern: /^\$\$\r?\n[\s\S]*?\r?\n\$\$(?:\r?\n|$)/ },
  { kind: 'directive', pattern: /^::(?:video|github|music)\{[^\r\n]*\}(?:\r?\n|$)/ },
  { kind: 'image', pattern: /^!\[[^\]\r\n]*\]\([^\r\n]+\)(?:\r?\n|$)/ },
];

const BLOCK_START = /^(?:!\[|\$\$|::(?:video|github|music)\{|:::(?:note|tip|important|warning|caution)\b|>\s*\[!(?:NOTE|TIP|IMPORTANT|WARNING|CAUTION)\])/m;

const blockTokenizer: MarkdownTokenizer = {
  name: 'moriiumSourceBlock',
  level: 'block',
  start: (source) => source.search(BLOCK_START),
  tokenize(source) {
    for (const { kind, pattern } of BLOCK_PATTERNS) {
      const match = pattern.exec(source);
      if (match) return { type: 'moriiumSourceBlock', raw: match[0], kind } as SourceToken;
    }
    return undefined;
  },
};

const inlineTokenizer: MarkdownTokenizer = {
  name: 'moriiumSourceInline',
  level: 'inline',
  start(source) {
    const math = source.search(/\$(?!\$)/);
    const spoiler = source.indexOf(':spoiler[');
    if (math === -1) return spoiler;
    if (spoiler === -1) return math;
    return Math.min(math, spoiler);
  },
  tokenize(source) {
    const spoiler = /^:spoiler\[[^\]\r\n]+\]/.exec(source);
    if (spoiler) {
      return { type: 'moriiumSourceInline', raw: spoiler[0], kind: 'spoiler' } as SourceToken;
    }
    const math = /^\$(?!\$)(?:\\.|[^$\\\r\n])+\$/.exec(source);
    if (math) return { type: 'moriiumSourceInline', raw: math[0], kind: 'math-inline' } as SourceToken;
    return undefined;
  },
};

function rawNode(
  name: 'moriiumSourceBlock' | 'moriiumSourceInline',
  token: MarkdownToken,
  helpers: MarkdownParseHelpers,
): JSONContent {
  const source = token as SourceToken;
  return helpers.createNode(name, { raw: source.raw ?? '', kind: source.kind });
}

function sourceAttributes() {
  return {
    raw: { default: '', rendered: false },
    kind: { default: 'directive', rendered: false },
  };
}

export const MoriiumSourceBlock = Node.create({
  name: 'moriiumSourceBlock',
  priority: 1_000,
  group: 'block',
  atom: true,
  isolating: true,
  selectable: true,
  addAttributes: sourceAttributes,
  renderHTML({ node }) {
    return [
      'pre',
      { 'data-moriium-source-block': String(node.attrs.kind) },
      ['code', {}, String(node.attrs.raw)],
    ];
  },
  markdownTokenName: 'moriiumSourceBlock',
  markdownTokenizer: blockTokenizer,
  parseMarkdown: (token, helpers) => rawNode('moriiumSourceBlock', token, helpers),
  renderMarkdown: (node) => String(node.attrs?.raw ?? ''),
});

export const MoriiumSourceInline = Node.create({
  name: 'moriiumSourceInline',
  priority: 1_000,
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addAttributes: sourceAttributes,
  renderHTML({ node }) {
    return [
      'code',
      { 'data-moriium-source-inline': String(node.attrs.kind) },
      String(node.attrs.raw),
    ];
  },
  markdownTokenName: 'moriiumSourceInline',
  markdownTokenizer: inlineTokenizer,
  parseMarkdown: (token, helpers) => rawNode('moriiumSourceInline', token, helpers),
  renderMarkdown: (node) => String(node.attrs?.raw ?? ''),
});

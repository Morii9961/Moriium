// Editable source nodes for Moriium syntax that Tiptap does not model natively.
//
// Tiptap's Markdown extension documents custom tokenizers plus parseMarkdown /
// renderMarkdown as the supported extension boundary:
// https://tiptap.dev/docs/editor/markdown/guides/integrate-markdown-in-your-extension
//
// These nodes do not interpret their payload. They hold the raw source as
// ordinary editable text, so the author can correct a path or an attribute in
// place, while the Beta serializer never gets a chance to escape, normalize or
// drop syntax it does not own. The node shape follows Tiptap's own CodeBlock:
// `content: 'text*'` with `marks: ''` and `code: true`.
//
// Images are not handled here. They get a real node with a rendered preview,
// see image-node.ts.

import {
  Node,
  type JSONContent,
  type MarkdownParseHelpers,
  type MarkdownToken,
  type MarkdownTokenizer,
} from '@tiptap/core';

type SourceKind =
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
];

const BLOCK_START = /^(?:\$\$|::(?:video|github|music)\{|:::(?:note|tip|important|warning|caution)\b|>\s*\[!(?:NOTE|TIP|IMPORTANT|WARNING|CAUTION)\])/m;

/** Splits a token's raw source into the text the author edits and the newline that follows it. */
export function splitTrailingNewline(raw: string): { body: string; trailing: string } {
  const match = /(\r?\n)$/.exec(raw);
  return match
    ? { body: raw.slice(0, -match[0].length), trailing: match[0] }
    : { body: raw, trailing: '' };
}

/** The editable text a source node currently holds. */
export function sourceTextOf(node: JSONContent): string {
  return (node.content ?? []).map((child) => child.text ?? '').join('');
}

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

function sourceNode(
  name: 'moriiumSourceBlock' | 'moriiumSourceInline',
  token: MarkdownToken,
  helpers: MarkdownParseHelpers,
): JSONContent {
  const source = token as SourceToken;
  const { body, trailing } = splitTrailingNewline(source.raw ?? '');
  return helpers.createNode(
    name,
    { kind: source.kind, trailing },
    body ? [helpers.createTextNode(body)] : [],
  );
}

function sourceAttributes() {
  return {
    kind: { default: 'directive', rendered: false },
    // Held so the round trip returns the author's file unchanged rather than
    // whatever block separation the serializer would otherwise choose.
    trailing: { default: '', rendered: false },
  };
}

export const MoriiumSourceBlock = Node.create({
  name: 'moriiumSourceBlock',
  priority: 1_000,
  group: 'block',
  content: 'text*',
  marks: '',
  code: true,
  defining: true,
  isolating: true,
  addAttributes: sourceAttributes,
  parseHTML() {
    return [{ tag: 'pre[data-moriium-source-block]', preserveWhitespace: 'full' as const }];
  },
  renderHTML({ node }) {
    return ['pre', { 'data-moriium-source-block': String(node.attrs.kind) }, ['code', {}, 0]];
  },
  markdownTokenName: 'moriiumSourceBlock',
  markdownTokenizer: blockTokenizer,
  parseMarkdown: (token, helpers) => sourceNode('moriiumSourceBlock', token, helpers),
  renderMarkdown: (node) => sourceTextOf(node) + String(node.attrs?.trailing ?? ''),
});

export const MoriiumSourceInline = Node.create({
  name: 'moriiumSourceInline',
  priority: 1_000,
  group: 'inline',
  inline: true,
  content: 'text*',
  marks: '',
  code: true,
  addAttributes: sourceAttributes,
  parseHTML() {
    return [{ tag: 'code[data-moriium-source-inline]', preserveWhitespace: 'full' as const }];
  },
  renderHTML({ node }) {
    return ['code', { 'data-moriium-source-inline': String(node.attrs.kind) }, 0];
  },
  markdownTokenName: 'moriiumSourceInline',
  markdownTokenizer: inlineTokenizer,
  parseMarkdown: (token, helpers) => sourceNode('moriiumSourceInline', token, helpers),
  renderMarkdown: (node) => sourceTextOf(node) + String(node.attrs?.trailing ?? ''),
});

const ADMONITIONS = new Set(['note', 'tip', 'important', 'warning', 'caution']);

/**
 * The directive names Moriium actually defines, by node type.
 *
 * Anything else is not a directive an author meant to write, and is restored to
 * the text it was typed as. See `literalizeUnknown`.
 */
const KNOWN_DIRECTIVES = {
  textDirective: new Set(['spoiler']),
  leafDirective: new Set(['github', 'video', 'music']),
};

const DIRECTIVE_MARKER = { textDirective: ':', leafDirective: '::' };

/** Rebuilds the `{...}` an author typed, so restored text matches the source. */
function attributeSource(attributes) {
  const parts = [];
  for (const [key, value] of Object.entries(attributes ?? {})) {
    if (key === 'id') parts.push(`#${value}`);
    else if (key === 'class') parts.push(...String(value).split(/\s+/).filter(Boolean).map((name) => `.${name}`));
    else if (value === '' || value === null || value === undefined) parts.push(key);
    else parts.push(`${key}="${value}"`);
  }
  return parts.length > 0 ? `{${parts.join(' ')}}` : '';
}

/**
 * Puts back the text that generic directive syntax swallowed.
 *
 * remark-directive claims a colon followed by a word, and the name may start
 * with a digit. So `08:12`, `16:9` and `Note:this` parsed as inline directives
 * and left the document: the reader was shown `08` where the source said
 * `08:12`, with an empty element where the rest had been. Nothing reported it,
 * because as far as the parser was concerned the author had written a
 * directive.
 *
 * Only the names in KNOWN_DIRECTIVES are ours. Every other directive is
 * rendered as the characters it was typed as, which is both what the author
 * meant in the `08:12` case and, in the case of a real typo like
 * `:spolier[...]`, the fastest way for them to see it.
 *
 * Container directives are left alone: `:::name` cannot be typed by accident
 * mid-sentence, and `scripts/validate-content.mjs` already refuses an unknown
 * one at build time.
 */
function literalizeUnknown(node) {
  if (!Array.isArray(node.children)) return;

  const children = [];
  for (const child of node.children) {
    literalizeUnknown(child);
    const known = KNOWN_DIRECTIVES[child.type];
    if (!known || known.has(child.name)) {
      children.push(child);
      continue;
    }
    const label = child.children ?? [];
    const restored = [
      text(`${DIRECTIVE_MARKER[child.type]}${child.name}${label.length > 0 ? '[' : ''}`),
      ...label,
      text(`${label.length > 0 ? ']' : ''}${attributeSource(child.attributes)}`),
    ];
    // A leaf directive stands where a block does, and inline nodes left in that
    // position are dropped on the way to HTML -- which would be the same silent
    // loss under a different name.
    if (child.type === 'leafDirective') children.push({ type: 'paragraph', children: restored });
    else children.push(...restored);
  }
  node.children = children;
}

function walk(node, visitor, parent = null) {
  visitor(node, parent);
  if (Array.isArray(node.children)) {
    for (const child of node.children) walk(child, visitor, node);
  }
}

function text(value) {
  return { type: 'text', value };
}

function titleParagraph(title) {
  return {
    type: 'paragraph',
    data: { hName: 'p', hProperties: { className: ['admonition__title'] } },
    children: [text(title)],
  };
}

function applyAdmonition(node, kind, title) {
  node.data = {
    ...(node.data ?? {}),
    hName: 'aside',
    hProperties: {
      className: ['admonition', `admonition--${kind}`],
      'data-admonition': kind,
    },
  };
  node.children = [titleParagraph(title || kind[0].toUpperCase() + kind.slice(1)), ...node.children];
}

function githubCallout(node, copy) {
  if (node.type !== 'blockquote' || !node.children?.length) return;
  const first = node.children[0];
  if (first?.type !== 'paragraph' || first.children?.[0]?.type !== 'text') return;
  const match = first.children[0].value.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*/i);
  if (!match) return;
  const kind = match[1].toLowerCase();
  first.children[0].value = first.children[0].value.slice(match[0].length);
  if (!first.children[0].value) first.children.shift();
  if (!first.children.length) node.children.shift();
  applyAdmonition(node, kind, copy.admonitions[kind]);
}

function placeholder(node, name, properties) {
  node.data = {
    ...(node.data ?? {}),
    hName: 'div',
    hProperties: {
      className: [`reader-${name}`],
      [`data-${name}`]: '',
      ...properties,
    },
  };
  node.children = [];
}

export function remarkMoriiumDirectives() {
  return (tree, file) => {
    const copy = readerCopyForFile(file);
    literalizeUnknown(tree);
    walk(tree, (node) => {
      githubCallout(node, copy);

      if (!['containerDirective', 'leafDirective', 'textDirective'].includes(node.type)) return;
      const attributes = node.attributes ?? {};

      if (node.type === 'containerDirective' && ADMONITIONS.has(node.name)) {
        applyAdmonition(node, node.name, attributes.title || copy.admonitions[node.name]);
        return;
      }

      if (node.type === 'textDirective' && node.name === 'spoiler') {
        node.data = {
          ...(node.data ?? {}),
          hName: 'span',
          hProperties: {
            className: ['spoiler'],
            tabindex: 0,
            role: 'button',
            'aria-label': copy.spoiler,
            'aria-pressed': 'false',
            'data-spoiler': '',
          },
        };
        return;
      }

      if (node.type !== 'leafDirective') return;

      if (node.name === 'github') {
        placeholder(node, 'github', { 'data-repo': attributes.repo ?? '' });
      } else if (node.name === 'video') {
        placeholder(node, 'video', {
          'data-provider': attributes.provider ?? '',
          'data-id': attributes.id ?? '',
          'data-src': attributes.src ?? '',
          'data-title': attributes.title ?? '',
          'data-ratio': attributes.ratio ?? '16/9',
          'data-poster': attributes.poster ?? '',
        });
      } else if (node.name === 'music') {
        placeholder(node, 'music', {
          'data-title': attributes.title ?? '',
          'data-artist': attributes.artist ?? '',
          'data-cover': attributes.cover ?? '',
          'data-audio': attributes.audio ?? '',
          'data-lrc': attributes.lrc ?? '',
          'data-meting': attributes.meting ?? '',
        });
      }
    });
  };
}
import { readerCopyForFile } from './reader-copy.mjs';

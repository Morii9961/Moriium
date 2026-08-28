const ADMONITIONS = new Set(['note', 'tip', 'important', 'warning', 'caution']);

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

function githubCallout(node) {
  if (node.type !== 'blockquote' || !node.children?.length) return;
  const first = node.children[0];
  if (first?.type !== 'paragraph' || first.children?.[0]?.type !== 'text') return;
  const match = first.children[0].value.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*/i);
  if (!match) return;
  const kind = match[1].toLowerCase();
  first.children[0].value = first.children[0].value.slice(match[0].length);
  if (!first.children[0].value) first.children.shift();
  if (!first.children.length) node.children.shift();
  applyAdmonition(node, kind, kind[0].toUpperCase() + kind.slice(1));
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
  return (tree) => {
    walk(tree, (node) => {
      githubCallout(node);

      if (!['containerDirective', 'leafDirective', 'textDirective'].includes(node.type)) return;
      const attributes = node.attributes ?? {};

      if (node.type === 'containerDirective' && ADMONITIONS.has(node.name)) {
        applyAdmonition(node, node.name, attributes.title);
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
            'aria-label': 'Reveal spoiler',
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

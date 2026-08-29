// The inventory of custom content blocks both prototypes must handle.
//
// docs/markdown-reference.md is the authority for the syntax; this file makes
// the same list machine-readable so coverage can be asserted instead of
// claimed. ADR 0001 section 4 draws task T3's checklist from that document, and
// validate-fixtures.ts fails if the inventory and the document disagree, or if
// the fixture corpus stops exercising a block.
//
// Dependency direction is fixed: this module imports nothing from studio-a or
// admin-b.

/** The five markers that gate which browser modules an article may load. */
export type FeatureMarker = 'lightbox' | 'mermaid' | 'music' | 'video' | 'math';

export type ContentBlock = {
  /** Stable id used in reports and scoring tables. */
  id: string;
  /** Heading this block is documented under in docs/markdown-reference.md. */
  section: string;
  /** Detects the syntax in a Markdown body. */
  detect: RegExp;
  /**
   * The feature marker this block sets, if any. A block with no marker still
   * renders, it just needs no extra browser module.
   */
  marker: FeatureMarker | null;
  /**
   * Whether a prototype may legitimately fail to round-trip this block through
   * a WYSIWYG editor without that counting as data loss. Nothing is exempt:
   * this is here so the scoring table cannot quietly grow exemptions later.
   */
  roundTripOptional: false;
};

export const CONTENT_BLOCKS: readonly ContentBlock[] = [
  {
    id: 'image',
    section: 'Images and lightbox',
    detect: /!\[[^\]]*\]\([^)]+\)/,
    marker: 'lightbox',
    roundTripOptional: false,
  },
  {
    id: 'code-fence-metadata',
    section: 'Code',
    // Expressive Code metadata: a title, line numbers, marked lines, or a
    // collapsed range. A bare fence is ordinary Markdown and not in scope here.
    detect: /^```\w+[^\n]*(title=|showLineNumbers|collapse=|\{\d)/m,
    marker: null,
    roundTripOptional: false,
  },
  {
    id: 'math-inline',
    section: 'Math',
    detect: /(^|[^$\\])\$[^$\n]+\$([^$]|$)/,
    marker: 'math',
    roundTripOptional: false,
  },
  {
    id: 'math-block',
    section: 'Math',
    detect: /^\$\$\s*$/m,
    marker: 'math',
    roundTripOptional: false,
  },
  {
    id: 'mermaid',
    section: 'Mermaid',
    detect: /^```mermaid\s/m,
    marker: 'mermaid',
    roundTripOptional: false,
  },
  {
    id: 'video',
    section: 'Video',
    detect: /::video\{/,
    marker: 'video',
    roundTripOptional: false,
  },
  {
    id: 'github-card',
    section: 'GitHub repository cards',
    detect: /::github\{/,
    marker: null,
    roundTripOptional: false,
  },
  {
    id: 'music-card',
    section: 'Music cards',
    detect: /::music\{/,
    marker: 'music',
    roundTripOptional: false,
  },
  {
    id: 'admonition',
    section: 'Admonitions',
    detect: /^:::(note|tip|important|warning|caution)\b/m,
    marker: null,
    roundTripOptional: false,
  },
  {
    id: 'admonition-github-callout',
    section: 'Admonitions',
    detect: /^>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/m,
    marker: null,
    roundTripOptional: false,
  },
  {
    id: 'spoiler',
    section: 'Spoilers',
    detect: /:spoiler\[/,
    marker: null,
    roundTripOptional: false,
  },
];

/** The admonition kinds docs/markdown-reference.md allows. */
export const ADMONITION_KINDS = ['note', 'tip', 'important', 'warning', 'caution'] as const;

/** Block ids a Markdown body contains. */
export function blocksIn(body: string): string[] {
  return CONTENT_BLOCKS.filter((block) => block.detect.test(body)).map((block) => block.id);
}

/**
 * Feature markers a body requires. Mirrors featuresOf() in
 * scripts/encrypt-post.mjs, but derived from the block inventory so the two
 * cannot describe different sets of blocks.
 */
export function markersFor(body: string): Record<FeatureMarker, boolean> {
  const markers: Record<FeatureMarker, boolean> = {
    lightbox: false,
    mermaid: false,
    music: false,
    video: false,
    math: false,
  };
  for (const block of CONTENT_BLOCKS) {
    if (block.marker && block.detect.test(body)) markers[block.marker] = true;
  }
  return markers;
}

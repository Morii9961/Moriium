// Media asset contract.
//
// docs/enouia-todo.md section 02 asks for a photography asset manifest carrying
// the public path, dimensions, format, alt, caption, copyright and an
// allowlist of publishable EXIF. AGENTS.md adds the hard part: original photos
// are never touched, and derivatives must have GPS and sensitive EXIF removed
// before they are committed.
//
// The shape below is built so the privacy rule is structural. A manifest entry
// records the derivative that may be published; there is no field for the
// original's location on disk, so a manifest cannot carry one by accident.
//
// Dependency direction is fixed: this module imports nothing from studio-a or
// admin-b.

import { z } from 'astro/zod';

/**
 * The only EXIF tags allowed to survive into a published derivative. Everything
 * else is dropped. GPS is absent by construction, not by filtering, and this
 * list must never grow to include a tag that can locate or identify a person.
 */
export const PUBLISHABLE_EXIF_TAGS = [
  'Make',
  'Model',
  'LensModel',
  'FocalLength',
  'FNumber',
  'ExposureTime',
  'ISOSpeedRatings',
] as const;

export type PublishableExifTag = (typeof PUBLISHABLE_EXIF_TAGS)[number];

export const IMAGE_FORMATS = ['webp', 'avif', 'jpeg', 'png', 'svg'] as const;

export const mediaAsset = z.object({
  /** Site-absolute path of the publishable derivative. Never a disk path. */
  publicPath: z.string().regex(/^\/[^\s]*$/, 'publicPath must be a site-absolute URL path'),
  format: z.enum(IMAGE_FORMATS),
  /** Absent for SVG, which has no intrinsic raster size. */
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  /**
   * Required and non-empty. An image with no alt text fails the accessibility
   * gate in AGENTS.md, so it is not representable here.
   */
  alt: z.string().min(1),
  caption: z.string().optional(),
  copyright: z.string().optional(),
  /**
   * EXIF retained in the published file. Empty is the normal case; the field
   * exists so a manifest can state what survived rather than leaving it
   * unknown. The allowlist is enforced by blockersForPublishing() rather than
   * by the key type, so an out-of-list tag produces a readable blocker instead
   * of an opaque parse failure — and the rule lives in exactly one place.
   */
  exif: z.record(z.string(), z.string()).default({}),
  /**
   * Set once the derivative has passed scripts/sanitize-media.mjs. Nothing may
   * be published while this is false.
   */
  sanitized: z.boolean(),
});

export type MediaAsset = z.infer<typeof mediaAsset>;

export const mediaManifest = z.object({
  version: z.literal(1),
  assets: z.array(mediaAsset),
});

export type MediaManifest = z.infer<typeof mediaManifest>;

export type MarkdownImageReference = {
  publicPath: string;
  alt: string;
};

// Matches the Markdown image form Moriium documents and the Tiptap image node
// serializes. Publication scans inline occurrences too: an unsupported inline
// image must not bypass the gate merely because the editor cannot model it.
// The path is `*` rather than `+` on purpose: `![]()` has an empty path and
// would otherwise not match at all, so the gate would never see it. That is
// how a stray empty image reached a published version once (ADR 0001 13.18).
const MARKDOWN_IMAGE = /!\[([^\]\r\n]*)\]\(([^\s)]*)(?:\s+"[^"\r\n]*")?\)/g;

export function imageReferencesIn(markdown: string): MarkdownImageReference[] {
  return Array.from(markdown.matchAll(MARKDOWN_IMAGE), (match) => ({
    alt: match[1] ?? '',
    publicPath: match[2] ?? '',
  }));
}

/** Raster formats that carry metadata and therefore must be sanitized. */
const RASTER_FORMATS = new Set(['webp', 'avif', 'jpeg', 'png']);

export function requiresSanitizing(asset: Pick<MediaAsset, 'format'>): boolean {
  return RASTER_FORMATS.has(asset.format);
}

/**
 * The publish gate. Returns the reasons an asset may not be published, empty
 * when it may. Reasons rather than a boolean so a prototype can show a writer
 * what to fix instead of failing opaquely.
 */
export function blockersForPublishing(asset: MediaAsset): string[] {
  const blockers: string[] = [];
  if (requiresSanitizing(asset) && !asset.sanitized) {
    blockers.push('Raster media must pass scripts/sanitize-media.mjs before it can be published.');
  }
  for (const tag of Object.keys(asset.exif)) {
    if (!PUBLISHABLE_EXIF_TAGS.includes(tag as PublishableExifTag)) {
      blockers.push(`EXIF tag "${tag}" is not on the publishable allowlist.`);
    }
  }
  if (asset.alt.trim().length === 0) blockers.push('alt text must not be blank.');
  return blockers;
}

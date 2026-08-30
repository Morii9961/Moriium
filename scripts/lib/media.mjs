// One definition of "sanitized" for every caller.
//
// scripts/sanitize-media.mjs produces derivatives, scripts/check-media.mjs
// audits the published tree, and the server's media import does both on an
// upload. ADR 0002 section 8.1 says the server reuses those two halves rather
// than growing a third copy, so the recipe, the metadata block lists and the
// re-read that confirms the strip all live here.
//
// The distinction between the two block lists is deliberate:
//
//   * SENSITIVE_BLOCKS is what must never reach a reader. EXIF carries the
//     camera body and, on a phone, the GPS fix; XMP and IPTC carry the editing
//     history and the credit line. That list is what the public tree is audited
//     against.
//   * STRIPPED_BLOCKS adds ICC. A colour profile is not private, but a
//     derivative that still carries one was not re-encoded the way this module
//     re-encodes, and that is worth failing on: the interesting claim is not
//     "no GPS survived" but "this file came out of our own pipeline".
//
// This module is imported by the on-demand admin. It must never be imported by
// a public route: sharp is a native module and a reader's request never reaches
// Node at all (ADR 0002 section 4).

import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import sharp from 'sharp';

/** Metadata blocks that must never appear in a published file. */
export const SENSITIVE_BLOCKS = ['exif', 'xmp', 'iptc'];

/** Everything a file that came out of `sanitizeToBuffer` must be free of. */
export const STRIPPED_BLOCKS = [...SENSITIVE_BLOCKS, 'icc'];

/** Raster files the published-tree audit inspects. */
export const RASTER_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.tif', '.tiff']);

/**
 * Input formats the import pipeline accepts.
 *
 * GIF is absent on purpose rather than by oversight: the resize below would
 * flatten an animation to its first frame and report success, which is a
 * silent content change. SVG is absent because stripping metadata from XML is
 * a different problem from re-encoding a raster, and a half-done job on markup
 * that can carry script is worse than a refusal.
 */
export const IMPORTABLE_FORMATS = new Set(['jpeg', 'png', 'webp', 'avif', 'tiff']);

/** The longest edge a public derivative keeps. */
export const MAX_DERIVATIVE_EDGE = 1800;

/** Which of `blocks` the metadata actually carries. */
export function metadataBlocksIn(metadata, blocks = SENSITIVE_BLOCKS) {
  return blocks.filter((block) => Boolean(metadata[block]));
}

/**
 * Reads a file and reports the sensitive blocks it still carries.
 *
 * The bytes are loaded with `readFile` and handed to sharp as a buffer rather
 * than letting sharp open the path itself. libvips memory-maps the file it
 * opens, and on Windows that mapping keeps the file locked long enough that the
 * next write or delete fails with an unexplained UNKNOWN — which is exactly
 * what the import pipeline does right after this check.
 */
export async function sensitiveBlocksInFile(path) {
  return metadataBlocksIn(await sharp(await readFile(path)).metadata(), SENSITIVE_BLOCKS);
}

function encoderFor(image, format) {
  if (format === 'webp') return image.webp({ quality: 84, smartSubsample: true });
  if (format === 'avif') return image.avif({ quality: 62, effort: 6 });
  if (format === 'jpeg') return image.jpeg({ quality: 86, mozjpeg: true });
  throw new Error('Sanitized output must be webp, avif, or jpeg.');
}

/** Maps a destination file extension onto an encoder name. */
export function formatForExtension(path) {
  const extension = extname(path).toLowerCase();
  if (extension === '.webp') return 'webp';
  if (extension === '.avif') return 'avif';
  if (extension === '.jpg' || extension === '.jpeg') return 'jpeg';
  throw new Error('Destination must be .webp, .avif, .jpg, or .jpeg.');
}

/**
 * Re-encodes an image into a public derivative with no metadata attached.
 *
 * Nothing here trusts a caller's claim that the input was already clean, and
 * nothing trusts sharp's own return value either: `assertStripped` re-reads the
 * bytes that were actually produced. `failOn: 'warning'` makes a truncated or
 * malformed upload an error rather than a partially decoded image.
 *
 * @returns {Promise<{ data: Buffer, format: string, width: number, height: number,
 *                     source: { format: string, width: number, height: number,
 *                               blocks: string[] } }>}
 */
export async function sanitizeToBuffer(input, format) {
  const before = await sharp(input).metadata();
  if (!before.format || !IMPORTABLE_FORMATS.has(before.format)) {
    throw new Error(`Unsupported image format: ${before.format ?? 'unknown'}.`);
  }
  if (!before.width || !before.height) {
    throw new Error('The image has no readable dimensions.');
  }

  const pipeline = sharp(input, { failOn: 'warning' })
    // Applies the EXIF orientation to the pixels, so dropping the tag cannot
    // silently rotate the published image.
    .rotate()
    .resize({
      width: MAX_DERIVATIVE_EDGE,
      height: MAX_DERIVATIVE_EDGE,
      fit: 'inside',
      withoutEnlargement: true,
    });
  const data = await encoderFor(pipeline, format).toBuffer();
  const after = await assertStripped(data);
  return {
    data,
    format,
    width: after.width ?? 0,
    height: after.height ?? 0,
    source: {
      format: before.format,
      width: before.width,
      height: before.height,
      blocks: metadataBlocksIn(before, STRIPPED_BLOCKS),
    },
  };
}

/**
 * Re-reads produced bytes and refuses anything still carrying metadata.
 *
 * Separate and exported so the confirmation can be tested against a file that
 * really does carry EXIF. A checker only ever run on clean input proves
 * nothing.
 */
export async function assertStripped(input) {
  const metadata = await sharp(input).metadata();
  const remaining = metadataBlocksIn(metadata, STRIPPED_BLOCKS);
  if (remaining.length > 0) {
    throw new Error(`Output still contains ${remaining.join(', ')} metadata.`);
  }
  return metadata;
}

// Where an imported derivative lives, and what a reader will call it.
//
// Two things are settled here and nowhere else:
//
//   * The bytes land under /var/lib/moriium/media/, outside any release
//     directory. ADR 0002 section 15.1 makes that a hard requirement: releases
//     are replaced whole and only six are kept, so media stored inside one
//     disappears on the seventh deploy.
//   * The public path is derived by the server from the uploaded bytes, never
//     accepted from the client. A caller cannot propose where its file goes, so
//     there is no traversal to filter — `fileForPublicPath` still refuses an
//     escape, because the guard has to hold for rows written by anything else
//     too.

import { createHash } from 'node:crypto';
import { isAbsolute, relative, resolve } from 'node:path';
import { AdminError } from '../errors.ts';

/** The URL prefix an exported build serves the media root from. */
export const PUBLIC_MEDIA_PREFIX = '/media/';

export const DEFAULT_MEDIA_ROOT =
  process.platform === 'win32' ? resolve('.astro/media') : '/var/lib/moriium/media';

/** Imported files are grouped one directory deep, usually per article. */
const DEFAULT_GROUP = 'library';
const MAX_NAME_LENGTH = 48;
const DIGEST_LENGTH = 12;

export function mediaRoot(): string {
  return resolve(process.env.MORIIUM_MEDIA_ROOT?.trim() || DEFAULT_MEDIA_ROOT);
}

/**
 * Reduces an author-supplied name to one safe path segment.
 *
 * A name with nothing ASCII left in it — a Chinese or Japanese filename, most
 * often — collapses to empty and the caller's fallback takes over. That is
 * better than transliterating: the file is found through the media library,
 * not by reading its name off a URL.
 */
export function toPathSegment(value: string, fallback: string): string {
  const slug = value
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_NAME_LENGTH)
    .replace(/-+$/, '');
  return slug || fallback;
}

/**
 * The public path for one imported file.
 *
 * The digest is taken over the sanitized bytes, so re-importing the same photo
 * lands on the same path and collides with its own row rather than quietly
 * creating a second copy under a second name.
 */
export function publicPathFor(input: {
  readonly data: Uint8Array;
  readonly filename: string;
  readonly group?: string | undefined;
  readonly extension: string;
}): string {
  const group = toPathSegment(input.group ?? '', DEFAULT_GROUP);
  const name = toPathSegment(input.filename, 'image');
  const digest = createHash('sha256').update(input.data).digest('hex').slice(0, DIGEST_LENGTH);
  return `${PUBLIC_MEDIA_PREFIX}posts/${group}/${name}-${digest}.${input.extension}`;
}

/**
 * Resolves a stored public path to the file on disk.
 *
 * Refuses anything that leaves the media root. The paths this module generates
 * cannot escape, so this is guarding rows that arrived some other way — a hand
 * edit, an import, a future migration — which is exactly when a guard is worth
 * having.
 */
export function fileForPublicPath(publicPath: string, root = mediaRoot()): string {
  if (!publicPath.startsWith(PUBLIC_MEDIA_PREFIX)) {
    throw new AdminError('path-outside-root', 'That media path is not part of the media library.');
  }
  const file = resolve(root, publicPath.slice(PUBLIC_MEDIA_PREFIX.length));
  const inside = relative(root, file);
  if (!inside || inside.startsWith('..') || isAbsolute(inside)) {
    throw new AdminError('path-outside-root', 'That media path is not part of the media library.');
  }
  return file;
}

// Where the public, prerendered output lands.
//
// Adding the Node adapter (ADR 0002 section 4) split the build: static pages
// moved to dist/client/ and the on-demand server to dist/server/. Every check
// that reads the built site wants the client half and only the client half —
// auditing dist/ as a whole would start reading server bundles, and a link
// checker would follow paths that do not exist for a reader.
//
// Resolving it in one place rather than in each script means the next layout
// change is one edit, and means no script can quietly disagree with another
// about what "the built site" is.

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

export const repoRoot = resolve(import.meta.dirname, '../..');

/**
 * The directory a reader's request resolves against.
 *
 * Falls back to dist/ so the checks still work if the adapter is ever removed;
 * ADR 0002 section 14 keeps that rollback available, and a check that breaks on
 * rollback would make the rollback harder exactly when it is needed.
 */
export function publicOutputRoot(root = repoRoot) {
  const split = resolve(root, 'dist/client');
  return existsSync(split) ? split : resolve(root, 'dist');
}

/** Where the on-demand server entry lands, or null when there is no adapter. */
export function serverOutputRoot(root = repoRoot) {
  const server = resolve(root, 'dist/server');
  return existsSync(server) ? server : null;
}

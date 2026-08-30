// A verified mirror of the sanitized media root (ADR 0002 section 11.2).
//
// The media root is the only place the public derivatives exist. The database
// records their metadata and the export projects them into a build, but neither
// can reproduce a lost file: sanitization is a one-way re-encode and the
// originals are never uploaded. So this is the one part of the data that a
// backup has to carry byte for byte.
//
// What this module does NOT do is send anything offsite. Section 11.2 asks for
// a daily offsite sync, and a second copy on the same disk is not that -- it
// survives an accidental delete and nothing else. The transport belongs to the
// deployment block; this produces the tree that transport would carry.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { AdminError } from '../errors.ts';

export type MirrorResult = {
  readonly copied: readonly string[];
  readonly unchanged: readonly string[];
  readonly removed: readonly string[];
};

function digest(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** Every file under a directory, as paths relative to it, with forward slashes. */
function filesUnder(root: string): string[] {
  if (!existsSync(root)) return [];
  const found: string[] = [];
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const full = join(directory, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) found.push(relative(root, full).split(sep).join('/'));
    }
  };
  walk(root);
  return found.sort();
}

/**
 * Mirrors the media root into a backup directory.
 *
 * Unchanged files are skipped by size and then by digest, which keeps an hourly
 * or daily run cheap once the library stops growing. Every file it does copy is
 * read back and compared, because a mirror that was never verified is the same
 * bet as a backup that was never opened.
 */
export function mirrorMedia(options: {
  readonly source: string;
  readonly target: string;
}): MirrorResult {
  const { source, target } = options;
  if (!existsSync(source)) {
    throw new AdminError('backup-failed', 'The media root does not exist.');
  }
  mkdirSync(target, { recursive: true });

  const wanted = filesUnder(source);
  const present = new Set(filesUnder(target));
  const copied: string[] = [];
  const unchanged: string[] = [];

  for (const path of wanted) {
    const from = join(source, ...path.split('/'));
    const to = join(target, ...path.split('/'));
    if (present.has(path) && statSync(from).size === statSync(to).size) {
      const before = readFileSync(from);
      if (digest(before) === digest(readFileSync(to))) {
        unchanged.push(path);
        present.delete(path);
        continue;
      }
    }
    const bytes = readFileSync(from);
    mkdirSync(join(target, ...path.split('/').slice(0, -1)), { recursive: true });
    writeFileSync(to, bytes);
    if (digest(readFileSync(to)) !== digest(bytes)) {
      throw new AdminError('backup-failed', `A mirrored image did not match its source: ${path}`);
    }
    copied.push(path);
    present.delete(path);
  }

  // Anything left in `present` is in the mirror and no longer in the source.
  const removed = [...present].sort();
  for (const path of removed) rmSync(join(target, ...path.split('/')), { force: true });

  return { copied, unchanged, removed };
}

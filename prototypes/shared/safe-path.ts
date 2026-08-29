// Path containment for both prototypes.
//
// ADR 0001 section 5: binding to 127.0.0.1 is not a security model. Both
// prototypes accept paths from a browser, so both need an approved root and a
// check that a resolved path is genuinely inside it.
//
// Three mistakes this module exists to avoid:
//
//   1. Checking the string before normalising it. "posts/../../etc" only looks
//      contained until it is resolved.
//   2. Checking with a prefix comparison. "/data" is a prefix of "/data-other",
//      so a plain startsWith lets a sibling directory through. Containment is
//      decided with path.relative instead.
//   3. Stopping at the textual check. A symlink — or on Windows a junction or
//      any other reparse point — can sit inside the root and point anywhere.
//      The ADR calls this one out because an NTFS junction is not a symlink and
//      code that only handles symlinks misses it. realpath resolves all of
//      them, so the resolved path is re-checked.
//
// A path that does not exist yet still has to be checkable, because writing a
// new file is the normal case. The nearest existing ancestor is resolved
// instead, which is enough: if every existing part of the chain is inside the
// root, the missing tail cannot leave it.

import { realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { PrototypeError } from './errors.ts';

/** True when `child` is `parent` itself or beneath it. Not a string prefix test. */
export function contains(parent: string, child: string): boolean {
  const difference = relative(parent, child);
  if (difference === '') return true;
  return !difference.startsWith('..') && !isAbsolute(difference);
}

/** realpath of the nearest ancestor that exists, for paths not yet created. */
function realpathOfNearestExisting(target: string): string {
  let current = resolve(target);
  const missing: string[] = [];

  for (;;) {
    try {
      return join(realpathSync(current), ...missing.reverse());
    } catch {
      const parent = dirname(current);
      // Reached a filesystem root without finding anything that exists.
      if (parent === current) return resolve(target);
      missing.push(current.slice(parent.length + 1));
      current = parent;
    }
  }
}

export type SafeResolveOptions = {
  /**
   * Skip the realpath pass. Only for a caller that has already resolved links
   * itself. Leaving it on is the safe default and turning it off should be
   * argued for, which is why it reads as an opt-out rather than an opt-in.
   */
  followLinks?: boolean;
};

/**
 * Resolves `candidate` inside `root` and returns the real absolute path, or
 * throws `path-outside-root`.
 *
 * `candidate` is treated as relative to `root`. An absolute candidate is
 * rejected outright rather than silently re-based, because a browser sending
 * one is not a case worth guessing about.
 */
export function safeResolve(root: string, candidate: string, options: SafeResolveOptions = {}): string {
  const { followLinks = true } = options;

  if (candidate.length === 0) {
    throw new PrototypeError('path-outside-root', 'An empty path is not a file.');
  }
  if (isAbsolute(candidate) || /^[a-zA-Z]:/.test(candidate)) {
    throw new PrototypeError('path-outside-root', 'Absolute paths are not accepted.');
  }
  // A NUL byte can truncate a path inside a lower layer, so the string checked
  // here would not be the string opened there.
  if (candidate.includes('\0')) {
    throw new PrototypeError('path-outside-root', 'That path contains an invalid character.');
  }

  const realRoot = followLinks ? realpathSync(resolve(root)) : resolve(root);
  const resolved = resolve(realRoot, candidate);

  if (!contains(realRoot, resolved)) {
    throw new PrototypeError('path-outside-root', 'That path is outside the approved directory.');
  }

  if (!followLinks) return resolved;

  // The textual check passed; now find out where the path really goes. This is
  // what catches a symlink, junction or other reparse point planted inside the
  // root.
  const real = realpathOfNearestExisting(resolved);
  if (!contains(realRoot, real)) {
    throw new PrototypeError(
      'path-outside-root',
      'That path resolves outside the approved directory through a link.',
    );
  }
  return real;
}

/** Non-throwing form, for listing where one bad entry should not abort the rest. */
export function isSafe(root: string, candidate: string, options?: SafeResolveOptions): boolean {
  try {
    safeResolve(root, candidate, options);
    return true;
  } catch {
    return false;
  }
}

/**
 * Path of `target` relative to `root`, with forward slashes, for display and
 * logging. Throws if the target is not contained, so an escaped path cannot be
 * rendered as though it were normal.
 */
export function relativeToRoot(root: string, target: string): string {
  const from = resolve(root);
  if (!contains(from, resolve(target))) {
    throw new PrototypeError('path-outside-root', 'That path is outside the approved directory.');
  }
  return relative(from, resolve(target)).split(sep).join('/');
}

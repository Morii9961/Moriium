// Reuse unchanged bytes without sharing writable build files with a release.
import { createHash } from 'node:crypto';
import { chmodSync, copyFileSync, existsSync, linkSync, lstatSync, mkdirSync, readdirSync, readFileSync, unlinkSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';

const digest = (file: string) => createHash('sha256').update(readFileSync(file)).digest('hex');

export function copyReleaseTree(source: string, target: string, previous?: string): { copied: number; reused: number } {
  const counts = { copied: 0, reused: 0 };
  mkdirSync(target, { recursive: true });
  chmodSync(target, 0o755);
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    const from = join(source, entry.name);
    const to = join(target, entry.name);
    const old = previous ? join(previous, entry.name) : undefined;
    if (entry.isDirectory()) {
      const nested = copyReleaseTree(from, to, old);
      counts.copied += nested.copied;
      counts.reused += nested.reused;
    } else {
      if (!entry.isFile()) throw new Error('A release input contains a non-regular file.');
      if (old && existsSync(old) && lstatSync(old).isFile() &&
          (process.platform === 'win32' || (lstatSync(old).mode & 0o777) === 0o644) && digest(from) === digest(old)) {
        try {
          linkSync(old, to);
          counts.reused += 1;
          continue;
        } catch (error) {
          if (!['EXDEV', 'EPERM', 'ENOTSUP', 'EACCES'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error;
        }
      }
      copyFileSync(from, to);
      chmodSync(to, 0o644);
      counts.copied += 1;
    }
  }
  return counts;
}

/** Generated hash-addressed assets stay reachable by old open pages. Never overwrite. */
export function retainAssets(source: string, pool: string): void {
  if (!existsSync(source)) return;
  if (existsSync(pool) && (!lstatSync(pool).isDirectory() || lstatSync(pool).isSymbolicLink())) throw new Error('The asset pool must be a regular directory.');
  mkdirSync(pool, { recursive: true });
  chmodSync(pool, 0o755);
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    const from = join(source, entry.name);
    const to = join(pool, entry.name);
    if (entry.isDirectory()) retainAssets(from, to);
    else {
      if (!entry.isFile()) throw new Error('The public asset input contains a non-regular file.');
      if (existsSync(to)) {
        if (!lstatSync(to).isFile() || digest(from) !== digest(to)) throw new Error('A retained asset name changed its bytes.');
      } else {
        mkdirSync(dirname(to), { recursive: true });
        chmodSync(dirname(to), 0o755);
        const temporary = `${to}.${randomUUID()}.next`;
        try {
          copyFileSync(from, temporary);
          chmodSync(temporary, 0o644);
          if (digest(from) !== digest(temporary)) throw new Error('A retained asset copy did not match its source.');
          // Atomic create without replacing an existing immutable inode.
          linkSync(temporary, to);
        } finally { if (existsSync(temporary)) unlinkSync(temporary); }
      }
    }
  }
}

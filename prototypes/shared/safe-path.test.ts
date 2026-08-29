// Path containment tests.
//
// ADR 0001 section 5 requires the traversal and reparse-point guards to be
// proven rather than declared, and singles out Windows junctions because an
// NTFS junction is not a symlink and code that only handles symlinks misses it.
// So this creates a real junction on disk that points out of the approved root
// and checks the guard refuses a path through it. Asserting on the string
// handling alone would not have caught that class of bug.

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { contains, isSafe, relativeToRoot, safeResolve } from './safe-path.ts';

let base: string;
let root: string;
let outside: string;

before(() => {
  base = mkdtempSync(join(tmpdir(), 'moriium-path-'));
  root = join(base, 'approved');
  outside = join(base, 'elsewhere');
  mkdirSync(join(root, 'posts'), { recursive: true });
  mkdirSync(outside, { recursive: true });
  writeFileSync(join(root, 'posts', 'a.md'), 'inside');
  writeFileSync(join(outside, 'secret.md'), 'outside');

  // A sibling sharing the root's name prefix. A startsWith check would let this
  // through; path.relative does not.
  mkdirSync(`${root}-other`, { recursive: true });
  writeFileSync(join(`${root}-other`, 'b.md'), 'sibling');
});

after(() => {
  rmSync(base, { recursive: true, force: true });
});

describe('containment', () => {
  it('accepts a path inside the root', () => {
    assert.equal(safeResolve(root, 'posts/a.md'), resolve(root, 'posts/a.md'));
  });

  it('accepts a file that does not exist yet, since writing one is normal', () => {
    assert.equal(safeResolve(root, 'posts/new.md'), resolve(root, 'posts/new.md'));
  });

  it('accepts a file in a directory that does not exist yet', () => {
    assert.equal(safeResolve(root, 'posts/ja/new.md'), resolve(root, 'posts/ja/new.md'));
  });

  it('rejects a parent traversal', () => {
    assert.throws(() => safeResolve(root, '../elsewhere/secret.md'), /outside the approved/);
  });

  it('rejects a traversal disguised by a leading real segment', () => {
    assert.throws(() => safeResolve(root, 'posts/../../elsewhere/secret.md'), /outside the approved/);
  });

  it('rejects a traversal that does not exist, not just one that does', () => {
    assert.throws(() => safeResolve(root, '../elsewhere/nothing-here.md'), /outside the approved/);
  });

  it('rejects an absolute path instead of re-basing it', () => {
    assert.throws(() => safeResolve(root, join(outside, 'secret.md')), /Absolute paths/);
  });

  it('rejects a Windows drive-letter path', () => {
    assert.throws(() => safeResolve(root, 'C:\\Windows\\win.ini'), /Absolute paths/);
  });

  it('rejects an embedded NUL byte', () => {
    assert.throws(() => safeResolve(root, 'posts/a.md\0.png'), /invalid character/);
  });

  it('rejects an empty path', () => {
    assert.throws(() => safeResolve(root, ''), /not a file/);
  });

  it('does not treat a name-prefixed sibling as contained', () => {
    // `${root}-other` starts with `${root}`, which a startsWith check would
    // accept. Reached by traversal it must still be refused.
    assert.throws(() => safeResolve(root, '../approved-other/b.md'), /outside the approved/);
    assert.equal(contains(root, `${root}-other`), false);
  });

  it('treats the root itself as contained', () => {
    assert.equal(contains(root, root), true);
  });
});

describe('reparse points', () => {
  it('refuses a path through a junction that leaves the root', () => {
    const link = join(root, 'escape');
    // 'junction' works on Windows without elevation and is the case ADR
    // section 5 warns about. On POSIX Node creates a directory symlink, so the
    // same assertion is meaningful on both.
    symlinkSync(outside, link, 'junction');

    // The textual check passes — 'escape/secret.md' looks contained. Only
    // resolving the link reveals it is not.
    assert.equal(contains(resolve(root), resolve(root, 'escape/secret.md')), true);
    assert.throws(() => safeResolve(root, 'escape/secret.md'), /through a link/);
  });

  it('still allows a junction that stays inside the root', () => {
    const target = join(root, 'posts');
    const link = join(root, 'inside-link');
    symlinkSync(target, link, 'junction');
    assert.equal(safeResolve(root, 'inside-link/a.md'), resolve(root, 'posts', 'a.md'));
  });

  it('lets a caller opt out of link resolution only explicitly', () => {
    // Same escaping junction, textual check only: it passes. This documents
    // exactly what followLinks:false gives up.
    assert.equal(isSafe(root, 'escape/secret.md', { followLinks: false }), true);
    assert.equal(isSafe(root, 'escape/secret.md'), false);
  });
});

describe('relativeToRoot', () => {
  it('renders a contained path with forward slashes', () => {
    assert.equal(relativeToRoot(root, join(root, 'posts', 'a.md')), 'posts/a.md');
  });

  it('refuses to render an escaped path as though it were normal', () => {
    assert.throws(() => relativeToRoot(root, join(outside, 'secret.md')), /outside the approved/);
  });
});

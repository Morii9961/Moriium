// Proves the privacy audit can fail.
//
// docs/handoff-claude-public-v1-nonvisual-acceptance.md makes the point that
// scripts/audit-public-tree.mjs reporting nothing is not the same as the tree
// being clean: an audit whose detectors never fire is indistinguishable from an
// audit that found nothing. So every rule is shown a synthetic sample that it
// must catch, and a benign neighbour it must not.
//
// The samples are invented here. None of them is real private material, and
// nothing in this file is copied from .private/, from a protected post, or from
// any photograph's metadata.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, before, after } from 'node:test';
import { PATH_RULES, CONTENT_RULES, isTextBlob } from '../scripts/audit-public-tree.mjs';

const pathRule = (id) => PATH_RULES.find((rule) => rule.id === id);
const contentRule = (id) => CONTENT_RULES.find((rule) => rule.id === id);

/** Every rule is scoped; these are the paths each scope calls evidence. */
const IN_SCOPE = 'src/content/posts/zh/example.md';
const OUT_OF_SCOPE = 'scripts/sanitize-media.mjs';

// Assembled from fragments so that this file does not itself contain the
// literals its own rules match. scripts/audit-public-tree.mjs does the same
// with the retired article title, for the same reason: a test that proves a
// detector fires must not become the thing the detector is meant to find. It
// is not hypothetical -- committing these samples spelled out made the audit
// report its own test file, which is how a rule ends up quietly narrowed to
// make the noise stop.
const PEM_OPEN = `-----${'BEGIN'}`;
const AUTH_HEADER = `${'Authorization'}:`;

/** Dangerous paths, and a benign path each rule must leave alone. */
const PATH_SAMPLES = [
  {
    id: 'private-plaintext',
    dangerous: ['.private', '.private/posts/zh/draft.md'],
    benign: ['src/content/posts/zh/public.md', 'docs/encrypted-posts.md'],
  },
  {
    id: 'database-artifact',
    dangerous: ['data/moriium.db', 'data/moriium.db-wal', 'data/moriium.db-shm', 'x.sqlite3'],
    benign: ['src/server/db/open.ts', 'notes-about-db.md'],
  },
  {
    id: 'session-store',
    dangerous: ['var/lib/moriium/sessions/9f2a1c', '.astro/sessions/abc123'],
    benign: ['src/server/auth/session.ts', 'sessions.md'],
  },
  {
    id: 'environment-secret',
    dangerous: ['.env', '.env.production', 'deploy/.env.local'],
    benign: ['.env.example'],
  },
  {
    id: 'raw-photograph',
    dangerous: ['photos/DSC01234.ARW', 'photos/IMG_0001.dng', 'photos/x.heic'],
    benign: ['public/media/photo.webp', 'public/media/photo.jpg'],
  },
  {
    id: 'database-backup',
    dangerous: ['backups/moriium.bak', 'backup-2026-09-01.tar.gz', 'dump.sql'.replace('dump.sql', 'db.dump')],
    benign: ['src/server/backup/database-backup.ts'],
  },
];

/** Dangerous file contents, and benign text each rule must leave alone. */
const CONTENT_SAMPLES = [
  {
    id: 'password-frontmatter',
    dangerous: ['---\ntitle: A post\npassword: not-a-real-password\n---\n'],
    benign: ['---\ntitle: A post\n---\n\nThe password flow is described in the docs.\n'],
  },
  {
    id: 'private-key-block',
    dangerous: [
      `${PEM_OPEN} PRIVATE KEY-----\nAAAA`,
      `${PEM_OPEN} OPENSSH PRIVATE KEY-----\nAAAA`,
    ],
    benign: ['Keep the private key out of the repository.'],
  },
  {
    id: 'authorization-header',
    dangerous: [
      [AUTH_HEADER, 'Bearer', 'abcdefghijklmnop'].join(' '),
      [AUTH_HEADER, 'Basic', 'Zm9vOmJhcg=='].join(' '),
    ],
    benign: ['Send an Authorization header with the request.'],
  },
  {
    id: 'exif-location',
    dangerous: ['GPSLatitude: 35.0', 'exif.GPSPosition', '{"GPSLongitude": 139.0}'],
    benign: ['Strip GPS data before publishing a photograph.'],
  },
  {
    id: 'coordinate-frontmatter',
    dangerous: ['---\nlatitude: 35.68941\nlongitude: 139.76921\n---', 'gps: -33.86882'],
    // Three decimals is town-level, not a doorstep, and a plain word is nothing.
    benign: ['lat: 35.68\n', 'The latitude is recorded elsewhere.'],
  },
  {
    id: 'private-source-path',
    dangerous: ['see .private/posts/zh/x.md', 'C:\\repo\\.private\\posts\\x.md'],
    benign: ['Plaintext lives outside the repository.'],
  },
];

describe('every privacy path rule', () => {
  it('is covered by a synthetic sample', () => {
    const covered = new Set(PATH_SAMPLES.map((sample) => sample.id));
    // The retired-article rule is exercised in its own case below.
    covered.add('retired-protected-article');
    for (const rule of PATH_RULES) {
      assert.ok(covered.has(rule.id), `path rule ${rule.id} has no synthetic sample`);
    }
  });

  for (const sample of PATH_SAMPLES) {
    it(`catches ${sample.id}`, () => {
      const rule = pathRule(sample.id);
      assert.ok(rule, `${sample.id} is not a known path rule`);
      for (const path of sample.dangerous) {
        assert.equal(rule.test(path), true, `${sample.id} missed ${path}`);
      }
      for (const path of sample.benign) {
        assert.equal(rule.test(path), false, `${sample.id} falsely flagged ${path}`);
      }
    });
  }
});

describe('every privacy content rule', () => {
  it('is covered by a synthetic sample', () => {
    const covered = new Set(CONTENT_SAMPLES.map((sample) => sample.id));
    covered.add('retired-protected-article');
    for (const rule of CONTENT_RULES) {
      assert.ok(covered.has(rule.id), `content rule ${rule.id} has no synthetic sample`);
    }
  });

  for (const sample of CONTENT_SAMPLES) {
    it(`catches ${sample.id}`, () => {
      const rule = contentRule(sample.id);
      assert.ok(rule, `${sample.id} is not a known content rule`);
      for (const text of sample.dangerous) {
        assert.ok(rule.count(text) > 0, `${sample.id} missed a dangerous sample`);
      }
      for (const text of sample.benign) {
        assert.equal(rule.count(text), 0, `${sample.id} falsely flagged a benign sample`);
      }
    });
  }
});

describe('the retired protected article', () => {
  // Reassembled the same way the audit does, so neither file publishes it whole.
  const title = ['A', 'Farewell', 'But', 'Not', 'the', 'Finale'].join('-');

  it('is caught in a path and in file content', () => {
    assert.equal(pathRule('retired-protected-article').test(`src/content/protected/${title}.json`), true);
    assert.ok(contentRule('retired-protected-article').count(`title: ${title}`) > 0);
  });

  it('does not fire on unrelated text', () => {
    assert.equal(pathRule('retired-protected-article').test('src/content/posts/zh/farewell.md'), false);
    assert.equal(contentRule('retired-protected-article').count('A farewell to the old site.'), 0);
  });
});

describe('the audit rule sets', () => {
  it('expose a stable shape so the runner and this test agree', () => {
    for (const rule of PATH_RULES) {
      assert.equal(typeof rule.id, 'string');
      assert.equal(typeof rule.describe, 'string');
      assert.equal(typeof rule.test, 'function');
    }
    for (const rule of CONTENT_RULES) {
      assert.equal(typeof rule.id, 'string');
      assert.equal(typeof rule.describe, 'string');
      assert.equal(typeof rule.count, 'function');
      assert.equal(typeof rule.appliesTo, 'function');
    }
  });

  it('treat published material as evidence for every rule', () => {
    for (const rule of CONTENT_RULES) {
      assert.equal(rule.appliesTo(IN_SCOPE), true, `${rule.id} skips authored content`);
    }
  });

  it('do not report the code that names a risk in order to remove it', () => {
    // scripts/sanitize-media.mjs and its tests have to say "GPSLatitude" to
    // strip it, and AGENTS.md has to say ".private/posts" to document it.
    // Reporting those as leaks trains people to ignore the audit.
    const scoped = ['private-source-path', 'exif-location', 'coordinate-frontmatter'];
    for (const id of scoped) {
      assert.equal(contentRule(id).appliesTo(OUT_OF_SCOPE), false, `${id} still flags the safety net`);
    }
    // Everything else has no legitimate home anywhere, scope included.
    for (const rule of CONTENT_RULES.filter((candidate) => !scoped.includes(candidate.id))) {
      assert.equal(rule.appliesTo(OUT_OF_SCOPE), true, `${rule.id} was narrowed without cause`);
    }
  });
});

describe('blob text detection', () => {
  it('reads text and skips anything holding a NUL byte', () => {
    assert.equal(isTextBlob(Buffer.from('password: x\n', 'utf8')), true);
    assert.equal(isTextBlob(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x1a])), false);
  });
});

// The rule sets above are unit-checked, but the history sweep is plumbing:
// object enumeration, a `git cat-file --batch` stream, and byte-accurate
// framing. None of that is exercised by feeding a regex a string, so it gets a
// real repository whose secret exists only in a commit that was later undone.
describe('the history sweep', () => {
  let repo;

  const run = (cwd) => {
    try {
      const stdout = execFileSync(
        process.execPath,
        [new URL('../scripts/audit-public-tree.mjs', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'), '--root', cwd],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
      );
      return { code: 0, output: stdout };
    } catch (error) {
      return { code: error.status, output: `${error.stdout ?? ''}${error.stderr ?? ''}` };
    }
  };

  const git = (...args) =>
    execFileSync('git', ['-c', 'user.email=t@example.invalid', '-c', 'user.name=Test', ...args], {
      cwd: repo,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

  before(() => {
    repo = mkdtempSync(join(tmpdir(), 'moriium-audit-'));
    git('init', '-q', '-b', 'main');
    mkdirSync(join(repo, 'src/content/posts/zh'), { recursive: true });
    writeFileSync(join(repo, 'README.md'), 'A repository.\n');
    git('add', '-A');
    git('commit', '-qm', 'first');
  });

  after(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  it('is clean before anything is planted', () => {
    const { code, output } = run(repo);
    assert.equal(code, 0, output);
    assert.match(output, /Privacy audit clean/);
    assert.match(output, /reachable commits, \d+ distinct historical paths, \d+ unique blobs/);
  });

  it('finds a path that only ever existed as a rename target', () => {
    // `git log --diff-filter=A` calls this an R, not an A, so a path-enumeration
    // built on additions never sees it. The file is renamed into a forbidden
    // path and then deleted, so the working tree and the index are both clean
    // and only the history knows.
    writeFileSync(join(repo, 'notes.txt'), 'Ordinary notes.\n');
    git('add', '-A');
    git('commit', '-qm', 'notes');

    mkdirSync(join(repo, 'data'), { recursive: true });
    git('mv', 'notes.txt', 'data/moriium.db');
    git('commit', '-qm', 'rename only');

    git('rm', '-q', 'data/moriium.db');
    git('commit', '-qm', 'remove');

    const { code, output } = run(repo);
    assert.equal(code, 1, 'a rename into a forbidden path must fail the audit');
    assert.match(output, /database-artifact/);
    assert.match(output, /data\/moriium\.db/);
  });

  it('reports a blob at every path it was stored at, not just the first', () => {
    // Identical content at two paths is one blob. Attributing it to a single
    // path -- which is all `rev-list --objects` reports -- can hide a finding
    // outright: here the rule only applies under src/content/, so if the blob
    // were attributed to the docs/ copy alone the leak would go unreported.
    const body = 'GPSLatitude: 39/1 54/1 0/1\n';
    mkdirSync(join(repo, 'docs'), { recursive: true });
    writeFileSync(join(repo, 'docs/notes.md'), body);
    writeFileSync(join(repo, 'src/content/posts/zh/dup.md'), body);
    git('add', '-A');
    git('commit', '-qm', 'same blob, two paths');

    git('rm', '-q', 'docs/notes.md', 'src/content/posts/zh/dup.md');
    git('commit', '-qm', 'remove both');

    const { code, output } = run(repo);
    assert.equal(code, 1, 'the in-scope copy must be reported');
    assert.match(output, /exif-location/);
    assert.match(output, /src\/content\/posts\/zh\/dup\.md/);
    // The docs/ copy is the same blob but out of this rule's scope.
    assert.doesNotMatch(output, /docs\/notes\.md :: exif-location/);
    assert.doesNotMatch(output, /39\/1 54\/1/, 'the audit must never print the match');
  });

  it('finds a blob a ref names directly, with no commit or path above it', () => {
    // `git hash-object -w` plus `git update-ref` parks content in the object
    // store under a ref with no tree and no commit. Every path-keyed
    // enumeration misses it -- `rev-list --objects` emits it as a bare id with
    // no path, which is exactly the shape a path-based reader skips -- so its
    // content would never be read at all.
    const marker = `-----${'BEGIN'} PRIVATE KEY-----\nAAAA\n`;
    writeFileSync(join(repo, 'loose'), marker);
    const sha = git('hash-object', '-w', 'loose').trim();
    rmSync(join(repo, 'loose'));
    git('update-ref', 'refs/secrets/parked', sha);

    const { code, output } = run(repo);
    assert.equal(code, 1, 'a blob parked under a ref must still be audited');
    assert.match(output, /git-ref/);
    assert.match(output, /private-key-block/);
    assert.match(output, /refs\/secrets\/parked/);
    assert.doesNotMatch(output, /BEGIN PRIVATE KEY/, 'the audit must never print the match');

    git('update-ref', '-d', 'refs/secrets/parked');
  });

  it('finds a secret that was committed and then deleted', () => {
    mkdirSync(join(repo, 'src/content/posts/zh'), { recursive: true });
    const leak = join(repo, 'src/content/posts/zh/leak.md');
    // Invented, not real: a password-shaped string and a coordinate.
    writeFileSync(leak, '---\ntitle: x\npassword: synthetic-not-a-real-password\nlatitude: 35.68941\n---\n');
    git('add', '-A');
    git('commit', '-qm', 'add');

    rmSync(leak);
    git('add', '-A');
    git('commit', '-qm', 'remove');

    // The working tree no longer has it. History still does.
    const { code, output } = run(repo);
    assert.equal(code, 1, 'a deleted-but-committed secret must still fail the audit');
    assert.match(output, /git-history/);
    assert.match(output, /password-frontmatter/);
    assert.match(output, /coordinate-frontmatter/);
    assert.doesNotMatch(output, /synthetic-not-a-real-password/, 'the audit must never print the match');
    assert.doesNotMatch(output, /35\.68941/, 'the audit must never print a coordinate');
  });
});

describe('the history sweep when git cannot deliver an object', () => {
  // The failure this guards is silent under-reading: if cat-file hands back
  // fewer objects than were asked for and nobody checks, the audit still ends
  // with the word "clean", which is the only sentence anyone reads.
  let repo;

  after(() => {
    if (repo) rmSync(repo, { recursive: true, force: true });
  });

  it('fails instead of reporting clean', () => {
    repo = mkdtempSync(join(tmpdir(), 'moriium-audit-broken-'));
    const git = (...args) =>
      execFileSync('git', ['-c', 'user.email=t@example.invalid', '-c', 'user.name=Test', ...args], {
        cwd: repo,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });

    git('init', '-q', '-b', 'main');
    writeFileSync(join(repo, 'note.txt'), 'Something worth reading.\n');
    git('add', '-A');
    git('commit', '-qm', 'first');

    // Remove the loose object backing the committed file. Objects in a fresh
    // repository are loose, so this leaves a reference to something git can
    // name but not read.
    const sha = git('rev-parse', 'HEAD:note.txt').trim();
    rmSync(join(repo, '.git/objects', sha.slice(0, 2), sha.slice(2)), { force: true });

    let code = 0;
    let output = '';
    try {
      output = execFileSync(
        process.execPath,
        [
          new URL('../scripts/audit-public-tree.mjs', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'),
          '--root',
          repo,
        ],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
      );
    } catch (error) {
      code = error.status;
      output = `${error.stdout ?? ''}${error.stderr ?? ''}`;
    }

    assert.notEqual(code, 0, 'an unreadable object must not end in a clean report');
    assert.doesNotMatch(output, /Privacy audit clean/);
  });
});

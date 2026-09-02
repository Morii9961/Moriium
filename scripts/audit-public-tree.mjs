// Looks for private material in everything this repository publishes or keeps.
//
//   node scripts/audit-public-tree.mjs              (runs inside `pnpm verify`)
//   node scripts/audit-public-tree.mjs --report     (report findings without failing)
//   node scripts/audit-public-tree.mjs --root <dir> (audit a repository elsewhere)
//
// --root exists so the audit can be pointed at a synthetic repository whose
// history contains a planted secret. A check nobody has watched fail is a check
// nobody knows the shape of; tests/privacy-audit.test.mjs uses it for exactly
// that, and the rule sets below are exported for the same reason.
//
// Scope, in the order the risk actually runs:
//
//   1. The Git index -- what a push would hand to GitHub right now.
//   2. Git history -- what a push would hand over from every earlier commit.
//      A file deleted in the working tree is still in the pack, so "it is not
//      there any more" is not an answer to "was it ever committed". Every
//      unique blob is read and put through every content rule; sweeping a
//      couple of fixed strings would only prove the strings were absent.
//   3. src/content/ -- the authored collections, including protected envelopes.
//   4. The built client tree -- what a reader can fetch.
//   5. The built server bundle -- not reader-facing, but it is copied to the
//      VPS, so a private path baked into it still leaves the machine.
//   6. Local round artifacts -- logs, screenshots and reports that a working
//      session drops into the tree and that are easy to commit by accident.
//
// AGENTS.md forbids printing protected plaintext, passwords or exact GPS to
// logs. That constrains this file more than it constrains most: a scanner that
// prints its matches to prove it found a secret has published the secret to
// the terminal and to CI. So every finding here reports a path, a Git object or
// commit id, and a count -- never the matched text, and never a line of it.

import { execFile, spawn } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative, resolve } from 'node:path';
import { promisify } from 'node:util';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { publicOutputRoot, serverOutputRoot } from './lib/public-output.mjs';

const execFileAsync = promisify(execFile);

const rootFlag = process.argv.indexOf('--root');
if (rootFlag !== -1 && process.argv[rootFlag + 1] === undefined) {
  console.error('Moriium audit: --root needs a directory.');
  process.exit(1);
}
const root = rootFlag === -1 ? resolve(import.meta.dirname, '..') : resolve(process.argv[rootFlag + 1]);
const reportOnly = process.argv.includes('--report');

/**
 * The protected article that was retired. Assembled rather than written out so
 * that this file does not itself become the place its title is published.
 */
const RETIRED_PROTECTED_TITLE = ['A', 'Farewell', 'But', 'Not', 'the', 'Finale'].join('-');

/** Everywhere. Most rules describe things with no legitimate home at all. */
const ANYWHERE = () => true;

/**
 * The material that actually reaches a reader: authored collections, build
 * output, and published media derivatives.
 *
 * Three rules are scoped to it, because outside it the same strings are how the
 * project talks about the risk rather than evidence of it. `.private/posts` is
 * the documented convention, named on purpose by AGENTS.md,
 * docs/encrypted-posts.md and scripts/encrypt-post.mjs. `GPSLatitude` and a
 * decimal `latitude:` are named by the media privacy gate and by the tests that
 * prove it strips them -- code that removes a field has to say the field's name.
 *
 * This scoping is not a guess. Running these rules across all of history first
 * returned 15 hits, every one of them a synthetic test fixture or design prose
 * about stripping EXIF; none was a photograph's real location. A rule that
 * reports the safety net as a leak trains people to ignore it.
 *
 * Inside this scope the same strings mean something else entirely: an article,
 * a built page or a published derivative that carries a real location.
 */
const PUBLISHED_MATERIAL = (path) =>
  path.startsWith('src/content/') || path.startsWith('dist/') || path.startsWith('public/media/');

/**
 * Paths that must never be committed, built, or left in the tree.
 *
 * Each returns true for a path that is a problem in itself, whatever it holds.
 */
export const PATH_RULES = [
  {
    id: 'private-plaintext',
    describe: 'plaintext protected source under .private/',
    test: (path) => path === '.private' || path.startsWith('.private/'),
  },
  {
    id: 'retired-protected-article',
    describe: 'the retired protected article',
    test: (path) => path.includes(RETIRED_PROTECTED_TITLE),
  },
  {
    id: 'database-artifact',
    describe: 'an admin database or its write-ahead files',
    test: (path) => /\.(?:db|db-wal|db-shm|sqlite|sqlite3)$/i.test(path),
  },
  {
    id: 'session-store',
    describe: 'a session store file',
    test: (path) => /(?:^|\/)sessions\/[^/]+$/i.test(path),
  },
  {
    id: 'environment-secret',
    describe: 'a real .env rather than the example',
    test: (path) => /(?:^|\/)\.env(?:\.[\w-]+)?$/i.test(path) && !path.endsWith('.env.example'),
  },
  {
    id: 'raw-photograph',
    describe: 'an untouched camera original',
    test: (path) => /\.(?:arw|cr2|cr3|nef|dng|orf|rw2|raf|heic|heif)$/i.test(path),
  },
  {
    id: 'database-backup',
    describe: 'a database backup or dump',
    test: (path) => /\.(?:bak|dump)$/i.test(path) || /backup[^/]*\.(?:tar\.gz|tgz|zip|sql)$/i.test(path),
  },
];

/**
 * Content that must not appear in a file.
 *
 * `count` returns the number of matches; the count is reported and the match is
 * not. `appliesTo` narrows a rule to the paths where it is evidence rather than
 * documentation, and applies identically to the working tree and to history --
 * a rule that means one thing today and another in a 2026-08 commit would be
 * two rules wearing one name.
 */
export const CONTENT_RULES = [
  {
    id: 'retired-protected-article',
    describe: 'the retired protected article',
    appliesTo: ANYWHERE,
    count: (text) => countOf(text, new RegExp(RETIRED_PROTECTED_TITLE, 'g')),
  },
  {
    id: 'private-source-path',
    describe: 'a path into the private plaintext tree',
    appliesTo: PUBLISHED_MATERIAL,
    count: (text) => countOf(text, /\.private[/\\]posts/g),
  },
  {
    id: 'password-frontmatter',
    describe: 'password frontmatter',
    appliesTo: ANYWHERE,
    count: (text) => countOf(text, /^password\s*:\s*\S/gm),
  },
  {
    id: 'private-key-block',
    describe: 'an embedded private key',
    appliesTo: ANYWHERE,
    count: (text) => countOf(text, /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/g),
  },
  {
    id: 'authorization-header',
    describe: 'a literal authorization header',
    appliesTo: ANYWHERE,
    count: (text) => countOf(text, /Authorization["'\s:]+(?:Bearer|Basic)\s+[\w.\-+/=]{8,}/gi),
  },
  {
    id: 'exif-location',
    describe: 'an exact EXIF location field',
    appliesTo: PUBLISHED_MATERIAL,
    count: (text) => countOf(text, /\bGPS(?:Latitude|Longitude|Position|Altitude|Coordinates)\b/g),
  },
  {
    id: 'coordinate-frontmatter',
    describe: 'coordinate frontmatter',
    appliesTo: PUBLISHED_MATERIAL,
    count: (text) => countOf(text, /^\s*(?:gps|coordinates|latitude|longitude|lat|lng)\s*:\s*-?\d+\.\d{4,}/gim),
  },
];

function countOf(text, pattern) {
  return (text.match(pattern) ?? []).length;
}

/** Extensions worth reading as text on disk. Anything else is checked by path. */
const TEXTUAL = new Set(['.md', '.mdx', '.json', '.html', '.xml', '.js', '.mjs', '.cjs', '.ts', '.txt', '.css', '.yml', '.yaml']);

/** Local directories a working session fills and that must stay out of Git. */
const ROUND_ARTIFACTS = ['artifacts', 'playwright-report', 'test-results'];

const findings = [];

function report(scope, location, ruleId, describe, count) {
  findings.push({ scope, location, ruleId, describe, count });
}

async function filesUnder(directory, extensions) {
  const files = [];
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return files;
    throw error;
  }
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await filesUnder(path, extensions)));
    else if (!extensions || extensions.has(extname(entry.name))) files.push(path);
  }
  return files;
}

async function git(args) {
  const { stdout } = await execFileAsync('git', args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
  return stdout;
}

/** Apply the path rules to one path in one scope. */
function auditPath(scope, path) {
  for (const rule of PATH_RULES) {
    if (rule.test(path)) report(scope, path, rule.id, rule.describe, 1);
  }
}

/** Apply the content rules that are meaningful at `path` to that file's text. */
function auditContent(scope, location, path, text) {
  for (const rule of CONTENT_RULES) {
    if (!rule.appliesTo(path)) continue;
    const count = rule.count(text);
    if (count > 0) report(scope, location, rule.id, rule.describe, count);
  }
}

/**
 * Apply only the rules that hold regardless of path.
 *
 * For content that has no path at all -- a blob a ref names directly -- the
 * scoped rules cannot be evaluated, and guessing a path for them would be
 * inventing the answer. The unscoped rules still apply in full.
 */
export function auditUnscopedContent(scope, location, text) {
  for (const rule of CONTENT_RULES) {
    if (rule.appliesTo !== ANYWHERE) continue;
    const count = rule.count(text);
    if (count > 0) report(scope, location, rule.id, rule.describe, count);
  }
}

/**
 * A blob is worth reading as text unless it holds a NUL byte.
 *
 * Extension is not usable here: history contains blobs whose path changed, and
 * a secret committed as `notes` with no extension is exactly the case that
 * matters. Content decides instead.
 */
export function isTextBlob(buffer) {
  return !buffer.includes(0x00);
}

/**
 * Reads the named blobs through one `git cat-file --batch` process.
 *
 * The batch stream is `<sha> <type> <size>
<size bytes>
`, so it is parsed as
 * bytes rather than lines: a line-based reader would corrupt any blob that
 * happens to contain a newline at the wrong offset.
 *
 * Every failure mode here has to be loud. A privacy audit that silently reads
 * fewer objects than it asked for still prints "clean", and that sentence is
 * the whole product. So a non-zero exit, a `missing` object, or a short count
 * all reject rather than letting the run finish.
 */
function readBlobs(shas, onBlob) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn('git', ['cat-file', '--batch'], { cwd: root });
    let buffer = Buffer.alloc(0);
    let pending = null;
    let stderr = '';
    const delivered = new Set();
    const missing = [];

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });

    child.stdout.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      for (;;) {
        if (pending === null) {
          const newline = buffer.indexOf(0x0a);
          if (newline === -1) return;
          const header = buffer.subarray(0, newline).toString('utf8');
          buffer = buffer.subarray(newline + 1);
          const parsed = /^([0-9a-f]+) (\w+) (\d+)$/.exec(header);
          if (!parsed) {
            // "<object> missing" or "<object> ambiguous": the object was asked
            // for and not delivered, which is a gap in coverage, not a nuisance.
            const unresolved = /^(\S+) (missing|ambiguous)$/.exec(header);
            if (unresolved) missing.push(unresolved[1]);
            continue;
          }
          pending = { sha: parsed[1], size: Number(parsed[3]) };
        }
        if (buffer.length < pending.size + 1) return;
        delivered.add(pending.sha);
        onBlob(pending.sha, buffer.subarray(0, pending.size));
        buffer = buffer.subarray(pending.size + 1);
        pending = null;
      }
    });

    child.on('error', reject);
    child.stdin.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`git cat-file --batch exited ${code}${stderr ? `: ${stderr.trim()}` : ''}`));
        return;
      }
      if (missing.length > 0) {
        reject(new Error(`git cat-file --batch could not resolve ${missing.length} object(s)`));
        return;
      }
      if (delivered.size !== new Set(shas).size) {
        reject(
          new Error(
            `git cat-file --batch returned ${delivered.size} of ${new Set(shas).size} requested objects`,
          ),
        );
        return;
      }
      resolvePromise();
    });

    child.stdin.end(shas.map((sha) => `${sha}\n`).join(''));
  });
}

async function historyBlobs() {
  const commits = (await git(['rev-list', '--all'])).split('\n').filter(Boolean);
  const pathsBySha = new Map();
  const allPaths = new Set();

  // One full listing per reachable commit, rather than the paths a diff calls
  // "added". `--diff-filter=A` answers a different question and misses two real
  // cases: a pure rename into a forbidden path is an R, not an A, and a blob
  // that also lives somewhere else is only ever attributed to one of its paths.
  // Listing each snapshot in full asks the question that actually matters --
  // "did this path ever exist in a commit anyone can reach" -- and gets every
  // path a blob was ever stored at.
  const record = (sha, path) => {
    allPaths.add(path);
    if (!pathsBySha.has(sha)) pathsBySha.set(sha, new Set());
    pathsBySha.get(sha).add(path);
  };

  for (const commit of commits) {
    const listing = await git(['ls-tree', '-r', '-z', commit]);
    for (const entry of listing.split('\0')) {
      if (!entry) continue;
      // "<mode> SP <type> SP <object> TAB <path>"
      const tab = entry.indexOf('\t');
      if (tab === -1) continue;
      const [, type, sha] = entry.slice(0, tab).split(' ');
      if (type !== 'blob') continue;
      record(sha, entry.slice(tab + 1));
    }
  }

  // The snapshot walk above only reaches objects hanging off commits. A ref can
  // point straight at a tree or a blob -- this repository has fifteen
  // `refs/codex/turn-diffs/checkpoints/*` refs that do exactly that, holding 35
  // blobs no commit tree contains. `rev-list --objects` reaches those, so the
  // two enumerations are unioned: the walk gives every path a blob was stored
  // at, and this gives the objects the walk cannot see. Dropping either one
  // would be a coverage hole in a check whose whole value is having none.
  const objectTypes = new Map();
  for (const line of (await git([
    'cat-file', '--batch-all-objects', '--batch-check=%(objectname) %(objecttype)',
  ])).split('\n')) {
    const [sha, type] = line.trim().split(' ');
    if (sha && type) objectTypes.set(sha, type);
  }

  for (const line of (await git(['rev-list', '--objects', '--all'])).split('\n')) {
    const space = line.indexOf(' ');
    if (space === -1) continue;
    const sha = line.slice(0, space);
    const path = line.slice(space + 1).trim();
    if (path && objectTypes.get(sha) === 'blob') record(sha, path);
  }

  // A ref can point straight at a blob, with no tree and no commit above it and
  // therefore no path anywhere. `rev-list --objects` emits such an object as a
  // bare id, which every path-keyed enumeration above drops on the floor: the
  // content would never be read at all. `git hash-object -w` followed by
  // `git update-ref` is all it takes to park a file there, so the blind spot is
  // reachable by accident as well as on purpose.
  //
  // The ref name stands in for the path. Only unscoped rules can run, because
  // the scoped ones ask a question about a path that does not exist here.
  const refBlobs = new Map();
  const noteRefBlob = (sha, refname) => {
    if (!refBlobs.has(sha)) refBlobs.set(sha, new Set());
    refBlobs.get(sha).add(refname);
  };

  for (const line of (await git([
    'for-each-ref', '--format=%(objecttype) %(objectname) %(*objecttype) %(*objectname) %(refname)',
  ])).split('\n')) {
    if (!line.trim()) continue;
    const [type, name, peeledType, peeledName, ...rest] = line.trim().split(' ');
    const refname = rest.join(' ');
    // An annotated tag reports its own type; the object it peels to is what
    // actually holds content.
    if (type === 'blob') noteRefBlob(name, refname);
    else if (peeledType === 'blob') noteRefBlob(peeledName, refname);
  }

  return { commits, allPaths, pathsBySha, refBlobs };
}

async function main() {
  let gitAvailable = true;
  let historyStats = { commits: 0, paths: 0, blobs: 0, refBlobs: 0, text: 0, binary: 0 };

  try {
    // 1. What a push would hand over right now.
    for (const path of (await git(['ls-files', '-z'])).split('\0').filter(Boolean)) {
      auditPath('git-index', path);
    }

    // 2. What a push would hand over from every earlier commit: every path in
    // every reachable snapshot, then the contents of every unique blob against
    // every rule that applies at any path that blob was stored at.
    const { commits, allPaths, pathsBySha, refBlobs } = await historyBlobs();
    historyStats.commits = commits.length;
    historyStats.paths = allPaths.size;
    historyStats.refBlobs = refBlobs.size;

    for (const path of allPaths) auditPath('git-history', path);

    const wanted = new Set([...pathsBySha.keys(), ...refBlobs.keys()]);
    historyStats.blobs = wanted.size;

    if (wanted.size > 0) {
      await readBlobs([...wanted], (sha, content) => {
        if (!isTextBlob(content)) {
          historyStats.binary += 1;
          return;
        }
        historyStats.text += 1;
        const text = content.toString('utf8');

        // A blob can sit at several paths at once, and a rule's scope is a
        // property of the path. Reporting it at each path the rule applies to
        // is what makes "the same secret was also committed over here" visible.
        for (const path of pathsBySha.get(sha) ?? []) {
          auditContent('git-history', `${sha.slice(0, 12)} ${path}`, path, text);
        }

        // A blob a ref names directly has no path, so the scoped rules have
        // nothing to decide against. The unscoped ones describe things with no
        // legitimate home anywhere, which is exactly the question worth asking
        // of an object someone parked under a ref.
        for (const refname of refBlobs.get(sha) ?? []) {
          auditUnscopedContent('git-ref', `${sha.slice(0, 12)} ${refname}`, text);
        }
      });
    }
  } catch (error) {
    if (error.code === 'ENOENT' || /not a git repository/i.test(String(error.stderr ?? ''))) {
      gitAvailable = false;
      console.warn('Git is unavailable; auditing generated and content files only.');
    } else {
      throw error;
    }
  }

  // 3, 4 and 5. Authored content, the reader's tree, and the server bundle that
  // is copied to the VPS alongside it.
  const serverRoot = serverOutputRoot(root);
  const scopes = [
    ['content', resolve(root, 'src/content')],
    ['public-output', publicOutputRoot(root)],
    ...(serverRoot ? [['server-output', serverRoot]] : []),
  ];

  for (const [scope, directory] of scopes) {
    for (const file of await filesUnder(directory)) {
      const name = relative(root, file).split('\\').join('/');
      auditPath(scope, name);
      if (!TEXTUAL.has(extname(file))) continue;
      auditContent(scope, name, name, await readFile(file, 'utf8'));
    }
  }

  // 6. Whatever this round itself left behind.
  for (const directory of ROUND_ARTIFACTS) {
    for (const file of await filesUnder(resolve(root, directory))) {
      const name = relative(root, file).split('\\').join('/');
      auditPath('round-artifacts', name);
      if (TEXTUAL.has(extname(file))) {
        auditContent('round-artifacts', name, name, await readFile(file, 'utf8'));
      }
    }
  }

  for (const file of await filesUnder(root, new Set(['.log']))) {
    const name = relative(root, file).split('\\').join('/');
    if (name.startsWith('node_modules/')) continue;
    auditPath('round-artifacts', name);
    auditContent('round-artifacts', name, name, await readFile(file, 'utf8'));
  }

  // Reporting. Paths, ids and counts only: never the matched text.
  if (findings.length > 0) {
    const unique = new Map();
    for (const finding of findings) {
      const key = `${finding.scope}\u0000${finding.location}\u0000${finding.ruleId}`;
      unique.set(key, (unique.get(key) ?? 0) + finding.count);
    }

    console.error(`Privacy audit found ${unique.size} location(s) to review:`);
    for (const [key, count] of unique) {
      const [scope, location, ruleId] = key.split('\u0000');
      console.error(`  - [${scope}] ${location} :: ${ruleId} x${count}`);
    }
    console.error('\nMatched text is deliberately not printed. Open the listed path to review it.');

    if (!reportOnly) process.exitCode = 1;
    return;
  }

  const history = gitAvailable
    ? `git: index plus ${historyStats.commits} reachable commits, ` +
      `${historyStats.paths} distinct historical paths, ${historyStats.blobs} unique blobs ` +
      `(${historyStats.text} scanned as text, ${historyStats.binary} binary skipped, ` +
      `${historyStats.refBlobs} named directly by a ref)`
    : 'git: unavailable';
  console.log(
    `Privacy audit clean: ${PATH_RULES.length} path rules and ${CONTENT_RULES.length} content rules ` +
      `over ${scopes.map(([scope]) => scope).join(', ')}; ${history}.`,
  );
}

// Only audit when run as a command. tests/privacy-audit.test.mjs imports the
// rule sets to prove each one fires, and must not trigger a real scan to do it.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}

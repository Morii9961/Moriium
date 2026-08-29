// Validates the fixture corpus. Run it after touching anything under
// prototypes/fixtures/.
//
//   node prototypes/tools/validate-fixtures.ts
//
// ADR 0001 section 1 makes the corpus a hard prerequisite for Phase 1, because
// prototype A and prototype B have to consume identical inputs for the
// comparison in section 4 to mean anything. A corpus nobody checks cannot carry
// that weight, so every claim here is an assertion, not a comment.

import { readFile, readdir, stat } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { parseFrontmatter } from '@astrojs/markdown-remark';
import { decryptHtml } from '../../scripts/lib/crypto.mjs';
import {
  PROTECTED_ADDED_FIELDS,
  PROTECTED_OMITTED_FIELDS,
  SHARED_METADATA_FIELDS,
  postMetadata,
  protectedMetadata,
} from '../shared/content-schema.ts';
import { FIXTURE_PASSWORD } from './fixture-password.ts';

const here = import.meta.dirname;
const repoRoot = resolve(here, '../..');
const fixturesRoot = resolve(here, '../fixtures');
const postsRoot = join(fixturesRoot, 'posts');
const protectedRoot = join(fixturesRoot, 'protected');
const mediaRoot = join(fixturesRoot, 'media');

const failures: string[] = [];
const notes: string[] = [];

function check(condition: unknown, message: string) {
  if (!condition) failures.push(message);
}

function rel(path: string) {
  return path.replace(`${repoRoot}\\`, '').replace(`${repoRoot}/`, '').replace(/\\/g, '/');
}

async function walk(dir: string, extension: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const found: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await walk(full, extension)));
    else if (entry.name.endsWith(extension)) found.push(full);
  }
  return found.sort();
}

async function exists(path: string) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// 1. Schema drift against production
// ---------------------------------------------------------------------------

const productionConfig = await readFile(join(repoRoot, 'src/content.config.ts'), 'utf8');

/** Capture group 1 of every match, dropping the ones the engine left unset. */
function captures(source: string, pattern: RegExp): string[] {
  return [...source.matchAll(pattern)]
    .map((match) => match[1])
    .filter((value): value is string => value !== undefined)
    .sort();
}

const sharedBody = productionConfig.match(/const sharedMetadata = z\.object\(\{([\s\S]*?)\n\}\);/)?.[1];
check(
  sharedBody !== undefined,
  'Could not locate sharedMetadata in src/content.config.ts; the drift check is blind.',
);

if (sharedBody !== undefined) {
  const productionFields = captures(sharedBody, /^\s{2}(\w+):/gm);
  const missing = productionFields.filter((f) => !SHARED_METADATA_FIELDS.includes(f));
  const extra = SHARED_METADATA_FIELDS.filter((f) => !productionFields.includes(f));
  check(
    missing.length === 0,
    `prototypes/shared/content-schema.ts is missing fields present in production: ${missing.join(', ')}`,
  );
  check(
    extra.length === 0,
    `prototypes/shared/content-schema.ts declares fields production does not have: ${extra.join(', ')}`,
  );
  notes.push(`schema mirror: ${productionFields.length} shared fields match production`);
}

const omitBody = productionConfig.match(/\.omit\(\{([^}]*)\}\)/)?.[1];
check(omitBody !== undefined, 'Could not locate the protected .omit() list in src/content.config.ts.');
if (omitBody !== undefined) {
  const omitted = captures(omitBody, /(\w+):\s*true/g);
  check(
    JSON.stringify(omitted) === JSON.stringify(PROTECTED_OMITTED_FIELDS),
    `protected omit list drifted. production=${omitted.join(',')} mirror=${PROTECTED_OMITTED_FIELDS.join(',')}`,
  );
}

const extendBody = productionConfig.match(/\.extend\(\{([\s\S]*?)\n\s{2}\}\)/)?.[1];
check(extendBody !== undefined, 'Could not locate the protected .extend() block in src/content.config.ts.');
if (extendBody !== undefined) {
  const added = captures(extendBody, /^\s{4}(\w+):/gm);
  check(
    JSON.stringify(added) === JSON.stringify(PROTECTED_ADDED_FIELDS),
    `protected extend list drifted. production=${added.join(',')} mirror=${PROTECTED_ADDED_FIELDS.join(',')}`,
  );
}

// ---------------------------------------------------------------------------
// 2. Public post fixtures
// ---------------------------------------------------------------------------

const postFiles = await walk(postsRoot, '.md');
check(postFiles.length > 0, 'No post fixtures found.');

type Loaded = { file: string; data: Record<string, unknown>; body: string };
const posts: Loaded[] = [];

for (const file of postFiles) {
  const raw = await readFile(file, 'utf8');
  const { frontmatter, content } = parseFrontmatter(raw);
  const result = postMetadata.safeParse(frontmatter);
  if (!result.success) {
    for (const issue of result.error.issues) {
      failures.push(`${rel(file)}: ${issue.path.join('.') || '(root)'} — ${issue.message}`);
    }
    continue;
  }
  posts.push({ file, data: frontmatter as Record<string, unknown>, body: content });

  const lang = String(frontmatter.lang);
  const slug = String(frontmatter.slug);
  check(slug.startsWith(`${lang}/`), `${rel(file)}: slug "${slug}" does not start with lang "${lang}".`);
  check(
    basename(dirname(file)) === lang,
    `${rel(file)}: sits in directory "${basename(dirname(file))}" but declares lang "${lang}".`,
  );
}

// ---------------------------------------------------------------------------
// 3. Translation relationships (ADR section 4, task T6)
// ---------------------------------------------------------------------------

const groups = new Map<string, Set<string>>();
for (const post of posts) {
  const key = String(post.data.translationKey);
  if (!groups.has(key)) groups.set(key, new Set());
  groups.get(key)!.add(String(post.data.lang));
}

for (const [key, langs] of [...groups].sort()) {
  notes.push(`translationKey ${key}: ${[...langs].sort().join(', ')}`);
}

// T6 needs a group that already has two languages and is genuinely missing a
// third, so "unavailable" can be told apart from "not built yet".
const tide = groups.get('tide-notes');
check(tide?.has('zh') && tide?.has('ja'), 'tide-notes must ship zh and ja.');
check(
  tide && !tide.has('en'),
  'tide-notes must NOT ship en. The absent English version is the fixture for "translation unavailable".',
);

// T6 asks Morii to author a Japanese translation during the task, so one group
// has to start out single-language.
const darkroom = groups.get('darkroom-log');
check(
  darkroom?.size === 1 && darkroom.has('zh'),
  'darkroom-log must ship zh only; it is the starting state for task T6.',
);

// ---------------------------------------------------------------------------
// 4. Draft fixture (ADR section 4 hard veto: drafts must not leak)
// ---------------------------------------------------------------------------

const drafts = posts.filter((p) => p.data.draft === true);
check(drafts.length > 0, 'No draft fixture. The draft-leak veto cannot be tested without one.');
for (const draft of drafts) {
  check(
    draft.data.unlisted === false,
    `${rel(draft.file)}: a draft fixture must keep unlisted:false so filtering is proven to key on draft.`,
  );
}

// ---------------------------------------------------------------------------
// 5. Media references resolve, and carry alt text
// ---------------------------------------------------------------------------

const MEDIA_PREFIX = '/media/fixtures/';
const referenced = new Set<string>();

async function checkMediaPath(source: string, path: string) {
  check(path.startsWith(MEDIA_PREFIX), `${source}: media path "${path}" must start with ${MEDIA_PREFIX}.`);
  if (!path.startsWith(MEDIA_PREFIX)) return;
  const name = path.slice(MEDIA_PREFIX.length);
  referenced.add(name);
  check(await exists(join(mediaRoot, name)), `${source}: media file "${name}" does not exist.`);
}

for (const post of posts) {
  const source = rel(post.file);
  if (post.data.cover) {
    await checkMediaPath(source, String(post.data.cover));
    check(
      typeof post.data.coverAlt === 'string' && post.data.coverAlt.trim().length > 0,
      `${source}: cover is set but coverAlt is empty.`,
    );
  }
  for (const match of post.body.matchAll(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g)) {
    const alt = match[1] ?? '';
    const path = match[2];
    check(alt.trim().length > 0, `${source}: an image has empty alt text.`);
    if (path !== undefined) await checkMediaPath(source, path);
  }
}

// ---------------------------------------------------------------------------
// 6. Protected fixture: schema, markers, and a real decryption round trip
// ---------------------------------------------------------------------------

const protectedFiles = await walk(protectedRoot, '.json');
check(protectedFiles.length > 0, 'No protected fixture found.');

for (const file of protectedFiles) {
  const parsed = JSON.parse(await readFile(file, 'utf8'));
  const result = protectedMetadata.safeParse(parsed);
  if (!result.success) {
    for (const issue of result.error.issues) {
      failures.push(`${rel(file)}: ${issue.path.join('.') || '(root)'} — ${issue.message}`);
    }
    continue;
  }

  const sourcePath = file.replace(/\.json$/, '.source.md');
  check(await exists(sourcePath), `${rel(file)}: committed plaintext source is missing; the fixture is not reproducible.`);

  if (await exists(sourcePath)) {
    const rawSource = await readFile(sourcePath, 'utf8');
    const { content } = parseFrontmatter(rawSource);
    const expected = {
      lightbox: /!\[[^\]]*\]\([^)]+\)/.test(content),
      mermaid: /```mermaid\s/.test(content),
      music: /::music\{/.test(content),
      video: /::video\{/.test(content),
      math: /(^|[^\\])\$\$?[\s\S]*?\$\$?/.test(content),
    };
    for (const [name, want] of Object.entries(expected)) {
      check(
        parsed.features[name] === want,
        `${rel(file)}: feature marker "${name}" is ${parsed.features[name]} but the source says ${want}. ` +
          'Regenerate with prototypes/tools/build-protected-fixture.mjs.',
      );
    }
  }

  // Decrypting is the only way to know the envelope is usable rather than
  // merely well-shaped.
  try {
    const html = await decryptHtml(parsed.encryption, FIXTURE_PASSWORD);
    check(html.length > 0, `${rel(file)}: decrypted to an empty document.`);
    check(
      !/password|口令/i.test(JSON.stringify(parsed.encryption)),
      `${rel(file)}: the envelope appears to contain a password.`,
    );
    notes.push(`${rel(file)}: decrypts to ${html.length} chars with the published test password`);
  } catch (error) {
    failures.push(`${rel(file)}: decryption with the published test password failed — ${(error as Error).message}`);
  }

  // A wrong password must fail, or the fixture proves nothing about the flow.
  let rejected = false;
  try {
    await decryptHtml(parsed.encryption, 'wrong-password-wrong-password');
  } catch {
    rejected = true;
  }
  check(rejected, `${rel(file)}: decryption succeeded with a wrong password.`);
}

// ---------------------------------------------------------------------------
// 7. No orphaned media
// ---------------------------------------------------------------------------

const mediaFiles = (await walk(mediaRoot, '.svg')).map((f) => basename(f));
for (const name of mediaFiles) {
  check(referenced.has(name), `prototypes/fixtures/media/${name} is not referenced by any fixture.`);
}

// ---------------------------------------------------------------------------

console.log(`Checked ${posts.length} post fixtures, ${protectedFiles.length} protected fixture(s), ${mediaFiles.length} media file(s).`);
for (const note of notes) console.log(`  ${note}`);

if (failures.length > 0) {
  console.error(`\n${failures.length} problem(s):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exitCode = 1;
} else {
  console.log('\nFixture corpus is valid.');
}

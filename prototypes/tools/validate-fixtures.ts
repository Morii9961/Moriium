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
  type Language,
  postMetadata,
  protectedMetadata,
} from '../shared/content-schema.ts';
import { CONTENT_BLOCKS, blocksIn, markersFor } from '../shared/content-blocks.ts';
import {
  availableLanguages,
  buildTranslationIndex,
  missingLanguages,
  statusOf,
} from '../shared/translations.ts';
import { FIXTURE_PASSWORD } from './fixture-password.ts';
import { baselinePathFor, createPublicRenderer, renderPost } from './build-baselines.mjs';

// Whitespace-normalised copy of the expressiveCode({...}) call in
// astro.config.mjs. Section 7 fails if the real call no longer matches.
const EXPECTED_EXPRESSIVE_CODE_CALL =
  "expressiveCode({ plugins: [pluginLineNumbers(), pluginCollapsibleSections()], " +
  "defaultProps: { wrap: true, showLineNumbers: false, }, " +
  "themes: ['github-light', 'github-dark'], " +
  "themeCssSelector: (theme) => theme.name === 'github-dark' ? '[data-theme=\"dark\"]' : " +
  "'[data-theme=\"light\"]', })";

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

const productionSchema = await readFile(join(repoRoot, 'src/content-schema.ts'), 'utf8');
const productionAstroConfig = await readFile(join(repoRoot, 'astro.config.mjs'), 'utf8');

/** Capture group 1 of every match, dropping the ones the engine left unset. */
function captures(source: string, pattern: RegExp): string[] {
  return [...source.matchAll(pattern)]
    .map((match) => match[1])
    .filter((value): value is string => value !== undefined)
    .sort();
}

const sharedBody = productionSchema.match(/(?:export )?const sharedMetadata = z\.object\(\{([\s\S]*?)\n\}\);/)?.[1];
check(
  sharedBody !== undefined,
  'Could not locate sharedMetadata in src/content-schema.ts; the drift check is blind.',
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

const omitBody = productionSchema.match(/\.omit\(\{([^}]*)\}\)/)?.[1];
check(omitBody !== undefined, 'Could not locate the protected .omit() list in src/content-schema.ts.');
if (omitBody !== undefined) {
  const omitted = captures(omitBody, /(\w+):\s*true/g);
  check(
    JSON.stringify(omitted) === JSON.stringify(PROTECTED_OMITTED_FIELDS),
    `protected omit list drifted. production=${omitted.join(',')} mirror=${PROTECTED_OMITTED_FIELDS.join(',')}`,
  );
}

const extendBody = productionSchema.match(/\.extend\(\{([\s\S]*?)\n\s{2}\}\)/)?.[1];
check(extendBody !== undefined, 'Could not locate the protected .extend() block in src/content-schema.ts.');
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
// 3. Translation relationships (ADR section 4, task B6)
// ---------------------------------------------------------------------------

// Built through the shared module rather than a local map, so the contract the
// prototypes will use is the one exercised here.
const groups = buildTranslationIndex(
  posts.map((post) => ({
    translationKey: String(post.data.translationKey),
    lang: post.data.lang as Language,
    slug: String(post.data.slug),
    title: String(post.data.title),
    draft: post.data.draft === true,
  })),
);

for (const [key, group] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
  const available = availableLanguages(group);
  const missing = missingLanguages(group);
  notes.push(
    `translationKey ${key}: available ${available.join(', ') || 'none'}` +
      (missing.length > 0 ? ` | unavailable ${missing.join(', ')}` : ''),
  );
}

// B6 needs a group that already has two languages and is genuinely missing a
// third, so "unavailable" can be told apart from "not built yet".
const tide = groups.get('tide-notes');
check(
  JSON.stringify(availableLanguages(tide)) === JSON.stringify(['zh', 'ja']),
  `tide-notes must offer zh and ja, got ${availableLanguages(tide).join(', ') || 'none'}.`,
);
check(
  statusOf(tide, 'en').state === 'unavailable',
  'tide-notes must NOT ship en. The absent English version is the fixture for "translation unavailable".',
);

// B6 asks Morii to author a Japanese translation during the task, so one group
// has to start out single-language.
const darkroom = groups.get('darkroom-log');
check(
  JSON.stringify(availableLanguages(darkroom)) === JSON.stringify(['zh']),
  'darkroom-log must offer zh only; it is the starting state for task B6.',
);

// A draft must never be reported as an available translation.
const winter = groups.get('winter-drafts');
check(
  statusOf(winter, 'zh').state === 'draft',
  'winter-drafts zh is draft:true and must report as draft, never as available.',
);

// ---------------------------------------------------------------------------
// 3b. The corpus exercises every content block
// ---------------------------------------------------------------------------

const reference = await readFile(join(repoRoot, 'docs/markdown-reference.md'), 'utf8');
const documentedSections = new Set(captures(reference, /^## (.+)$/gm));
for (const block of CONTENT_BLOCKS) {
  check(
    documentedSections.has(block.section),
    `Block "${block.id}" claims section "${block.section}", which docs/markdown-reference.md ` +
      'no longer has. The inventory has drifted from the reference.',
  );
}

const covered = new Set(posts.flatMap((post) => blocksIn(post.body)));
const uncovered = CONTENT_BLOCKS.filter((block) => !covered.has(block.id)).map((b) => b.id);
check(
  uncovered.length === 0,
  `The corpus does not exercise: ${uncovered.join(', ')}. Task B3 checks every block, so a ` +
    'block no fixture contains would go untested.',
);
if (uncovered.length === 0) notes.push(`content blocks: all ${CONTENT_BLOCKS.length} exercised`);

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
    // Catches a source edited without regenerating the envelope.
    const expected = markersFor(content);
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
// 7. Baselines are current, and the pipeline they came from has not drifted
// ---------------------------------------------------------------------------

// The expressiveCode({...}) options are duplicated in build-baselines.mjs
// because an Astro integration keeps its options in a closure. Guard the copy:
// if the production call changes, the baseline silently stops matching the site.
const ecCall = productionAstroConfig.match(/expressiveCode\(\{[\s\S]*?\n {4}\}\)/)?.[0];
check(ecCall !== undefined, 'Could not locate the expressiveCode({...}) call in astro.config.mjs.');
if (ecCall !== undefined) {
  const normalised = ecCall.replace(/\s+/g, ' ').trim();
  check(
    normalised === EXPECTED_EXPRESSIVE_CODE_CALL,
    'The expressiveCode({...}) options in astro.config.mjs changed. ' +
      'Update EXPRESSIVE_CODE_OPTIONS in prototypes/tools/build-baselines.mjs and regenerate the ' +
      `baselines, then update EXPECTED_EXPRESSIVE_CODE_CALL.\n      now: ${normalised}`,
  );
}

const renderer = await createPublicRenderer();
let staleBaselines = 0;
for (const post of posts) {
  const target = baselinePathFor(post.file);
  if (!(await exists(target))) {
    failures.push(`${rel(post.file)}: no baseline at ${rel(target)}. Run pnpm -C prototypes baselines:build.`);
    continue;
  }
  const fresh = await renderPost(renderer, post.file);
  const stored = (await readFile(target, 'utf8')).replace(/\n$/, '');
  if (fresh.replace(/\n$/, '') !== stored) staleBaselines += 1;
}
check(
  staleBaselines === 0,
  `${staleBaselines} baseline(s) no longer match a fresh render. Either the fixtures or the ` +
    'production pipeline changed. Run pnpm -C prototypes baselines:build and review the diff — ' +
    'a change here means public rendering changed.',
);
if (staleBaselines === 0) notes.push(`baselines: ${posts.length} current against the public pipeline`);

// ---------------------------------------------------------------------------
// 8. No orphaned media
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

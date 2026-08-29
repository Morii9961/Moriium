// Builds the encrypted fixture in prototypes/fixtures/protected/ from its
// committed fictional plaintext.
//
// This is deliberately NOT scripts/encrypt-post.mjs. That script requires the
// plaintext to live in .private/posts/ and writes into src/content/protected/,
// and Phase 1 may touch neither. It also demands an interactive TTY so a real
// password is never scripted. Here the password is a published test constant,
// so a prompt would be theatre.
//
// The envelope format and the render pipeline are the production ones, imported
// by relative path, so the fixture cannot drift from what the site actually
// decrypts. Only the source and output roots differ.

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { parseFrontmatter } from '@astrojs/markdown-remark';
import { encryptHtml } from '../../scripts/lib/crypto.mjs';
import { renderPrivateMarkdown } from '../../scripts/lib/render-markdown.mjs';
import { FIXTURE_PASSWORD } from './fixture-password.ts';
// Markers come from the shared block inventory rather than a second copy of the
// regexes. scripts/encrypt-post.mjs still has its own featuresOf() for real
// protected posts; reconciling the two belongs with whichever prototype takes
// over the encryption flow, and is noted in the fixtures README.
import { markersFor } from '../shared/content-blocks.ts';

const here = import.meta.dirname;
const sourcePath = resolve(here, '../fixtures/protected/zh-sealed-notebook.source.md');
const outputPath = resolve(here, '../fixtures/protected/zh-sealed-notebook.json');

function publicMetadata(frontmatter) {
  if ('password' in frontmatter) {
    throw new Error('Password frontmatter is forbidden, even in a fixture.');
  }
  return {
    title: String(frontmatter.title),
    slug: String(frontmatter.slug),
    summary: String(frontmatter.summary),
    publishedAt: frontmatter.publishedAt,
    ...(frontmatter.updatedAt ? { updatedAt: frontmatter.updatedAt } : {}),
    lang: String(frontmatter.lang),
    translationKey: String(frontmatter.translationKey),
    category: String(frontmatter.category),
    tags: Array.isArray(frontmatter.tags) ? frontmatter.tags.map(String) : [],
    draft: Boolean(frontmatter.draft),
    unlisted: Boolean(frontmatter.unlisted),
    listed: Boolean(frontmatter.listed),
  };
}

const raw = await readFile(sourcePath, 'utf8');
const { frontmatter, content } = parseFrontmatter(raw);
const rendered = await renderPrivateMarkdown(content);
const encryption = await encryptHtml(rendered, FIXTURE_PASSWORD);

const output = {
  ...publicMetadata(frontmatter),
  features: markersFor(content),
  encryption,
};

await mkdir(dirname(outputPath), { recursive: true });
const tempPath = `${outputPath}.tmp`;
await writeFile(tempPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
await rename(tempPath, outputPath);

const markers = Object.entries(output.features)
  .filter(([, on]) => on)
  .map(([name]) => name)
  .join(', ');
console.log(`Wrote ${outputPath}`);
console.log(`Feature markers: ${markers || 'none'}`);
console.log(`Ciphertext bytes (base64): ${output.encryption.ciphertext.length}`);

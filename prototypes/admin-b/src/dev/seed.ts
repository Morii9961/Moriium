// Seeds the prototype database from the fixture corpus.
//
// The corpus is a read-only input (prototypes/fixtures/README.md). This copies
// content out of it into prototype B's own database so Morii has real
// multilingual articles to operate on. Nothing is ever written back.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { LANGUAGES, type Language } from '../../../shared/content-schema.ts';
import type { Store } from '../storage/store.ts';

const FIXTURES = resolve(import.meta.dirname, '../../../fixtures/posts');

const FILES = [
  'zh/zh-tide-notes.md',
  'ja/ja-tide-notes.md',
  'zh/zh-darkroom-log.md',
  'zh/zh-winter-drafts.md',
] as const;

type Seed = {
  translationKey: string;
  lang: Language;
  slug: string;
  title: string;
  summary: string;
  markdown: string;
};

/** Reads one scalar out of the fixture frontmatter. Nested keys and lists are not needed here. */
function scalar(frontmatter: string, key: string): string {
  const match = new RegExp(`^${key}:[ \t]*(.+?)[ \t]*$`, 'm').exec(frontmatter);
  if (!match?.[1]) throw new Error(`fixture frontmatter has no ${key}`);
  return match[1].replace(/^["']|["']$/g, '');
}

function readSeed(relativePath: string): Seed {
  const parts = readFileSync(resolve(FIXTURES, relativePath), 'utf8').split(/^---\r?$/m);
  if (parts.length < 3) throw new Error(`${relativePath} has no frontmatter`);
  const frontmatter = parts[1] ?? '';
  const lang = scalar(frontmatter, 'lang');
  if (!(LANGUAGES as readonly string[]).includes(lang)) {
    throw new Error(`${relativePath} declares an unknown lang`);
  }

  return {
    translationKey: scalar(frontmatter, 'translationKey'),
    lang: lang as Language,
    slug: scalar(frontmatter, 'slug'),
    title: scalar(frontmatter, 'title'),
    summary: scalar(frontmatter, 'summary'),
    markdown: parts.slice(2).join('---').trimStart(),
  };
}

/**
 * Fills an empty database. Returns how many articles were added.
 *
 * Existing data is left alone, so restarting the dev server keeps whatever
 * Morii wrote in the previous session.
 */
export function seedIfEmpty(store: Store): number {
  if (store.listArticles().length > 0) return 0;

  let added = 0;
  for (const file of FILES) {
    store.createArticle(readSeed(file));
    added += 1;
  }
  return added;
}

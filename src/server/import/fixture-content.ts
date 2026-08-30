// The only content migration admitted before Moriium has production evidence.
//
// These paths are an allowlist, not defaults for a generic importer. Four are
// invented prototype fixtures; the fifth is the public reader acceptance page.
// Real posts and protected plaintext are deliberately unreachable from here.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseFrontmatter } from '@astrojs/markdown-remark';
import { publicPostMetadataSchema } from '../../content-schema.ts';
import type { Article, ArticleStore, NewArticle } from '../articles.ts';

const REPOSITORY_ROOT = resolve(import.meta.dirname, '../../..');

export const FIXTURE_CONTENT_SOURCES = [
  'prototypes/fixtures/posts/zh/zh-tide-notes.md',
  'prototypes/fixtures/posts/ja/ja-tide-notes.md',
  'prototypes/fixtures/posts/zh/zh-darkroom-log.md',
  'prototypes/fixtures/posts/zh/zh-winter-drafts.md',
  'src/content/posts/zh/reader-capabilities.md',
] as const;

export type FixtureImportResult = {
  imported: readonly Pick<Article, 'id' | 'slug'>[];
  skipped: string[];
};

type ImportOptions = {
  store: ArticleStore;
  authorId: number;
  root?: string;
};

function readSource(root: string, source: (typeof FIXTURE_CONTENT_SOURCES)[number]): Omit<NewArticle, 'authorId'> {
  const raw = readFileSync(resolve(root, source), 'utf8');
  const parsed = parseFrontmatter(raw);
  const data = publicPostMetadataSchema.parse(parsed.frontmatter);

  return {
    translationKey: data.translationKey,
    lang: data.lang,
    slug: data.slug,
    title: data.title,
    summary: data.summary,
    publishedAt: data.publishedAt.toISOString(),
    updatedAt: data.updatedAt?.toISOString() ?? null,
    category: data.category,
    tags: data.tags,
    cover: data.cover ?? null,
    coverAlt: data.coverAlt ?? null,
    draft: data.draft,
    unlisted: data.unlisted,
    copyProtection: data.copyProtection,
    markdown: parsed.content.replace(/^\r?\n/, ''),
    editorJson: null,
  };
}

/**
 * Imports approved fixtures as database drafts and never publishes them.
 *
 * Existing matching entries are preserved so rerunning the command cannot
 * overwrite author edits. A conflicting slug or translation identity aborts
 * before the atomic write starts.
 */
export function importFixtureContent(options: ImportOptions): FixtureImportResult {
  const root = options.root ?? REPOSITORY_ROOT;
  const sources = FIXTURE_CONTENT_SOURCES.map((source) => readSource(root, source));
  const existing = options.store.listArticles();
  const skipped: string[] = [];
  const pending: Array<Omit<NewArticle, 'authorId'>> = [];

  for (const source of sources) {
    const sameSlug = existing.find((article) => article.slug === source.slug);
    if (sameSlug) {
      if (sameSlug.translationKey !== source.translationKey || sameSlug.lang !== source.lang) {
        throw new Error(`Fixture ${source.slug} conflicts with an existing article identity.`);
      }
      skipped.push(source.slug);
      continue;
    }

    const sameTranslation = existing.find(
      (article) => article.translationKey === source.translationKey && article.lang === source.lang,
    );
    if (sameTranslation) {
      throw new Error(
        `Fixture ${source.slug} conflicts with translation identity already owned by ${sameTranslation.slug}.`,
      );
    }
    pending.push(source);
  }

  const imported = pending.length > 0
    ? options.store.createArticles(
        pending.map((source) => ({ ...source, authorId: options.authorId })),
      )
    : [];
  return {
    imported: imported.map(({ id, slug }) => ({ id, slug })),
    skipped,
  };
}

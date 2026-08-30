import type { Article, ArticleStore, AuditEntry, Version } from '../articles.ts';

export type ArticleListDto = {
  readonly article: Article;
  readonly latest: Pick<Version, 'id' | 'kind' | 'createdAt' | 'title' | 'summary'> | null;
  readonly hasUnpublishedChanges: boolean;
  readonly awaitingExport: boolean;
};

export type ArticleDetailDto = {
  readonly article: Article;
  readonly latest: Version | null;
  readonly published: Version | null;
  readonly live: Version | null;
  readonly versions: readonly Version[];
  readonly audit: readonly AuditEntry[];
  readonly hasUnpublishedChanges: boolean;
  readonly awaitingExport: boolean;
};

export type PublicArticleDto = {
  readonly article: Pick<Article, 'id' | 'translationKey' | 'lang' | 'slug'>;
  readonly version: Omit<Version, 'authorId' | 'kind' | 'editorJson'>;
};

/** List DTO intentionally excludes Markdown and editor JSON. */
export function toArticleListDto(store: ArticleStore, article: Article): ArticleListDto {
  const latest = store.getLatest(article.id);
  return {
    article,
    latest: latest
      ? {
          id: latest.id,
          kind: latest.kind,
          createdAt: latest.createdAt,
          title: latest.title,
          summary: latest.summary,
        }
      : null,
    hasUnpublishedChanges: store.hasUnpublishedChanges(article.id),
    awaitingExport: store.isAwaitingExport(article.id),
  };
}

/** Admin-only detail DTO. No anonymous route is allowed to call this. */
export function toArticleDetailDto(store: ArticleStore, article: Article): ArticleDetailDto {
  return {
    article,
    latest: store.getLatest(article.id),
    published: store.getPublished(article.id),
    live: store.getLive(article.id),
    versions: store.listVersions(article.id),
    audit: store.listAudit(article.id),
    hasUnpublishedChanges: store.hasUnpublishedChanges(article.id),
    awaitingExport: store.isAwaitingExport(article.id),
  };
}

/**
 * Export-facing DTO. It can only resolve the published pointer, never the
 * latest autosave, and is not exposed through a runtime reader endpoint.
 */
export function toPublicArticleDto(
  store: ArticleStore,
  article: Article,
): PublicArticleDto | null {
  const published = store.getPublished(article.id);
  if (!published) return null;
  const { authorId: _authorId, kind: _kind, editorJson: _editorJson, ...version } = published;
  return {
    article: {
      id: article.id,
      translationKey: article.translationKey,
      lang: article.lang,
      slug: article.slug,
    },
    version,
  };
}

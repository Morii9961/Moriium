// Articles and versions: the production state machine.
//
// This ports the semantics ADR 0001 section 13.7 verified in the spike onto the
// production schema, and adds the two things the spike had no concept of: an
// author on every version (ADR 0002 section 9.1), and the split between what
// the database says is published and what the built site is actually serving
// (section 4.2).
//
// The rules are carried by the data, not by callers remembering them:
//
//   - A draft is `published_version_id IS NULL`. There is no boolean to forget
//     to set, and a new article is a draft because there is nothing for a
//     reader to resolve to.
//   - Saving only ever appends a version row. No path through `saveVersion`
//     can reach `published_version_id`, so "an autosave changed what readers
//     see" is not something discipline prevents -- it is unreachable.
//   - Publish and rollback are one operation pointing at different versions,
//     in one transaction with its audit row. Rollback therefore cannot rot:
//     if publishing works, rollback works.
//
// SQL lives in this module. Nothing outside it imports node:sqlite, so the
// engine stays replaceable and callers talk about articles, not rows.

import type { DatabaseSync } from 'node:sqlite';
import { AdminError, isAdminError } from './errors.ts';

export type VersionKind = 'autosave' | 'manual';
export type AuditAction = 'publish' | 'rollback' | 'unpublish';
export type Language = 'zh' | 'ja' | 'en';

export type Article = {
  id: number;
  translationKey: string;
  lang: Language;
  slug: string;
  createdAt: string;
  /** What the database says is published. Null means the article is a draft. */
  publishedVersionId: number | null;
  /** What the built site is actually serving. Trails publishing until an export succeeds. */
  liveVersionId: number | null;
};

/** The frontmatter of one saved version. Mirrors sharedMetadata in src/content-schema.ts. */
export type VersionFields = {
  title: string;
  summary: string;
  publishedAt: string;
  updatedAt: string | null;
  category: string;
  tags: readonly string[];
  cover: string | null;
  coverAlt: string | null;
  draft: boolean;
  unlisted: boolean;
  copyProtection: boolean;
  markdown: string;
  editorJson: string | null;
};

export type Version = VersionFields & {
  id: number;
  articleId: number;
  authorId: number;
  kind: VersionKind;
  createdAt: string;
};

export type SaveInput = VersionFields & { authorId: number; kind?: VersionKind };

export type NewArticle = {
  translationKey: string;
  lang: Language;
  slug: string;
} & Omit<SaveInput, 'kind'>;

export type AuditEntry = {
  id: number;
  at: string;
  actorId: number;
  action: AuditAction;
  articleId: number;
  fromVersionId: number | null;
  toVersionId: number | null;
  note: string | null;
};

type ArticleRow = {
  id: number;
  translation_key: string;
  lang: string;
  slug: string;
  created_at: string;
  published_version_id: number | null;
  live_version_id: number | null;
};

type VersionRow = {
  id: number;
  article_id: number;
  author_id: number;
  kind: string;
  created_at: string;
  title: string;
  summary: string;
  published_at: string;
  updated_at: string | null;
  category: string;
  cover: string | null;
  cover_alt: string | null;
  draft: number;
  unlisted: number;
  copy_protection: number;
  markdown: string;
  editor_json: string | null;
};

type AuditRow = {
  id: number;
  at: string;
  actor_id: number;
  action: string;
  article_id: number;
  from_version_id: number | null;
  to_version_id: number | null;
  note: string | null;
};

/**
 * Turns SQLite write contention into the modelled `db-locked` failure.
 *
 * node:sqlite surfaces it as a plain Error carrying SQLite's own wording.
 * Passed through, it reaches the author as an unexplained 500 while a
 * retryable code that maps to 503 already exists. The ADR 0001 13.20 drill
 * found exactly that: the code was modelled, mapped, and never raised.
 */
function asStoreError(error: unknown): unknown {
  if (isAdminError(error)) return error;
  const message = error instanceof Error ? error.message : String(error);
  if (/database is locked|database is busy|SQLITE_BUSY/i.test(message)) {
    return new AdminError('db-locked', 'The database is busy. Try again.', { cause: error });
  }
  return error;
}

function toArticle(row: ArticleRow): Article {
  return {
    id: row.id,
    translationKey: row.translation_key,
    lang: row.lang as Language,
    slug: row.slug,
    createdAt: row.created_at,
    publishedVersionId: row.published_version_id,
    liveVersionId: row.live_version_id,
  };
}

function toVersion(row: VersionRow, tags: readonly string[]): Version {
  return {
    id: row.id,
    articleId: row.article_id,
    authorId: row.author_id,
    kind: row.kind as VersionKind,
    createdAt: row.created_at,
    title: row.title,
    summary: row.summary,
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
    category: row.category,
    tags,
    cover: row.cover,
    coverAlt: row.cover_alt,
    draft: row.draft === 1,
    unlisted: row.unlisted === 1,
    copyProtection: row.copy_protection === 1,
    markdown: row.markdown,
    editorJson: row.editor_json,
  };
}

function toAudit(row: AuditRow): AuditEntry {
  return {
    id: row.id,
    at: row.at,
    actorId: row.actor_id,
    action: row.action as AuditAction,
    articleId: row.article_id,
    fromVersionId: row.from_version_id,
    toVersionId: row.to_version_id,
    note: row.note,
  };
}

export class ArticleStore {
  readonly #db: DatabaseSync;
  /** Injected rather than read from the clock, so tests can order events without sleeping. */
  readonly #now: () => string;

  constructor(db: DatabaseSync, now: () => string = () => new Date().toISOString()) {
    this.#db = db;
    this.#now = now;
  }

  // -- reads ----------------------------------------------------------------

  getArticle(id: number): Article | null {
    const row = this.#db.prepare('SELECT * FROM articles WHERE id = ?').get(id) as
      | ArticleRow
      | undefined;
    return row ? toArticle(row) : null;
  }

  getArticleBySlug(slug: string): Article | null {
    const row = this.#db.prepare('SELECT * FROM articles WHERE slug = ?').get(slug) as
      | ArticleRow
      | undefined;
    return row ? toArticle(row) : null;
  }

  listArticles(): Article[] {
    const rows = this.#db.prepare('SELECT * FROM articles ORDER BY id').all() as ArticleRow[];
    return rows.map(toArticle);
  }

  getVersion(id: number): Version | null {
    const row = this.#db.prepare('SELECT * FROM versions WHERE id = ?').get(id) as
      | VersionRow
      | undefined;
    return row ? toVersion(row, this.#tagsFor(id)) : null;
  }

  listVersions(articleId: number): Version[] {
    const rows = this.#db
      .prepare('SELECT * FROM versions WHERE article_id = ? ORDER BY id DESC')
      .all(articleId) as VersionRow[];
    return rows.map((row) => toVersion(row, this.#tagsFor(row.id)));
  }

  /** What a reader would get once the site catches up. Null while never published. */
  getPublished(articleId: number): Version | null {
    const article = this.getArticle(articleId);
    return article?.publishedVersionId == null ? null : this.getVersion(article.publishedVersionId);
  }

  /** What the built site is serving right now. */
  getLive(articleId: number): Version | null {
    const article = this.getArticle(articleId);
    return article?.liveVersionId == null ? null : this.getVersion(article.liveVersionId);
  }

  /** The newest version, published or not. What the editor reopens. */
  getLatest(articleId: number): Version | null {
    const row = this.#db
      .prepare('SELECT * FROM versions WHERE article_id = ? ORDER BY id DESC LIMIT 1')
      .get(articleId) as VersionRow | undefined;
    return row ? toVersion(row, this.#tagsFor(row.id)) : null;
  }

  isDraft(articleId: number): boolean {
    return this.getArticle(articleId)?.publishedVersionId == null;
  }

  /** True when the newest version is not the published one. */
  hasUnpublishedChanges(articleId: number): boolean {
    const article = this.getArticle(articleId);
    if (!article) return false;
    const latest = this.getLatest(article.id);
    return latest != null && latest.id !== article.publishedVersionId;
  }

  /**
   * True when publishing succeeded but the export has not caught up.
   *
   * ADR 0002 section 4.2 asks the admin to show this rather than hide it: it is
   * a retryable state, not an ambiguous one, and the author is owed the
   * difference between "not published" and "published, site still building".
   */
  isAwaitingExport(articleId: number): boolean {
    const article = this.getArticle(articleId);
    return article != null && article.publishedVersionId !== article.liveVersionId;
  }

  listAudit(articleId: number): AuditEntry[] {
    const rows = this.#db
      .prepare('SELECT * FROM audit WHERE article_id = ? ORDER BY id DESC')
      .all(articleId) as AuditRow[];
    return rows.map(toAudit);
  }

  // -- writes ---------------------------------------------------------------

  /** Creates the article and its first version. The article starts as a draft. */
  createArticle(input: NewArticle): Article {
    return this.#transaction(() => this.#createArticle(input));
  }

  /** Creates a migration batch atomically, so a later refusal leaves no partial import. */
  createArticles(inputs: readonly NewArticle[]): Article[] {
    return this.#transaction(() => inputs.map((input) => this.#createArticle(input)));
  }

  /**
   * Appends a version. Never touches `published_version_id`.
   *
   * Tags are written in the same transaction as the version row, so a version
   * cannot exist with the previous version's tags.
   */
  saveVersion(articleId: number, input: SaveInput): Version {
    return this.#transaction(() => {
      if (!this.getArticle(articleId)) {
        throw new AdminError('validation-failed', 'That article does not exist.');
      }
      return this.getVersion(this.#insertVersion(articleId, input))!;
    });
  }

  autosave(articleId: number, input: SaveInput): Version {
    return this.saveVersion(articleId, { ...input, kind: 'autosave' });
  }

  publish(
    articleId: number,
    versionId: number,
    options: { actorId: number; note?: string; validate?: (version: Version) => void },
  ): Article {
    return this.#pointAt('publish', articleId, versionId, options);
  }

  rollback(
    articleId: number,
    versionId: number,
    options: { actorId: number; note?: string; validate?: (version: Version) => void },
  ): Article {
    return this.#pointAt('rollback', articleId, versionId, options);
  }

  unpublish(articleId: number, options: { actorId: number; note?: string }): Article {
    return this.#transaction(() => {
      const article = this.getArticle(articleId);
      if (!article) throw new AdminError('validation-failed', 'That article does not exist.');
      if (article.publishedVersionId == null) {
        throw new AdminError('conflict', 'That article is not published.');
      }
      this.#db.prepare('UPDATE articles SET published_version_id = NULL WHERE id = ?').run(articleId);
      this.#insertAudit(
        'unpublish',
        options.actorId,
        articleId,
        article.publishedVersionId,
        null,
        options.note ?? null,
      );
      return this.getArticle(articleId)!;
    });
  }

  /**
   * Records that the built site now serves `versionId` (ADR 0002 section 4.2 step two).
   *
   * Deliberately not part of publishing. The export runs after the publish
   * transaction has already committed, and a failed export must leave the
   * database's truth alone so the whole thing can simply be retried. No audit
   * row: this reports on a build, it is not an editorial act.
   */
  markLive(articleId: number, versionId: number): Article {
    return this.#transaction(() => {
      const article = this.getArticle(articleId);
      if (!article) throw new AdminError('validation-failed', 'That article does not exist.');

      const version = this.getVersion(versionId);
      if (!version || version.articleId !== articleId) {
        throw new AdminError('validation-failed', 'That version does not belong to this article.');
      }
      // Going live with something that was never published would put content in
      // front of readers that the publish gate never examined.
      if (article.publishedVersionId !== versionId) {
        throw new AdminError(
          'conflict',
          'Only the published version can be marked live.',
        );
      }
      this.#db.prepare('UPDATE articles SET live_version_id = ? WHERE id = ?').run(versionId, articleId);
      return this.getArticle(articleId)!;
    });
  }

  /** Records that the site no longer serves this article, after an unpublish has been exported. */
  markNotLive(articleId: number): Article {
    return this.#transaction(() => {
      const article = this.getArticle(articleId);
      if (!article) throw new AdminError('validation-failed', 'That article does not exist.');
      if (article.publishedVersionId != null) {
        throw new AdminError('conflict', 'That article is still published.');
      }
      this.#db.prepare('UPDATE articles SET live_version_id = NULL WHERE id = ?').run(articleId);
      return this.getArticle(articleId)!;
    });
  }

  // -- internals ------------------------------------------------------------

  #createArticle(input: NewArticle): Article {
    const at = this.#now();
    let articleId: number;
    try {
      const result = this.#db
        .prepare(
          'INSERT INTO articles (translation_key, lang, slug, created_at) VALUES (?, ?, ?, ?)',
        )
        .run(input.translationKey, input.lang, input.slug, at);
      articleId = Number(result.lastInsertRowid);
    } catch (cause) {
      throw new AdminError(
        'conflict',
        'An article with that slug, or that language within the translation group, already exists.',
        { cause },
      );
    }
    this.#insertVersion(articleId, { ...input, kind: 'manual' });
    return this.getArticle(articleId)!;
  }

  #pointAt(
    action: 'publish' | 'rollback',
    articleId: number,
    versionId: number,
    options: { actorId: number; note?: string; validate?: (version: Version) => void },
  ): Article {
    return this.#transaction(() => {
      const article = this.getArticle(articleId);
      if (!article) throw new AdminError('validation-failed', 'That article does not exist.');

      const version = this.getVersion(versionId);
      // Ownership, not mere existence: publishing another article's version
      // would silently swap the content a reader sees.
      if (!version || version.articleId !== articleId) {
        throw new AdminError('validation-failed', 'That version does not belong to this article.');
      }
      if (article.publishedVersionId === versionId) {
        throw new AdminError('conflict', 'That version is already the published one.');
      }

      // Before any write, so a rejection cannot leave a half-published article
      // or an audit row for something that did not happen.
      options.validate?.(version);

      this.#db.prepare('UPDATE articles SET published_version_id = ? WHERE id = ?').run(versionId, articleId);
      this.#insertAudit(
        action,
        options.actorId,
        articleId,
        article.publishedVersionId,
        versionId,
        options.note ?? null,
      );
      return this.getArticle(articleId)!;
    });
  }

  #insertVersion(articleId: number, input: SaveInput): number {
    const result = this.#db
      .prepare(
        `INSERT INTO versions (
           article_id, author_id, kind, created_at,
           title, summary, published_at, updated_at, category,
           cover, cover_alt, draft, unlisted, copy_protection,
           markdown, editor_json
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        articleId,
        input.authorId,
        input.kind ?? 'manual',
        this.#now(),
        input.title,
        input.summary,
        input.publishedAt,
        input.updatedAt,
        input.category,
        input.cover,
        input.coverAlt,
        input.draft ? 1 : 0,
        input.unlisted ? 1 : 0,
        input.copyProtection ? 1 : 0,
        input.markdown,
        input.editorJson,
      );

    const versionId = Number(result.lastInsertRowid);
    const insertTag = this.#db.prepare('INSERT INTO version_tags (version_id, tag) VALUES (?, ?)');
    // Deduplicated here rather than relying on the primary key to reject a
    // repeat: a duplicate tag is the caller being sloppy, not a conflict worth
    // failing a save over.
    for (const tag of new Set(input.tags)) insertTag.run(versionId, tag);
    return versionId;
  }

  #insertAudit(
    action: AuditAction,
    actorId: number,
    articleId: number,
    fromVersionId: number | null,
    toVersionId: number | null,
    note: string | null,
  ): void {
    this.#db
      .prepare(
        `INSERT INTO audit (at, actor_id, action, article_id, from_version_id, to_version_id, note)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(this.#now(), actorId, action, articleId, fromVersionId, toVersionId, note);
  }

  #tagsFor(versionId: number): string[] {
    const rows = this.#db
      .prepare('SELECT tag FROM version_tags WHERE version_id = ? ORDER BY tag')
      .all(versionId) as { tag: string }[];
    return rows.map((row) => row.tag);
  }

  #transaction<T>(work: () => T): T {
    let active = false;
    try {
      this.#db.exec('BEGIN IMMEDIATE');
      active = true;
      const result = work();
      this.#db.exec('COMMIT');
      active = false;
      return result;
    } catch (error) {
      if (active) this.#db.exec('ROLLBACK');
      throw asStoreError(error);
    }
  }
}

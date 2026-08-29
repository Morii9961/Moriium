// Prototype B's storage layer.
//
// ADR 0001 section 3.5: node:sqlite is a spike tool, not a production choice.
// If B wins in Phase 5 the database is re-evaluated from scratch, so every
// statement lives in this file and the API below speaks in articles, versions
// and publishing rather than in rows, transactions or driver types. Nothing
// outside this module imports node:sqlite. If that holds, swapping the engine
// is rewriting one file; if it leaks, the cost of switching gets discovered
// late and blamed on the wrong decision.
//
// The state machine is the part worth getting right:
//
//   * A new article is a draft because published_version_id is NULL, not
//     because a boolean says so.
//   * Saving appends a version. It never updates an existing row and never
//     touches published_version_id, so autosave cannot change what a reader
//     sees. That is a hard veto in ADR section 4.
//   * Publishing and rolling back are the same operation pointed at different
//     versions, done in one transaction with an audit row. Rollback therefore
//     cannot rot, because it is not a separate code path.

import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { PrototypeError } from '../../../shared/errors.ts';
import type { Language } from '../../../shared/content-schema.ts';

const SCHEMA_PATH = resolve(import.meta.dirname, 'schema.sql');

export type VersionKind = 'autosave' | 'manual';
export type AuditAction = 'publish' | 'rollback' | 'unpublish';

export type Article = {
  id: number;
  translationKey: string;
  lang: Language;
  slug: string;
  createdAt: string;
  publishedVersionId: number | null;
};

export type Version = {
  id: number;
  articleId: number;
  markdown: string;
  editorJson: string | null;
  title: string;
  summary: string;
  kind: VersionKind;
  createdAt: string;
};

export type AuditEntry = {
  id: number;
  at: string;
  action: AuditAction;
  articleId: number;
  fromVersionId: number | null;
  toVersionId: number | null;
  note: string | null;
};

export type NewArticle = {
  translationKey: string;
  lang: Language;
  slug: string;
  title: string;
  summary: string;
  markdown: string;
};

export type SaveInput = {
  title: string;
  summary: string;
  markdown: string;
  editorJson?: string | null;
  kind?: VersionKind;
};

type ArticleRow = {
  id: number;
  translation_key: string;
  lang: string;
  slug: string;
  created_at: string;
  published_version_id: number | null;
};

type VersionRow = {
  id: number;
  article_id: number;
  markdown: string;
  editor_json: string | null;
  title: string;
  summary: string;
  kind: string;
  created_at: string;
};

type AuditRow = {
  id: number;
  at: string;
  action: string;
  article_id: number;
  from_version_id: number | null;
  to_version_id: number | null;
  note: string | null;
};

const toArticle = (row: ArticleRow): Article => ({
  id: row.id,
  translationKey: row.translation_key,
  lang: row.lang as Language,
  slug: row.slug,
  createdAt: row.created_at,
  publishedVersionId: row.published_version_id,
});

const toVersion = (row: VersionRow): Version => ({
  id: row.id,
  articleId: row.article_id,
  markdown: row.markdown,
  editorJson: row.editor_json,
  title: row.title,
  summary: row.summary,
  kind: row.kind as VersionKind,
  createdAt: row.created_at,
});

const toAudit = (row: AuditRow): AuditEntry => ({
  id: row.id,
  at: row.at,
  action: row.action as AuditAction,
  articleId: row.article_id,
  fromVersionId: row.from_version_id,
  toVersionId: row.to_version_id,
  note: row.note,
});

export class Store {
  readonly #db: DatabaseSync;
  /**
   * Injected rather than read from the clock, so tests can order events without
   * sleeping and so a caller cannot accidentally depend on wall-clock skew.
   */
  readonly #now: () => string;

  private constructor(db: DatabaseSync, now: () => string) {
    this.#db = db;
    this.#now = now;
  }

  /** `location` is a file path, or ':memory:' for tests. */
  static open(location: string, now: () => string = () => new Date().toISOString()): Store {
    if (location !== ':memory:') mkdirSync(dirname(location), { recursive: true });
    const db = new DatabaseSync(location);
    db.exec(readFileSync(SCHEMA_PATH, 'utf8'));
    return new Store(db, now);
  }

  close(): void {
    this.#db.close();
  }

  // -- reads ----------------------------------------------------------------

  getArticle(id: number): Article | null {
    const row = this.#db.prepare('SELECT * FROM articles WHERE id = ?').get(id) as ArticleRow | undefined;
    return row ? toArticle(row) : null;
  }

  getArticleBySlug(slug: string): Article | null {
    const row = this.#db.prepare('SELECT * FROM articles WHERE slug = ?').get(slug) as ArticleRow | undefined;
    return row ? toArticle(row) : null;
  }

  listArticles(): Article[] {
    const rows = this.#db.prepare('SELECT * FROM articles ORDER BY id').all() as ArticleRow[];
    return rows.map(toArticle);
  }

  getVersion(id: number): Version | null {
    const row = this.#db.prepare('SELECT * FROM versions WHERE id = ?').get(id) as VersionRow | undefined;
    return row ? toVersion(row) : null;
  }

  listVersions(articleId: number): Version[] {
    const rows = this.#db
      .prepare('SELECT * FROM versions WHERE article_id = ? ORDER BY id DESC')
      .all(articleId) as VersionRow[];
    return rows.map(toVersion);
  }

  /** What a reader would get. Null while the article has never been published. */
  getPublished(articleId: number): Version | null {
    const row = this.#db
      .prepare(
        'SELECT v.* FROM versions v JOIN articles a ON a.published_version_id = v.id WHERE a.id = ?',
      )
      .get(articleId) as VersionRow | undefined;
    return row ? toVersion(row) : null;
  }

  /** The newest version, published or not. What the editor reopens. */
  getLatest(articleId: number): Version | null {
    const row = this.#db
      .prepare('SELECT * FROM versions WHERE article_id = ? ORDER BY id DESC LIMIT 1')
      .get(articleId) as VersionRow | undefined;
    return row ? toVersion(row) : null;
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

  listAudit(articleId: number): AuditEntry[] {
    const rows = this.#db
      .prepare('SELECT * FROM audit WHERE article_id = ? ORDER BY id DESC')
      .all(articleId) as AuditRow[];
    return rows.map(toAudit);
  }

  // -- writes ---------------------------------------------------------------

  /** Creates the article and its first version. The article starts as a draft. */
  createArticle(input: NewArticle): Article {
    return this.#transaction(() => {
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
        throw new PrototypeError(
          'conflict',
          'An article with that slug, or that language within the translation group, already exists.',
          { cause },
        );
      }
      this.#insertVersion(articleId, {
        title: input.title,
        summary: input.summary,
        markdown: input.markdown,
        kind: 'manual',
      });
      return this.getArticle(articleId)!;
    });
  }

  /**
   * Appends a version. Deliberately has no way to reach published_version_id,
   * so no amount of autosaving can change what is public.
   */
  saveVersion(articleId: number, input: SaveInput): Version {
    if (!this.getArticle(articleId)) {
      throw new PrototypeError('validation-failed', 'That article does not exist.');
    }
    const id = this.#insertVersion(articleId, input);
    return this.getVersion(id)!;
  }

  autosave(articleId: number, input: Omit<SaveInput, 'kind'>): Version {
    return this.saveVersion(articleId, { ...input, kind: 'autosave' });
  }

  /**
   * Makes `versionId` the public version, in one transaction with its audit
   * row. `validate` runs before anything is written; throwing from it leaves
   * the published version untouched.
   */
  publish(
    articleId: number,
    versionId: number,
    options: { note?: string; validate?: (version: Version) => void } = {},
  ): Article {
    return this.#pointAt('publish', articleId, versionId, options);
  }

  /** Identical mechanism, aimed at an older version and recorded as a rollback. */
  rollback(
    articleId: number,
    versionId: number,
    options: { note?: string; validate?: (version: Version) => void } = {},
  ): Article {
    return this.#pointAt('rollback', articleId, versionId, options);
  }

  /** Withdraws the article from public view without deleting any version. */
  unpublish(articleId: number, note?: string): Article {
    return this.#transaction(() => {
      const article = this.getArticle(articleId);
      if (!article) throw new PrototypeError('validation-failed', 'That article does not exist.');
      if (article.publishedVersionId == null) {
        throw new PrototypeError('conflict', 'That article is not published.');
      }
      this.#db.prepare('UPDATE articles SET published_version_id = NULL WHERE id = ?').run(articleId);
      this.#insertAudit('unpublish', articleId, article.publishedVersionId, null, note ?? null);
      return this.getArticle(articleId)!;
    });
  }

  // -- internals ------------------------------------------------------------

  #pointAt(
    action: 'publish' | 'rollback',
    articleId: number,
    versionId: number,
    options: { note?: string; validate?: (version: Version) => void },
  ): Article {
    return this.#transaction(() => {
      const article = this.getArticle(articleId);
      if (!article) throw new PrototypeError('validation-failed', 'That article does not exist.');

      const version = this.getVersion(versionId);
      // Checking ownership rather than existence alone: publishing another
      // article's version would silently swap the content a reader sees.
      if (!version || version.articleId !== articleId) {
        throw new PrototypeError('validation-failed', 'That version does not belong to this article.');
      }
      if (article.publishedVersionId === versionId) {
        throw new PrototypeError('conflict', 'That version is already the published one.');
      }

      // Before any write, so a rejection cannot leave a half-published article.
      options.validate?.(version);

      this.#db.prepare('UPDATE articles SET published_version_id = ? WHERE id = ?').run(versionId, articleId);
      this.#insertAudit(action, articleId, article.publishedVersionId, versionId, options.note ?? null);
      return this.getArticle(articleId)!;
    });
  }

  #insertVersion(articleId: number, input: SaveInput): number {
    const result = this.#db
      .prepare(
        `INSERT INTO versions (article_id, markdown, editor_json, title, summary, kind, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        articleId,
        input.markdown,
        input.editorJson ?? null,
        input.title,
        input.summary,
        input.kind ?? 'manual',
        this.#now(),
      );
    return Number(result.lastInsertRowid);
  }

  #insertAudit(
    action: AuditAction,
    articleId: number,
    fromVersionId: number | null,
    toVersionId: number | null,
    note: string | null,
  ): void {
    this.#db
      .prepare(
        'INSERT INTO audit (at, action, article_id, from_version_id, to_version_id, note) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(this.#now(), action, articleId, fromVersionId, toVersionId, note);
  }

  #transaction<T>(work: () => T): T {
    this.#db.exec('BEGIN IMMEDIATE');
    try {
      const result = work();
      this.#db.exec('COMMIT');
      return result;
    } catch (error) {
      this.#db.exec('ROLLBACK');
      throw error;
    }
  }
}

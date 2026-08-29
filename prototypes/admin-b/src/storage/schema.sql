-- Prototype B storage schema.
--
-- Two rules from ADR 0001 section 3.5 are enforced here rather than left to
-- calling code:
--
--   * An article points at the version that is public. Editing appends a new
--     version row and never rewrites an existing one, so autosave cannot reach
--     what a reader sees.
--   * Publishing and rolling back both move that one pointer, which is why both
--     are a single atomic write and why rollback needs no separate mechanism.
--
-- Canonical content is Markdown for the whole of Phase 1. editor_json exists
-- only to measure what a WYSIWYG editor loses on the way back out; it is not a
-- source of truth and nothing renders from it.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS articles (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  translation_key     TEXT    NOT NULL,
  lang                TEXT    NOT NULL CHECK (lang IN ('zh', 'ja', 'en')),
  slug                TEXT    NOT NULL UNIQUE,
  created_at          TEXT    NOT NULL,
  -- NULL means never published. A new article is therefore a draft because
  -- there is nothing for a reader to resolve to, not because a flag says so.
  published_version_id INTEGER REFERENCES versions(id) ON DELETE RESTRICT,

  -- A language may appear once per translation group, matching the rule in
  -- prototypes/shared/translations.ts.
  UNIQUE (translation_key, lang)
);

CREATE TABLE IF NOT EXISTS versions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  article_id  INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  -- Canonical content.
  markdown    TEXT    NOT NULL,
  -- Editor state kept beside it for round-trip measurement. Never canonical.
  editor_json TEXT,
  title       TEXT    NOT NULL,
  summary     TEXT    NOT NULL,
  -- 'autosave' rows are written without the author asking; 'manual' rows are
  -- explicit saves. Publishing an autosave is allowed, but the distinction has
  -- to survive so the two can be told apart in the audit trail.
  kind        TEXT    NOT NULL CHECK (kind IN ('autosave', 'manual')),
  created_at  TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS versions_by_article ON versions (article_id, id DESC);

CREATE TABLE IF NOT EXISTS audit (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  at              TEXT    NOT NULL,
  action          TEXT    NOT NULL CHECK (action IN ('publish', 'rollback', 'unpublish')),
  article_id      INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  from_version_id INTEGER REFERENCES versions(id) ON DELETE SET NULL,
  to_version_id   INTEGER REFERENCES versions(id) ON DELETE SET NULL,
  note            TEXT
);

CREATE INDEX IF NOT EXISTS audit_by_article ON audit (article_id, id DESC);

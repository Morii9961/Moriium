// The initial schema, as a module rather than a file read at runtime.
//
// open.ts used to load this with readFileSync(resolve(import.meta.dirname,
// 'schema.sql')). That works from source and fails in the built artifact: the
// bundler inlines open.ts into dist/server/chunks/ and does not carry the .sql
// file, so import.meta.dirname points somewhere the schema does not exist. A
// fresh production database could therefore never be migrated, and the first
// boot on a clean VPS would fail (ADR 0002 section 21.26).
//
// Generated once from the former src/server/db/schema.sql, which was then
// removed; this module is the only copy. Keep it SQL and this header, nothing
// else.

export const SCHEMA_SQL = `-- Moriium admin database, migration 001.
--
-- ADR 0002 sections 6.3 and 6.4. Never edit this file to change an existing
-- installation: it is applied once, recorded in schema_migrations, and every
-- later change is a new numbered migration. Editing it in place would leave
-- two databases with the same recorded version and different shapes.
--
-- Three decisions are visible in the shape and worth naming, because a reader
-- would otherwise assume they were accidents:
--
--   * Frontmatter hangs off \`versions\`, not \`articles\`. Changing a title, a
--     category or a tag has to produce a new version and has to be revertible.
--     Hanging it off the article would make a rollback restore the body while
--     silently keeping the new metadata.
--   * \`tags\` is its own table rather than a JSON column, because tag pages and
--     the tag directory query and group by tag. A JSON column forces string
--     matching for something the database can index.
--   * \`articles\` carries both \`published_version_id\` and \`live_version_id\`.
--     The first is what the database says is public; the second is what the
--     last successful site build actually contains. Publishing is two steps
--     (ADR 0002 section 4.2), and the gap between them has to be observable
--     rather than inferred.

-- No \`PRAGMA foreign_keys\` here. Migrations run inside a transaction, and
-- SQLite makes that pragma a no-op while one is open, so a copy of it in this
-- file would look like the thing enforcing the REFERENCES clauses below while
-- doing nothing at all. open.ts sets it before any transaction starts.

CREATE TABLE IF NOT EXISTS accounts (
  id            INTEGER PRIMARY KEY,
  name          TEXT    NOT NULL UNIQUE,
  password_hash TEXT    NOT NULL,
  created_at    TEXT    NOT NULL,
  -- Disabled rather than deleted: historical versions and audit rows reference
  -- an author, and deleting the row would break that reference.
  disabled_at   TEXT
) STRICT;

CREATE TABLE IF NOT EXISTS articles (
  id                   INTEGER PRIMARY KEY,
  translation_key      TEXT    NOT NULL,
  lang                 TEXT    NOT NULL CHECK (lang IN ('zh', 'ja', 'en')),
  slug                 TEXT    NOT NULL UNIQUE,
  created_at           TEXT    NOT NULL,
  published_version_id INTEGER REFERENCES versions (id),
  live_version_id      INTEGER REFERENCES versions (id),

  -- One article per language within a translation group.
  UNIQUE (translation_key, lang)
) STRICT;

CREATE TABLE IF NOT EXISTS versions (
  id              INTEGER PRIMARY KEY,
  article_id      INTEGER NOT NULL REFERENCES articles (id),
  author_id       INTEGER NOT NULL REFERENCES accounts (id),
  kind            TEXT    NOT NULL CHECK (kind IN ('autosave', 'manual')),
  created_at      TEXT    NOT NULL,

  -- Frontmatter. One column per field in src/content-schema.ts, except \`tags\`,
  -- which is version_tags below. A test asserts this list against that file, so
  -- adding a field there without adding a migration here fails the build.
  title           TEXT    NOT NULL,
  summary         TEXT    NOT NULL,
  published_at    TEXT    NOT NULL,
  updated_at      TEXT,
  category        TEXT    NOT NULL,
  cover           TEXT,
  cover_alt       TEXT,
  draft           INTEGER NOT NULL DEFAULT 0 CHECK (draft IN (0, 1)),
  unlisted        INTEGER NOT NULL DEFAULT 0 CHECK (unlisted IN (0, 1)),
  copy_protection INTEGER NOT NULL DEFAULT 0 CHECK (copy_protection IN (0, 1)),

  -- Content. Markdown is canonical (ADR 0002 section 6.1); the editor's JSON
  -- rides along for editor state only and is never the source of truth.
  markdown        TEXT    NOT NULL,
  editor_json     TEXT,

  -- src/content-schema.ts requires coverAlt whenever cover is present.
  CHECK (cover IS NULL OR cover_alt IS NOT NULL)
) STRICT;

CREATE INDEX IF NOT EXISTS versions_by_article ON versions (article_id, id DESC);

CREATE TABLE IF NOT EXISTS version_tags (
  version_id INTEGER NOT NULL REFERENCES versions (id),
  tag        TEXT    NOT NULL,
  PRIMARY KEY (version_id, tag)
) STRICT;

CREATE INDEX IF NOT EXISTS version_tags_by_tag ON version_tags (tag);

CREATE TABLE IF NOT EXISTS media_assets (
  id           INTEGER PRIMARY KEY,
  -- A public URL path, never a disk path. The binary lives on disk; only
  -- metadata lives here (ADR 0002 section 6.3).
  public_path  TEXT    NOT NULL UNIQUE,
  format       TEXT    NOT NULL,
  width        INTEGER,
  height       INTEGER,
  alt          TEXT    NOT NULL,
  caption      TEXT,
  copyright    TEXT,
  exif_json    TEXT    NOT NULL DEFAULT '{}',
  -- NULL until the server has stripped metadata and re-read the file to
  -- confirm. Nothing with a NULL here may be published (section 8.1).
  sanitized_at TEXT,
  created_at   TEXT    NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS audit (
  id              INTEGER PRIMARY KEY,
  at              TEXT    NOT NULL,
  -- Who did it. Two author accounts share full permissions, so the audit trail
  -- is what tells them apart (ADR 0002 section 9.1).
  actor_id        INTEGER NOT NULL REFERENCES accounts (id),
  action          TEXT    NOT NULL CHECK (action IN ('publish', 'rollback', 'unpublish')),
  article_id      INTEGER NOT NULL REFERENCES articles (id),
  from_version_id INTEGER REFERENCES versions (id),
  to_version_id   INTEGER REFERENCES versions (id),
  note            TEXT
) STRICT;

CREATE INDEX IF NOT EXISTS audit_by_article ON audit (article_id, id DESC);
`;

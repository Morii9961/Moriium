import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { createAccount, disableAccount } from '../src/server/accounts.ts';
import { ArticleStore } from '../src/server/articles.ts';
import { openDatabase } from '../src/server/db/open.ts';
import {
  FIXTURE_CONTENT_SOURCES,
  importFixtureContent,
} from '../src/server/import/fixture-content.ts';
import {
  importForAuthor,
  parseFixtureImportCommand,
} from '../scripts/import-fixture-content.mjs';

let directory;
let db;
let store;
let author;

beforeEach(async () => {
  directory = mkdtempSync(join(tmpdir(), 'moriium-fixture-import-'));
  db = openDatabase(join(directory, 'admin.db'), { now: () => '2026-08-31T00:00:00.000Z' });
  store = new ArticleStore(db, () => '2026-08-31T00:00:00.000Z');
  author = await createAccount(
    db,
    { name: 'Morii', password: 'fixture-import-test-password' },
    () => '2026-08-31T00:00:00.000Z',
  );
});

afterEach(() => {
  db.close();
  rmSync(directory, { recursive: true, force: true });
});

describe('fixture and test article migration', () => {
  it('accepts only an approved author name and no content path', () => {
    assert.deepEqual(parseFixtureImportCommand(['Morii']), { name: 'Morii' });
    assert.throws(() => parseFixtureImportCommand(['Other']), /Usage:/);
    assert.throws(() => parseFixtureImportCommand(['Morii', 'src/content/posts']), /Usage:/);
  });

  it('imports only the five approved Markdown sources as unpublished database drafts', () => {
    const result = importFixtureContent({ store, authorId: author.id });
    const articles = store.listArticles();

    assert.equal(FIXTURE_CONTENT_SOURCES.length, 5);
    assert.deepEqual(
      articles.map((article) => article.slug).sort(),
      [
        'ja/tide-notes',
        'zh/darkroom-log',
        'zh/reader-capabilities',
        'zh/tide-notes',
        'zh/winter-drafts',
      ],
    );
    assert.equal(result.imported.length, 5);
    assert.deepEqual(result.skipped, []);

    for (const article of articles) {
      const latest = store.getLatest(article.id);
      assert.ok(latest);
      assert.equal(latest.authorId, author.id);
      assert.equal(store.getPublished(article.id), null);
      assert.equal(store.getLive(article.id), null);
    }

    const winter = articles.find((article) => article.slug === 'zh/winter-drafts');
    const reader = articles.find((article) => article.slug === 'zh/reader-capabilities');
    assert.equal(store.getLatest(winter.id).draft, true);
    assert.match(store.getLatest(reader.id).markdown, /```mermaid/);

    const repeated = importFixtureContent({ store, authorId: author.id });
    assert.deepEqual(repeated.imported, []);
    assert.deepEqual(repeated.skipped.sort(), articles.map((article) => article.slug).sort());
    assert.equal(store.listArticles().length, 5);
  });

  it('preflights identity conflicts before writing any fixture', () => {
    store.createArticle({
      authorId: author.id,
      translationKey: 'tide-notes',
      lang: 'ja',
      slug: 'ja/conflicting-tide-notes',
      title: 'Existing draft',
      summary: 'An existing article that owns this translation identity.',
      publishedAt: '2026-08-31T00:00:00.000Z',
      updatedAt: null,
      category: 'Test',
      tags: [],
      cover: null,
      coverAlt: null,
      draft: true,
      unlisted: true,
      copyProtection: false,
      markdown: 'Existing body.\n',
      editorJson: null,
    });

    assert.throws(
      () => importFixtureContent({ store, authorId: author.id }),
      /translation identity.*ja\/conflicting-tide-notes/i,
    );
    assert.deepEqual(store.listArticles().map((article) => article.slug), ['ja/conflicting-tide-notes']);
  });

  it('rolls back the whole storage batch when a later article conflicts', () => {
    const version = {
      authorId: author.id,
      translationKey: 'first',
      lang: 'zh',
      slug: 'zh/first',
      title: 'First',
      summary: 'First article in one atomic batch.',
      publishedAt: '2026-08-31T00:00:00.000Z',
      updatedAt: null,
      category: 'Test',
      tags: [],
      cover: null,
      coverAlt: null,
      draft: true,
      unlisted: true,
      copyProtection: false,
      markdown: 'First body.\n',
      editorJson: null,
    };

    assert.throws(
      () => store.createArticles([version, { ...version, translationKey: 'second' }]),
      /already exists/i,
    );
    assert.deepEqual(store.listArticles(), []);
  });

  it('refuses to attribute a migration to a disabled account', () => {
    disableAccount(db, 'Morii', () => '2026-08-31T00:01:00.000Z');
    assert.throws(
      () => importForAuthor({ db, name: 'Morii', write: () => {} }),
      /No active author account/,
    );
    assert.deepEqual(store.listArticles(), []);
  });
});

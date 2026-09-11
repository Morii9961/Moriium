import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { ArticleStore } from '../src/server/articles.ts';
import { openDatabase } from '../src/server/db/open.ts';
import { translateArticleInto } from '../src/server/translation/translate-article.ts';

let directory;
const opened = [];

before(() => {
  directory = mkdtempSync(join(tmpdir(), 'moriium-translate-'));
});

after(() => {
  while (opened.length > 0) opened.pop().close();
  rmSync(directory, { recursive: true, force: true });
});

let counter = 0;
function freshStore() {
  counter += 1;
  const db = openDatabase(join(directory, `t-${counter}.db`));
  opened.push(db);
  db.prepare("INSERT INTO accounts (name, password_hash, created_at) VALUES ('Morii', 'x', '2026-01-01')").run();
  return { store: new ArticleStore(db, () => '2026-09-09T00:00:00.000Z'), db };
}

function sourceArticle(store) {
  return store.createArticle({
    translationKey: 'first-light',
    lang: 'zh',
    slug: 'zh/first-light',
    authorId: 1,
    title: '第一束光',
    summary: '一段摘要。',
    publishedAt: '2026-09-09T00:00:00.000Z',
    updatedAt: null,
    category: '随笔',
    tags: ['记录'],
    cover: null,
    coverAlt: null,
    draft: false,
    unlisted: false,
    copyProtection: false,
    markdown: '正文第一段。\n\n```ts\nconst a = 1;\n```\n\n正文第二段。',
    editorJson: null,
  });
}

/** Marks what it is given so the test can see exactly what was sent. */
const markTranslator = async (texts) => texts.map((text) => `[JA]${text}`);

describe('translating an article into another language', () => {
  it('creates a draft variant in the same group, marked as machine translated', async () => {
    const { store } = freshStore();
    const source = sourceArticle(store);

    const created = await translateArticleInto(store, {
      articleId: source.id,
      to: 'ja',
      authorId: 1,
      translate: markTranslator,
    });

    assert.equal(created.article.lang, 'ja');
    assert.equal(created.article.translationKey, 'first-light');
    assert.equal(created.article.slug, 'ja/first-light');
    assert.equal(created.article.machineTranslatedFrom, 'zh');
    // Never published by the act of translating: Morii reviews it first.
    assert.equal(created.article.publishedVersionId, null);
  });

  it('translates the title, the summary and the prose but not the code', async () => {
    const { store } = freshStore();
    const source = sourceArticle(store);

    const created = await translateArticleInto(store, {
      articleId: source.id,
      to: 'ja',
      authorId: 1,
      translate: markTranslator,
    });

    assert.equal(created.version.title, '[JA]第一束光');
    assert.equal(created.version.summary, '[JA]一段摘要。');
    assert.match(created.version.markdown, /\[JA\]正文第一段。/);
    assert.match(created.version.markdown, /\[JA\]正文第二段。/);
    assert.match(created.version.markdown, /const a = 1;/);
    assert.doesNotMatch(created.version.markdown, /\[JA\]const/);
    assert.doesNotMatch(created.version.markdown, /\[JA\]```/);
  });

  it('carries the metadata that is not prose across unchanged', async () => {
    const { store } = freshStore();
    const source = sourceArticle(store);

    const created = await translateArticleInto(store, {
      articleId: source.id,
      to: 'ja',
      authorId: 1,
      translate: markTranslator,
    });

    assert.equal(created.version.publishedAt, '2026-09-09T00:00:00.000Z');
    assert.equal(created.version.category, '随笔');
    assert.deepEqual([...created.version.tags], ['记录']);
    assert.equal(created.version.copyProtection, false);
  });

  it('writes nothing at all when the service fails', async () => {
    // Fail closed. A variant that does not exist is shown as unavailable, which
    // the site already handles; a half-written one would be a published page.
    const { store } = freshStore();
    const source = sourceArticle(store);

    await assert.rejects(
      translateArticleInto(store, {
        articleId: source.id,
        to: 'ja',
        authorId: 1,
        translate: async () => {
          throw new Error('service down');
        },
      }),
    );

    assert.equal(store.listArticles().length, 1);
    assert.equal(store.listArticles()[0].lang, 'zh');
  });

  it('refuses to translate into a language the group already holds', async () => {
    const { store } = freshStore();
    const source = sourceArticle(store);
    await translateArticleInto(store, { articleId: source.id, to: 'ja', authorId: 1, translate: markTranslator });

    await assert.rejects(
      translateArticleInto(store, { articleId: source.id, to: 'ja', authorId: 1, translate: markTranslator }),
      (error) => error.code === 'conflict',
    );
  });

  it('refuses to translate an article into its own language', async () => {
    const { store } = freshStore();
    const source = sourceArticle(store);

    await assert.rejects(
      translateArticleInto(store, { articleId: source.id, to: 'zh', authorId: 1, translate: markTranslator }),
      (error) => error.code === 'validation-failed',
    );
  });
});

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { createAccount } from '../src/server/accounts.ts';
import { ArticleStore } from '../src/server/articles.ts';
import { openDatabase } from '../src/server/db/open.ts';
import {
  handleArticleResource,
  handleArticlesCollection,
} from '../src/server/http/article-handlers.ts';
import { toPublicArticleDto } from '../src/server/http/article-dtos.ts';
import { preparePublishValidator } from '../src/server/publishing/publish-gate.ts';

let directory;
const opened = [];
let counter = 0;

before(() => {
  directory = mkdtempSync(join(tmpdir(), 'moriium-admin-api-'));
});

after(() => {
  while (opened.length > 0) opened.pop().close();
  rmSync(directory, { recursive: true, force: true });
});

class FakeSession {
  constructor(author = null, csrfToken = null) {
    this.data = new Map();
    if (author) this.data.set('author', author);
    if (csrfToken) this.data.set('csrfToken', csrfToken);
  }

  async get(key) {
    return this.data.get(key);
  }

  set(key, value) {
    this.data.set(key, value);
  }

  async regenerate() {}
  destroy() {}
}

async function freshContext() {
  counter += 1;
  let tick = 0;
  const now = () => new Date(Date.UTC(2026, 7, 30, 0, 0, tick++)).toISOString();
  const db = openDatabase(join(directory, `api-${counter}.db`), { now });
  opened.push(db);
  const author = await createAccount(db, { name: 'Enouia', password: 'e'.repeat(30) }, now);
  return {
    db,
    store: new ArticleStore(db, now),
    author,
    session: new FakeSession({ id: author.id, name: author.name }, 'csrf-test-token'),
  };
}

function fields(overrides = {}) {
  return {
    title: '潮汐笔记',
    summary: '为了拍到退潮后的滩涂写的推算脚本。',
    publishedAt: '2026-03-14T21:40:00+08:00',
    updatedAt: null,
    category: '工程夹具',
    tags: ['夹具', '摄影'],
    cover: null,
    coverAlt: null,
    draft: false,
    unlisted: false,
    copyProtection: false,
    markdown: '正文。\n',
    editorJson: null,
    ...overrides,
  };
}

function createInput(overrides = {}) {
  return {
    translationKey: 'tide-notes',
    lang: 'zh',
    slug: 'zh/tide-notes',
    ...fields(),
    ...overrides,
  };
}

function request(path, { method = 'POST', body, csrf = true, origin = true } = {}) {
  const headers = new Headers({ Host: 'admin.example' });
  if (origin) headers.set('Origin', 'https://admin.example');
  if (csrf) headers.set('X-CSRF-Token', 'csrf-test-token');
  if (body !== undefined) headers.set('Content-Type', 'application/json');
  return new Request(`https://admin.example${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function json(response) {
  return response.status === 204 ? null : response.json();
}

function addMedia(db, overrides = {}) {
  const asset = {
    publicPath: '/media/fixture.svg',
    format: 'svg',
    width: null,
    height: null,
    alt: 'Fixture image',
    caption: null,
    copyright: null,
    exifJson: '{}',
    sanitizedAt: null,
    createdAt: '2026-08-30T00:00:00.000Z',
    ...overrides,
  };
  db.prepare(
    `INSERT INTO media_assets (
       public_path, format, width, height, alt, caption, copyright,
       exif_json, sanitized_at, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    asset.publicPath,
    asset.format,
    asset.width,
    asset.height,
    asset.alt,
    asset.caption,
    asset.copyright,
    asset.exifJson,
    asset.sanitizedAt,
    asset.createdAt,
  );
}

describe('production publish gate', () => {
  it('ignores image examples in fenced code but refuses a real missing image', async () => {
    const { db, store, author } = await freshContext();
    const article = store.createArticle({
      authorId: author.id,
      ...createInput({ markdown: '```markdown\n![Example](/media/missing.jpg)\n```\n' }),
    });
    const fenced = store.getLatest(article.id);
    const acceptFenced = await preparePublishValidator(store, db, fenced);

    assert.doesNotThrow(() =>
      store.publish(article.id, fenced.id, { actorId: author.id, validate: acceptFenced }),
    );

    const real = store.saveVersion(article.id, {
      authorId: author.id,
      ...fields({ markdown: '![Example](/media/missing.jpg)\n' }),
    });
    const rejectReal = await preparePublishValidator(store, db, real);
    assert.throws(
      () => store.publish(article.id, real.id, { actorId: author.id, validate: rejectReal }),
      (error) => error?.code === 'media-gate-refused' && /missing\.jpg/.test(error.userMessage),
    );
    assert.equal(store.getArticle(article.id).publishedVersionId, fenced.id);
    assert.equal(store.listAudit(article.id).length, 1);

    const rawHtml = store.saveVersion(article.id, {
      authorId: author.id,
      ...fields({ markdown: '<img src="/media/untracked.jpg" alt="Untracked">\n' }),
    });
    const rejectRawHtml = await preparePublishValidator(store, db, rawHtml);
    assert.throws(
      () =>
        store.publish(article.id, rawHtml.id, { actorId: author.id, validate: rejectRawHtml }),
      (error) => error?.code === 'media-gate-refused' && /Raw HTML/.test(error.userMessage),
    );
  });

  it('checks the complete metadata candidate and current media privacy state', async () => {
    const { db, store, author } = await freshContext();
    addMedia(db, {
      publicPath: '/media/unsafe.jpg',
      format: 'jpeg',
      width: 1200,
      height: 800,
      exifJson: JSON.stringify({ GPSLatitude: '39.9' }),
      sanitizedAt: null,
    });
    const article = store.createArticle({
      authorId: author.id,
      ...createInput({
        summary: 'x'.repeat(281),
        cover: '/media/unsafe.jpg',
        coverAlt: '潮间带',
        updatedAt: '2026-08-30T09:30:00+08:00',
        unlisted: true,
        copyProtection: true,
      }),
    });
    const version = store.getLatest(article.id);
    const validate = await preparePublishValidator(store, db, version);

    assert.throws(
      () => store.publish(article.id, version.id, { actorId: author.id, validate }),
      (error) => error?.code === 'validation-failed' && /summary/.test(error.userMessage),
    );
    assert.equal(store.getArticle(article.id).publishedVersionId, null);
    assert.deepEqual(store.listAudit(article.id), []);

    const mediaOnly = store.saveVersion(article.id, {
      authorId: author.id,
      ...fields({ cover: '/media/unsafe.jpg', coverAlt: '潮间带' }),
    });
    const validateMedia = await preparePublishValidator(store, db, mediaOnly);
    assert.throws(
      () => store.publish(article.id, mediaOnly.id, { actorId: author.id, validate: validateMedia }),
      (error) =>
        error?.code === 'media-gate-refused' &&
        /sanit/.test(error.userMessage) &&
        /GPSLatitude/.test(error.userMessage),
    );
  });
});

describe('author article HTTP API', () => {
  it('keeps all draft reads author-only and carries create, autosave, publish and rollback', async () => {
    const { db, store, session } = await freshContext();
    const anonymous = new FakeSession();

    const denied = await handleArticlesCollection(
      request('/api/articles', { method: 'GET', origin: false }),
      anonymous,
      store,
      db,
    );
    assert.equal(denied.status, 401);

    const createdResponse = await handleArticlesCollection(
      request('/api/articles', { body: createInput() }),
      session,
      store,
      db,
    );
    assert.equal(createdResponse.status, 201);
    const created = await json(createdResponse);
    const articleId = created.article.id;
    const firstVersionId = created.latest.id;

    const autosavedResponse = await handleArticleResource(
      request(`/api/articles/${articleId}/autosave`, {
        body: fields({ markdown: '自动保存。\n', updatedAt: '2026-08-30T09:30:00+08:00' }),
      }),
      session,
      store,
      db,
      articleId,
      'autosave',
    );
    assert.equal(autosavedResponse.status, 201);
    const autosaved = await json(autosavedResponse);
    assert.equal(store.getArticle(articleId).publishedVersionId, null);

    const published = await handleArticleResource(
      request(`/api/articles/${articleId}/publish`, {
        body: { versionId: autosaved.version.id, note: 'integration publish' },
      }),
      session,
      store,
      db,
      articleId,
      'publish',
    );
    assert.equal(published.status, 200);
    assert.equal(store.getArticle(articleId).publishedVersionId, autosaved.version.id);

    const rolledBack = await handleArticleResource(
      request(`/api/articles/${articleId}/rollback`, {
        body: { versionId: firstVersionId },
      }),
      session,
      store,
      db,
      articleId,
      'rollback',
    );
    assert.equal(rolledBack.status, 200);
    assert.equal(store.getArticle(articleId).publishedVersionId, firstVersionId);
    assert.equal(toPublicArticleDto(store, store.getArticle(articleId)).version.markdown, '正文。\n');

    const detail = await handleArticleResource(
      request(`/api/articles/${articleId}`, { method: 'GET', origin: false }),
      session,
      store,
      db,
      articleId,
    );
    const detailBody = await json(detail);
    assert.equal(detail.status, 200);
    assert.equal(detailBody.latest.markdown, '自动保存。\n');
    assert.deepEqual(
      detailBody.audit.map((entry) => entry.action),
      ['rollback', 'publish'],
    );
  });

  it('refuses malformed write DTOs and writes without the explicit CSRF token', async () => {
    const { db, store, session } = await freshContext();
    const missingField = createInput();
    delete missingField.category;

    const malformed = await handleArticlesCollection(
      request('/api/articles', { body: missingField }),
      session,
      store,
      db,
    );
    assert.equal(malformed.status, 400);
    assert.equal(store.listArticles().length, 0);

    const missingCoverAlt = await handleArticlesCollection(
      request('/api/articles', {
        body: createInput({ cover: '/media/cover.svg', coverAlt: null }),
      }),
      session,
      store,
      db,
    );
    assert.equal(missingCoverAlt.status, 400);
    assert.equal(store.listArticles().length, 0);

    const crossed = await handleArticlesCollection(
      request('/api/articles', { body: createInput(), csrf: false }),
      session,
      store,
      db,
    );
    assert.equal(crossed.status, 403);
    assert.equal(store.listArticles().length, 0);
  });

  it('renders an unsaved author preview through the production pipeline without storing it', async () => {
    const { db, store, author, session } = await freshContext();
    const article = store.createArticle({
      authorId: author.id,
      ...createInput(),
    });
    const before = store.listVersions(article.id).length;

    const preview = await handleArticleResource(
      request(`/api/articles/${article.id}/preview`, {
        body: { markdown: '```ts\nexport const tide = 1;\n```\n' },
      }),
      session,
      store,
      db,
      article.id,
      'preview',
    );
    assert.equal(preview.status, 200);
    assert.match((await json(preview)).html, /expressive-code/);
    assert.equal(store.listVersions(article.id).length, before);
    assert.equal(store.getArticle(article.id).publishedVersionId, null);

    const anonymous = await handleArticleResource(
      request(`/api/articles/${article.id}/preview`, {
        body: { markdown: 'secret draft' },
      }),
      new FakeSession(),
      store,
      db,
      article.id,
      'preview',
    );
    assert.equal(anonymous.status, 401);
  });
});

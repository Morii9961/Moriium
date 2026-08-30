import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { ArticleStore } from '../src/server/articles.ts';
import { createAccount } from '../src/server/accounts.ts';
import { openDatabase } from '../src/server/db/open.ts';
import { AdminError } from '../src/server/errors.ts';

// ADR 0002 sections 4.2 and 6, porting the state machine ADR 0001 13.7
// verified in the spike. These are written as attempts to break the rules
// rather than as a checklist: the point of the design is that the rules are
// unreachable, so the tests go looking for a way around them.

let directory;
const opened = [];

before(() => {
  directory = mkdtempSync(join(tmpdir(), 'moriium-articles-'));
});

after(() => {
  while (opened.length > 0) opened.pop().close();
  rmSync(directory, { recursive: true, force: true });
});

let counter = 0;

async function freshStore() {
  counter += 1;
  let tick = 0;
  const now = () => new Date(Date.UTC(2026, 0, 1, 0, 0, tick++)).toISOString();
  const db = openDatabase(join(directory, `articles-${counter}.db`), { now });
  opened.push(db);
  const morii = await createAccount(db, { name: 'Morii', password: 'a'.repeat(30) }, now);
  const enouia = await createAccount(db, { name: 'Enouia', password: 'b'.repeat(30) }, now);
  return { store: new ArticleStore(db, now), morii, enouia };
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

async function articleWith(overrides = {}) {
  const context = await freshStore();
  const article = context.store.createArticle({
    translationKey: 'tide-notes',
    lang: 'zh',
    slug: 'zh/tide-notes',
    authorId: context.morii.id,
    ...fields(overrides),
  });
  return { ...context, article };
}

describe('articles and versions', () => {
  it('starts an article as a draft because nothing resolves to it yet', async () => {
    const { store, article } = await articleWith();

    assert.equal(article.publishedVersionId, null);
    assert.equal(article.liveVersionId, null);
    assert.equal(store.isDraft(article.id), true);
    assert.equal(store.getPublished(article.id), null);
  });

  it('keeps the whole frontmatter, including the tags, through a round trip', async () => {
    const { store, article } = await articleWith({
      cover: '/media/tide-cover.svg',
      coverAlt: '封面替代文本',
      updatedAt: '2026-05-02T10:05:00+08:00',
      unlisted: true,
      copyProtection: true,
    });
    const version = store.getLatest(article.id);

    assert.equal(version.cover, '/media/tide-cover.svg');
    assert.equal(version.coverAlt, '封面替代文本');
    assert.equal(version.updatedAt, '2026-05-02T10:05:00+08:00');
    assert.equal(version.unlisted, true);
    assert.equal(version.copyProtection, true);
    assert.equal(version.draft, false);
    assert.deepEqual(version.tags, ['夹具', '摄影']);
  });

  it('refuses a second article on the same slug, and on the same language in one group', async () => {
    const { store, morii } = await articleWith();

    assert.throws(
      () =>
        store.createArticle({
          translationKey: 'other-key',
          lang: 'ja',
          slug: 'zh/tide-notes',
          authorId: morii.id,
          ...fields(),
        }),
      (error) => error instanceof AdminError && error.code === 'conflict',
    );
    assert.throws(
      () =>
        store.createArticle({
          translationKey: 'tide-notes',
          lang: 'zh',
          slug: 'zh/something-else',
          authorId: morii.id,
          ...fields(),
        }),
      (error) => error instanceof AdminError && error.code === 'conflict',
    );
  });
});

describe('autosave cannot reach what a reader sees', () => {
  it('leaves the published pointer alone through a run of autosaves', async () => {
    const { store, article, morii } = await articleWith();
    const first = store.getLatest(article.id);
    store.publish(article.id, first.id, { actorId: morii.id });

    for (let i = 0; i < 5; i += 1) {
      store.autosave(article.id, {
        authorId: morii.id,
        ...fields({ markdown: `改了第 ${i} 次。\n` }),
      });
    }

    assert.equal(store.getPublished(article.id).id, first.id);
    assert.equal(store.getPublished(article.id).markdown, '正文。\n');
    assert.equal(store.hasUnpublishedChanges(article.id), true);
    assert.equal(store.listVersions(article.id).length, 6);
  });

  it('writes a version whose tags are its own, not the previous version\'s', async () => {
    const { store, article, morii } = await articleWith();
    store.saveVersion(article.id, {
      authorId: morii.id,
      ...fields({ tags: ['只剩一个'] }),
    });

    const [newest, oldest] = store.listVersions(article.id);
    assert.deepEqual(newest.tags, ['只剩一个']);
    assert.deepEqual(oldest.tags, ['夹具', '摄影']);
  });

  it('records which author wrote each version, since both accounts have the same rights', async () => {
    const { store, article, morii, enouia } = await articleWith();
    store.saveVersion(article.id, { authorId: enouia.id, ...fields() });

    const [newest, oldest] = store.listVersions(article.id);
    assert.equal(newest.authorId, enouia.id);
    assert.equal(oldest.authorId, morii.id);
    assert.notEqual(morii.id, enouia.id);
  });

  it('refuses to save against an article that does not exist', async () => {
    const { store, morii } = await articleWith();

    assert.throws(
      () => store.saveVersion(9999, { authorId: morii.id, ...fields() }),
      (error) => error instanceof AdminError && error.code === 'validation-failed',
    );
  });
});

describe('publishing and rollback', () => {
  it('is one operation pointing at different versions, with an audit row each time', async () => {
    const { store, article, morii } = await articleWith();
    const first = store.getLatest(article.id);
    const second = store.saveVersion(article.id, {
      authorId: morii.id,
      ...fields({ markdown: '第二版。\n' }),
    });

    store.publish(article.id, first.id, { actorId: morii.id, note: '先发第一版' });
    store.publish(article.id, second.id, { actorId: morii.id });
    const rolled = store.rollback(article.id, first.id, { actorId: morii.id, note: '退回去' });

    assert.equal(rolled.publishedVersionId, first.id);
    assert.equal(store.getPublished(article.id).markdown, '正文。\n');

    const audit = store.listAudit(article.id);
    assert.deepEqual(
      audit.map((entry) => entry.action),
      ['rollback', 'publish', 'publish'],
    );
    assert.equal(audit[0].fromVersionId, second.id);
    assert.equal(audit[0].toVersionId, first.id);
    assert.equal(audit[0].note, '退回去');
    assert.equal(audit[2].fromVersionId, null);
  });

  it('refuses to publish a version belonging to another article', async () => {
    const { store, article, morii } = await articleWith();
    const other = store.createArticle({
      translationKey: 'darkroom-log',
      lang: 'zh',
      slug: 'zh/darkroom-log',
      authorId: morii.id,
      ...fields(),
    });
    const stolen = store.getLatest(other.id);

    assert.throws(
      () => store.publish(article.id, stolen.id, { actorId: morii.id }),
      (error) => error instanceof AdminError && error.code === 'validation-failed',
    );
    assert.equal(store.getPublished(article.id), null);
  });

  it('leaves nothing behind when the gate rejects the version', async () => {
    const { store, article, morii } = await articleWith();
    const version = store.getLatest(article.id);

    assert.throws(
      () =>
        store.publish(article.id, version.id, {
          actorId: morii.id,
          validate: () => {
            throw new AdminError('media-gate-refused', 'That image has no alt text.');
          },
        }),
      (error) => error instanceof AdminError && error.code === 'media-gate-refused',
    );

    // The hard veto in ADR 0001 section 4: a refused publish must not leave a
    // half-public state or an audit row for something that did not happen.
    assert.equal(store.getArticle(article.id).publishedVersionId, null);
    assert.equal(store.getArticle(article.id).liveVersionId, null);
    assert.deepEqual(store.listAudit(article.id), []);
  });

  it('runs the gate before the write, not after it', async () => {
    const { store, article, morii } = await articleWith();
    const version = store.getLatest(article.id);
    let pointerDuringValidation;

    store.publish(article.id, version.id, {
      actorId: morii.id,
      validate: () => {
        pointerDuringValidation = store.getArticle(article.id).publishedVersionId;
      },
    });

    assert.equal(pointerDuringValidation, null);
    assert.equal(store.getArticle(article.id).publishedVersionId, version.id);
  });

  it('refuses to republish the version that is already published', async () => {
    const { store, article, morii } = await articleWith();
    const version = store.getLatest(article.id);
    store.publish(article.id, version.id, { actorId: morii.id });

    assert.throws(
      () => store.publish(article.id, version.id, { actorId: morii.id }),
      (error) => error instanceof AdminError && error.code === 'conflict',
    );
  });

  it('unpublishes back to a draft and says who did it', async () => {
    const { store, article, morii, enouia } = await articleWith();
    const version = store.getLatest(article.id);
    store.publish(article.id, version.id, { actorId: morii.id });

    const drafted = store.unpublish(article.id, { actorId: enouia.id, note: '先撤下来' });

    assert.equal(drafted.publishedVersionId, null);
    assert.equal(store.isDraft(article.id), true);
    assert.equal(store.listAudit(article.id)[0].actorId, enouia.id);
    assert.equal(store.listAudit(article.id)[0].fromVersionId, version.id);
    assert.equal(store.listAudit(article.id)[0].toVersionId, null);
  });
});

describe('the database is the truth and the site is its projection', () => {
  it('does not mark anything live just because it was published', async () => {
    const { store, article, morii } = await articleWith();
    const version = store.getLatest(article.id);
    store.publish(article.id, version.id, { actorId: morii.id });

    // Publishing is step one. Until an export succeeds, the site is still
    // serving the previous thing, and the admin owes the author that difference.
    assert.equal(store.getArticle(article.id).liveVersionId, null);
    assert.equal(store.getLive(article.id), null);
    assert.equal(store.isAwaitingExport(article.id), true);

    store.markLive(article.id, version.id);

    assert.equal(store.getLive(article.id).id, version.id);
    assert.equal(store.isAwaitingExport(article.id), false);
  });

  it('keeps the site serving the old version when a later publish is not exported', async () => {
    const { store, article, morii } = await articleWith();
    const first = store.getLatest(article.id);
    store.publish(article.id, first.id, { actorId: morii.id });
    store.markLive(article.id, first.id);

    const second = store.saveVersion(article.id, {
      authorId: morii.id,
      ...fields({ markdown: '第二版。\n' }),
    });
    store.publish(article.id, second.id, { actorId: morii.id });

    assert.equal(store.getPublished(article.id).id, second.id);
    assert.equal(store.getLive(article.id).id, first.id);
    assert.equal(store.isAwaitingExport(article.id), true);
  });

  it('refuses to put a version in front of readers that was never published', async () => {
    const { store, article, morii } = await articleWith();
    const first = store.getLatest(article.id);
    const unpublished = store.saveVersion(article.id, {
      authorId: morii.id,
      ...fields({ markdown: '没发布过。\n' }),
    });
    store.publish(article.id, first.id, { actorId: morii.id });

    // Marking this live would serve content the publish gate never examined.
    assert.throws(
      () => store.markLive(article.id, unpublished.id),
      (error) => error instanceof AdminError && error.code === 'conflict',
    );
    assert.equal(store.getArticle(article.id).liveVersionId, null);
  });

  it('will not record an unpublished article as still live', async () => {
    const { store, article, morii } = await articleWith();
    const version = store.getLatest(article.id);
    store.publish(article.id, version.id, { actorId: morii.id });
    store.markLive(article.id, version.id);
    store.unpublish(article.id, { actorId: morii.id });

    // Still live: the export removing it has not run yet, and pretending
    // otherwise would hide a page readers can still reach.
    assert.equal(store.getLive(article.id).id, version.id);
    assert.equal(store.isAwaitingExport(article.id), true);

    store.markNotLive(article.id);
    assert.equal(store.getLive(article.id), null);
    assert.equal(store.isAwaitingExport(article.id), false);
  });

  it('refuses to clear the live pointer while the article is still published', async () => {
    const { store, article, morii } = await articleWith();
    const version = store.getLatest(article.id);
    store.publish(article.id, version.id, { actorId: morii.id });
    store.markLive(article.id, version.id);

    assert.throws(
      () => store.markNotLive(article.id),
      (error) => error instanceof AdminError && error.code === 'conflict',
    );
    assert.equal(store.getLive(article.id).id, version.id);
  });
});

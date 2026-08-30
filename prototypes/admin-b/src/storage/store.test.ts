// Storage tests for prototype B.
//
//   pnpm -C prototypes test
//
// ADR 0001 section 4 lists "a draft leaking into public output" and "publishing
// that cannot be rolled back" as hard vetoes, and section 5 requires tests to
// prove rather than declare. So these are attempts to break the state machine:
// autosave repeatedly and check what a reader sees, fail a publish halfway and
// check nothing moved, publish another article's version, roll back and confirm
// the trail records it.

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { PrototypeError } from '../../../shared/errors.ts';
import { Store } from './store.ts';

let clock = 0;
const nextTimestamp = () => new Date(Date.UTC(2026, 0, 1, 0, 0, clock++)).toISOString();

const article = {
  translationKey: 'tide-notes',
  lang: 'zh' as const,
  slug: 'zh/tide-notes',
  title: '潮汐笔记',
  summary: '第一版',
  markdown: 'First body.',
};

let store: Store;
beforeEach(() => {
  clock = 0;
  store = Store.open(':memory:', nextTimestamp);
});

describe('article lifecycle', () => {
  it('starts a new article as a draft with nothing public', () => {
    const created = store.createArticle(article);
    assert.equal(created.publishedVersionId, null);
    assert.equal(store.isDraft(created.id), true);
    assert.equal(store.getPublished(created.id), null);
  });

  it('keeps the first version so it can be published later', () => {
    const created = store.createArticle(article);
    const versions = store.listVersions(created.id);
    assert.equal(versions.length, 1);
    assert.equal(versions[0]?.markdown, 'First body.');
    assert.equal(versions[0]?.kind, 'manual');
  });

  it('refuses a duplicate slug', () => {
    store.createArticle(article);
    assert.throws(() => store.createArticle({ ...article, translationKey: 'other' }), /already exists/);
  });

  it('refuses a second article for the same language in a translation group', () => {
    store.createArticle(article);
    assert.throws(() => store.createArticle({ ...article, slug: 'zh/other' }), /already exists/);
  });
});

describe('autosave cannot reach what a reader sees', () => {
  it('leaves the published version alone no matter how often it runs', () => {
    const created = store.createArticle(article);
    const first = store.listVersions(created.id)[0]!;
    store.publish(created.id, first.id);

    for (let i = 0; i < 5; i += 1) {
      store.autosave(created.id, { title: '潮汐笔记', summary: '草稿', markdown: `Draft ${i}.` });
    }

    assert.equal(store.getPublished(created.id)?.markdown, 'First body.');
    assert.equal(store.getPublished(created.id)?.id, first.id);
    assert.equal(store.hasUnpublishedChanges(created.id), true);
    assert.equal(store.listVersions(created.id).length, 6);
  });

  it('does not overwrite the version it started from', () => {
    const created = store.createArticle(article);
    const first = store.listVersions(created.id)[0]!;
    store.autosave(created.id, { title: 't', summary: 's', markdown: 'Changed.' });
    assert.equal(store.getVersion(first.id)?.markdown, 'First body.');
  });

  it('records autosaves distinguishably from explicit saves', () => {
    const created = store.createArticle(article);
    store.autosave(created.id, { title: 't', summary: 's', markdown: 'a' });
    store.saveVersion(created.id, { title: 't', summary: 's', markdown: 'b' });
    const kinds = store.listVersions(created.id).map((v) => v.kind);
    assert.deepEqual(kinds, ['manual', 'autosave', 'manual']);
  });
});

describe('publishing', () => {
  it('makes exactly the chosen version public and records it', () => {
    const created = store.createArticle(article);
    const first = store.listVersions(created.id)[0]!;
    const second = store.saveVersion(created.id, { title: 't', summary: 's', markdown: 'Second body.' });

    store.publish(created.id, second.id, { note: 'first release' });

    assert.equal(store.getPublished(created.id)?.markdown, 'Second body.');
    assert.equal(store.hasUnpublishedChanges(created.id), false);

    const [entry] = store.listAudit(created.id);
    assert.equal(entry?.action, 'publish');
    assert.equal(entry?.fromVersionId, null);
    assert.equal(entry?.toVersionId, second.id);
    assert.equal(entry?.note, 'first release');
    assert.notEqual(second.id, first.id);
  });

  it('leaves the published version untouched when validation rejects', () => {
    const created = store.createArticle(article);
    const first = store.listVersions(created.id)[0]!;
    store.publish(created.id, first.id);
    const second = store.saveVersion(created.id, { title: 't', summary: 's', markdown: 'Bad.' });

    assert.throws(
      () => store.publish(created.id, second.id, { validate: () => { throw new Error('media check failed'); } }),
      /media check failed/,
    );

    assert.equal(store.getPublished(created.id)?.id, first.id);
    assert.equal(store.getPublished(created.id)?.markdown, 'First body.');
    // A rejected publish must not leave a trace suggesting it happened.
    assert.equal(store.listAudit(created.id).length, 1);
  });

  it('refuses a version belonging to another article', () => {
    const a = store.createArticle(article);
    const b = store.createArticle({ ...article, translationKey: 'darkroom', slug: 'zh/darkroom' });
    const bVersion = store.listVersions(b.id)[0]!;

    assert.throws(() => store.publish(a.id, bVersion.id), /does not belong/);
    assert.equal(store.getPublished(a.id), null);
  });

  it('refuses to republish the version already public', () => {
    const created = store.createArticle(article);
    const first = store.listVersions(created.id)[0]!;
    store.publish(created.id, first.id);
    assert.throws(() => store.publish(created.id, first.id), /already the published one/);
  });
});

describe('rollback', () => {
  it('restores an earlier version and records where it came from', () => {
    const created = store.createArticle(article);
    const first = store.listVersions(created.id)[0]!;
    store.publish(created.id, first.id);
    const second = store.saveVersion(created.id, { title: 't', summary: 's', markdown: 'Second body.' });
    store.publish(created.id, second.id);

    store.rollback(created.id, first.id, { note: 'broke the gallery' });

    assert.equal(store.getPublished(created.id)?.markdown, 'First body.');
    const [entry] = store.listAudit(created.id);
    assert.equal(entry?.action, 'rollback');
    assert.equal(entry?.fromVersionId, second.id);
    assert.equal(entry?.toVersionId, first.id);
  });

  it('keeps every version, so a rollback is itself reversible', () => {
    const created = store.createArticle(article);
    const first = store.listVersions(created.id)[0]!;
    const second = store.saveVersion(created.id, { title: 't', summary: 's', markdown: 'Second body.' });
    store.publish(created.id, second.id);
    store.rollback(created.id, first.id);
    store.publish(created.id, second.id);

    assert.equal(store.getPublished(created.id)?.markdown, 'Second body.');
    assert.equal(store.listVersions(created.id).length, 2);
    assert.deepEqual(
      store.listAudit(created.id).map((e) => e.action),
      ['publish', 'rollback', 'publish'],
    );
  });
});

describe('unpublish', () => {
  it('withdraws the article without destroying history', () => {
    const created = store.createArticle(article);
    const first = store.listVersions(created.id)[0]!;
    store.publish(created.id, first.id);

    store.unpublish(created.id, 'taking it down');

    assert.equal(store.getPublished(created.id), null);
    assert.equal(store.isDraft(created.id), true);
    assert.equal(store.listVersions(created.id).length, 1);
    assert.equal(store.listAudit(created.id)[0]?.action, 'unpublish');
  });

  it('refuses when the article was never published', () => {
    const created = store.createArticle(article);
    assert.throws(() => store.unpublish(created.id), /not published/);
  });
});

describe('canonical content', () => {
  it('stores editor JSON beside the Markdown without it becoming the source', () => {
    const created = store.createArticle(article);
    const version = store.saveVersion(created.id, {
      title: 't',
      summary: 's',
      markdown: '# Heading\n',
      editorJson: '{"type":"doc"}',
    });
    store.publish(created.id, version.id);

    // What a reader resolves to is the Markdown. The editor state rides along.
    assert.equal(store.getPublished(created.id)?.markdown, '# Heading\n');
    assert.equal(store.getPublished(created.id)?.editorJson, '{"type":"doc"}');
  });

  it('treats missing editor state as normal, not an error', () => {
    const created = store.createArticle(article);
    assert.equal(store.listVersions(created.id)[0]?.editorJson, null);
  });
});

// Found by holding a real write lock against a running instance (ADR 13.20).
// The B10 drill got HTTP 500 "Unexpected server error" from a locked database,
// even though errors.ts modelled db-locked as retryable and the HTTP layer
// already mapped it to 503. Nothing raised it, so the path was dead. This needs
// a file-backed database: ':memory:' has no second connection to contend with.
describe('a locked database', () => {
  let directory: string;
  let file: string;
  let locked: Store;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'moriium-store-'));
    file = join(directory, 'contended.db');
    locked = Store.open(file, nextTimestamp);
  });

  afterEach(() => {
    locked.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it('reports contention as retryable db-locked rather than an unknown failure', () => {
    const created = locked.createArticle(article);
    const before = locked.listVersions(created.id).length;

    const competitor = new DatabaseSync(file);
    competitor.exec('BEGIN IMMEDIATE');
    try {
      assert.throws(
        () => locked.saveVersion(created.id, { title: 't', summary: 's', markdown: 'blocked' }),
        (error: unknown) =>
          error instanceof PrototypeError && error.code === 'db-locked' && error.retryable,
      );
      // The refusal must also leave the article exactly as it was.
      assert.equal(locked.listVersions(created.id).length, before);
    } finally {
      competitor.exec('ROLLBACK');
      competitor.close();
    }

    // And the store still works once the lock is gone.
    assert.equal(locked.saveVersion(created.id, { title: 't', summary: 's', markdown: 'after' }).markdown, 'after');
  });
});

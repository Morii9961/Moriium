// Media import: sanitization, storage, the author API, and the publish gate.
//
// ADR 0001 section 5 asks these to be destruction attempts rather than a
// checklist. The load-bearing ones here are the negatives: a confirmation step
// only ever run on clean input proves nothing, so `assertStripped` is aimed at
// a file that really does carry EXIF, and every refusal is checked for leaving
// neither a row nor a file behind.

import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import sharp from 'sharp';
import { assertStripped, sensitiveBlocksInFile } from '../scripts/lib/media.mjs';
import { createAccount } from '../src/server/accounts.ts';
import { ArticleStore } from '../src/server/articles.ts';
import { openDatabase } from '../src/server/db/open.ts';
import { MediaStore } from '../src/server/media/assets.ts';
import { importImage } from '../src/server/media/import.ts';
import { fileForPublicPath, publicPathFor, toPathSegment } from '../src/server/media/storage.ts';
import {
  handleMediaCollection,
  handleMediaFile,
  MAX_UPLOAD_BYTES,
} from '../src/server/http/media-handlers.ts';
import { preparePublishValidator } from '../src/server/publishing/publish-gate.ts';

let directory;
let mediaRoot;
let previousMediaRoot;
const opened = [];
let counter = 0;

before(() => {
  directory = mkdtempSync(join(tmpdir(), 'moriium-media-'));
  mediaRoot = join(directory, 'media');
  previousMediaRoot = process.env.MORIIUM_MEDIA_ROOT;
  process.env.MORIIUM_MEDIA_ROOT = mediaRoot;
});

after(() => {
  while (opened.length > 0) opened.pop().close();
  if (previousMediaRoot === undefined) delete process.env.MORIIUM_MEDIA_ROOT;
  else process.env.MORIIUM_MEDIA_ROOT = previousMediaRoot;
  rmSync(directory, { recursive: true, force: true });
});

/** A JPEG carrying both a camera identity and a GPS fix. */
async function photographWithExif() {
  return sharp({
    create: { width: 120, height: 90, channels: 3, background: { r: 24, g: 84, b: 120 } },
  })
    .withExif({
      IFD0: { Make: 'Moriium', Model: 'FixtureCam' },
      GPS: { GPSLatitudeRef: 'N', GPSLatitude: '39/1 54/1 0/1' },
    })
    .jpeg()
    .toBuffer();
}

async function filesUnder(root) {
  const found = [];
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) found.push(...(await filesUnder(path)));
    else found.push(path);
  }
  return found;
}

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
  const db = openDatabase(join(directory, `media-${counter}.db`), { now });
  opened.push(db);
  const author = await createAccount(db, { name: 'Morii', password: 'm'.repeat(30) }, now);
  return {
    db,
    now,
    author,
    media: new MediaStore(db, now),
    articles: new ArticleStore(db, now),
    root: join(mediaRoot, `case-${counter}`),
    session: new FakeSession({ id: author.id, name: author.name }, 'csrf-test-token'),
  };
}

async function upload(fields, { csrf = true, origin = true, contentType } = {}) {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) form.set(name, value);
  const encoded = new Request('https://admin.example/api/media', { method: 'POST', body: form });
  const headers = new Headers(encoded.headers);
  headers.set('Host', 'admin.example');
  if (origin) headers.set('Origin', 'https://admin.example');
  if (csrf) headers.set('X-CSRF-Token', 'csrf-test-token');
  if (contentType) headers.set('Content-Type', contentType);
  const body = await encoded.arrayBuffer();
  return new Request('https://admin.example/api/media', { method: 'POST', headers, body });
}

function read(path, { csrf = true } = {}) {
  const headers = new Headers({ Host: 'admin.example', Origin: 'https://admin.example' });
  if (csrf) headers.set('X-CSRF-Token', 'csrf-test-token');
  return new Request(`https://admin.example${path}`, { method: 'GET', headers });
}

describe('sanitization confirmation', () => {
  it('refuses a file that still carries metadata and accepts a real derivative', async () => {
    const original = await photographWithExif();
    const source = join(directory, 'original.jpg');
    const { writeFileSync } = await import('node:fs');
    writeFileSync(source, original);

    // The negative first: without this failing, everything below is vacuous.
    assert.deepEqual(await sensitiveBlocksInFile(source), ['exif']);
    await assert.rejects(assertStripped(original), /still contains exif metadata/);

    const derivative = await sharp(original).webp().toBuffer();
    const metadata = await assertStripped(derivative);
    assert.equal(metadata.format, 'webp');
  });
});

describe('derived storage paths', () => {
  it('keeps a hostile filename inside the media root', () => {
    const path = publicPathFor({
      data: new Uint8Array([1, 2, 3]),
      filename: '../../etc/passwd.jpg',
      group: '../../..',
      extension: 'webp',
    });
    assert.match(path, /^\/media\/posts\/[a-z0-9-]+\/[a-z0-9-]+-[0-9a-f]{12}\.webp$/);
    assert.doesNotMatch(path, /\.\./);
    const file = fileForPublicPath(path, '/srv/media');
    assert.ok(file.includes('posts'));
  });

  it('falls back rather than inventing a name it cannot transliterate', () => {
    assert.equal(toPathSegment('潮間帶.jpg', 'image'), 'image');
    assert.equal(toPathSegment('Tide Flats 2026.JPG', 'image'), 'tide-flats-2026');
  });

  it('refuses a stored path that escapes the media root', () => {
    assert.throws(
      () => fileForPublicPath('/media/../../etc/passwd', '/srv/media'),
      (error) => error?.code === 'path-outside-root',
    );
    assert.throws(
      () => fileForPublicPath('/etc/passwd', '/srv/media'),
      (error) => error?.code === 'path-outside-root',
    );
  });
});

describe('media import', () => {
  it('strips a camera identity and a GPS fix, then records the strip', async () => {
    const { media, root } = await freshContext();
    const original = await photographWithExif();
    assert.ok(
      (await sharp(original).metadata()).exif,
      'the fixture has to carry EXIF, or this test asserts nothing',
    );

    const asset = await importImage(
      media,
      { data: original, filename: 'Tide Flats.jpg', alt: '退潮后的滩涂', group: 'tide-notes' },
      { root },
    );

    assert.equal(asset.format, 'webp');
    assert.equal(asset.width, 120);
    assert.equal(asset.height, 90);
    assert.equal(asset.alt, '退潮后的滩涂');
    assert.ok(asset.sanitizedAt, 'the strip has to be recorded, not assumed');
    assert.deepEqual(asset.exif, {});
    assert.match(asset.publicPath, /^\/media\/posts\/tide-notes\/tide-flats-[0-9a-f]{12}\.webp$/);

    const file = fileForPublicPath(asset.publicPath, root);
    assert.ok(existsSync(file));
    assert.deepEqual(await sensitiveBlocksInFile(file), []);
  });

  it('leaves neither a row nor a file behind when it refuses', async () => {
    const { media, root } = await freshContext();
    const original = await photographWithExif();
    const animation = await sharp({
      create: { width: 20, height: 20, channels: 3, background: '#123456' },
    })
      .gif()
      .toBuffer();
    const vector = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8"/></svg>',
    );

    const refusals = [
      [{ data: original, filename: 'a.jpg', alt: '   ' }, 'validation-failed'],
      [{ data: new Uint8Array(), filename: 'a.jpg', alt: '空' }, 'validation-failed'],
      [{ data: vector, filename: 'a.svg', alt: '矢量' }, 'media-gate-refused'],
      [{ data: animation, filename: 'a.gif', alt: '动图' }, 'media-gate-refused'],
      [{ data: Buffer.from('not an image at all'), filename: 'a.jpg', alt: '垃圾' }, 'media-gate-refused'],
    ];

    for (const [request, code] of refusals) {
      await assert.rejects(
        importImage(media, request, { root }),
        (error) => error?.code === code,
        `${request.filename} should have been refused as ${code}`,
      );
    }

    assert.deepEqual(media.list(), []);
    assert.deepEqual(await filesUnder(root), []);
  });

  it('refuses a second import of the same image instead of duplicating it', async () => {
    const { media, root } = await freshContext();
    const original = await photographWithExif();
    const first = await importImage(
      media,
      { data: original, filename: 'photo.jpg', alt: '第一次' },
      { root },
    );
    await assert.rejects(
      importImage(media, { data: original, filename: 'photo.jpg', alt: '第二次' }, { root }),
      (error) => error?.code === 'conflict',
    );

    assert.equal(media.list().length, 1);
    assert.equal(media.list()[0].alt, '第一次');
    // The conflict is with the existing row, so its file must survive.
    assert.ok(existsSync(fileForPublicPath(first.publicPath, root)));
  });
});

describe('media API', () => {
  it('refuses an anonymous read and a write without CSRF', async () => {
    const { db, session } = await freshContext();
    const anonymous = await handleMediaCollection(read('/api/media'), new FakeSession(), db);
    assert.equal(anonymous.status, 401);

    const noCsrf = await handleMediaCollection(
      await upload({ file: new File([await photographWithExif()], 'a.jpg'), alt: '图' }, { csrf: false }),
      session,
      db,
    );
    assert.equal(noCsrf.status, 403);
    assert.equal(new MediaStore(db).list().length, 0);
  });

  it('refuses a JSON body and an oversized upload before parsing either', async () => {
    const { db, session } = await freshContext();

    const asJson = new Request('https://admin.example/api/media', {
      method: 'POST',
      headers: {
        Host: 'admin.example',
        Origin: 'https://admin.example',
        'X-CSRF-Token': 'csrf-test-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ alt: '图' }),
    });
    assert.equal((await handleMediaCollection(asJson, session, db)).status, 415);

    const oversized = new Request('https://admin.example/api/media', {
      method: 'POST',
      headers: {
        Host: 'admin.example',
        Origin: 'https://admin.example',
        'X-CSRF-Token': 'csrf-test-token',
        'Content-Type': 'multipart/form-data; boundary=x',
        'Content-Length': String(MAX_UPLOAD_BYTES + 1),
      },
      body: 'ignored',
    });
    assert.equal((await handleMediaCollection(oversized, session, db)).status, 413);
    assert.equal(new MediaStore(db).list().length, 0);
  });

  it('imports through the endpoint and serves the stored bytes back', async () => {
    const { db, session } = await freshContext();
    const original = await photographWithExif();

    const created = await handleMediaCollection(
      await upload({
        file: new File([original], '潮間帶.jpg', { type: 'image/jpeg' }),
        alt: '退潮后的滩涂',
        caption: '傍晚六点',
        group: 'tide-notes',
      }),
      session,
      db,
    );
    assert.equal(created.status, 201);
    const { asset } = await created.json();
    assert.ok(asset.sanitizedAt);
    assert.equal(asset.caption, '傍晚六点');
    // The Japanese filename has no ASCII to keep, so the fallback name is used.
    assert.match(asset.publicPath, /^\/media\/posts\/tide-notes\/image-[0-9a-f]{12}\.webp$/);

    const listed = await handleMediaCollection(read('/api/media'), session, db);
    assert.equal(listed.status, 200);
    assert.deepEqual((await listed.json()).assets.map((row) => row.id), [asset.id]);

    const served = await handleMediaFile(read(`/api/media/${asset.id}/file`), session, db, asset.id);
    assert.equal(served.status, 200);
    assert.equal(served.headers.get('Content-Type'), 'image/webp');
    assert.equal(served.headers.get('X-Content-Type-Options'), 'nosniff');
    const bytes = Buffer.from(await served.arrayBuffer());
    assert.deepEqual(bytes, readFileSync(fileForPublicPath(asset.publicPath)));
    await assertStripped(bytes);

    const anonymous = await handleMediaFile(
      read(`/api/media/${asset.id}/file`),
      new FakeSession(),
      db,
      asset.id,
    );
    assert.equal(anonymous.status, 401);

    const missing = await handleMediaFile(read('/api/media/9999/file'), session, db, 9999);
    assert.equal(missing.status, 400);
  });
});

describe('imported media and the publish gate', () => {
  it('publishes a reference the import created and refuses one it did not', async () => {
    const { db, session, media, articles, author, root } = await freshContext();
    const asset = await importImage(
      media,
      { data: await photographWithExif(), filename: 'flats.jpg', alt: '退潮后的滩涂' },
      { root },
    );

    const article = articles.createArticle({
      authorId: author.id,
      translationKey: 'tide-notes',
      lang: 'zh',
      slug: 'zh/tide-notes',
      title: '潮汐笔记',
      summary: '为了拍到退潮后的滩涂写的推算脚本。',
      publishedAt: '2026-03-14T21:40:00+08:00',
      updatedAt: null,
      category: '工程夹具',
      tags: ['摄影'],
      cover: null,
      coverAlt: null,
      draft: false,
      unlisted: false,
      copyProtection: false,
      markdown: `![退潮后的滩涂](${asset.publicPath})\n`,
      editorJson: null,
    });

    const version = articles.getLatest(article.id);
    const validate = await preparePublishValidator(articles, db, version);
    assert.doesNotThrow(() =>
      articles.publish(article.id, version.id, { actorId: author.id, validate }),
    );
    assert.equal(articles.getArticle(article.id).publishedVersionId, version.id);

    // The same shape of path, never imported, still cannot be published.
    const forged = articles.saveVersion(article.id, {
      authorId: author.id,
      ...version,
      markdown: '![退潮后的滩涂](/media/posts/tide-notes/forged-0123456789ab.webp)\n',
    });
    const rejectForged = await preparePublishValidator(articles, db, forged);
    await assert.rejects(
      async () =>
        articles.publish(article.id, forged.id, { actorId: author.id, validate: rejectForged }),
      (error) => error?.code === 'media-gate-refused',
    );
    assert.equal(articles.getArticle(article.id).publishedVersionId, version.id);

    // And the endpoint the editor uses lists exactly what may be referenced.
    const listed = await handleMediaCollection(read('/api/media'), session, db);
    assert.deepEqual(
      (await listed.json()).assets.map((row) => row.publicPath),
      [asset.publicPath],
    );
  });
});

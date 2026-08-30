import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { PrototypeError } from '../../../shared/errors.ts';
import { mediaManifest, type MediaManifest } from '../../../shared/media.ts';
import { Store } from '../storage/store.ts';
import { validateVersionForPublishing } from './publish-gate.ts';

const stores: Store[] = [];

afterEach(() => {
  while (stores.length > 0) stores.pop()!.close();
});

function store(): Store {
  const value = Store.open(':memory:');
  stores.push(value);
  return value;
}

function manifest(assets: MediaManifest['assets'] = []): MediaManifest {
  return mediaManifest.parse({ version: 1, assets });
}

function candidate(database: Store, markdown = 'A publishable body.\n') {
  const article = database.createArticle({
    translationKey: 'gate-candidate',
    lang: 'zh',
    slug: 'zh/gate-candidate',
    title: 'Gate candidate',
    summary: 'A valid summary.',
    markdown,
  });
  return database.getLatest(article.id)!;
}

describe('prototype B publish gate', () => {
  it('accepts a valid article even when the other translations do not exist', () => {
    const database = store();
    const version = candidate(database, '![A fixture](/media/fixtures/a.svg)\n');
    const media = manifest([
      {
        publicPath: '/media/fixtures/a.svg',
        format: 'svg',
        alt: 'A fixture',
        exif: {},
        sanitized: false,
      },
    ]);

    assert.doesNotThrow(() => validateVersionForPublishing(database, version, media));
  });

  it('refuses content that cannot satisfy the shared publish metadata contract', () => {
    const database = store();
    const version = candidate(database);
    const invalid = { ...version, summary: 'x'.repeat(281) };

    assert.throws(
      () => validateVersionForPublishing(database, invalid, manifest()),
      (error: unknown) =>
        error instanceof PrototypeError &&
        error.code === 'validation-failed' &&
        /summary/i.test(error.userMessage),
    );
  });

  it('refuses an image that is absent from the media manifest', () => {
    const database = store();
    const version = candidate(database, '![Unknown](/media/fixtures/missing.svg)\n');

    assert.throws(
      () => validateVersionForPublishing(database, version, manifest()),
      (error: unknown) =>
        error instanceof PrototypeError &&
        error.code === 'media-gate-refused' &&
        /missing\.svg/.test(error.userMessage),
    );
  });

  it('refuses a remote image instead of letting it bypass the local media manifest', () => {
    const database = store();
    const version = candidate(database, '![Remote](https://example.test/image.jpg)\n');

    assert.throws(
      () => validateVersionForPublishing(database, version, manifest()),
      (error: unknown) =>
        error instanceof PrototypeError &&
        error.code === 'media-gate-refused' &&
        /https:\/\/example\.test\/image\.jpg/.test(error.userMessage),
    );
  });

  it('refuses blank usage alt text and unsafe raster metadata', () => {
    const database = store();
    const version = candidate(database, '![](/media/fixtures/a.jpg)\n');
    const media = manifest([
      {
        publicPath: '/media/fixtures/a.jpg',
        format: 'jpeg',
        alt: 'Manifest fallback must not hide a blank usage alt.',
        exif: { GPSLatitude: '35.0' },
        sanitized: false,
      },
    ]);

    assert.throws(
      () => validateVersionForPublishing(database, version, media),
      (error: unknown) =>
        error instanceof PrototypeError &&
        error.code === 'media-gate-refused' &&
        /alt text.*sanitize-media.*GPSLatitude/is.test(error.userMessage),
    );
  });
});

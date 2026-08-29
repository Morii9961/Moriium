// Tests for the shared contract.
//
//   pnpm -C prototypes test
//
// These cover the properties that are supposed to be guarantees rather than
// intentions: a missing translation never resolves to another language, a log
// message never carries a secret, and unsanitised raster media cannot be
// published. ADR 0001 section 5 says tests must prove these rather than declare
// them, so each one is written as an attempt to break the rule.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { blocksIn, markersFor } from './content-blocks.ts';
import { PrototypeError, describeForLog, redactForLog } from './errors.ts';
import { blockersForPublishing, mediaAsset } from './media.ts';
import {
  availableLanguages,
  buildTranslationIndex,
  missingLanguages,
  statusByLanguage,
  statusOf,
} from './translations.ts';

const post = (translationKey: string, lang: 'zh' | 'ja' | 'en', draft = false) => ({
  translationKey,
  lang,
  slug: `${lang}/${translationKey}`,
  title: `${translationKey} (${lang})`,
  draft,
});

describe('translations', () => {
  it('reports a missing language as unavailable and offers no substitute', () => {
    const groups = buildTranslationIndex([post('a', 'zh'), post('a', 'ja')]);
    const status = statusOf(groups.get('a'), 'en');
    assert.equal(status.state, 'unavailable');
    // The only shape carrying an entry is 'available'. There is no field an
    // English reader could be served another language through.
    assert.equal('entry' in status, false);
  });

  it('never counts a draft as an available translation', () => {
    const groups = buildTranslationIndex([post('a', 'zh'), post('a', 'ja', true)]);
    assert.equal(statusOf(groups.get('a'), 'ja').state, 'draft');
    assert.deepEqual(availableLanguages(groups.get('a')), ['zh']);
    assert.deepEqual(missingLanguages(groups.get('a')), ['ja', 'en']);
  });

  it('covers all three languages so a switcher cannot silently omit one', () => {
    const groups = buildTranslationIndex([post('a', 'zh')]);
    const all = statusByLanguage(groups.get('a'));
    assert.deepEqual(Object.keys(all), ['zh', 'ja', 'en']);
  });

  it('treats an unknown key as unavailable rather than throwing', () => {
    const groups = buildTranslationIndex([post('a', 'zh')]);
    assert.equal(statusOf(groups.get('nope'), 'zh').state, 'unavailable');
  });

  it('refuses two entries for the same language in one group', () => {
    assert.throws(
      () => buildTranslationIndex([post('a', 'zh'), post('a', 'zh')]),
      /two zh entries/,
    );
  });
});

describe('errors', () => {
  it('redacts private paths', () => {
    const out = redactForLog('failed to read .private/posts/letter.md');
    assert.match(out, /<private-path>/);
    assert.doesNotMatch(out, /letter\.md/);
  });

  it('redacts passwords however they are spelled', () => {
    for (const input of ['password=hunter2abc', 'password: hunter2abc', 'passphrase="hunter2abc"']) {
      const out = redactForLog(input);
      assert.doesNotMatch(out, /hunter2abc/, `leaked from: ${input}`);
    }
  });

  it('redacts long base64 runs so ciphertext cannot reach a log', () => {
    const blob = 'A'.repeat(60);
    assert.doesNotMatch(redactForLog(`ciphertext ${blob}`), /A{40}/);
  });

  it('redacts through describeForLog, not only the raw helper', () => {
    const error = new PrototypeError('file-write-failed', 'could not write .private/posts/a.md');
    assert.doesNotMatch(describeForLog(error), /a\.md/);
  });

  it('marks contention retryable and refusals not', () => {
    assert.equal(new PrototypeError('db-locked', 'busy').retryable, true);
    assert.equal(new PrototypeError('file-locked', 'busy').retryable, true);
    // Repeating a rejected traversal is not recovery.
    assert.equal(new PrototypeError('path-outside-root', 'nope').retryable, false);
    assert.equal(new PrototypeError('media-gate-refused', 'nope').retryable, false);
    assert.equal(new PrototypeError('unauthorized', 'nope').retryable, false);
  });
});

describe('media', () => {
  const base = { publicPath: '/media/x.webp', format: 'webp' as const, alt: 'A picture', exif: {}, sanitized: true };

  it('blocks unsanitised raster media', () => {
    const asset = mediaAsset.parse({ ...base, sanitized: false });
    assert.match(blockersForPublishing(asset).join(' '), /sanitize-media/);
  });

  it('allows SVG without the sanitiser, since it carries no camera metadata', () => {
    const asset = mediaAsset.parse({ ...base, publicPath: '/media/x.svg', format: 'svg', sanitized: false });
    assert.deepEqual(blockersForPublishing(asset), []);
  });

  it('blocks EXIF outside the allowlist', () => {
    const asset = mediaAsset.parse({ ...base, exif: { GPSLatitude: '35.0' } });
    assert.match(blockersForPublishing(asset).join(' '), /GPSLatitude/);
  });

  it('accepts allowlisted EXIF', () => {
    const asset = mediaAsset.parse({ ...base, exif: { Make: 'Fixture', FNumber: '2.8' } });
    assert.deepEqual(blockersForPublishing(asset), []);
  });

  it('will not represent an image without alt text', () => {
    assert.throws(() => mediaAsset.parse({ ...base, alt: '' }));
  });

  it('rejects a disk path where a public URL belongs', () => {
    assert.throws(() => mediaAsset.parse({ ...base, publicPath: 'E:\\Moriium\\photo.webp' }));
  });
});

describe('content blocks', () => {
  it('derives feature markers from the body', () => {
    assert.deepEqual(markersFor('![a](/m/a.svg)\n\nInline $x = 1$ here.\n'), {
      lightbox: true,
      mermaid: false,
      music: false,
      video: false,
      math: true,
    });
  });

  it('leaves every marker false for plain prose', () => {
    assert.deepEqual(markersFor('Just words, and a price of 5 dollars.\n'), {
      lightbox: false,
      mermaid: false,
      music: false,
      video: false,
      math: false,
    });
  });

  it('detects directive blocks and admonitions', () => {
    const body = '::github{repo="a/b"}\n\n:::warning\nCare.\n:::\n\n> [!TIP]\n> Hint.\n\n:spoiler[hidden]\n';
    const found = blocksIn(body);
    for (const id of ['github-card', 'admonition', 'admonition-github-callout', 'spoiler']) {
      assert.ok(found.includes(id), `missed ${id}`);
    }
  });

  it('separates a fence carrying Expressive Code metadata from a plain one', () => {
    assert.equal(blocksIn('```ts\nconst a = 1;\n```\n').includes('code-fence-metadata'), false);
    assert.equal(
      blocksIn('```ts title="a.ts" showLineNumbers\nconst a = 1;\n```\n').includes('code-fence-metadata'),
      true,
    );
  });
});

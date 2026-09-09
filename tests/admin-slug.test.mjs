import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  composeSlug,
  deriveIdentity,
  languagesLeftInGroup,
  slugBodyFromTitle,
  translationKeyFor,
} from '../src/admin/slug.ts';

describe('admin slug derivation', () => {
  it('produces the slug shape the content schema accepts', () => {
    // The regex is the contract. Reading it from the schema keeps this test
    // honest if the schema ever tightens.
    const schema = readFileSync('src/content-schema.ts', 'utf8');
    const declared = /slug: z\.string\(\)\.regex\((\/.+\/)\)/.exec(schema);
    assert.ok(declared, 'the schema is expected to declare a slug pattern');
    const pattern = new RegExp(declared[1].slice(1, -1));

    for (const title of [
      'Beginning again from a blank page',
      '  Mixed CASE, punctuation! and   spaces  ',
      'Astro 7.2.4 release notes',
      'café — naïve résumé',
    ]) {
      const slug = composeSlug('zh', slugBodyFromTitle(title, new Date('2026-09-09T00:00:00Z')));
      assert.match(slug, pattern, `${title} produced ${slug}`);
    }
  });

  it('falls back to the date when a title has nothing the slug can carry', () => {
    // Morii writes in Chinese, so this is the ordinary case, not the edge one.
    // Transliterating would produce pinyin noise nobody chose; a dated slug is
    // at least valid, unique per day, and obviously worth replacing.
    const body = slugBodyFromTitle('从一张白纸重新开始', new Date('2026-09-09T12:00:00Z'));

    assert.equal(body, '2026-09-09');
    assert.doesNotMatch(body, /cong|zhang|bai/);
  });

  it('never emits a leading, trailing or doubled hyphen', () => {
    for (const title of ['  --hello--  ', '!!!', 'a---b', '中文 mixed 英文']) {
      const body = slugBodyFromTitle(title, new Date('2026-09-09T00:00:00Z'));
      assert.doesNotMatch(body, /^-|-$|--/, `${title} produced ${body}`);
    }
  });

  it('keeps the language prefix out of the body the author types', () => {
    // The prefix exists so Astro's collection ids stay unique; it is not a
    // decision the author makes, so the form must not ask for it.
    assert.equal(composeSlug('ja', 'first-light'), 'ja/first-light');
    assert.equal(slugBodyFromTitle('zh/first-light', new Date()), 'zh-first-light');
  });

  it('derives a new article key from its own slug body', () => {
    assert.equal(translationKeyFor({ mode: 'new', slugBody: 'first-light' }), 'first-light');
  });

  it('takes the key from the source article when the entry is a translation', () => {
    // Typing a string that has to match another article exactly was never a
    // job for a person: a typo silently starts a second group of one.
    const source = { translationKey: 'moriium-reconstruction', slug: 'zh/moriium-reconstruction' };

    assert.equal(
      translationKeyFor({ mode: 'translation', slugBody: 'anything', source }),
      'moriium-reconstruction',
    );
  });

  it('yields a usable identity before the author has typed anything', () => {
    // The form opens on this state. An empty slug here is what made the field
    // look like it was never generated at all, and it is `required`, so the
    // browser blocked the submit instead of the admin filling the value in.
    const identity = deriveIdentity({
      mode: 'new',
      title: '',
      lang: 'zh',
      typedBody: '',
      now: new Date('2026-09-09T12:00:00Z'),
    });

    assert.equal(identity.slug, 'zh/2026-09-09');
    assert.equal(identity.translationKey, '2026-09-09');
  });

  it('never lets either identifier come out empty', () => {
    for (const title of ['', '   ', '从一张白纸重新开始', '!!!', '---']) {
      for (const typedBody of ['', '   ']) {
        const identity = deriveIdentity({
          mode: 'new',
          title,
          lang: 'ja',
          typedBody,
          now: new Date('2026-09-09T12:00:00Z'),
        });

        assert.notEqual(identity.slug, 'ja/', `${JSON.stringify(title)} produced a bare prefix`);
        assert.ok(identity.translationKey.length > 0);
      }
    }
  });

  it('keeps the key equal to the slug body it will actually publish under', () => {
    // These drifted apart once: clearing the slug left the key holding a value
    // derived from the slug that used to be there, so the note under the field
    // described a group the article would not join.
    for (const typedBody of ['', 'chosen-by-hand', '  spaced  ']) {
      const identity = deriveIdentity({
        mode: 'new',
        title: 'A title',
        lang: 'en',
        typedBody,
        now: new Date('2026-09-09T12:00:00Z'),
      });

      assert.equal(identity.slug, `en/${identity.translationKey}`);
    }
  });

  it('prefers what the author typed over what the title suggests', () => {
    const identity = deriveIdentity({
      mode: 'new',
      title: 'Beginning again',
      lang: 'zh',
      typedBody: 'first-light',
      now: new Date('2026-09-09T12:00:00Z'),
    });

    assert.equal(identity.slug, 'zh/first-light');
  });

  it('takes both identifiers from the source when translating', () => {
    const identity = deriveIdentity({
      mode: 'translation',
      title: '無題',
      lang: 'ja',
      typedBody: '',
      source: { translationKey: 'moriium-reconstruction', slug: 'zh/moriium-reconstruction' },
      now: new Date('2026-09-09T12:00:00Z'),
    });

    assert.equal(identity.slug, 'ja/moriium-reconstruction');
    assert.equal(identity.translationKey, 'moriium-reconstruction');
  });

  it('offers only the languages the group is still missing', () => {
    const articles = [
      { translationKey: 'first-light', lang: 'zh' },
      { translationKey: 'first-light', lang: 'ja' },
      { translationKey: 'other', lang: 'en' },
    ];

    assert.deepEqual(languagesLeftInGroup(articles, 'first-light'), ['en']);
    assert.deepEqual(languagesLeftInGroup(articles, 'other'), ['zh', 'ja']);
    assert.deepEqual(languagesLeftInGroup(articles, 'unused'), ['zh', 'ja', 'en']);
  });
});

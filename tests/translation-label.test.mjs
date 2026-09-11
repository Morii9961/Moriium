// AGENTS.md permits a machine-translated variant only when it says so, and an
// unlabelled one is treated as fabricated. "Says so" is not one place: a reader
// meets the article on its page and in a feed, and a feed reader renders only
// the title and the description. This checks every surface the rule covers, so
// adding a fourth surface without a label fails here rather than in public.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';
import { toMarkdownFile } from '../src/server/export/frontmatter.ts';

const root = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

const article = {
  id: 2,
  translationKey: 'first-light',
  lang: 'ja',
  slug: 'ja/first-light',
  createdAt: '2026-09-09T00:00:00.000Z',
  publishedVersionId: 5,
  liveVersionId: null,
  machineTranslatedFrom: 'zh',
};

const version = {
  id: 5,
  articleId: 2,
  authorId: 1,
  kind: 'manual',
  createdAt: '2026-09-09T00:00:00.000Z',
  title: '第一の光',
  summary: '概要。',
  publishedAt: '2026-09-09T00:00:00.000Z',
  updatedAt: null,
  category: '随笔',
  tags: [],
  cover: null,
  coverAlt: null,
  draft: false,
  unlisted: false,
  copyProtection: false,
  markdown: '本文。',
  editorJson: null,
};

describe('the machine-translation label reaches every surface', () => {
  it('is written into the exported frontmatter', () => {
    const file = toMarkdownFile(article, version);

    assert.match(file, /^machineTranslation: "zh"$/m);
  });

  it('is absent from an article a person wrote', () => {
    // Emitting the key with a null value would put the field on every article
    // and make the notice depend on reading its value rather than its presence.
    const file = toMarkdownFile({ ...article, machineTranslatedFrom: null }, version);

    assert.doesNotMatch(file, /machineTranslation/);
  });

  it('is declared by the content schema, so the public build can read it', () => {
    const schema = read('src/content-schema.ts');

    assert.match(schema, /machineTranslation: language\.optional\(\)/);
  });

  it('renders a notice on the article page, conditioned on the field', () => {
    const layout = read('src/layouts/ArticleLayout.astro');

    assert.match(layout, /post\.data\.machineTranslation && \(/);
    assert.match(layout, /a-article__machine-translation/);
    // One notice per interface language, or two of the three would show
    // Chinese to readers who came for the other two.
    for (const fragment of ['本文由机器翻译', '機械翻訳されたもの', 'machine translated from the Chinese']) {
      assert.ok(layout.includes(fragment), `the article page is missing: ${fragment}`);
    }
  });

  it('marks the feed item, which is all a subscriber ever sees', () => {
    const feed = read('src/pages/[lang]/rss.xml.ts');

    assert.match(feed, /post\.data\.machineTranslation/);
    assert.match(feed, /machineTranslatedFeed/);
  });

  it('has a feed marker in each interface language', () => {
    const site = read('src/data/site.ts');
    const markers = [...site.matchAll(/machineTranslatedFeed: '([^']+)'/g)].map((match) => match[1]);

    assert.equal(markers.length, 3, `expected one marker per language, found ${markers.join(', ')}`);
    for (const marker of markers) assert.ok(marker.trim().length > 0);
  });

  it('has a style that does not hide it', () => {
    const css = read('src/styles/public-reading.css');
    const block = /\.a-article__machine-translation\s*\{([^}]*)\}/.exec(css);

    assert.ok(block, 'the notice must be styled rather than inheriting nothing');
    // `font-size: 0` means zero, not `0.8125rem`, so the digit has to be the
    // whole value rather than the start of one.
    assert.doesNotMatch(block[1], /display:\s*none|visibility:\s*hidden|font-size:\s*0\s*[;}]/);
  });
});

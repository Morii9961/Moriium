// The byline, end to end.
//
// Two people write here, and the byline is the only thing that says which of
// them wrote a given article. It crosses five boundaries on the way to a reader
// -- the content schema, the database, the write API, the export and the page
// -- and a field that is dropped at any one of them does not fail loudly: the
// article simply comes out as Morii's, which is also what the default says. So
// each crossing is checked with Enouia, the value a silent drop would erase.

import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { parseFrontmatter } from '@astrojs/markdown-remark';
import { publicPostMetadataSchema, protectedPostMetadataSchema } from '../src/content-schema.ts';
import { createAccount } from '../src/server/accounts.ts';
import { ArticleStore } from '../src/server/articles.ts';
import { openDatabase } from '../src/server/db/open.ts';
import { toMarkdownFile } from '../src/server/export/frontmatter.ts';
import { publicOutputRoot } from '../scripts/lib/public-output.mjs';

const directory = mkdtempSync(join(tmpdir(), 'moriium-byline-'));
const opened = [];
after(() => {
  for (const db of opened) db.close();
  rmSync(directory, { recursive: true, force: true });
});

let counter = 0;
async function freshStore() {
  counter += 1;
  const db = openDatabase(join(directory, `byline-${counter}.db`), {
    now: () => '2026-09-13T00:00:00.000Z',
  });
  opened.push(db);
  const account = await createAccount(db, { name: 'Morii', password: 'a'.repeat(30) }, () => '2026-09-13T00:00:00.000Z');
  return { db, store: new ArticleStore(db, () => '2026-09-13T00:00:00.000Z'), account };
}

function fields(overrides = {}) {
  return {
    title: '茶馆里的一个下午',
    summary: '一篇短文。',
    publishedAt: '2025-10-20T16:00:00+08:00',
    updatedAt: null,
    category: '生活随笔',
    tags: [],
    cover: null,
    coverAlt: null,
    draft: false,
    unlisted: false,
    copyProtection: false,
    author: 'Enouia',
    markdown: '正文。\n',
    editorJson: null,
    ...overrides,
  };
}

const base = {
  title: 't',
  slug: 'zh/t',
  summary: 's',
  publishedAt: '2026-01-01',
  lang: 'zh',
  translationKey: 't',
  category: 'c',
};

describe('the byline', () => {
  it('is one of the two authors, and Morii when an article does not say', () => {
    assert.equal(publicPostMetadataSchema.parse(base).author, 'Morii');
    assert.equal(publicPostMetadataSchema.parse({ ...base, author: 'Enouia' }).author, 'Enouia');
    assert.throws(() => publicPostMetadataSchema.parse({ ...base, author: 'someone else' }));
    // A protected article's byline is public metadata like its title.
    assert.ok(Object.hasOwn(protectedPostMetadataSchema.shape, 'author'));
  });

  it('survives the database, and the database refuses a name it does not know', async () => {
    const { db, store, account } = await freshStore();
    const article = store.createArticle({
      translationKey: 'tea-house', lang: 'zh', slug: 'zh/tea-house', authorId: account.id, ...fields(),
    });
    // Saved by Morii's account, credited to Enouia: the two are not the same thing.
    const version = store.getLatest(article.id);
    assert.equal(version.author, 'Enouia');
    assert.equal(version.authorId, account.id);

    assert.throws(
      () => db.prepare("UPDATE versions SET author = 'Nobody' WHERE id = ?").run(version.id),
      /CHECK constraint failed/,
    );
  });

  it('is written into the exported Markdown and read back unchanged', async () => {
    const { store, account } = await freshStore();
    const article = store.createArticle({
      translationKey: 'tea-house', lang: 'zh', slug: 'zh/tea-house', authorId: account.id, ...fields(),
    });
    const file = toMarkdownFile(store.getArticle(article.id), store.getLatest(article.id));
    const { frontmatter } = parseFrontmatter(file);
    assert.equal(frontmatter.author, 'Enouia');
    assert.equal(publicPostMetadataSchema.parse(frontmatter).author, 'Enouia');
  });

  it('reaches the reader, and names the real author to machines too', () => {
    // Every published article, whoever wrote it: the byline on the page and in
    // the structured data is the one its frontmatter names, or Morii by default.
    const root = join('src', 'content', 'posts');
    const files = readdirSync(root, { recursive: true }).filter((file) => String(file).endsWith('.md'));
    let checked = 0;
    for (const file of files) {
      const { frontmatter } = parseFrontmatter(readFileSync(join(root, String(file)), 'utf8'));
      if (frontmatter.draft) continue;
      const [lang, slug] = String(frontmatter.slug).split('/');
      const page = join(publicOutputRoot(), lang, 'posts', slug, 'index.html');
      assert.ok(existsSync(page), `run \`pnpm build\` before this assertion (${page})`);
      const html = readFileSync(page, 'utf8');
      const author = frontmatter.author ?? 'Morii';
      const label = { zh: '作者', ja: '著者', en: 'Author' }[lang];

      assert.ok(html.includes(`<dt>${label}</dt><dd>${author}</dd>`), `${file} does not name ${author} on the page`);
      const structured = JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)[1]);
      assert.equal(structured.author.name, author, `${file} names the wrong author to machines`);
      // The site, which publishes both, is still the publisher.
      assert.equal(structured.publisher.name, 'Morii');
      checked += 1;
    }
    assert.ok(checked > 0, 'no published article was checked');
  });
});

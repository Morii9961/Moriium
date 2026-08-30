// The export step: the database's published pointers, projected onto disk.
//
// ADR 0002 sections 4.2, 8.2 and 15.3. The acceptance criteria for this block
// are about failure ordering, not about the happy path, so most of what is
// below is an attempt to get something into the export tree that has no
// business being there -- an autosave, an unsanitized image, a half-written
// file -- or to make a failure damage the previous export.

import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { parseFrontmatter } from '@astrojs/markdown-remark';
import sharp from 'sharp';
import { createAccount } from '../src/server/accounts.ts';
import { ArticleStore } from '../src/server/articles.ts';
import { openDatabase } from '../src/server/db/open.ts';
import { isAdminError } from '../src/server/errors.ts';
import { exportPublished, MANIFEST_NAME } from '../src/server/export/content-export.ts';
import { exportPathFor, toMarkdownFile } from '../src/server/export/frontmatter.ts';
import { MediaStore } from '../src/server/media/assets.ts';
import { importImage } from '../src/server/media/import.ts';
import { fileForPublicPath } from '../src/server/media/storage.ts';
import { preparePublishValidator } from '../src/server/publishing/publish-gate.ts';

let directory;
const opened = [];
let counter = 0;

before(() => {
  directory = mkdtempSync(join(tmpdir(), 'moriium-export-'));
});

after(() => {
  while (opened.length > 0) opened.pop().close();
  rmSync(directory, { recursive: true, force: true });
});

/** One isolated database, export root and media root per test. */
async function workspace() {
  counter += 1;
  let tick = 0;
  const now = () => new Date(Date.UTC(2026, 0, 1, 0, 0, tick++)).toISOString();
  const db = openDatabase(join(directory, `export-${counter}.db`), { now });
  opened.push(db);
  const morii = await createAccount(db, { name: 'Morii', password: 'a'.repeat(30) }, now);
  return {
    db,
    morii,
    store: new ArticleStore(db, now),
    media: new MediaStore(db, now),
    root: join(directory, `root-${counter}`),
    mediaRoot: join(directory, `media-${counter}`),
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

function createPublished(context, { slug = 'zh/tide-notes', lang = 'zh', translationKey = 'tide-notes', ...overrides } = {}) {
  const article = context.store.createArticle({
    translationKey,
    lang,
    slug,
    authorId: context.morii.id,
    ...fields(overrides),
  });
  const version = context.store.getLatest(article.id);
  context.store.publish(article.id, version.id, { actorId: context.morii.id });
  return { article, version };
}

function run(context) {
  return exportPublished({
    store: context.store,
    media: context.media,
    root: context.root,
    mediaRoot: context.mediaRoot,
  });
}

/** Every file in the export, as path -> bytes, so two runs can be compared. */
function treeOf(base) {
  const files = new Map();
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else files.set(relative(base, full).split(sep).join('/'), readFileSync(full));
    }
  };
  walk(base);
  return files;
}

async function photograph() {
  return sharp({
    create: { width: 60, height: 40, channels: 3, background: { r: 12, g: 90, b: 140 } },
  })
    .jpeg()
    .toBuffer();
}

describe('exporting published content', () => {
  it('writes the published version and leaves drafts out', async () => {
    const context = await workspace();
    const { article, version } = createPublished(context);
    context.store.createArticle({
      translationKey: 'unfinished',
      lang: 'en',
      slug: 'en/unfinished',
      authorId: context.morii.id,
      ...fields(),
    });

    const result = await run(context);

    assert.equal(result.articles.length, 1);
    assert.equal(result.articles[0].versionId, version.id);
    const file = join(result.directory, exportPathFor(article));
    assert.equal(readFileSync(file, 'utf8'), toMarkdownFile(article, version));
    assert.equal(existsSync(join(result.directory, 'posts/en/unfinished.md')), false);
  });

  it('exports the published version even when a newer autosave exists', async () => {
    const context = await workspace();
    const { article, version } = createPublished(context);
    context.store.autosave(article.id, {
      ...fields({ markdown: '这一段还没有发布。\n' }),
      authorId: context.morii.id,
    });

    const result = await run(context);
    const written = readFileSync(join(result.directory, exportPathFor(article)), 'utf8');

    assert.match(written, /正文。/);
    assert.doesNotMatch(written, /还没有发布/);
    assert.equal(result.articles[0].versionId, version.id);
  });

  it('does not record anything as live', async () => {
    const context = await workspace();
    const { article } = createPublished(context);

    await run(context);

    assert.equal(context.store.getArticle(article.id).liveVersionId, null);
    assert.equal(context.store.isAwaitingExport(article.id), true);
  });

  it('produces identical bytes when run twice on the same state', async () => {
    const context = await workspace();
    createPublished(context);

    const first = treeOf((await run(context)).directory);
    const second = treeOf((await run(context)).directory);

    assert.deepEqual([...second.keys()].sort(), [...first.keys()].sort());
    for (const [path, bytes] of first) {
      assert.equal(Buffer.compare(bytes, second.get(path)), 0, `${path} changed between exports`);
    }
  });

  it('drops an article from the next export once it is unpublished', async () => {
    const context = await workspace();
    const { article } = createPublished(context);
    const before = await run(context);
    assert.equal(existsSync(join(before.directory, exportPathFor(article))), true);

    context.store.unpublish(article.id, { actorId: context.morii.id });
    const after = await run(context);

    assert.equal(after.articles.length, 0);
    assert.equal(existsSync(join(after.directory, exportPathFor(article))), false);
  });

  it('exports the version a rollback pointed at, not the newest one', async () => {
    const context = await workspace();
    const { article, version } = createPublished(context);
    const second = context.store.saveVersion(article.id, {
      ...fields({ title: '第二稿' }),
      authorId: context.morii.id,
    });
    context.store.publish(article.id, second.id, { actorId: context.morii.id });
    context.store.rollback(article.id, version.id, { actorId: context.morii.id });

    const result = await run(context);
    const written = readFileSync(join(result.directory, exportPathFor(article)), 'utf8');

    assert.match(written, /"潮汐笔记"/);
    assert.doesNotMatch(written, /第二稿/);
  });

  it('keeps a title that would break unquoted YAML readable as one value', async () => {
    const context = await workspace();
    const hostile = '# 标题: "引号", 换行\n第二行 - 还有短横线';
    const { article } = createPublished(context, { title: hostile });

    const result = await run(context);
    const written = readFileSync(join(result.directory, exportPathFor(article)), 'utf8');
    const line = written.split('\n').find((candidate) => candidate.startsWith('title: '));

    // The emitted scalar is a JSON string, so parsing it back is the whole
    // round trip: nothing was dropped, split across lines, or re-interpreted.
    assert.equal(JSON.parse(line.slice('title: '.length)), hostile);
    assert.equal(written.split('\n').filter((candidate) => candidate === '---').length, 2);
  });

  it('reads back through the same frontmatter parser the build uses', async () => {
    const context = await workspace();
    const hostile = '# 标题: "引号"\n第二行 - 短横线 %百分号';
    const { article, version } = createPublished(context, {
      title: hostile,
      updatedAt: '2026-04-01T09:00:00+08:00',
      tags: ['夹具', 'Moriium'],
      unlisted: true,
      markdown: '正文第一段。\n\n```md\n![示例](/media/example.webp)\n```\n',
    });

    const result = await run(context);
    // parseFrontmatter is what scripts/validate-content.mjs and the Astro
    // content loader both use, so this is the real parser rather than a second
    // implementation agreeing with the first.
    const parsed = parseFrontmatter(readFileSync(join(result.directory, exportPathFor(article)), 'utf8'));

    assert.equal(parsed.frontmatter.title, hostile);
    assert.equal(parsed.frontmatter.slug, article.slug);
    assert.equal(parsed.frontmatter.summary, version.summary);
    assert.equal(parsed.frontmatter.publishedAt, version.publishedAt);
    assert.equal(parsed.frontmatter.updatedAt, '2026-04-01T09:00:00+08:00');
    assert.equal(parsed.frontmatter.lang, 'zh');
    assert.equal(parsed.frontmatter.translationKey, article.translationKey);
    assert.equal(parsed.frontmatter.category, version.category);
    assert.deepEqual(parsed.frontmatter.tags, ['Moriium', '夹具']);
    assert.equal(parsed.frontmatter.draft, false);
    assert.equal(parsed.frontmatter.unlisted, true);
    assert.equal(parsed.frontmatter.copyProtection, false);
    assert.equal(parsed.content.trim(), version.markdown.trim());
  });

  it('emits an empty tag list the parser reads as an empty array', async () => {
    const context = await workspace();
    const { article } = createPublished(context, { tags: [] });

    const result = await run(context);
    const parsed = parseFrontmatter(readFileSync(join(result.directory, exportPathFor(article)), 'utf8'));

    assert.deepEqual(parsed.frontmatter.tags, []);
  });

  it('emits cover and coverAlt together and projects the cover file', async () => {
    const context = await workspace();
    const cover = await importImage(
      context.media,
      { data: await photograph(), filename: 'cover.jpg', alt: '滩涂', group: 'tide' },
      { root: context.mediaRoot },
    );
    const { article } = createPublished(context, { cover: cover.publicPath, coverAlt: '滩涂' });

    const result = await run(context);
    const parsed = parseFrontmatter(readFileSync(join(result.directory, exportPathFor(article)), 'utf8'));

    assert.equal(parsed.frontmatter.cover, cover.publicPath);
    assert.equal(parsed.frontmatter.coverAlt, '滩涂');
    // A cover is a reader-facing image that never appears in the body, so the
    // export has to find it through the version rather than through Markdown.
    assert.equal(
      existsSync(join(result.directory, 'media', cover.publicPath.replace('/media/', ''))),
      true,
    );
  });
});

describe('exporting media', () => {
  async function withImage(context, overrides = {}) {
    const asset = await importImage(
      context.media,
      { data: await photograph(), filename: 'tide.jpg', alt: '退潮后的滩涂', group: 'tide' },
      { root: context.mediaRoot },
    );
    const unused = await importImage(
      context.media,
      { data: await sharp({ create: { width: 20, height: 20, channels: 3, background: { r: 200, g: 40, b: 40 } } }).jpeg().toBuffer(),
        filename: 'unused.jpg', alt: '没有被任何文章引用' },
      { root: context.mediaRoot },
    );
    const article = context.store.createArticle({
      translationKey: 'tide-notes',
      lang: 'zh',
      slug: 'zh/tide-notes',
      authorId: context.morii.id,
      ...fields({ markdown: `正文。\n\n![退潮后的滩涂](${asset.publicPath})\n`, ...overrides }),
    });
    const version = context.store.getLatest(article.id);
    const validate = await preparePublishValidator(context.store, context.db, version);
    context.store.publish(article.id, version.id, { actorId: context.morii.id, validate });
    return { article, version, asset, unused };
  }

  it('projects only the media published articles reference', async () => {
    const context = await workspace();
    const { asset, unused } = await withImage(context);

    const result = await run(context);

    assert.deepEqual(
      result.media.map((entry) => entry.publicPath),
      [asset.publicPath],
    );
    const projected = join(result.directory, 'media', asset.publicPath.replace('/media/', ''));
    assert.equal(
      Buffer.compare(readFileSync(projected), readFileSync(fileForPublicPath(asset.publicPath, context.mediaRoot))),
      0,
    );
    assert.equal(
      existsSync(join(result.directory, 'media', unused.publicPath.replace('/media/', ''))),
      false,
    );
  });

  it('generates the manifest from the database rather than a written file', async () => {
    const context = await workspace();
    const { asset } = await withImage(context);

    const result = await run(context);
    const manifest = JSON.parse(readFileSync(join(result.directory, MANIFEST_NAME), 'utf8'));

    assert.equal(manifest.assets.length, 1);
    assert.equal(manifest.assets[0].publicPath, asset.publicPath);
    assert.equal(manifest.assets[0].alt, '退潮后的滩涂');
    assert.equal(manifest.assets[0].format, 'webp');
    assert.deepEqual(manifest.assets[0].exif, {});
  });

  it('refuses an asset whose sanitization was undone after publication', async () => {
    const context = await workspace();
    const { asset } = await withImage(context);
    await run(context);
    context.db
      .prepare('UPDATE media_assets SET sanitized_at = NULL WHERE public_path = ?')
      .run(asset.publicPath);

    await assert.rejects(run(context), (error) => {
      assert.equal(isAdminError(error), true);
      assert.equal(error.code, 'export-failed');
      return true;
    });
  });

  it('leaves the previous export in place when a published image is missing', async () => {
    const context = await workspace();
    const { asset } = await withImage(context);
    const good = treeOf((await run(context)).directory);
    rmSync(fileForPublicPath(asset.publicPath, context.mediaRoot), { force: true });

    await assert.rejects(run(context), (error) => error.code === 'export-failed');

    const current = join(context.root, 'current');
    const kept = treeOf(current);
    assert.deepEqual([...kept.keys()].sort(), [...good.keys()].sort());
    for (const [path, bytes] of good) {
      assert.equal(Buffer.compare(bytes, kept.get(path)), 0, `${path} was damaged by the failure`);
    }
    assert.equal(existsSync(join(context.root, 'staging')), false);
  });
});

describe('promoting an export', () => {
  it('recovers an export interrupted between its two renames', async () => {
    const context = await workspace();
    const { article, version } = createPublished(context);
    await run(context);

    // Exactly the state a process killed inside the promote window leaves
    // behind: the last good export sitting in previous/, no current/.
    renameSync(join(context.root, 'current'), join(context.root, 'previous'));
    const result = await run(context);

    assert.equal(existsSync(join(context.root, 'previous')), false);
    assert.equal(
      readFileSync(join(result.directory, exportPathFor(article)), 'utf8'),
      toMarkdownFile(article, version),
    );
  });

  it('removes an abandoned staging directory instead of reusing it', async () => {
    const context = await workspace();
    createPublished(context);
    await run(context);
    const staging = join(context.root, 'staging');
    const stale = join(staging, 'posts', 'zh', 'left-behind.md');
    mkdirSync(join(staging, 'posts', 'zh'), { recursive: true });
    writeFileSync(stale, '这是上一次失败留下的。\n', 'utf8');

    const result = await run(context);

    assert.equal(existsSync(stale), false);
    assert.equal(existsSync(join(result.directory, 'posts/zh/left-behind.md')), false);
  });
});

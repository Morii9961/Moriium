// The release state machine: export, stage, build, check, switch, probe,
// record, prune (ADR 0002 section 15.3).
//
// The acceptance criteria for this block are about failure ORDER, so the tests
// are built to break the order rather than to walk it. Commands, the symlink
// and the HTTP probe are faked -- a unit test must not run pnpm, replace a
// symlink or open a socket -- and everything else runs against the real
// filesystem, including staging, the built-release copy, the servability
// checks and pruning.
//
// The fake build reads the staged posts and writes one page per article. That
// is deliberate: a test whose build ignores its input could not tell staging
// from luck.

import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:http';
import process from 'node:process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { parseFrontmatter } from '@astrojs/markdown-remark';
import { createAccount } from '../src/server/accounts.ts';
import { ArticleStore } from '../src/server/articles.ts';
import { openDatabase } from '../src/server/db/open.ts';
import { MediaStore } from '../src/server/media/assets.ts';
import { installIsNeeded, releaseSite, STAGED_POSTS_DIRECTORY } from '../src/server/release/release.ts';
import { nodeReleaseHost } from '../src/server/release/host.ts';
import { parseReleaseCommand } from '../scripts/release-site.mjs';

let directory;
const opened = [];
let counter = 0;

before(() => {
  directory = mkdtempSync(join(tmpdir(), 'moriium-release-'));
});

after(() => {
  while (opened.length > 0) opened.pop().close();
  rmSync(directory, { recursive: true, force: true });
});

function fields(overrides = {}) {
  return {
    title: '潮汐笔记',
    summary: '为了拍到退潮后的滩涂写的推算脚本。',
    publishedAt: '2026-03-14T21:40:00+08:00',
    updatedAt: null,
    category: '工程夹具',
    tags: ['夹具'],
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

async function workspace() {
  counter += 1;
  let tick = 0;
  const now = () => new Date(Date.UTC(2026, 0, 1, 0, 0, tick++)).toISOString();
  const db = openDatabase(join(directory, `release-${counter}.db`), { now });
  opened.push(db);
  const morii = await createAccount(db, { name: 'Morii', password: 'a'.repeat(30) }, now);
  const store = new ArticleStore(db, now);

  const base = join(directory, `site-${counter}`);
  const paths = {
    workspace: join(base, 'workspace'),
    releases: join(base, 'releases'),
    current: join(base, 'current'),
  };
  mkdirSync(paths.workspace, { recursive: true });
  writeFileSync(join(paths.workspace, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n', 'utf8');

  return {
    db,
    morii,
    store,
    media: new MediaStore(db, now),
    paths,
    contentRoot: join(base, 'content'),
    mediaRoot: join(base, 'media'),
  };
}

function publish(context, overrides = {}) {
  const { slug = 'zh/tide-notes', lang = 'zh', translationKey = 'tide-notes', ...rest } = overrides;
  const article = context.store.createArticle({
    translationKey,
    lang,
    slug,
    authorId: context.morii.id,
    ...fields(rest),
  });
  const version = context.store.getLatest(article.id);
  context.store.publish(article.id, version.id, { actorId: context.morii.id });
  return { article, version };
}

/** Writes what a real build would produce, from what staging actually left behind. */
function fakeBuild(workspacePath, { skipArticlePages = false, emptyHome = false } = {}) {
  const client = join(workspacePath, 'dist', 'client');
  rmSync(client, { recursive: true, force: true });
  for (const language of ['zh', 'ja', 'en']) {
    mkdirSync(join(client, language), { recursive: true });
    writeFileSync(
      join(client, language, 'index.html'),
      emptyHome && language === 'zh' ? '' : `<html><head><title>Moriium</title></head><body></body></html>`,
      'utf8',
    );
  }
  writeFileSync(join(client, 'sitemap-index.xml'), '<sitemapindex/>', 'utf8');

  if (skipArticlePages) return;
  const staged = join(workspacePath, 'src', 'content', 'posts', STAGED_POSTS_DIRECTORY);
  if (!existsSync(staged)) return;
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.name.endsWith('.md')) continue;
      const { frontmatter } = parseFrontmatter(readFileSync(full, 'utf8'));
      const tail = String(frontmatter.slug).replace(/^(zh|ja|en)\//, '');
      const page = join(client, frontmatter.lang, 'posts', tail);
      mkdirSync(page, { recursive: true });
      writeFileSync(join(page, 'index.html'), `<title>${frontmatter.title}</title>`, 'utf8');
    }
  };
  walk(staged);
}

/**
 * A host that records what it was asked to do.
 *
 * `fail` names a command that should throw, so a test can put the failure at
 * one exact point in the sequence and assert everything downstream is untouched.
 */
function fakeHost({ fail = null, probeFails = false, build = {} } = {}) {
  const links = new Map();
  const calls = [];
  return {
    calls,
    links,
    run(command, args, cwd) {
      const label = [command, ...args].join(' ');
      calls.push(label);
      if (fail && label.includes(fail)) throw new Error(`${label} failed`);
      if (label === 'pnpm build') fakeBuild(cwd, build);
      if (label === 'pnpm install --frozen-lockfile') {
        mkdirSync(join(cwd, 'node_modules'), { recursive: true });
      }
    },
    linkTarget(link) {
      return links.get(link) ?? null;
    },
    switchLink(link, target) {
      calls.push(`link ${target}`);
      links.set(link, target);
    },
    async probe(url) {
      calls.push(`probe ${url}`);
      if (probeFails) throw new Error('the site did not answer');
    },
  };
}

function release(context, host, overrides = {}) {
  return releaseSite({
    store: context.store,
    media: context.media,
    host,
    paths: context.paths,
    id: 'r1',
    probeUrl: 'https://example.invalid/zh/',
    contentRoot: context.contentRoot,
    mediaRoot: context.mediaRoot,
    ...overrides,
  });
}

describe('a release that succeeds', () => {
  it('records live versions only after the probe answers', async () => {
    const context = await workspace();
    const { article, version } = publish(context);
    const host = fakeHost();

    const result = await release(context, host);

    assert.equal(result.stage, 'pruned');
    assert.equal(context.store.getArticle(article.id).liveVersionId, version.id);
    assert.equal(context.store.isAwaitingExport(article.id), false);
    // The probe has to come before anything is recorded, so its position in the
    // call list is the assertion.
    const probeIndex = host.calls.findIndex((call) => call.startsWith('probe '));
    const linkIndex = host.calls.findIndex((call) => call.startsWith('link '));
    assert.ok(linkIndex >= 0 && probeIndex > linkIndex);
  });

  it('stages the export into its own directory and builds from it', async () => {
    const context = await workspace();
    publish(context);
    const staged = join(context.paths.workspace, 'src', 'content', 'posts', STAGED_POSTS_DIRECTORY);
    mkdirSync(join(staged, 'zh'), { recursive: true });
    writeFileSync(join(staged, 'zh', 'gone.md'), '---\ntitle: "旧"\n---\n', 'utf8');

    const result = await release(context, fakeHost());

    assert.equal(existsSync(join(staged, 'zh', 'tide-notes.md')), true);
    // A file from a previous export must not survive into this one.
    assert.equal(existsSync(join(staged, 'zh', 'gone.md')), false);
    assert.equal(existsSync(join(result.directory, 'zh', 'posts', 'tide-notes', 'index.html')), true);
  });

  it('clears the live pointer of an article that was unpublished', async () => {
    const context = await workspace();
    const { article } = publish(context);
    await release(context, fakeHost());
    context.store.unpublish(article.id, { actorId: context.morii.id });

    await release(context, fakeHost(), { id: 'r2' });

    assert.equal(context.store.getArticle(article.id).liveVersionId, null);
    assert.equal(context.store.isAwaitingExport(article.id), false);
  });

  it('installs only when the lockfile has moved', async () => {
    const context = await workspace();
    publish(context);

    const first = fakeHost();
    await release(context, first);
    assert.ok(first.calls.includes('pnpm install --frozen-lockfile'));
    assert.equal(installIsNeeded(context.paths.workspace), false);

    const second = fakeHost();
    await release(context, second, { id: 'r2' });
    assert.equal(second.calls.includes('pnpm install --frozen-lockfile'), false);

    writeFileSync(join(context.paths.workspace, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n# moved\n', 'utf8');
    assert.equal(installIsNeeded(context.paths.workspace), true);
  });

  it('refuses a workspace that does not exist', async () => {
    const context = await workspace();
    publish(context);
    const paths = { ...context.paths, workspace: join(context.paths.workspace, 'typo') };

    await assert.rejects(release(context, fakeHost(), { paths }), (error) => {
      assert.equal(error.code, 'release-failed');
      assert.match(error.userMessage, /workspace directory does not exist/);
      return true;
    });
  });

  it('refuses a release id that is a path rather than a name', async () => {
    const context = await workspace();
    publish(context);

    await assert.rejects(release(context, fakeHost(), { id: '../escape' }), (error) => {
      assert.equal(error.code, 'release-failed');
      assert.match(error.userMessage, /plain name/);
      return true;
    });
  });
});

describe('a release that fails before the switch', () => {
  async function failingAt(fail, build = {}) {
    const context = await workspace();
    const { article, version } = publish(context);
    const first = fakeHost();
    await release(context, first);
    const served = first.links.get(context.paths.current);

    const host = fakeHost({ fail, build });
    host.links.set(context.paths.current, served);
    const failure = await release(context, host, { id: 'r2' }).then(
      () => null,
      (error) => error,
    );

    return { context, article, version, host, served, failure };
  }

  it('leaves the served release and the live pointers alone when the build fails', async () => {
    const { context, article, version, host, served, failure } = await failingAt('pnpm build');

    assert.equal(failure.code, 'release-failed');
    assert.match(failure.userMessage, /stopped after "installed"/);
    assert.equal(host.links.get(context.paths.current), served);
    assert.equal(context.store.getArticle(article.id).liveVersionId, version.id);
  });

  it('leaves them alone when a pre-live check fails', async () => {
    const { context, host, served, failure } = await failingAt('check-render-split');

    assert.match(failure.userMessage, /stopped after "built"/);
    assert.equal(host.links.get(context.paths.current), served);
    assert.equal(host.calls.some((call) => call.startsWith('link ')), false);
  });

  it('refuses a build that dropped an exported article', async () => {
    const { context, host, served, failure } = await failingAt(null, { skipArticlePages: true });

    assert.match(failure.userMessage, /stopped after "checked"/);
    assert.match(failure.userMessage, /zh\/tide-notes/);
    assert.equal(host.links.get(context.paths.current), served);
  });

  it('refuses a build whose home page is empty', async () => {
    const { context, host, served, failure } = await failingAt(null, { emptyHome: true });

    assert.match(failure.userMessage, /stopped after "checked"/);
    assert.equal(host.links.get(context.paths.current), served);
  });
});

describe('a release that switches but does not answer', () => {
  it('restores the previous release and records nothing', async () => {
    const context = await workspace();
    const { article, version } = publish(context);
    const first = fakeHost();
    await release(context, first);
    const served = first.links.get(context.paths.current);

    const host = fakeHost({ probeFails: true });
    host.links.set(context.paths.current, served);
    const failure = await release(context, host, { id: 'r2' }).then(
      () => null,
      (error) => error,
    );

    assert.match(failure.userMessage, /stopped after "switched"/);
    assert.match(failure.userMessage, /previous release was restored/);
    assert.equal(host.links.get(context.paths.current), served);
    assert.equal(context.store.getArticle(article.id).liveVersionId, version.id);
  });

  it('says so plainly when there is no previous release to restore', async () => {
    const context = await workspace();
    const { article } = publish(context);

    const host = fakeHost({ probeFails: true });
    const failure = await release(context, host).then(
      () => null,
      (error) => error,
    );

    assert.match(failure.userMessage, /no previous release to restore/);
    assert.equal(context.store.getArticle(article.id).liveVersionId, null);
    assert.equal(context.store.isAwaitingExport(article.id), true);
  });

  it('can be retried from the same published state without republishing', async () => {
    const context = await workspace();
    const { article, version } = publish(context);
    await release(context, fakeHost({ probeFails: true })).then(
      () => assert.fail('the first attempt should have failed'),
      () => {},
    );
    assert.equal(context.store.getArticle(article.id).liveVersionId, null);

    const result = await release(context, fakeHost(), { id: 'r2' });

    assert.equal(result.stage, 'pruned');
    assert.equal(context.store.getArticle(article.id).liveVersionId, version.id);
    assert.equal(context.store.listAudit(article.id).length, 1);
  });
});

describe('the real release host', () => {
  // Everything above fakes the host. These exercise the real one, because a
  // host that has never been run is a host whose first run is in production.
  // The symlink case needs a platform that will create one: Linux always will,
  // Windows only with developer mode, so it declares a skip rather than
  // silently passing on a machine that never tried.
  const linkSupport = (() => {
    try {
      const probe = join(directory, 'link-support');
      mkdirSync(probe, { recursive: true });
      symlinkSync(join(probe, 'target'), join(probe, 'link'));
      return null;
    } catch (error) {
      return `this platform refuses to create symbolic links (${error.code ?? 'unknown'})`;
    }
  })();

  it('turns a non-zero exit into a release failure', () => {
    const host = nodeReleaseHost();

    host.run(process.execPath, ['-e', 'process.exit(0)'], directory);
    assert.throws(() => host.run(process.execPath, ['-e', 'process.exit(3)'], directory), (error) => {
      assert.equal(error.code, 'release-failed');
      assert.match(error.userMessage, /exited 3/);
      return true;
    });
  });

  it('reports a command that could not be started at all', () => {
    const host = nodeReleaseHost();

    assert.throws(
      () => host.run(join(directory, 'no-such-binary'), [], directory),
      (error) => error.code === 'release-failed',
    );
  });

  it('accepts a 200 and refuses anything else', async () => {
    const host = nodeReleaseHost();
    let status = 200;
    const server = createServer((_request, response) => {
      response.writeHead(status, { 'content-type': 'text/html' });
      response.end('<html></html>');
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${server.address().port}/zh/`;

    try {
      await host.probe(url);
      status = 503;
      await assert.rejects(host.probe(url), (error) => {
        assert.equal(error.code, 'release-failed');
        assert.match(error.userMessage, /answered 503/);
        return true;
      });
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it('replaces the current link in one step', { skip: linkSupport }, () => {
    const host = nodeReleaseHost();
    const base = join(directory, 'switch');
    const first = join(base, 'releases', 'one');
    const second = join(base, 'releases', 'two');
    mkdirSync(first, { recursive: true });
    mkdirSync(second, { recursive: true });
    writeFileSync(join(first, 'index.html'), 'one', 'utf8');
    writeFileSync(join(second, 'index.html'), 'two', 'utf8');
    const link = join(base, 'current');

    assert.equal(host.linkTarget(link), null);
    host.switchLink(link, first);
    assert.equal(host.linkTarget(link), first);
    assert.equal(readFileSync(join(link, 'index.html'), 'utf8'), 'one');

    // The second switch happens over an existing link, which is the case that
    // matters: a release replaces a link, it does not create one.
    host.switchLink(link, second);
    assert.equal(host.linkTarget(link), second);
    assert.equal(readFileSync(join(link, 'index.html'), 'utf8'), 'two');
    assert.equal(existsSync(`${link}.next`), false);
  });
});

describe('the release command line', () => {
  const stamp = () => new Date(Date.UTC(2026, 7, 30, 13, 5, 0));

  it('derives every path from one release root', () => {
    const command = parseReleaseCommand(
      ['--id', '37af11d', '--root', '/var/www/moriium', '--url', 'https://example.test/zh/'],
      {},
      stamp,
    );

    assert.equal(command.id, '37af11d');
    assert.equal(command.paths.current, join('/var/www/moriium', 'current'));
    assert.equal(command.paths.releases, join('/var/www/moriium', 'releases'));
    assert.equal(command.paths.workspace, join('/var/www/moriium', 'workspace'));
    assert.equal(command.keep, 6);
  });

  it('names an author-triggered release after the moment it ran', () => {
    const command = parseReleaseCommand(['--url', 'https://example.test/zh/'], {}, stamp);

    assert.equal(command.id, '2026-08-30T13-05-00-000Z');
  });

  it('refuses to run without something to probe', () => {
    assert.throws(() => parseReleaseCommand([], {}, stamp), /probe URL is required/);
  });

  it('refuses a flag with no value and an unknown flag', () => {
    assert.throws(() => parseReleaseCommand(['--url'], {}, stamp), /needs a value/);
    assert.throws(() => parseReleaseCommand(['--force'], {}, stamp), /Unknown argument/);
  });
});

describe('retention', () => {
  it('keeps the newest releases and never removes the one being served', async () => {
    const context = await workspace();
    publish(context);
    const host = fakeHost();

    // Older releases, aged so the sort has something real to order.
    for (const [index, name] of ['old-1', 'old-2', 'old-3'].entries()) {
      const stale = join(context.paths.releases, name);
      mkdirSync(stale, { recursive: true });
      writeFileSync(join(stale, 'index.html'), '<html></html>', 'utf8');
      const when = new Date(Date.UTC(2026, 0, 1 + index)).getTime() / 1000;
      utimesSync(stale, when, when);
    }

    const result = await release(context, host, { keep: 2 });

    const remaining = readdirSync(context.paths.releases).sort();
    assert.equal(remaining.includes('r1'), true);
    assert.equal(remaining.length, 2);
    assert.equal(result.removed.length, 2);
    assert.ok(statSync(join(context.paths.releases, 'r1')).isDirectory());
  });
});

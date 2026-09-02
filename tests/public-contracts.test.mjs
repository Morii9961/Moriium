// What the built public site is allowed to tell an indexer.
//
// These assertions read dist/client, not astro.config.mjs. A sitemap filter can
// look correct in the config and still emit the wrong URLs, so the contract is
// checked against the artifact a reader and a crawler actually receive.
//
// Every expectation is derived from content frontmatter. Hardcoding the three
// current slugs would keep passing on the day a translation uses a different
// route segment, which is exactly the case the alternate rules exist for.

import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, extname, relative } from 'node:path';
import { describe, it, before } from 'node:test';
import { parseFrontmatter } from '@astrojs/markdown-remark';
import { publicOutputRoot, repoRoot } from '../scripts/lib/public-output.mjs';

const SITE = 'https://morii9961.top';
const out = publicOutputRoot();
const postsRoot = join(repoRoot, 'src/content/posts');
const LOCALE = { zh: 'zh-CN', ja: 'ja-JP', en: 'en-US' };

function filesUnder(directory, extension) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return filesUnder(path, extension);
    return extname(entry.name) === extension ? [path] : [];
  });
}

/** Public post metadata, read straight from the files the build reads. */
function readPosts() {
  return filesUnder(postsRoot, '.md').map((file) => {
    const { frontmatter } = parseFrontmatter(readFileSync(file, 'utf8'));
    const routeSlug = String(frontmatter.slug).replace(/^(zh|ja|en)\//, '');
    return {
      file: relative(repoRoot, file),
      lang: frontmatter.lang,
      translationKey: frontmatter.translationKey,
      draft: frontmatter.draft === true,
      unlisted: frontmatter.unlisted === true,
      path: `/${frontmatter.lang}/posts/${routeSlug}/`,
    };
  });
}

/** Protected posts carry ciphertext only; their metadata drives the same rules. */
function readProtected() {
  const root = join(repoRoot, 'src/content/protected');
  return filesUnder(root, '.json').map((file) => {
    const data = JSON.parse(readFileSync(file, 'utf8'));
    const routeSlug = String(data.slug).replace(/^(zh|ja|en)\//, '');
    return {
      file: relative(repoRoot, file),
      lang: data.lang,
      translationKey: data.translationKey,
      draft: data.draft === true,
      listed: data.listed === true,
      path: `/${data.lang}/protected/${routeSlug}/`,
    };
  });
}

const htmlFiles = (root) => filesUnder(root, '.html');
const posix = (path) => relative(out, path).split('\\').join('/');

let sitemap;
let sitemapUrls;
let posts;
let protectedPosts;

before(() => {
  assert.ok(
    existsSync(join(out, 'sitemap-0.xml')),
    'run `pnpm build` before these output-contract assertions',
  );
  sitemap = readFileSync(join(out, 'sitemap-0.xml'), 'utf8');
  sitemapUrls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => decodeURI(m[1]));
  posts = readPosts();
  protectedPosts = readProtected();
});

describe('the public index boundary', () => {
  it('keeps the author surface out of the reader sitemap', () => {
    const authorSurface = sitemapUrls.filter((url) => /\/(admin|api)\//.test(url));
    assert.deepEqual(authorSurface, [], 'the sitemap must not advertise /admin/ or /api/');
  });

  it('keeps design research out of the reader sitemap', () => {
    assert.deepEqual(sitemapUrls.filter((url) => url.includes('/design/')), []);
  });

  it('lists every listed post and no unlisted or draft post', () => {
    const listed = posts.filter((p) => !p.draft && !p.unlisted).map((p) => `${SITE}${p.path}`);
    const hidden = posts.filter((p) => p.draft || p.unlisted).map((p) => `${SITE}${p.path}`);

    assert.ok(listed.length > 0, 'the fixture set must contain at least one listed post');
    assert.ok(hidden.length > 0, 'the fixture set must contain at least one hidden post');

    for (const url of listed) assert.ok(sitemapUrls.includes(url), `sitemap is missing ${url}`);
    for (const url of hidden) assert.ok(!sitemapUrls.includes(url), `sitemap leaks ${url}`);
  });

  it('keeps unlisted and unpublished protected posts out of the sitemap', () => {
    for (const post of protectedPosts) {
      if (post.draft || !post.listed) {
        assert.ok(!sitemapUrls.includes(`${SITE}${post.path}`), `sitemap leaks ${post.path}`);
      }
    }
  });

  it('still builds an unlisted post as a directly reachable static page', () => {
    for (const post of posts.filter((p) => p.unlisted && !p.draft)) {
      assert.ok(
        existsSync(join(out, post.path, 'index.html')),
        `${post.path} must stay reachable by direct link`,
      );
    }
  });

  it('never prerenders the author surface into the reader tree', () => {
    assert.equal(existsSync(join(out, 'admin')), false);
    assert.equal(existsSync(join(out, 'api')), false);
  });
});

describe('design research pages', () => {
  it('are all noindex,nofollow', () => {
    const pages = htmlFiles(join(out, 'design'));
    assert.ok(pages.length > 0, 'the design study build is expected to exist this round');
    for (const page of pages) {
      assert.match(
        readFileSync(page, 'utf8'),
        /<meta name="robots" content="noindex,nofollow">/,
        `${posix(page)} is missing noindex,nofollow`,
      );
    }
  });

  it('are not reachable from any production page', () => {
    const production = htmlFiles(out).filter((file) => !posix(file).startsWith('design/'));
    for (const page of production) {
      assert.doesNotMatch(
        readFileSync(page, 'utf8'),
        /href="\/design\//,
        `${posix(page)} links into design research`,
      );
    }
  });
});

describe('the per-language reader indexes', () => {
  const expectedPaths = (lang) =>
    posts
      .filter((p) => p.lang === lang && !p.draft && !p.unlisted)
      .map((p) => p.path)
      .concat(protectedPosts.filter((p) => p.lang === lang && !p.draft && p.listed).map((p) => p.path))
      .sort();

  it('put only same-language listed posts in the search index', () => {
    for (const lang of ['zh', 'ja', 'en']) {
      const records = JSON.parse(readFileSync(join(out, 'search', `${lang}.json`), 'utf8'));
      const urls = records.map((record) => record.url).sort();
      assert.deepEqual(urls, expectedPaths(lang), `${lang} search index does not match listed metadata`);
    }
  });

  it('put only same-language listed posts in the feed', () => {
    for (const lang of ['zh', 'ja', 'en']) {
      const feed = readFileSync(join(out, lang, 'rss.xml'), 'utf8');
      const items = [...feed.matchAll(/<item>[\s\S]*?<link>([^<]+)<\/link>[\s\S]*?<\/item>/g)]
        .map((match) => decodeURI(match[1]).replace(SITE, ''))
        .sort();
      assert.deepEqual(items, expectedPaths(lang), `${lang} feed does not match listed metadata`);
      assert.match(feed, new RegExp(`<language>${LOCALE[lang]}</language>`), `${lang} feed declares the wrong language`);
    }
  });
});

describe('the three-language page head', () => {
  const head = (page) => readFileSync(join(out, page), 'utf8');

  it('declares the language of the page it is on', () => {
    for (const lang of ['zh', 'ja', 'en']) {
      assert.match(
        head(`${lang}/index.html`),
        new RegExp(`<html lang="${LOCALE[lang]}"`),
        `${lang} home does not declare its own language`,
      );
    }
  });

  it('canonicalises to the absolute production URL of the page itself', () => {
    const pages = [
      ...['zh', 'ja', 'en'].map((lang) => [`${lang}/index.html`, `/${lang}/`]),
      ...posts
        .filter((post) => !post.draft)
        .map((post) => [`${post.path}index.html`, post.path]),
    ];

    for (const [page, path] of pages) {
      const canonical = /<link rel="canonical" href="([^"]+)">/.exec(head(page));
      assert.ok(canonical, `${page} has no canonical link`);
      assert.equal(canonical[1], `${SITE}${path}`, `${page} canonicalises elsewhere`);
    }
  });

  it('gives an article exactly the alternates its translationKey earns', () => {
    const published = posts.filter((post) => !post.draft);

    for (const post of published) {
      const html = head(`${post.path}index.html`);
      const alternates = [...html.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)">/g)]
        .map((match) => ({ hreflang: match[1], href: match[2] }))
        .sort((a, b) => a.hreflang.localeCompare(b.hreflang));

      const expected = published
        .filter((sibling) => sibling.translationKey === post.translationKey)
        .map((sibling) => ({ hreflang: LOCALE[sibling.lang], href: `${SITE}${sibling.path}` }))
        .sort((a, b) => a.hreflang.localeCompare(b.hreflang));

      assert.deepEqual(alternates, expected, `${post.file} alternates do not match its translation group`);
    }
  });

  it('invents no alternate for an article that has no translation', () => {
    // The capability article shares a route shape with nothing, and a path-based
    // implementation would still be tempted to offer /ja/ and /en/ versions.
    const alone = posts.filter(
      (post) => !post.draft && posts.filter((other) => other.translationKey === post.translationKey).length === 1,
    );
    assert.ok(alone.length > 0, 'expected at least one untranslated article in the fixture set');

    for (const post of alone) {
      const html = head(`${post.path}index.html`);
      for (const other of ['zh', 'ja', 'en'].filter((lang) => lang !== post.lang)) {
        assert.ok(
          !new RegExp(`hreflang="${LOCALE[other]}"`).test(html),
          `${post.file} claims a ${other} translation that does not exist`,
        );
      }
    }
  });

  it('uses only the three locale codes the project has settled on', () => {
    for (const post of posts.filter((p) => !p.draft)) {
      const codes = [...head(`${post.path}index.html`).matchAll(/hreflang="([^"]+)"/g)].map((m) => m[1]);
      for (const code of codes) {
        assert.ok(Object.values(LOCALE).includes(code), `${post.file} introduces hreflang ${code}`);
      }
    }
  });
});

describe('robots.txt', () => {
  it('points at the sitemap it actually ships and contradicts nothing', () => {
    const robots = readFileSync(join(out, 'robots.txt'), 'utf8');
    assert.match(robots, new RegExp(`Sitemap: ${SITE}/sitemap-index\\.xml`));
    assert.ok(existsSync(join(out, 'sitemap-index.xml')), 'robots.txt names a sitemap that was not built');

    // Nothing robots.txt disallows may appear in the sitemap.
    const disallowed = [...robots.matchAll(/^Disallow:\s*(\S+)/gm)].map((match) => match[1]);
    for (const path of disallowed) {
      if (path === '/') continue;
      for (const url of sitemapUrls) {
        assert.ok(!new URL(url).pathname.startsWith(path), `${url} is both disallowed and listed`);
      }
    }
  });
});

describe('the sitemap URL shape', () => {
  it('uses the canonical origin, keeps trailing slashes, and never repeats a URL', () => {
    for (const url of sitemapUrls) {
      assert.ok(url.startsWith(`${SITE}/`), `${url} is not on the canonical origin`);
      assert.ok(url.endsWith('/'), `${url} must keep the trailing-slash contract`);
    }
    assert.equal(new Set(sitemapUrls).size, sitemapUrls.length, 'the sitemap repeats a URL');
  });

  it('points every listed URL at a file the static server can serve', () => {
    for (const url of sitemapUrls) {
      const path = new URL(url).pathname;
      assert.ok(
        existsSync(join(out, decodeURI(path), 'index.html')),
        `${path} is in the sitemap but was not built`,
      );
    }
  });
});

describe('sitemap alternates for the structural pages', () => {
  // The structural pages carry their hreflang in the sitemap rather than in the
  // document head. Google treats the HTML, header and sitemap methods as
  // equivalent, so publishing both would be two sources of one truth and one
  // more thing to drift. This is the check that the sitemap side is complete:
  //   https://developers.google.com/search/docs/specialty/international/localized-versions
  //
  // These pages exist once per language at the same path, so the group is the
  // path itself. Articles are the opposite case and are grouped by
  // translationKey in the suite below; the two must not be merged.
  const SECTIONS = ['', 'writing/', 'archive/', 'categories/', 'tags/', 'about/'];

  const entryFor = (url) => {
    for (const match of sitemap.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
      const loc = decodeURI(/<loc>([^<]+)<\/loc>/.exec(match[1])[1]);
      if (loc !== url) continue;
      return [...match[1].matchAll(/hreflang="([^"]+)" href="([^"]+)"/g)]
        .map((alt) => ({ hreflang: alt[1], href: decodeURI(alt[2]) }))
        .sort((a, b) => a.hreflang.localeCompare(b.hreflang));
    }
    return null;
  };

  it('give every structural page a complete, self-including language group', () => {
    for (const section of SECTIONS) {
      const expected = ['zh', 'ja', 'en']
        .map((lang) => ({ hreflang: LOCALE[lang], href: `${SITE}/${lang}/${section}` }))
        .sort((a, b) => a.hreflang.localeCompare(b.hreflang));

      for (const lang of ['zh', 'ja', 'en']) {
        const url = `${SITE}/${lang}/${section}`;
        const alternates = entryFor(url);
        assert.ok(alternates, `${url} is missing from the sitemap`);
        assert.deepEqual(alternates, expected, `${url} has an incomplete language group`);
        assert.ok(
          alternates.some((alt) => alt.href === url),
          `${url} does not include itself in its language group`,
        );
      }
    }
  });

  it('make those groups bidirectional', () => {
    // Every member of a group must name the same group, or a crawler reaching
    // the site through one language sees a different set than through another.
    for (const section of SECTIONS) {
      const groups = ['zh', 'ja', 'en'].map((lang) => entryFor(`${SITE}/${lang}/${section}`));
      for (const group of groups) {
        assert.deepEqual(group, groups[0], `/${section} disagrees about its own language group`);
      }
    }
  });
});

describe('sitemap translation alternates', () => {
  const entries = () =>
    [...sitemap.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((match) => ({
      loc: decodeURI(/<loc>([^<]+)<\/loc>/.exec(match[1])[1]),
      alternates: [...match[1].matchAll(/hreflang="([^"]+)" href="([^"]+)"/g)].map((alt) => ({
        hreflang: alt[1],
        href: decodeURI(alt[2]),
      })),
    }));

  // The alternates must follow translationKey. Today the three translations share
  // one route segment, so a path-shape implementation also happens to be right;
  // deriving the expectation from metadata is what stops that coincidence from
  // reading as proof.
  it('group article URLs by translationKey and nothing else', () => {
    const visible = posts.filter((post) => !post.draft && !post.unlisted);
    const byLocale = (a, b) => a.hreflang.localeCompare(b.hreflang);

    for (const post of visible) {
      const entry = entries().find((candidate) => candidate.loc === `${SITE}${post.path}`);
      assert.ok(entry, `${post.path} is missing from the sitemap`);

      const expected = visible
        .filter((sibling) => sibling.translationKey === post.translationKey)
        .map((sibling) => ({ hreflang: LOCALE[sibling.lang], href: `${SITE}${sibling.path}` }))
        .sort(byLocale);

      assert.deepEqual(
        [...entry.alternates].sort(byLocale),
        expected,
        `${post.path} alternates do not follow translationKey`,
      );
    }
  });

  it('never declares one language twice for a single URL', () => {
    for (const entry of entries()) {
      const langs = entry.alternates.map((alt) => alt.hreflang);
      assert.equal(new Set(langs).size, langs.length, `${entry.loc} declares a language twice`);
    }
  });
});

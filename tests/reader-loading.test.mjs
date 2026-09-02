// What a reader's browser is made to download before they ask for anything.
//
// AGENTS.md draws the line at "ordinary pages must not download Mermaid,
// PhotoSwipe, music, video, or decryption code". scripts/check-render-split.mjs
// already proves admin code is unreachable from any public page; the question
// here is narrower and about timing rather than reachability: of the code that
// is reachable, how much does the document ask for before the reader acts.
//
// So this walks the *eager* graph only. A module named inside `import(...)` is
// deliberately not followed — that exclusion is the contract being tested, and
// following it would collapse this into the reachability check that already
// exists.
//
// Which modules a page is allowed to load is derived from the article's own
// body through detectReaderFeatures, the same function the page used to decide.
// Asserting a hand-written list would only restate the current three articles.

import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, extname, relative, posix, dirname } from 'node:path';
import { describe, it, before } from 'node:test';
import { parseFrontmatter } from '@astrojs/markdown-remark';
import { publicOutputRoot, repoRoot } from '../scripts/lib/public-output.mjs';
import { detectReaderFeatures } from '../src/utils/features.ts';

const out = publicOutputRoot();

/**
 * Stylesheets a feature genuinely needs before its content can render, keyed by
 * the detectReaderFeatures flag that admits them. These are the only advanced
 * assets allowed to be eager, and only on a page whose body asks for them.
 */
const MODULE_STYLES = {
  lightbox: 'photoswipe',
  math: 'katex',
};

/**
 * The libraries themselves. Every one of these is reached through `import(...)`
 * after the reader acts, so none may appear in any page's eager graph — not even
 * the article that uses it.
 */
const LAZY_LIBRARIES = [
  'photoswipe.esm',
  'photoswipe-lightbox',
  'mermaid.core',
  'mermaid-parser',
  'katex.C',
];

/** The search module and its index both wait for the reader to open search. */
const SEARCH_ASSETS = ['search.', '/search/'];

/** Admin-only markers, matching scripts/check-render-split.mjs exactly. */
const ADMIN_ONLY = ['@tiptap', 'prosemirror', 'createApp', 'vue.runtime', 'node:sqlite'];

/** Third-party origins that may only be contacted after a deliberate click. */
const THIRD_PARTY_ORIGINS = [
  'https://www.youtube-nocookie.com',
  'https://player.bilibili.com',
  'https://meting.spr-aachen.com',
];

/** Web Crypto identifiers that only a protected article has any use for. */
const DECRYPTION_MARKERS = ['crypto.subtle', 'PBKDF2', 'deriveKey', 'AES-GCM'];

function filesUnder(directory, extension) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return filesUnder(path, extension);
    return extension === undefined || extname(entry.name) === extension ? [path] : [];
  });
}

const toPosix = (path) => path.split('\\').join('/');

/** Static import specifiers in a built chunk, with `import(...)` left out. */
function staticImports(code) {
  const withoutDynamic = code.replace(/\bimport\s*\(\s*(?:`[^`]*`|'[^']*'|"[^"]*")\s*\)/g, 'import(0)');
  const specifiers = [];
  for (const match of withoutDynamic.matchAll(/\bfrom\s*["']([^"']+)["']/g)) specifiers.push(match[1]);
  for (const match of withoutDynamic.matchAll(/\bimport\s*["']([^"']+)["']/g)) specifiers.push(match[1]);
  return specifiers;
}

/** Assets a stylesheet pulls in without further input from the reader. */
function cssReferences(code) {
  const references = [];
  for (const match of code.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) references.push(match[1]);
  for (const match of code.matchAll(/@import\s+["']([^"']+)["']/g)) references.push(match[1]);
  return references;
}

/**
 * Everything the browser fetches for a page before any interaction: the assets
 * the document names in src/href, and whatever those pull in statically.
 */
function eagerClosure(pageRelativePath) {
  const html = readFileSync(join(out, pageRelativePath), 'utf8');
  const seen = new Set();
  const queue = [];

  for (const match of html.matchAll(/(?:src|href)="(\/_astro\/[^"]+)"/g)) {
    queue.push(match[1].slice(1));
  }

  while (queue.length > 0) {
    const asset = queue.pop();
    if (seen.has(asset) || !existsSync(join(out, asset))) continue;
    seen.add(asset);

    const code = readFileSync(join(out, asset), 'utf8');
    const references = asset.endsWith('.css') ? cssReferences(code) : staticImports(code);
    for (const reference of references) {
      if (reference.startsWith('http') || reference.startsWith('data:')) continue;
      queue.push(posix.normalize(posix.join(dirname(asset), reference)).replace(/^\.\//, ''));
    }
  }

  // Inline module code counts as eager too: it runs on load, whatever it defers.
  const inline = [...html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)]
    .map((match) => match[1])
    .join('\n');

  return { html, assets: [...seen], inline };
}

/** Public post metadata plus the features its own body asks for. */
function readArticles() {
  return filesUnder(join(repoRoot, 'src/content/posts'), '.md').map((file) => {
    const raw = readFileSync(file, 'utf8');
    const { frontmatter, content } = parseFrontmatter(raw);
    const routeSlug = String(frontmatter.slug).replace(/^(zh|ja|en)\//, '');
    return {
      file: relative(repoRoot, file),
      draft: frontmatter.draft === true,
      page: `${frontmatter.lang}/posts/${routeSlug}/index.html`,
      features: detectReaderFeatures(content, frontmatter.copyProtection === true),
    };
  });
}

/** Pages that carry no article body, so they may never load a reader module. */
const ORDINARY_PAGES = ['zh', 'ja', 'en'].flatMap((lang) => [
  `${lang}/index.html`,
  `${lang}/writing/index.html`,
  `${lang}/archive/index.html`,
  `${lang}/categories/index.html`,
  `${lang}/tags/index.html`,
  `${lang}/about/index.html`,
]);

let articles;

before(() => {
  assert.ok(existsSync(join(out, 'zh/index.html')), 'run `pnpm build` before these loading assertions');
  articles = readArticles().filter((article) => !article.draft);
  assert.ok(articles.length > 0, 'expected at least one built article');
});

describe('ordinary pages before any interaction', () => {
  it('load no advanced reader module', () => {
    for (const page of ORDINARY_PAGES) {
      const { assets } = eagerClosure(page);
      for (const [feature, fragment] of Object.entries(MODULE_STYLES)) {
        const loaded = assets.filter((asset) => toPosix(asset).includes(fragment));
        assert.deepEqual(loaded, [], `${page} eagerly loads the ${feature} module`);
      }
    }
  });

  it('load neither the search module nor its index', () => {
    for (const page of ORDINARY_PAGES) {
      const { assets } = eagerClosure(page);
      for (const fragment of SEARCH_ASSETS) {
        const loaded = assets.filter((asset) => toPosix(asset).includes(fragment));
        assert.deepEqual(loaded, [], `${page} eagerly loads search (${fragment})`);
      }
    }
  });

  it('open no connection to a third-party media provider', () => {
    for (const page of ORDINARY_PAGES) {
      const { html } = eagerClosure(page);
      for (const origin of THIRD_PARTY_ORIGINS) {
        assert.ok(!html.includes(origin), `${page} references ${origin} without the reader asking`);
      }
    }
  });

  it('carry no decryption code', () => {
    for (const page of ORDINARY_PAGES) {
      const { assets, inline, html } = eagerClosure(page);
      const sources = [inline, html, ...assets.map((asset) => readFileSync(join(out, asset), 'utf8'))];
      for (const marker of DECRYPTION_MARKERS) {
        assert.ok(!sources.some((source) => source.includes(marker)), `${page} ships ${marker}`);
      }
    }
  });

  it('carry no admin code', () => {
    for (const page of ORDINARY_PAGES) {
      const { assets, inline } = eagerClosure(page);
      const sources = [inline, ...assets.map((asset) => readFileSync(join(out, asset), 'utf8'))];
      for (const marker of ADMIN_ONLY) {
        assert.ok(!sources.some((source) => source.includes(marker)), `${page} ships ${marker}`);
      }
    }
  });
});

describe('an article loads only what its own body needs', () => {
  it('takes a feature stylesheet only when its body uses that feature', () => {
    for (const article of articles) {
      assert.ok(existsSync(join(out, article.page)), `${article.page} was not built`);
      const { assets } = eagerClosure(article.page);

      for (const [feature, fragment] of Object.entries(MODULE_STYLES)) {
        const loaded = assets.some((asset) => toPosix(asset).includes(fragment));
        assert.equal(
          loaded,
          article.features[feature],
          loaded
            ? `${article.file} does not use ${feature} but the page loads its stylesheet`
            : `${article.file} uses ${feature} but the page never loads its stylesheet`,
        );
      }
    }
  });

  it('leaves every heavy library behind a dynamic import, on every page', () => {
    for (const page of [...ORDINARY_PAGES, ...articles.map((article) => article.page)]) {
      const { assets } = eagerClosure(page);
      for (const library of LAZY_LIBRARIES) {
        const loaded = assets.filter((asset) => toPosix(asset).includes(library));
        assert.deepEqual(loaded, [], `${page} eagerly downloads ${library}`);
      }
    }
  });

  it('adds a reader setup script per feature, over one shared baseline', () => {
    // One ReaderEnhancements script is not feature-gated: it binds spoilers and
    // the copy control for decrypted code. Spoilers are inline markup rather
    // than a detectReaderFeatures flag, so any article body may contain one and
    // every article carries that single small script. Everything above that
    // baseline has to be earned by a feature the body actually uses.
    const BASELINE = 1;
    const setupScripts = (page) =>
      eagerClosure(page).assets.filter((asset) => toPosix(asset).includes('ReaderEnhancements')).length;

    for (const article of articles) {
      const featureCount = ['lightbox', 'mermaid', 'math', 'video', 'music', 'copyProtection'].filter(
        (feature) => article.features[feature],
      ).length;
      const scripts = setupScripts(article.page);

      assert.ok(scripts >= BASELINE, `${article.file} is missing the shared reader baseline`);
      assert.ok(
        scripts <= BASELINE + featureCount,
        `${article.file} loads ${scripts} reader scripts for ${featureCount} feature(s)`,
      );
      if (featureCount === 0) {
        assert.equal(scripts, BASELINE, `${article.file} uses no advanced feature but loads extra setup`);
      }
    }
  });

  it('gives a page with no article body no reader setup at all', () => {
    for (const page of ORDINARY_PAGES) {
      const { assets } = eagerClosure(page);
      assert.deepEqual(
        assets.filter((asset) => toPosix(asset).includes('ReaderEnhancements')),
        [],
        `${page} has no article body but loads reader setup`,
      );
    }
  });

  it('names a media provider only where the body embeds one', () => {
    for (const article of articles) {
      const { html } = eagerClosure(article.page);
      const embedsRemoteMedia = article.features.video || article.features.music;
      const named = THIRD_PARTY_ORIGINS.filter((origin) => html.includes(origin));
      if (!embedsRemoteMedia) {
        assert.deepEqual(named, [], `${article.file} embeds no remote media but names ${named}`);
      }
    }
  });

  it('never fetches a remote provider eagerly, even where it embeds one', () => {
    for (const article of articles) {
      const { html } = eagerClosure(article.page);
      // A provider may be named as a link or a consent target. It may not be a
      // live iframe or preconnect, which the browser would fetch on load.
      for (const origin of THIRD_PARTY_ORIGINS) {
        assert.ok(
          !new RegExp(`<iframe[^>]+src="${origin}`).test(html),
          `${article.file} renders a live iframe for ${origin} before consent`,
        );
        assert.ok(
          !new RegExp(`rel="(?:preconnect|dns-prefetch|preload)"[^>]*${origin}`).test(html),
          `${article.file} preconnects to ${origin}`,
        );
      }
    }
  });
});

describe('search stays behind the reader opening it', () => {
  it('passes the index as a data attribute rather than fetching it', () => {
    const { html, assets } = eagerClosure('zh/index.html');
    assert.match(html, /data-search-index="\/search\/zh\.json"/);
    assert.deepEqual(assets.filter((asset) => toPosix(asset).includes('search.')), []);
  });

  it('reaches the search chunk only through a dynamic import', () => {
    const shell = filesUnder(join(out, '_astro'), '.js').find((file) =>
      /BaseLayout\.astro_astro_type_script/.test(file),
    );
    assert.ok(shell, 'the shared shell script is expected in the build');
    const code = readFileSync(shell, 'utf8');
    assert.match(code, /import\(\s*[`'"]\.\/search\./, 'search must be dynamically imported');
    assert.deepEqual(
      staticImports(code).filter((specifier) => specifier.includes('search.')),
      [],
      'search must not be a static import of the shared shell',
    );
  });
});

describe('decryption code', () => {
  it('exists on protected pages only, and nowhere else in the public tree', () => {
    const pages = filesUnder(out, '.html');
    for (const page of pages) {
      const relativePath = toPosix(relative(out, page));
      if (relativePath.includes('/protected/')) continue;
      const html = readFileSync(page, 'utf8');
      assert.ok(!html.includes('data-decrypt-form'), `${relativePath} carries the unlock form`);
    }
  });
});

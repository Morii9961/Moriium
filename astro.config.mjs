import { defineConfig, sessionDrivers } from 'astro/config';
import node from '@astrojs/node';
import { readdirSync, readFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { parseFrontmatter, unified } from '@astrojs/markdown-remark';
import sitemap from '@astrojs/sitemap';
import expressiveCode from 'astro-expressive-code';
// The plugin chain lives in its own module so the trusted renderer can share it
// without importing this file. See the header of src/markdown/pipeline.mjs.
import {
  expressiveCodeOptions,
  rehypePlugins,
  remarkPlugins,
} from './src/markdown/pipeline.mjs';

// Production data never belongs to an immutable release directory. Windows is
// the local development host; the Linux default is the ADR 0002 data layout.
// MORIIUM_SESSION_DIRECTORY is read at build time, as Astro documents for
// driver configuration: https://docs.astro.build/en/guides/sessions/#configuring-sessions
const sessionDirectory =
  process.env.MORIIUM_SESSION_DIRECTORY?.trim() ||
  (process.platform === 'win32' ? resolve('.astro/sessions') : '/var/lib/moriium/sessions');

// Which built routes a crawler may be told about.
//
// @astrojs/sitemap enumerates every route the build knows, which is wider than
// the reader index: it picked up /admin/ (on-demand, never written to the client
// tree), the "/" redirect stub, and posts whose own metadata says they are not
// listed. The rule has to read that metadata, because excluding a known slug by
// hand would go stale the moment a post is added or its flags change.
const contentRoot = resolve('src/content');

function filesUnder(directory, extension) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return filesUnder(path, extension);
    return extname(entry.name) === extension ? [path] : [];
  });
}

const routeSlug = (slug) => String(slug).replace(/^(zh|ja|en)\//, '');

/** Routes whose frontmatter withholds them from the reader index. */
function unindexedPostRoutes() {
  const routes = new Set();

  for (const file of filesUnder(join(contentRoot, 'posts'), '.md')) {
    const { frontmatter } = parseFrontmatter(readFileSync(file, 'utf8'));
    if (frontmatter.draft === true || frontmatter.unlisted === true) {
      routes.add(`/${frontmatter.lang}/posts/${routeSlug(frontmatter.slug)}/`);
    }
  }

  // A protected post earns its place in the index only by opting in with
  // `listed`; the default keeps ciphertext routes out.
  for (const file of filesUnder(join(contentRoot, 'protected'), '.json')) {
    const data = JSON.parse(readFileSync(file, 'utf8'));
    if (data.draft === true || data.listed !== true) {
      routes.add(`/${data.lang}/protected/${routeSlug(data.slug)}/`);
    }
  }

  return routes;
}

const unindexedRoutes = unindexedPostRoutes();

// Article alternates have to come from translationKey, not from the URL.
// @astrojs/sitemap's i18n option infers a language group by swapping the locale
// segment, which is only right while every translation happens to reuse one
// route slug. Give a translation its own slug and that inference silently emits
// no alternate at all, so the relationship is rebuilt from metadata here.
const LOCALE = { zh: 'zh-CN', ja: 'ja-JP', en: 'en-US' };

function translationGroups() {
  const byKey = new Map();

  for (const file of filesUnder(join(contentRoot, 'posts'), '.md')) {
    const { frontmatter } = parseFrontmatter(readFileSync(file, 'utf8'));
    if (frontmatter.draft === true || frontmatter.unlisted === true) continue;
    const path = `/${frontmatter.lang}/posts/${routeSlug(frontmatter.slug)}/`;
    const group = byKey.get(frontmatter.translationKey) ?? [];
    group.push({ lang: LOCALE[frontmatter.lang], path });
    byKey.set(frontmatter.translationKey, group);
  }

  for (const file of filesUnder(join(contentRoot, 'protected'), '.json')) {
    const data = JSON.parse(readFileSync(file, 'utf8'));
    if (data.draft === true || data.listed !== true) continue;
    const path = `/${data.lang}/protected/${routeSlug(data.slug)}/`;
    const group = byKey.get(data.translationKey) ?? [];
    group.push({ lang: LOCALE[data.lang], path });
    byKey.set(data.translationKey, group);
  }

  // Index by route so serialize() can look a URL up directly.
  const byRoute = new Map();
  for (const group of byKey.values()) {
    for (const entry of group) byRoute.set(entry.path, group);
  }
  return byRoute;
}

const articleTranslations = translationGroups();

function withTranslationAlternates(item) {
  const path = decodeURI(new URL(item.url).pathname);
  const group = articleTranslations.get(path);
  if (!group) return item;

  // A post with no sibling translation gets no alternate set at all, rather
  // than a lone self-reference implying a group that does not exist.
  if (group.length < 2) {
    const { links, ...rest } = item;
    return rest;
  }

  const origin = new URL(item.url).origin;
  return { ...item, links: group.map(({ lang, path: route }) => ({ lang, url: `${origin}${route}` })) };
}

function isIndexable(page) {
  const { pathname } = new URL(page);
  // The author surface is on-demand and the design study is research; neither
  // belongs to a reader. "/" only redirects to /zh/ and already says noindex,
  // so advertising it would also declare zh-CN twice in the language group.
  if (pathname === '/') return false;
  if (/^\/(admin|api|design)\//.test(pathname)) return false;
  return !unindexedRoutes.has(decodeURI(pathname));
}

export default defineConfig({
  site: 'https://morii9961.top',
  // `static` stays. ADR 0002 section 4 admits the adapter for exactly one
  // purpose: letting `/admin` and `/api` opt out with `prerender = false`.
  // Every public route stays prerendered, so the reader path never reaches
  // this process. Do not switch to `output: 'server'`; that inverts the
  // default and puts the whole site behind Node.
  output: 'static',
  adapter: node({ mode: 'standalone' }),
  session: {
    driver: sessionDrivers.fsLite({ base: sessionDirectory }),
    // These are Astro's documented defaults, made explicit because this admin
    // is public-internet reachable and the production deployment always has TLS.
    // https://docs.astro.build/en/reference/configuration-reference/#sessioncookie
    cookie: { name: 'astro-session', sameSite: 'lax', httpOnly: true, secure: true, path: '/' },
    ttl: 12 * 60 * 60,
  },
  trailingSlash: 'always',
  build: {
    format: 'directory',
  },
  integrations: [
    expressiveCode(expressiveCodeOptions),
    sitemap({
      filter: isIndexable,
      serialize: withTranslationAlternates,
      i18n: {
        defaultLocale: 'zh',
        locales: { zh: 'zh-CN', ja: 'ja-JP', en: 'en-US' },
      },
    }),
  ],
  markdown: {
    processor: unified({ remarkPlugins, rehypePlugins }),
  },
  vite: {
    // assetsInlineLimit: 0 keeps every bundled script a file rather than letting
    // small ones be inlined into the HTML. deploy/nginx/moriium.conf sends
    // `script-src 'self'` with no 'unsafe-inline', no nonce and no hash, so an
    // inlined script is not merely untidy -- the browser refuses to run it. That
    // silently disabled the video consent control, the music card, spoilers, the
    // copy-protection notice and the home page feature reel in production, while
    // every local preview without the header looked correct. Serving the built
    // tree with the production CSP is what surfaced it, so the fix belongs here
    // rather than in a weaker policy.
    build: { target: 'es2022', assetsInlineLimit: 0 },
    environments: {
      astro: {
        // Astro's content runner needs this CommonJS dependency pre-bundled as ESM.
        // https://github.com/withastro/astro/blob/main/reference/optimize-deps.md
        optimizeDeps: { include: ['picomatch'] },
      },
    },
  },
});

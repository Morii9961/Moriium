import { defineConfig, sessionDrivers } from 'astro/config';
import node from '@astrojs/node';
import { resolve } from 'node:path';
import { unified } from '@astrojs/markdown-remark';
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
      filter: (page) => !page.includes('/design/'),
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

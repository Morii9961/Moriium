import { defineConfig, sessionDrivers } from 'astro/config';
import node from '@astrojs/node';
import { resolve } from 'node:path';
import { unified } from '@astrojs/markdown-remark';
import sitemap from '@astrojs/sitemap';
import expressiveCode from 'astro-expressive-code';
import { pluginCollapsibleSections } from '@expressive-code/plugin-collapsible-sections';
import { pluginLineNumbers } from '@expressive-code/plugin-line-numbers';
import remarkDirective from 'remark-directive';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { remarkMoriiumDirectives } from './src/markdown/remark-moriium-directives.mjs';
import { rehypeMoriiumContent } from './src/markdown/rehype-moriium-content.mjs';

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
    expressiveCode({
      plugins: [pluginLineNumbers(), pluginCollapsibleSections()],
      defaultProps: {
        wrap: true,
        showLineNumbers: false,
      },
      themes: ['github-light', 'github-dark'],
      themeCssSelector: (theme) =>
        theme.name === 'github-dark' ? '[data-theme="dark"]' : '[data-theme="light"]',
    }),
    sitemap({
      filter: (page) => !page.includes('/design/'),
      i18n: {
        defaultLocale: 'zh',
        locales: { zh: 'zh-CN', ja: 'ja-JP', en: 'en-US' },
      },
    }),
  ],
  markdown: {
    processor: unified({
      remarkPlugins: [remarkMath, remarkDirective, remarkMoriiumDirectives],
      rehypePlugins: [rehypeKatex, rehypeMoriiumContent],
    }),
  },
  vite: {
    build: { target: 'es2022' },
    environments: {
      astro: {
        // Astro's content runner needs this CommonJS dependency pre-bundled as ESM.
        // https://github.com/withastro/astro/blob/main/reference/optimize-deps.md
        optimizeDeps: { include: ['picomatch'] },
      },
    },
  },
});

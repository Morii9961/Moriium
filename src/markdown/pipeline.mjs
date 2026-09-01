// The one definition of Moriium's Markdown pipeline.
//
// Both the build and the author-facing preview render with the same plugins in
// the same order, and this module is how that is guaranteed without either side
// importing the other. It has one hard rule:
//
//   Nothing here may import the Astro config, an adapter, an integration, Vite
//   or the bundler.
//
// That rule is not stylistic. The trusted renderer runs inside the resident
// production server (`dist/server/entry.mjs`). When it used to reach the plugin
// list by importing `astro.config.mjs`, the build inlined that config's whole
// import graph -- Vite, Rolldown and css-tree included -- into
// `dist/server/chunks/`, where each of them resolves its own assets relative to
// its file location and therefore fails. Every article API route returned an
// empty 500 in the built artifact (ADR 0002 section 21.24). A request handler
// must not depend on build configuration; keeping this module free of it is the
// boundary that keeps that true.
//
// Source: https://v6.docs.astro.build/en/guides/markdown-content/

import rehypeKatex from 'rehype-katex';
import remarkDirective from 'remark-directive';
import remarkMath from 'remark-math';
import { pluginCollapsibleSections } from '@expressive-code/plugin-collapsible-sections';
import { pluginLineNumbers } from '@expressive-code/plugin-line-numbers';
import { rehypeMoriiumContent } from './rehype-moriium-content.mjs';
import { remarkMoriiumDirectives } from './remark-moriium-directives.mjs';

export const remarkPlugins = [remarkMath, remarkDirective, remarkMoriiumDirectives];

/**
 * The rehype chain, ending at Moriium's own transform.
 *
 * The preview inserts Expressive Code immediately before the last entry, so the
 * position of `rehypeMoriiumContent` is part of this module's contract rather
 * than an incidental ordering. `assertPipelineOrder()` states it as a check.
 */
export const rehypePlugins = [rehypeKatex, rehypeMoriiumContent];

/** Shared by the build integration and the preview's rehype plugin. */
export const expressiveCodeOptions = {
  plugins: [pluginLineNumbers(), pluginCollapsibleSections()],
  defaultProps: { wrap: true, showLineNumbers: false },
  themes: ['github-light', 'github-dark'],
  themeCssSelector: (theme) =>
    theme.name === 'github-dark' ? '[data-theme="dark"]' : '[data-theme="light"]',
};

/**
 * Fails loudly if the chain stops ending where the preview expects.
 *
 * The preview splices Expressive Code in at a fixed position. Silently
 * rendering a draft through a different chain than the build uses is the exact
 * drift the trusted renderer exists to prevent (ADR 0002 section 7).
 */
export function assertPipelineOrder() {
  if (rehypePlugins.at(-1) !== rehypeMoriiumContent) {
    throw new Error('The Moriium rehype chain must end with rehypeMoriiumContent.');
  }
}

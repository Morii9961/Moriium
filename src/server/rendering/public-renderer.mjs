// Trusted draft renderer. It renders with the same remark/rehype chain the
// build uses, and adds Expressive Code at the same point as the integration.
//
// The chain comes from src/markdown/pipeline.mjs, NOT from astro.config.mjs.
// This module runs inside the resident production server, so importing the
// build config here puts Vite, Rolldown and the adapter into a request
// handler's dependency graph -- which is exactly what made every article route
// return an empty 500 in the built artifact (ADR 0002 section 21.24). Do not
// reintroduce that import; tests/admin-built-artifact.test.mjs enforces it.

import { createMarkdownProcessor } from '@astrojs/markdown-remark';
import rehypeExpressiveCode from 'rehype-expressive-code';
import {
  assertPipelineOrder,
  expressiveCodeOptions,
  rehypePlugins,
  remarkPlugins,
} from '../../markdown/pipeline.mjs';

async function createPublicRenderer() {
  // The splice below assumes the chain ends at Moriium's own transform. Saying
  // so out loud stops a reordered pipeline from quietly rendering drafts
  // through a chain the build does not use.
  assertPipelineOrder();
  return createMarkdownProcessor({
    gfm: true,
    smartypants: true,
    remarkPlugins,
    rehypePlugins: [
      ...rehypePlugins.slice(0, -1),
      [rehypeExpressiveCode, expressiveCodeOptions],
      rehypePlugins.at(-1),
    ],
    syntaxHighlight: false,
  });
}

let cached;

export async function renderPreview(markdown) {
  cached ??= createPublicRenderer();
  const rendered = await (await cached).render(markdown);
  return rendered.code
    .replace(/<style>[\s\S]*?<\/style>/g, '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '');
}

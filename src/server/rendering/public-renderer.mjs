// Trusted draft renderer. It takes the remark/rehype chain from the production
// Astro config and adds Expressive Code at the same point as the integration.

import { createMarkdownProcessor } from '@astrojs/markdown-remark';
import { pluginCollapsibleSections } from '@expressive-code/plugin-collapsible-sections';
import { pluginLineNumbers } from '@expressive-code/plugin-line-numbers';
import rehypeExpressiveCode from 'rehype-expressive-code';
import astroConfig from '../../../astro.config.mjs';
import { rehypeMoriiumContent } from '../../markdown/rehype-moriium-content.mjs';

const EXPRESSIVE_CODE_OPTIONS = {
  plugins: [pluginLineNumbers(), pluginCollapsibleSections()],
  defaultProps: { wrap: true, showLineNumbers: false },
  themes: ['github-light', 'github-dark'],
  themeCssSelector: (theme) =>
    theme.name === 'github-dark' ? '[data-theme="dark"]' : '[data-theme="light"]',
};

async function createPublicRenderer() {
  const processor = astroConfig.markdown?.processor;
  if (!processor?.options) throw new Error('The production Markdown processor is unavailable.');
  const { remarkPlugins, rehypePlugins, remarkRehype, gfm, smartypants } = processor.options;
  if (rehypePlugins.at(-1) !== rehypeMoriiumContent) {
    throw new Error('The production rehype order changed; re-check the preview renderer.');
  }
  return createMarkdownProcessor({
    gfm: gfm ?? true,
    smartypants: smartypants ?? true,
    remarkRehype,
    remarkPlugins,
    rehypePlugins: [
      ...rehypePlugins.slice(0, -1),
      [rehypeExpressiveCode, EXPRESSIVE_CODE_OPTIONS],
      rehypeMoriiumContent,
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

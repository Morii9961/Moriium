import { createMarkdownProcessor } from '@astrojs/markdown-remark';
import { pluginCollapsibleSections } from '@expressive-code/plugin-collapsible-sections';
import { pluginLineNumbers } from '@expressive-code/plugin-line-numbers';
import rehypeExpressiveCode from 'rehype-expressive-code';
import rehypeKatex from 'rehype-katex';
import remarkDirective from 'remark-directive';
import remarkMath from 'remark-math';
import { rehypeMoriiumContent } from '../../src/markdown/rehype-moriium-content.mjs';
import { remarkMoriiumDirectives } from '../../src/markdown/remark-moriium-directives.mjs';

export async function renderPrivateMarkdown(markdown) {
  const processor = await createMarkdownProcessor({
    syntaxHighlight: false,
    smartypants: false,
    remarkPlugins: [remarkMath, remarkDirective, remarkMoriiumDirectives],
    rehypePlugins: [
      rehypeKatex,
      [rehypeExpressiveCode, {
        plugins: [pluginLineNumbers(), pluginCollapsibleSections()],
        defaultProps: { wrap: true, showLineNumbers: false },
        themes: ['github-light', 'github-dark'],
        themeCssSelector: (theme) =>
          theme.name === 'github-dark' ? '[data-theme="dark"]' : '[data-theme="light"]',
      }],
      rehypeMoriiumContent,
    ],
  });
  const rendered = await processor.render(markdown);

  // Expressive Code normally injects its browser module into the document head.
  // Protected HTML is inserted after decryption, where inline modules neither run
  // under our CSP nor belong in the encrypted payload. ReaderEnhancements supplies
  // the small copy interaction for decrypted blocks instead.
  return rendered.code.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
}

import { createMarkdownProcessor } from '@astrojs/markdown-remark';
import rehypeExpressiveCode from 'rehype-expressive-code';
import rehypeKatex from 'rehype-katex';
import remarkDirective from 'remark-directive';
import remarkMath from 'remark-math';
import { expressiveCodeOptions } from '../../src/markdown/expressive-code.mjs';
import { rehypeMoriiumContent } from '../../src/markdown/rehype-moriium-content.mjs';
import { remarkMoriiumDirectives } from '../../src/markdown/remark-moriium-directives.mjs';

export async function renderPrivateMarkdown(markdown) {
  const processor = await createMarkdownProcessor({
    syntaxHighlight: false,
    smartypants: false,
    remarkPlugins: [remarkMath, remarkDirective, remarkMoriiumDirectives],
    rehypePlugins: [
      rehypeKatex,
      [rehypeExpressiveCode, expressiveCodeOptions],
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

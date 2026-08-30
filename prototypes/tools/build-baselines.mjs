// Renders every fixture body through the PUBLIC article pipeline and stores the
// HTML under prototypes/fixtures/baseline/.
//
//   pnpm -C prototypes baselines:build
//
// The baseline is what ADR 0001 section 4 compares against: round-trip loss
// through Tiptap, and task B5's preview-versus-production diff. It therefore
// has to come from the pipeline that actually renders public articles.
//
// Morii settled this on 2026-08-29. scripts/lib/render-markdown.mjs is NOT the
// right source: that is the protected-post path, and it turns off smartypants
// and syntax highlighting, so every fidelity number taken against it would be
// skewed in the same direction.
//
// Instead of restating the plugin list, this imports astro.config.mjs and uses
// the processor the site itself is configured with, so the baseline cannot
// drift from production by editing one and forgetting the other.

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { createMarkdownProcessor, parseFrontmatter } from '@astrojs/markdown-remark';
import { pluginCollapsibleSections } from '@expressive-code/plugin-collapsible-sections';
import { pluginLineNumbers } from '@expressive-code/plugin-line-numbers';
import rehypeExpressiveCode from 'rehype-expressive-code';
import astroConfig from '../../astro.config.mjs';
import { rehypeMoriiumContent } from '../../src/markdown/rehype-moriium-content.mjs';

const here = import.meta.dirname;
const fixturesRoot = resolve(here, '../fixtures');
const postsRoot = join(fixturesRoot, 'posts');
const baselineRoot = join(fixturesRoot, 'baseline');

// Astro's own markdown defaults, used only where astro.config.mjs leaves a gap.
const ASTRO_MARKDOWN_DEFAULTS = { gfm: true, smartypants: true };

// Expressive Code reaches the real site as an Astro *integration*, so it is not
// in markdown.processor's plugin list. Rendering without it produces Astro's
// default Shiki markup (`pre.astro-code`), which the built site never contains —
// dist/ shows `div.expressive-code` and zero `astro-code`. The baseline has to
// add it back or every code block would count as a difference.
//
// These options duplicate the expressiveCode({...}) call in astro.config.mjs,
// because an integration keeps its options in a closure and does not hand them
// back. validate-fixtures.ts guards the duplication by failing if that call
// changes.
export const EXPRESSIVE_CODE_OPTIONS = {
  plugins: [pluginLineNumbers(), pluginCollapsibleSections()],
  defaultProps: { wrap: true, showLineNumbers: false },
  themes: ['github-light', 'github-dark'],
  themeCssSelector: (theme) =>
    theme.name === 'github-dark' ? '[data-theme="dark"]' : '[data-theme="light"]',
};

export async function createPublicRenderer() {
  const processor = astroConfig.markdown?.processor;
  if (!processor?.options) {
    throw new Error('astro.config.mjs no longer exposes markdown.processor; the baseline source moved.');
  }
  const { remarkPlugins, rehypePlugins, remarkRehype, gfm, smartypants } = processor.options;

  // rehypeMoriiumContent post-processes the finished tree, so it must stay last
  // and Expressive Code has to slot in ahead of it. This mirrors the order
  // scripts/lib/render-markdown.mjs already uses on the protected path.
  if (rehypePlugins.at(-1) !== rehypeMoriiumContent) {
    throw new Error(
      'astro.config.mjs no longer ends its rehype chain with rehypeMoriiumContent. ' +
        'Re-check where Expressive Code belongs in the order before trusting the baseline.',
    );
  }
  const withExpressiveCode = [
    ...rehypePlugins.slice(0, -1),
    [rehypeExpressiveCode, EXPRESSIVE_CODE_OPTIONS],
    rehypeMoriiumContent,
  ];

  return createMarkdownProcessor({
    gfm: gfm ?? ASTRO_MARKDOWN_DEFAULTS.gfm,
    smartypants: smartypants ?? ASTRO_MARKDOWN_DEFAULTS.smartypants,
    remarkRehype,
    remarkPlugins,
    rehypePlugins: withExpressiveCode,
    // Expressive Code owns code fences once it is in the chain.
    syntaxHighlight: false,
  });
}

export async function collectPosts() {
  const found = [];
  for (const langDir of await readdir(postsRoot, { withFileTypes: true })) {
    if (!langDir.isDirectory()) continue;
    for (const entry of await readdir(join(postsRoot, langDir.name), { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith('.md')) {
        found.push(join(postsRoot, langDir.name, entry.name));
      }
    }
  }
  return found.sort();
}

export function baselinePathFor(postPath) {
  const lang = basename(dirname(postPath));
  return join(baselineRoot, lang, `${basename(postPath, '.md')}.html`);
}

// Expressive Code inlines its stylesheet and init script into the first code
// block it renders. The Astro integration instead extracts them to
// /_astro/ec.*.css and /_astro/ec.*.js, so the built page contains neither.
// Left in, they were 24 KB of a 48 KB baseline — the content would be a
// rounding error inside its own diff. Dropping them makes the baseline closer
// to what dist/ holds, not further from it.
function stripInjectedAssets(html) {
  return html
    .replace(/<style>[\s\S]*?<\/style>/g, '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '');
}

// Prototype B's draft preview renders through here too, so the preview and the
// baseline it is compared against cannot come from two implementations that
// drift apart. Everything above this line is what makes the output production's
// own, and neither caller gets to skip it.
export async function renderMarkdown(renderer, markdown) {
  const rendered = await renderer.render(markdown);
  return stripInjectedAssets(rendered.code);
}

export async function renderPost(renderer, postPath) {
  const { content } = parseFrontmatter(await readFile(postPath, 'utf8'));
  return renderMarkdown(renderer, content);
}

// The exact bytes a baseline file holds. A test comparing preview output with a
// stored baseline needs this, otherwise it has to restate the trailing-newline
// rule and a byte-for-byte claim would rest on a copy of that rule.
export function baselineBytes(html) {
  return html.endsWith('\n') ? html : `${html}\n`;
}

if (import.meta.filename === process.argv[1]) {
  const renderer = await createPublicRenderer();
  const posts = await collectPosts();
  for (const post of posts) {
    const html = await renderPost(renderer, post);
    const target = baselinePathFor(post);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, baselineBytes(html), 'utf8');
    console.log(`${basename(post)} -> ${html.length} chars`);
  }
  console.log(`\nWrote ${posts.length} baseline(s) to prototypes/fixtures/baseline/.`);
}

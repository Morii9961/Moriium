// Prototype B's draft preview.
//
// The preview does not have a renderer of its own. It calls the same
// createPublicRenderer() the fixture baselines are built with, which takes its
// remark/rehype chain out of astro.config.mjs, so the preview cannot drift from
// the deployed article pipeline by editing one and forgetting the other. ADR
// 0001 section 13.5 already paid for that mistake once, on the baseline itself.
//
// What this is NOT: an appearance preview. The site shell, the stylesheet and
// the reader modules are not here, so admonitions, code blocks and spoilers
// come out as correct but unstyled markup. Rendering parity is the claim;
// looking like the published page is not.

import { createPublicRenderer, renderMarkdown } from '../../../tools/build-baselines.mjs';

type PublicRenderer = Awaited<ReturnType<typeof createPublicRenderer>>;

// Building the processor loads every remark and rehype plugin plus both
// Expressive Code themes. That is far too slow to repeat per keystroke, so the
// promise is cached and shared. Caching the promise rather than the resolved
// value also means two concurrent first requests build one processor.
let cached: Promise<PublicRenderer> | null = null;

export function publicRenderer(): Promise<PublicRenderer> {
  cached ??= createPublicRenderer();
  return cached;
}

/** Renders Markdown exactly the way a public article is rendered. */
export async function renderPreview(markdown: string): Promise<string> {
  return renderMarkdown(await publicRenderer(), markdown);
}

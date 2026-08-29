// The one editor configuration.
//
// The round-trip measurement and the editor Morii actually types into must be
// the same set of extensions. If they drift, the fidelity numbers stop
// describing the thing being operated, which is the mistake ADR 13.5 already
// caught once with the render baselines. Both import from here.

import type { Extensions } from '@tiptap/core';
import { Markdown } from '@tiptap/markdown';
import StarterKit from '@tiptap/starter-kit';
import type { marked } from 'marked';
import { createIsolatedMarked } from './marked-instance.ts';
import { MoriiumImage } from './image-node.ts';
import { MoriiumSourceBlock, MoriiumSourceInline } from './source-nodes.ts';

/** The Moriium-specific nodes, in the order Tiptap should try them. */
export const MORIIUM_NODES: Extensions = [MoriiumImage, MoriiumSourceBlock, MoriiumSourceInline];

/**
 * `sourceExtensions` is empty for the unextended Beta baseline and MORIIUM_NODES
 * for the configuration prototype B ships. `markedInstance` is only passed by
 * the test that watches the Tiptap/marked boundary.
 */
export function moriiumExtensions(
  sourceExtensions: Extensions = MORIIUM_NODES,
  markedInstance: typeof marked = createIsolatedMarked(),
): Extensions {
  return [
    StarterKit,
    ...sourceExtensions,
    Markdown.configure({
      // Without an instance of its own, Tiptap registers extension tokenizers
      // on marked's module singleton and changes editors created later.
      marked: markedInstance,
      markedOptions: { gfm: true, breaks: false, pedantic: false },
    }),
  ];
}

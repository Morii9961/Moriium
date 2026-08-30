import type { Extensions } from '@tiptap/core';
import { Markdown } from '@tiptap/markdown';
import StarterKit from '@tiptap/starter-kit';
import { createIsolatedMarked } from './marked-instance.ts';
import { MoriiumImage } from './image-node.ts';
import { MoriiumSourceBlock, MoriiumSourceInline } from './source-nodes.ts';

export function moriiumExtensions(): Extensions {
  return [
    StarterKit,
    MoriiumImage,
    MoriiumSourceBlock,
    MoriiumSourceInline,
    Markdown.configure({
      marked: createIsolatedMarked(),
      markedOptions: { gfm: true, breaks: false, pedantic: false },
    }),
  ];
}

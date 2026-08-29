// Baseline measurement for Tiptap's Beta Markdown bridge.
//
// Official API reference:
// https://tiptap.dev/docs/editor/markdown/api/editor
//
// This module measures the unextended editor before Moriium-specific source
// nodes are added. It does not declare a block safe merely because parsing did
// not throw: every syntax family present before the round trip is checked again
// afterwards against the shared content-block inventory.

import { Editor, type JSONContent } from '@tiptap/core';
import { Markdown } from '@tiptap/markdown';
import StarterKit from '@tiptap/starter-kit';
import { CONTENT_BLOCKS, blocksIn } from '../../../shared/content-blocks.ts';

export type RoundTripBlockResult = {
  id: string;
  presentInInput: boolean;
  presentInOutput: boolean;
  preserved: boolean;
  lost: boolean;
  introduced: boolean;
};

export type MarkdownRoundTripReport = {
  markdown: string;
  editorJson: JSONContent;
  inputCharacters: number;
  outputCharacters: number;
  inputBlockIds: string[];
  outputBlockIds: string[];
  lostBlockIds: string[];
  introducedBlockIds: string[];
  blockResults: RoundTripBlockResult[];
};

export function measureMarkdownRoundTrip(markdown: string): MarkdownRoundTripReport {
  const editor = new Editor({
    extensions: [
      StarterKit,
      Markdown.configure({
        markedOptions: { gfm: true, breaks: false, pedantic: false },
      }),
    ],
    content: markdown,
    contentType: 'markdown',
  });

  try {
    const output = editor.getMarkdown();
    const inputBlockIds = blocksIn(markdown);
    const outputBlockIds = blocksIn(output);
    const inputBlocks = new Set(inputBlockIds);
    const outputBlocks = new Set(outputBlockIds);
    const blockResults = CONTENT_BLOCKS.map((block): RoundTripBlockResult => {
      const presentInInput = inputBlocks.has(block.id);
      const presentInOutput = outputBlocks.has(block.id);
      return {
        id: block.id,
        presentInInput,
        presentInOutput,
        preserved: presentInInput && presentInOutput,
        lost: presentInInput && !presentInOutput,
        introduced: !presentInInput && presentInOutput,
      };
    });

    return {
      markdown: output,
      editorJson: editor.getJSON(),
      inputCharacters: markdown.length,
      outputCharacters: output.length,
      inputBlockIds,
      outputBlockIds,
      lostBlockIds: blockResults.filter((result) => result.lost).map((result) => result.id),
      introducedBlockIds: blockResults
        .filter((result) => result.introduced)
        .map((result) => result.id),
      blockResults,
    };
  } finally {
    editor.destroy();
  }
}

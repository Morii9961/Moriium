// One isolated marked instance per editor. Tiptap's MarkdownManager registers
// custom tokenizers through marked.use(); sharing the module singleton lets one
// editor silently change parsers created later.

import { Marked, type marked } from 'marked';

const REQUIRED_MEMBERS = ['Lexer', 'defaults', 'lexer', 'setOptions', 'use'] as const;

export function createIsolatedMarked(): typeof marked {
  const instance = new Marked();
  const missing = REQUIRED_MEMBERS.filter((member) => !(member in instance));
  if (missing.length > 0) {
    throw new Error(`The isolated Markdown parser no longer provides: ${missing.join(', ')}.`);
  }
  return instance as unknown as typeof marked;
}

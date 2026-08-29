// One isolated marked instance per editor.
//
// Tiptap's MarkdownManager registers extension tokenizers by calling
// `markedInstance.use(...)`. When no instance is injected it falls back to the
// `marked` module singleton, so the tokenizers one editor registers stay
// registered for every editor built afterwards in the same process. The
// `marked` option exists for exactly this injection:
// https://tiptap.dev/docs/editor/markdown/api/editor
//
// The option is typed `typeof marked` — the callable module namespace — while
// `new Marked()` is an instance. The two differ by one member, `getDefaults`,
// which MarkdownManager never reads; it touches only the five members listed
// below, and a Marked instance carries all five. The assertion below bridges
// that gap. It is not a blind cast: `marked-instance.test.ts` records every
// member Tiptap actually reads during a real round trip and fails if the set
// ever grows beyond this list.

import { Marked, type marked } from 'marked';

/**
 * Every member @tiptap/markdown 3.30.5 reads off the injected instance.
 * Verified against its `MarkdownManager`, not inferred from its documentation.
 */
export const MARKED_MEMBERS_TIPTAP_READS = [
  'Lexer',
  'defaults',
  'lexer',
  'setOptions',
  'use',
] as const;

/** Which of those members an object fails to provide. Separate so it can be tested against a stripped object. */
export function missingMarkedMembers(instance: object): string[] {
  return MARKED_MEMBERS_TIPTAP_READS.filter((member) => !(member in instance));
}

/** A marked instance private to one editor, so tokenizers cannot leak between editors. */
export function createIsolatedMarked(): typeof marked {
  const instance = new Marked();
  const missing = missingMarkedMembers(instance);

  if (missing.length > 0) {
    throw new Error(
      `A marked instance no longer provides ${missing.join(', ')}, which ` +
        '@tiptap/markdown reads off the injected instance. Re-check the ' +
        'injection before trusting any round-trip number.',
    );
  }

  return instance as unknown as typeof marked;
}

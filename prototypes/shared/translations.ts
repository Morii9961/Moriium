// Translation relationships shared by both prototypes.
//
// AGENTS.md: "Translation variants share a translationKey. Missing translations
// must be shown as unavailable; never fabricate or copy a translation."
//
// That rule is easy to state and easy to break by accident, because the
// convenient thing for a UI to do with a missing language is fall back to
// another one. So this module never returns a substitute. Lookup returns a
// discriminated status, and reading the entry requires narrowing to
// 'available' first — falling back is not something a caller can do by
// forgetting a check.
//
// Dependency direction is fixed: this module imports nothing from studio-a or
// admin-b.

import { LANGUAGES, type Language } from './content-schema.ts';

export type TranslationEntry = {
  lang: Language;
  slug: string;
  title: string;
  /** Drafts exist but must never be offered as an available translation. */
  draft: boolean;
};

export type TranslationGroup = {
  translationKey: string;
  entries: ReadonlyMap<Language, TranslationEntry>;
};

export type TranslationStatus =
  | { readonly state: 'available'; readonly entry: TranslationEntry }
  /** Nothing exists in this language yet. */
  | { readonly state: 'unavailable' }
  /** Something exists but is not publishable. Still unavailable to a reader. */
  | { readonly state: 'draft' };

export type TranslationInput = TranslationEntry & { translationKey: string };

export function buildTranslationIndex(
  posts: readonly TranslationInput[],
): Map<string, TranslationGroup> {
  const index = new Map<string, TranslationGroup>();
  for (const post of posts) {
    let group = index.get(post.translationKey);
    if (!group) {
      group = { translationKey: post.translationKey, entries: new Map() };
      index.set(post.translationKey, group);
    }
    const entries = group.entries as Map<Language, TranslationEntry>;
    const existing = entries.get(post.lang);
    if (existing) {
      throw new Error(
        `Duplicate translation: "${post.translationKey}" has two ${post.lang} entries ` +
          `(${existing.slug} and ${post.slug}). A language may appear once per group.`,
      );
    }
    entries.set(post.lang, {
      lang: post.lang,
      slug: post.slug,
      title: post.title,
      draft: post.draft,
    });
  }
  return index;
}

/**
 * Status of one language within a group. Never falls back to another language:
 * a caller that wants text has to narrow to 'available' and use that entry.
 */
export function statusOf(group: TranslationGroup | undefined, lang: Language): TranslationStatus {
  const entry = group?.entries.get(lang);
  if (!entry) return { state: 'unavailable' };
  if (entry.draft) return { state: 'draft' };
  return { state: 'available', entry };
}

/** Every language, with its status. Drives a language switcher without gaps. */
export function statusByLanguage(
  group: TranslationGroup | undefined,
): Record<Language, TranslationStatus> {
  const result = {} as Record<Language, TranslationStatus>;
  for (const lang of LANGUAGES) result[lang] = statusOf(group, lang);
  return result;
}

export function availableLanguages(group: TranslationGroup | undefined): Language[] {
  return LANGUAGES.filter((lang) => statusOf(group, lang).state === 'available');
}

export function missingLanguages(group: TranslationGroup | undefined): Language[] {
  return LANGUAGES.filter((lang) => statusOf(group, lang).state !== 'available');
}

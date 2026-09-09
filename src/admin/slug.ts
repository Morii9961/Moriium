// Deriving the two identifiers the author should never have to type.
//
// `slug` fixes the public URL and `translationKey` decides which articles are
// variants of each other. Both are immutable once the article exists, and both
// were plain text inputs: a typo in the first shipped a wrong address, a typo
// in the second silently started a second translation group of one.
//
// This module holds only the pure derivation so it can be tested without a
// browser. Nothing here talks to the API.

export type Language = 'zh' | 'ja' | 'en';

export const LANGUAGES: readonly Language[] = ['zh', 'ja', 'en'];

/**
 * The body of a slug, without the language prefix.
 *
 * Latin titles slugify the way anyone would expect. A Chinese title has
 * nothing the pattern in `src/content-schema.ts` can carry -- it allows
 * `[a-z0-9-]` only -- so rather than transliterate into pinyin nobody chose,
 * this falls back to the publication date: valid, unique per day, and obvious
 * enough that the author replaces it when they want a real name. Morii's own
 * articles use a hand-picked English slug (`zh/moriium-reconstruction` for
 * 「从一张白纸重新开始」), which no derivation could have guessed.
 */
export function slugBodyFromTitle(title: string, now: Date): string {
  const body = title
    .normalize('NFKD')
    // Strip the combining marks NFKD just separated, so "café" reaches "cafe".
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return body.length > 0 ? body : isoDate(now);
}

function isoDate(now: Date): string {
  const iso = now.toISOString();
  return iso.slice(0, iso.indexOf('T'));
}

/** Joins the prefix Astro needs to the body the author actually chose. */
export function composeSlug(lang: Language, body: string): string {
  return `${lang}/${body}`;
}

export type KeySource = { readonly translationKey: string; readonly slug: string };

export type KeyInput =
  | { readonly mode: 'new'; readonly slugBody: string }
  | { readonly mode: 'translation'; readonly slugBody: string; readonly source: KeySource };

/**
 * The key that puts this article in the right translation group.
 *
 * A new article opens its own group named after its slug body, which is the
 * convention every existing article already follows. A translation joins an
 * existing group by copying the key off the article it translates, so the two
 * can never disagree.
 */
export function translationKeyFor(input: KeyInput): string {
  return input.mode === 'translation' ? input.source.translationKey : input.slugBody;
}

/** Strips the language prefix, for reusing a source article's slug body. */
export function slugBodyOf(slug: string): string {
  return slug.replace(/^(zh|ja|en)\//, '');
}

/**
 * The languages a group has no article for yet.
 *
 * The publish gate refuses a group holding two articles of one language, since
 * the language links could not say which one to point at. Offering only the
 * free languages refuses that at the point of entry instead of at publication.
 */
export function languagesLeftInGroup(
  articles: readonly { readonly translationKey: string; readonly lang: string }[],
  translationKey: string,
): Language[] {
  const taken = new Set(
    articles.filter((entry) => entry.translationKey === translationKey).map((entry) => entry.lang),
  );
  return LANGUAGES.filter((lang) => !taken.has(lang));
}

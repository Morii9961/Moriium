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

export type IdentityInput = {
  readonly mode: 'new' | 'translation';
  readonly title: string;
  readonly lang: Language;
  /** Slugs that already exist, prefix included, so a new one can avoid them. */
  readonly taken?: readonly string[];
  readonly source?: KeySource;
  readonly now: Date;
};

export type Identity = { readonly slug: string; readonly translationKey: string };

/**
 * Both identifiers, derived, for any state the form can be in.
 *
 * The author does not enter either one. A slug is an address and a key is a
 * grouping, and both are immutable once the article exists, so asking a person
 * to type them only created ways to be permanently wrong: a typo in the first
 * shipped a bad URL, a typo in the second started a translation group of one.
 *
 * Deriving them together means they cannot disagree, and there is no input for
 * which this returns nothing: a blank title is not a choice, so the date
 * stands in.
 */
export function deriveIdentity(input: IdentityInput): Identity {
  if (input.mode === 'translation' && input.source) {
    // A translation resolves to the same route segment as its source, which is
    // what lets /zh/, /ja/ and /en/ share one address. It is never
    // disambiguated: the prefix already makes the row unique, and changing the
    // body here would break the language links.
    const body = slugBodyOf(input.source.slug);
    return { slug: composeSlug(input.lang, body), translationKey: input.source.translationKey };
  }

  const derived = slugBodyFromTitle(input.title, input.now);
  const body = unusedBody(derived, input.lang, input.taken ?? []);
  return { slug: composeSlug(input.lang, body), translationKey: body };
}

/**
 * The first free variant of a slug body within one language.
 *
 * Chinese titles all fall back to the same date, so a second article written
 * the same day would collide on `articles.slug`, and with no input on the form
 * the author has no way to resolve it. Numbering starts at 2 so the first
 * article of a day keeps the bare date.
 */
function unusedBody(body: string, lang: Language, taken: readonly string[]): string {
  const used = new Set(taken);
  if (!used.has(composeSlug(lang, body))) return body;
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${body}-${suffix}`;
    if (!used.has(composeSlug(lang, candidate))) return candidate;
  }
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

// Turning one article into a machine-translated variant of itself.
//
// The result is always a draft. Morii reviews every translation before it is
// published (`AGENTS.md`), so this produces something to read and correct, not
// something that is live. Publishing stays the same operation it already was,
// behind the same gate.
//
// The whole translation is assembled before anything is written. A service
// that fails halfway therefore leaves no article at all, and a missing variant
// is a state the site already renders honestly, as unavailable.

import type { Article, ArticleStore, Language, Version } from '../articles.ts';
import { AdminError } from '../errors.ts';
import { reassemble, splitForTranslation } from './markdown.ts';
import { translateTexts } from './edge.ts';

/** Injected so tests can see exactly which strings were sent. */
export type Translator = (texts: readonly string[], from: Language, to: Language) => Promise<string[]>;

const defaultTranslator: Translator = (texts, from, to) => translateTexts(texts, { from, to });

export type TranslateRequest = {
  readonly articleId: number;
  readonly to: Language;
  readonly authorId: number;
  readonly translate?: Translator;
};

export type TranslationResult = {
  readonly article: Article;
  readonly version: Version;
};

/**
 * Creates the target-language variant of an article as an unpublished draft.
 *
 * Title, summary and prose are sent as one array, in one request, so the
 * engine sees the article as a whole and the reply can be checked positionally
 * against what was asked.
 */
export async function translateArticleInto(
  store: ArticleStore,
  request: TranslateRequest,
): Promise<TranslationResult> {
  const source = store.getArticle(request.articleId);
  if (!source) throw new AdminError('validation-failed', '要翻译的文章不存在。');
  if (source.lang === request.to) {
    throw new AdminError('validation-failed', '不能把文章翻译成它自己的语言。');
  }

  const latest = store.getLatest(source.id);
  if (!latest) throw new AdminError('validation-failed', '这篇文章还没有可翻译的版本。');

  const pieces = splitForTranslation(latest.markdown);
  const prose = pieces.filter((piece) => piece.translatable).map((piece) => piece.text);

  // Title and summary lead the array so their positions are fixed and known.
  const translate = request.translate ?? defaultTranslator;
  const answered = await translate(
    [latest.title, latest.summary, ...prose],
    source.lang,
    request.to,
  );
  if (answered.length !== prose.length + 2) {
    throw new AdminError(
      'translation-failed',
      `翻译服务返回了 ${answered.length} 段，应为 ${prose.length + 2} 段。`,
    );
  }

  const [title, summary, ...body] = answered as [string, string, ...string[]];
  const markdown = reassemble(pieces, body);

  // Only now, with a complete translation in hand, does anything get written.
  return writeVariant(store, source, latest, request, { title, summary, markdown });
}

function writeVariant(
  store: ArticleStore,
  source: Article,
  latest: Version,
  request: TranslateRequest,
  translated: { title: string; summary: string; markdown: string },
): TranslationResult {
  const article = store.createArticle({
    translationKey: source.translationKey,
    lang: request.to,
    // The variants share a slug body so the three resolve to the same route
    // segment under their own language prefixes.
    slug: `${request.to}/${source.slug.replace(/^(zh|ja|en)\//, '')}`,
    machineTranslatedFrom: source.lang,
    authorId: request.authorId,
    title: translated.title,
    summary: translated.summary,
    markdown: translated.markdown,
    // Everything below is not prose and is carried across as it stands.
    // Translating a category or a tag would fork the taxonomy, and the dates
    // belong to the article, not to this rendering of it.
    publishedAt: latest.publishedAt,
    updatedAt: latest.updatedAt,
    category: latest.category,
    tags: [...latest.tags],
    cover: latest.cover,
    coverAlt: latest.coverAlt,
    draft: latest.draft,
    unlisted: latest.unlisted,
    copyProtection: latest.copyProtection,
    editorJson: null,
  });

  return { article, version: store.getLatest(article.id)! };
}

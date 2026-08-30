// Prototype B's publish policy.
//
// The HTTP layer supplies a stored version; this module turns the shared
// content, translation and media contracts into one atomic publish veto. It
// performs no writes. Store.publish/rollback calls it inside the transaction
// before changing published_version_id, so a refusal cannot leak a half-public
// state or an audit row.

import { publishCandidate } from '../../../shared/content-schema.ts';
import { PrototypeError } from '../../../shared/errors.ts';
import {
  blockersForPublishing,
  imageReferencesIn,
  type MediaManifest,
} from '../../../shared/media.ts';
import { buildTranslationIndex, statusOf } from '../../../shared/translations.ts';
import type { Store, Version } from '../storage/store.ts';

function contentBlockers(store: Store, version: Version): string[] {
  const article = store.getArticle(version.articleId);
  if (!article) return ['The article no longer exists.'];

  const parsed = publishCandidate.safeParse({
    title: version.title,
    slug: article.slug,
    summary: version.summary,
    lang: article.lang,
    translationKey: article.translationKey,
    markdown: version.markdown,
  });
  if (!parsed.success) {
    return parsed.error.issues.map((issue) => {
      const field = issue.path.join('.') || 'article';
      return `${field}: ${issue.message}`;
    });
  }

  try {
    const translations = buildTranslationIndex(
      store.listArticles().map((entry) => {
        const represented = entry.id === article.id
          ? version
          : store.getPublished(entry.id) ?? store.getLatest(entry.id);
        return {
          translationKey: entry.translationKey,
          lang: entry.lang,
          slug: entry.slug,
          title: represented?.title ?? '',
          draft: entry.id === article.id ? false : entry.publishedVersionId == null,
        };
      }),
    );
    if (statusOf(translations.get(article.translationKey), article.lang).state !== 'available') {
      return ['The candidate is not available in its own translation group.'];
    }
  } catch (error) {
    return [error instanceof Error ? error.message : String(error)];
  }

  return [];
}

function mediaBlockers(version: Version, manifest: MediaManifest): string[] {
  const assets = new Map<string, MediaManifest['assets'][number]>();
  const blockers: string[] = [];
  for (const asset of manifest.assets) {
    if (assets.has(asset.publicPath)) {
      blockers.push(`Media manifest contains duplicate path ${asset.publicPath}.`);
    } else {
      assets.set(asset.publicPath, asset);
    }
  }

  for (const reference of imageReferencesIn(version.markdown)) {
    if (reference.alt.trim().length === 0) {
      blockers.push(`Image ${reference.publicPath} has blank alt text.`);
    }
    const asset = assets.get(reference.publicPath);
    if (!asset) {
      blockers.push(`Image ${reference.publicPath} is missing from the media manifest.`);
      continue;
    }
    blockers.push(...blockersForPublishing(asset).map((reason) => `${reference.publicPath}: ${reason}`));
  }
  return blockers;
}

export function validateVersionForPublishing(
  store: Store,
  version: Version,
  manifest: MediaManifest,
): void {
  const content = contentBlockers(store, version);
  if (content.length > 0) {
    throw new PrototypeError('validation-failed', `Publishing is blocked: ${content.join(' ')}`);
  }

  const media = mediaBlockers(version, manifest);
  if (media.length > 0) {
    throw new PrototypeError('media-gate-refused', `Publishing is blocked: ${media.join(' ')}`);
  }
}

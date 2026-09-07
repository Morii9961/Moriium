// Production publication policy.
//
// Markdown parsing is asynchronous, while node:sqlite transactions are
// synchronous. preparePublishValidator() therefore extracts immutable image
// references first, then returns a synchronous validator. ArticleStore invokes
// that validator inside the publish transaction before any write, where it
// re-reads the article, translation group and media rows.

import { createMarkdownProcessor, type Node, type RemarkPlugin } from '@astrojs/markdown-remark';
import type { DatabaseSync } from 'node:sqlite';
import { z } from 'astro/zod';
import type { ArticleStore, Version } from '../articles.ts';
import { AdminError } from '../errors.ts';

const LANGUAGES = ['zh', 'ja', 'en'] as const;
const SLUG_PATTERN = /^(zh|ja|en)\/[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PUBLISHABLE_EXIF_TAGS = new Set([
  'Make',
  'Model',
  'LensModel',
  'FocalLength',
  'FNumber',
  'ExposureTime',
  'ISOSpeedRatings',
]);
const RASTER_FORMATS = new Set(['webp', 'avif', 'jpeg', 'png']);

const publishCandidate = z
  .object({
    title: z.string().trim().min(1),
    slug: z.string().regex(SLUG_PATTERN),
    summary: z.string().trim().min(1).max(280),
    publishedAt: z.coerce.date(),
    updatedAt: z.coerce.date().nullable(),
    lang: z.enum(LANGUAGES),
    translationKey: z.string().trim().min(1),
    category: z.string().trim().min(1),
    tags: z.array(z.string().trim().min(1)),
    cover: z.string().nullable(),
    coverAlt: z.string().nullable(),
    draft: z.literal(false),
    unlisted: z.boolean(),
    copyProtection: z.boolean(),
    markdown: z.string().trim().min(1),
  })
  .superRefine((value, context) => {
    if (!value.slug.startsWith(`${value.lang}/`)) {
      context.addIssue({
        code: 'custom',
        path: ['slug'],
        message: 'slug must start with the selected language',
      });
    }
    if (value.cover && !value.coverAlt?.trim()) {
      context.addIssue({
        code: 'custom',
        path: ['coverAlt'],
        message: 'coverAlt is required when cover is present',
      });
    }
  });

export type MarkdownImageReference = {
  readonly publicPath: string;
  readonly alt: string;
  readonly rawHtml?: boolean;
};

type AstNode = Node & {
  readonly type?: string;
  readonly url?: string;
  readonly alt?: string | null;
  readonly identifier?: string;
  readonly value?: string;
  readonly children?: readonly AstNode[];
};

/**
 * Extracts real Markdown image nodes rather than scanning source text.
 *
 * Remark plugins operate on mdast before HTML conversion, so fenced code is a
 * code node and its example syntax cannot become an image reference. Source:
 * https://docs.astro.build/en/guides/markdown-content/#markdown-plugins
 */
export async function imageReferencesIn(markdown: string): Promise<MarkdownImageReference[]> {
  const references: MarkdownImageReference[] = [];
  const definitions = new Map<string, string>();
  const referenced: Array<{ readonly identifier: string; readonly alt: string }> = [];

  const visit = (node: AstNode): void => {
    if (node.type === 'definition' && node.identifier && typeof node.url === 'string') {
      definitions.set(node.identifier.toLowerCase(), node.url);
    } else if (node.type === 'image' && typeof node.url === 'string') {
      references.push({ publicPath: node.url, alt: node.alt ?? '' });
    } else if (node.type === 'imageReference' && node.identifier) {
      referenced.push({ identifier: node.identifier.toLowerCase(), alt: node.alt ?? '' });
    } else if (node.type === 'html' && /<img\b/i.test(node.value ?? '')) {
      // Raw HTML can carry srcset and other URL-bearing attributes that a
      // Markdown image node cannot. Refuse it instead of pretending a partial
      // attribute regex is an equivalent media audit.
      references.push({ publicPath: '', alt: '', rawHtml: true });
    }
    for (const child of node.children ?? []) visit(child);
  };

  const collector = (() => (tree: Node) => visit(tree as AstNode)) as RemarkPlugin;
  const renderer = await createMarkdownProcessor({
    syntaxHighlight: false,
    smartypants: false,
    remarkPlugins: [collector],
  });
  await renderer.render(markdown);

  for (const reference of referenced) {
    const publicPath = definitions.get(reference.identifier);
    if (publicPath !== undefined) references.push({ publicPath, alt: reference.alt });
  }
  return references;
}

function contentBlockers(store: ArticleStore, version: Version): string[] {
  const article = store.getArticle(version.articleId);
  if (!article) return ['article：文章已不存在。'];

  const parsed = publishCandidate.safeParse({
    title: version.title,
    slug: article.slug,
    summary: version.summary,
    publishedAt: version.publishedAt,
    updatedAt: version.updatedAt,
    lang: article.lang,
    translationKey: article.translationKey,
    category: version.category,
    tags: version.tags,
    cover: version.cover,
    coverAlt: version.coverAlt,
    draft: version.draft,
    unlisted: version.unlisted,
    copyProtection: version.copyProtection,
    markdown: version.markdown,
  });
  if (!parsed.success) {
    return parsed.error.issues.map((issue) => {
      const field = issue.path.join('.') || 'article';
      return `${field}：字段内容无效。`;
    });
  }

  const seen = new Set<string>();
  for (const entry of store.listArticles()) {
    if (entry.translationKey !== article.translationKey) continue;
    if (seen.has(entry.lang)) {
      return [`translationKey：翻译组 ${article.translationKey} 中存在重复的 ${entry.lang} 文章。`];
    }
    seen.add(entry.lang);
  }
  if (!seen.has(article.lang)) {
    return ['translationKey：待发布文章不在自身翻译组中。'];
  }
  return [];
}

type MediaRow = {
  public_path: string;
  format: string;
  alt: string;
  exif_json: string;
  sanitized_at: string | null;
};

function mediaBlockers(
  db: DatabaseSync,
  version: Version,
  markdownReferences: readonly MarkdownImageReference[],
): string[] {
  const references = [...markdownReferences];
  if (version.cover) references.push({ publicPath: version.cover, alt: version.coverAlt ?? '' });
  const blockers: string[] = [];
  const findAsset = db.prepare(
    'SELECT public_path, format, alt, exif_json, sanitized_at FROM media_assets WHERE public_path = ?',
  );

  for (const reference of references) {
    if (reference.rawHtml) {
      blockers.push('不能发布原始 HTML 图片；请使用 Markdown 图片语法。');
      continue;
    }
    if (reference.publicPath.length === 0) {
      blockers.push('有一张图片缺少路径。');
      continue;
    }
    if (reference.alt.trim().length === 0) {
      blockers.push(`图片 ${reference.publicPath} 缺少替代文字。`);
    }
    const asset = findAsset.get(reference.publicPath) as MediaRow | undefined;
    if (!asset) {
      blockers.push(`媒体库中找不到图片 ${reference.publicPath}。`);
      continue;
    }
    if (asset.alt.trim().length === 0) {
      blockers.push(`${reference.publicPath}：媒体库中的替代文字不能为空。`);
    }
    if (RASTER_FORMATS.has(asset.format) && asset.sanitized_at === null) {
      blockers.push(`${reference.publicPath}：位图尚未通过元数据清理。`);
    }
    try {
      const exif: unknown = JSON.parse(asset.exif_json);
      if (!exif || typeof exif !== 'object' || Array.isArray(exif)) {
        blockers.push(`${reference.publicPath}：保存的 EXIF 元数据无效。`);
      } else {
        for (const tag of Object.keys(exif)) {
          if (!PUBLISHABLE_EXIF_TAGS.has(tag)) {
            blockers.push(`${reference.publicPath}：EXIF 标签“${tag}”不可发布。`);
          }
        }
      }
    } catch {
      blockers.push(`${reference.publicPath}：保存的 EXIF 元数据无效。`);
    }
  }
  return blockers;
}

/**
 * Prepares an atomic publish/rollback veto for one immutable stored version.
 */
export async function preparePublishValidator(
  store: ArticleStore,
  db: DatabaseSync,
  version: Version,
): Promise<(candidate: Version) => void> {
  const references = await imageReferencesIn(version.markdown);
  return (candidate: Version): void => {
    if (candidate.id !== version.id) {
      throw new AdminError('validation-failed', '待发布版本已发生变化，请重试。');
    }
    const content = contentBlockers(store, candidate);
    if (content.length > 0) {
      throw new AdminError('validation-failed', `无法发布：${content.join(' ')}`);
    }
    const media = mediaBlockers(db, candidate, references);
    if (media.length > 0) {
      throw new AdminError('media-gate-refused', `无法发布：${media.join(' ')}`);
    }
  };
}

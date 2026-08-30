// Step one of publishing's second half: the database's published pointers,
// projected onto disk as build input (ADR 0002 sections 4.2, 8.2 and 15.2).
//
// What this module is careful about, and why:
//
//   * It reads `published_version_id` only. `getLatest` is never called here.
//     An autosave the author has not published cannot reach a reader through
//     this path, because this path cannot see it.
//   * It does not touch `live_version_id`. Marking a version live is step eight
//     of the release sequence, after the built site is actually being served;
//     doing it here would record a build that has not happened yet.
//   * It writes into `staging/` and promotes by renaming directories, so a
//     failure anywhere -- a missing media file, a full disk, a killed process
//     -- leaves the previous export intact and the whole thing retryable
//     without the author republishing anything.
//   * Every file it writes, it reads back. The media import pipeline earned
//     that rule the hard way (ADR 0002 section 21.7); an export that assumes
//     its own writes succeeded is the same bet in a different place.
//
// Output layout under the export root:
//
//   current/                the last export that completed; the build's input
//     posts/<lang>/<name>.md
//     media/<path under /media/>
//     media-manifest.json
//   staging/                in progress, removed on failure
//   previous/               exists only inside the promote window
//
// The manifest carries no timestamp. Two exports of the same database state
// produce byte-identical trees, which is what makes "retry the export" a safe
// thing to say.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { ArticleStore, Version } from '../articles.ts';
import { AdminError } from '../errors.ts';
import type { MediaAsset, MediaStore } from '../media/assets.ts';
import { fileForPublicPath, mediaRoot, PUBLIC_MEDIA_PREFIX } from '../media/storage.ts';
import { imageReferencesIn } from '../publishing/publish-gate.ts';
import { exportPathFor, toMarkdownFile } from './frontmatter.ts';

/** Data, so it lives outside releases/ (ADR 0002 section 15.1). */
export const DEFAULT_CONTENT_ROOT =
  process.platform === 'win32' ? resolve('.astro/content') : '/var/lib/moriium/content';

export const MANIFEST_NAME = 'media-manifest.json';

export function contentRoot(): string {
  return resolve(process.env.MORIIUM_CONTENT_ROOT?.trim() || DEFAULT_CONTENT_ROOT);
}

export type ExportedArticle = {
  readonly articleId: number;
  readonly versionId: number;
  readonly lang: string;
  readonly slug: string;
  /** Relative to the export directory, with forward slashes. */
  readonly file: string;
};

export type ManifestEntry = {
  readonly publicPath: string;
  readonly format: string;
  readonly width: number | null;
  readonly height: number | null;
  readonly alt: string;
  readonly caption: string | null;
  readonly copyright: string | null;
  readonly exif: Record<string, string>;
};

export type ExportResult = {
  /** The export root. */
  readonly root: string;
  /** The promoted directory the build should copy from. */
  readonly directory: string;
  /**
   * One entry per exported article, for the caller to hand to `markLive` after
   * -- and only after -- the built site is being served.
   */
  readonly articles: readonly ExportedArticle[];
  readonly media: readonly ManifestEntry[];
};

function fail(message: string, cause?: unknown): never {
  throw new AdminError('export-failed', message, cause === undefined ? undefined : { cause });
}

/**
 * Finishes a promote that was interrupted between its two renames.
 *
 * That window is short but real: if the process dies inside it, `current` does
 * not exist and the last good export is sitting in `previous`. Recovering here
 * means an interrupted export costs a retry, not a restore.
 */
function recoverInterruptedPromote(root: string): void {
  const current = join(root, 'current');
  const previous = join(root, 'previous');
  if (!existsSync(current) && existsSync(previous)) renameSync(previous, current);
}

function writeVerified(file: string, contents: string): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, contents, 'utf8');
  if (readFileSync(file, 'utf8') !== contents) {
    fail('An exported file did not match what was written to it.');
  }
}

function copyVerified(source: string, target: string): void {
  let bytes: Buffer;
  try {
    bytes = readFileSync(source);
  } catch (cause) {
    fail('A published image is missing from the media library on disk.', cause);
  }
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, bytes);
  const written = readFileSync(target);
  const digest = (value: Buffer): string => createHash('sha256').update(value).digest('hex');
  if (digest(written) !== digest(bytes)) {
    fail('A copied image did not match its source after being written.');
  }
}

/** Every media path a published version puts in front of a reader. */
async function referencedPaths(version: Version): Promise<string[]> {
  const paths: string[] = [];
  for (const reference of await imageReferencesIn(version.markdown)) {
    // Raw HTML images cannot be published at all; the gate refuses them. If one
    // is somehow present, it carries no path to export and the gate is the
    // place that reports it, not this one.
    if (reference.rawHtml || reference.publicPath.length === 0) continue;
    paths.push(reference.publicPath);
  }
  if (version.cover) paths.push(version.cover);
  return paths;
}

/**
 * Exports every published article, plus the media those articles reference.
 *
 * Assets nobody published stay in the media root and never reach the public
 * tree. That is the intended behaviour rather than a missing feature: the media
 * library is the author's, the export is the reader's.
 */
export async function exportPublished(options: {
  readonly store: ArticleStore;
  readonly media: MediaStore;
  readonly root?: string;
  readonly mediaRoot?: string;
}): Promise<ExportResult> {
  const root = resolve(options.root ?? contentRoot());
  const sourceRoot = resolve(options.mediaRoot ?? mediaRoot());
  const staging = join(root, 'staging');
  const current = join(root, 'current');
  const previous = join(root, 'previous');

  mkdirSync(root, { recursive: true });
  recoverInterruptedPromote(root);
  rmSync(staging, { recursive: true, force: true });
  mkdirSync(staging, { recursive: true });

  try {
    const exported: ExportedArticle[] = [];
    const needed = new Set<string>();

    // Sorted by code unit rather than by locale: `localeCompare` depends on the
    // machine's ICU data, and an export whose order changes with the host is
    // not the reproducible artefact this block is supposed to produce.
    const articles = [...options.store.listArticles()].sort((a, b) =>
      a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0,
    );
    for (const article of articles) {
      if (article.publishedVersionId === null) continue;
      const version = options.store.getVersion(article.publishedVersionId);
      if (!version) {
        fail(`The published version of ${article.slug} could not be read.`);
      }
      const file = exportPathFor(article);
      writeVerified(join(staging, file), toMarkdownFile(article, version));
      exported.push({
        articleId: article.id,
        versionId: version.id,
        lang: article.lang,
        slug: article.slug,
        file,
      });
      for (const path of await referencedPaths(version)) needed.add(path);
    }

    const assets = new Map<string, MediaAsset>();
    for (const asset of options.media.list()) assets.set(asset.publicPath, asset);

    const manifest: ManifestEntry[] = [];
    for (const path of [...needed].sort()) {
      const asset = assets.get(path);
      if (!asset) {
        // The publish gate refuses a reference with no row, so reaching this
        // means the row was removed after publishing. Refusing here keeps a
        // broken image out of the built site rather than shipping a 404.
        fail(`Published content references ${path}, which is not in the media library.`);
      }
      if (asset.sanitizedAt === null) {
        fail(`${path} has not passed sanitization and must not reach the public tree.`);
      }
      if (!path.startsWith(PUBLIC_MEDIA_PREFIX)) {
        fail(`${path} is not a media library path.`);
      }
      copyVerified(
        fileForPublicPath(path, sourceRoot),
        join(staging, 'media', path.slice(PUBLIC_MEDIA_PREFIX.length)),
      );
      manifest.push({
        publicPath: asset.publicPath,
        format: asset.format,
        width: asset.width,
        height: asset.height,
        alt: asset.alt,
        caption: asset.caption,
        copyright: asset.copyright,
        exif: { ...asset.exif },
      });
    }

    const serialized = `${JSON.stringify({ assets: manifest }, null, 2)}\n`;
    writeVerified(join(staging, MANIFEST_NAME), serialized);
    try {
      JSON.parse(serialized);
    } catch (cause) {
      fail('The generated media manifest is not valid JSON.', cause);
    }

    // Promote. Two renames, with `previous` holding the old export across the
    // gap so an interrupted promote is recoverable rather than a data loss.
    rmSync(previous, { recursive: true, force: true });
    if (existsSync(current)) renameSync(current, previous);
    renameSync(staging, current);
    rmSync(previous, { recursive: true, force: true });

    return { root, directory: current, articles: exported, media: manifest };
  } catch (error) {
    rmSync(staging, { recursive: true, force: true });
    throw error;
  }
}

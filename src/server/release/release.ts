// Publishing's second half, as one retryable state machine (ADR 0002 section
// 15.3). Export, stage, install, build, check, switch, probe, record, prune.
//
// The whole point of this module is the ORDER, so that is what it is written
// around. Three rules decide every branch below:
//
//   1. Nothing before the switch may change what a reader is being served. An
//      export, an install, a build or a check that fails leaves `current`
//      pointing exactly where it pointed, and leaves every `live_version_id`
//      alone.
//   2. The switch is one rename. A reader resolves either the old release or
//      the new one, never a missing path.
//   3. `live_version_id` is written last, and only after the running site has
//      answered. It reports on a build that is demonstrably serving, not on one
//      that was assembled. If the probe fails, the link goes back and nothing
//      is recorded -- the database still says "published, awaiting export", the
//      admin still shows it, and the same command can simply be run again.
//
// Retrying never asks the author to publish again. The database is the truth;
// this is the projection catching up (section 4.2).

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { isAbsolute, join, relative, resolve } from 'node:path';
import type { ArticleStore } from '../articles.ts';
import { AdminError } from '../errors.ts';
import type { MediaStore } from '../media/assets.ts';
import type { ExportedArticle } from '../export/content-export.ts';
import { exportPublished, MANIFEST_NAME } from '../export/content-export.ts';
import { assertServable } from './checks.ts';
import type { ReleaseHost } from './host.ts';

/** Releases kept on disk. ADR 0002 section 15.1. */
export const RETAINED_RELEASES = 6;

/**
 * Where the export's articles land inside the workspace.
 *
 * A subdirectory rather than the collection root, because during migration the
 * repository's own posts and the exported ones have to coexist (section 15.2).
 * Owning one directory means a stale export can be removed by deleting it,
 * without a list of which files this process wrote last time.
 */
export const STAGED_POSTS_DIRECTORY = 'exported';

/** Repository checks that already exist, run against the freshly built workspace. */
export const WORKSPACE_CHECKS: readonly (readonly string[])[] = [
  ['scripts/check-links.mjs'],
  ['scripts/audit-public-tree.mjs'],
  ['scripts/check-render-split.mjs'],
];

export type ReleasePaths = {
  /** The source checkout the build runs in. */
  readonly workspace: string;
  /** Immutable built releases. */
  readonly releases: string;
  /** The symlink Nginx serves. */
  readonly current: string;
};

export type ReleaseStage =
  | 'nothing'
  | 'exported'
  | 'staged'
  | 'installed'
  | 'built'
  | 'checked'
  | 'published'
  | 'switched'
  | 'probed'
  | 'recorded'
  | 'pruned';

export type ReleaseResult = {
  readonly id: string;
  readonly directory: string;
  readonly previous: string | null;
  readonly articles: readonly ExportedArticle[];
  readonly stage: ReleaseStage;
  readonly removed: readonly string[];
};

function refuse(message: string, cause?: unknown): never {
  throw new AdminError('release-failed', message, cause === undefined ? undefined : { cause });
}

/** Replaces a directory's contents wholesale, creating it when absent. */
function replaceDirectory(source: string | null, target: string): void {
  rmSync(target, { recursive: true, force: true });
  mkdirSync(target, { recursive: true });
  if (source && existsSync(source)) cpSync(source, target, { recursive: true });
}

function lockfileStamp(workspace: string): string {
  const lockfile = join(workspace, 'pnpm-lock.yaml');
  if (!existsSync(lockfile)) refuse('The workspace has no pnpm-lock.yaml.');
  return createHash('sha256').update(readFileSync(lockfile)).digest('hex');
}

/**
 * Whether dependencies have to be installed before building.
 *
 * ADR 0002 section 15.2 keeps node_modules in the workspace and reinstalls only
 * when the lockfile moves. The stamp lives inside node_modules on purpose: if
 * that directory is gone, so is the stamp, and the answer is correctly yes.
 */
export function installIsNeeded(workspace: string): boolean {
  const stamp = join(workspace, 'node_modules', '.moriium-lockfile');
  if (!existsSync(join(workspace, 'node_modules'))) return true;
  if (!existsSync(stamp)) return true;
  return readFileSync(stamp, 'utf8').trim() !== lockfileStamp(workspace);
}

function recordInstall(workspace: string): void {
  const directory = join(workspace, 'node_modules');
  if (!existsSync(directory)) return;
  writeFileSync(join(directory, '.moriium-lockfile'), `${lockfileStamp(workspace)}\n`, 'utf8');
}

/** Newest first, by modification time, then by name so ties are not arbitrary. */
export function releasesByAge(releasesRoot: string): string[] {
  if (!existsSync(releasesRoot)) return [];
  return readdirSync(releasesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const full = join(releasesRoot, entry.name);
      return { full, name: entry.name, at: statSync(full).mtimeMs };
    })
    .sort((a, b) => (b.at - a.at) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .map((entry) => entry.full);
}

export type ReleaseOptions = {
  readonly store: ArticleStore;
  readonly media: MediaStore;
  readonly host: ReleaseHost;
  readonly paths: ReleasePaths;
  /** A git sha or a timestamp. Becomes the release directory name. */
  readonly id: string;
  /** The URL to ask whether the site is really serving. */
  readonly probeUrl: string;
  readonly contentRoot?: string | undefined;
  readonly mediaRoot?: string | undefined;
  readonly keep?: number | undefined;
};

type Progress = { stage: ReleaseStage };

/**
 * Runs the sequence, and names the last stage that completed when it fails.
 *
 * An operator reading "stopped after 'checked'" knows the site was never
 * switched; reading "stopped after 'switched'" knows to look at whether the
 * link was restored. Without it, every failure looks the same from outside.
 */
export async function releaseSite(options: ReleaseOptions): Promise<ReleaseResult> {
  // Checked before the try so its failure is not reported as an export failure.
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(options.id)) {
    refuse('A release id must be a plain name, not a path.');
  }
  const progress: Progress = { stage: 'nothing' };
  try {
    return await runRelease(options, progress);
  } catch (error) {
    const detail =
      error instanceof AdminError
        ? error.userMessage
        : error instanceof Error
          ? error.message
          : String(error);
    // Every failure is reported as one release failure carrying the stage,
    // including the ones that arrive from the export or from the article store.
    // A `db-locked` bubbling out raw would tell an operator which SQLite call
    // failed and nothing about whether the site had already been switched.
    throw new AdminError(
      'release-failed',
      progress.stage === 'nothing'
        ? `Release ${options.id} failed while exporting: ${detail}`
        : `Release ${options.id} stopped after "${progress.stage}": ${detail}`,
      { cause: error },
    );
  }
}

async function runRelease(options: ReleaseOptions, progress: Progress): Promise<ReleaseResult> {
  const workspace = resolve(options.paths.workspace);
  const releasesRoot = resolve(options.paths.releases);
  const currentLink = resolve(options.paths.current);
  const keep = options.keep ?? RETAINED_RELEASES;
  const releaseDirectory = join(releasesRoot, options.id);
  // A mistyped --root would otherwise create an empty tree and then fail at the
  // install, several steps and one confusing message later.
  if (!existsSync(workspace)) refuse('The workspace directory does not exist.');

  // 1. Export. Its own failures leave the previous export and the live site
  //    untouched; see src/server/export/content-export.ts.
  const exported = await exportPublished({
    store: options.store,
    media: options.media,
    ...(options.contentRoot === undefined ? {} : { root: options.contentRoot }),
    ...(options.mediaRoot === undefined ? {} : { mediaRoot: options.mediaRoot }),
  });
  progress.stage = 'exported';

  // 2. Stage the export as build input.
  replaceDirectory(
    join(exported.directory, 'posts'),
    join(workspace, 'src', 'content', 'posts', STAGED_POSTS_DIRECTORY),
  );
  // The export owns /media/ entirely: the public path of every asset is derived
  // from its sanitized bytes, so a file in there that the export did not write
  // is one no article can legitimately reference.
  replaceDirectory(join(exported.directory, 'media'), join(workspace, 'public', 'media'));
  const manifest = join(exported.directory, MANIFEST_NAME);
  if (existsSync(manifest)) {
    const generated = join(workspace, 'src', 'generated');
    mkdirSync(generated, { recursive: true });
    cpSync(manifest, join(generated, MANIFEST_NAME));
  }
  progress.stage = 'staged';

  // 3. Install only when the lockfile moved.
  if (installIsNeeded(workspace)) {
    options.host.run('pnpm', ['install', '--frozen-lockfile'], workspace);
    recordInstall(workspace);
  }
  progress.stage = 'installed';

  // 4. Build.
  options.host.run('pnpm', ['build'], workspace);
  progress.stage = 'built';

  // 5. Pre-live checks, before anything is moved into place.
  for (const check of WORKSPACE_CHECKS) {
    options.host.run('node', check, workspace);
  }
  progress.stage = 'checked';

  // 6. Publish the prerendered half as an immutable release. Only dist/client
  //    is served: dist/server is the on-demand entry, which the resident admin
  //    process runs from, not something Nginx hands to a reader.
  const built = join(workspace, 'dist', 'client');
  if (!existsSync(built)) refuse('The build produced no dist/client directory.');
  mkdirSync(releasesRoot, { recursive: true });
  rmSync(releaseDirectory, { recursive: true, force: true });
  cpSync(built, releaseDirectory, { recursive: true });
  assertServable(releaseDirectory, exported.articles);
  progress.stage = 'published';

  // 7. Switch. One rename; the reader never resolves a missing path.
  const previous = options.host.linkTarget(currentLink);
  options.host.switchLink(currentLink, releaseDirectory);
  progress.stage = 'switched';

  // 8. Ask the running site. A release that switched but does not answer is
  //    worse than one that never switched, so this failure undoes the switch.
  try {
    await options.host.probe(options.probeUrl);
  } catch (cause) {
    if (previous) options.host.switchLink(currentLink, previous);
    refuse(
      previous
        ? 'The switched release did not answer; the previous release was restored.'
        : 'The switched release did not answer, and there was no previous release to restore.',
      cause,
    );
  }
  progress.stage = 'probed';

  // 9. Only now is `live` true. Articles that were unpublished are cleared in
  //    the same pass: the site no longer contains them, so a live pointer left
  //    behind would be a claim about a page that is gone.
  for (const article of exported.articles) {
    options.store.markLive(article.articleId, article.versionId);
  }
  for (const article of options.store.listArticles()) {
    if (article.publishedVersionId === null && article.liveVersionId !== null) {
      options.store.markNotLive(article.id);
    }
  }
  progress.stage = 'recorded';

  // 10. Retain six. Never the one being served, and never a path outside the
  //     releases root -- a delete that trusts a computed path is how a release
  //     script becomes an outage.
  const removed: string[] = [];
  const live = options.host.linkTarget(currentLink);
  for (const candidate of releasesByAge(releasesRoot).slice(keep)) {
    if (candidate === live || candidate === releaseDirectory) continue;
    const inside = relative(releasesRoot, candidate);
    if (!inside || inside.startsWith('..') || isAbsolute(inside)) continue;
    rmSync(candidate, { recursive: true, force: true });
    removed.push(candidate);
  }
  progress.stage = 'pruned';

  return {
    id: options.id,
    directory: releaseDirectory,
    previous,
    articles: exported.articles,
    stage: progress.stage,
    removed,
  };
}

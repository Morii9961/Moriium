// What has to be true about a built release before it is allowed in front of a
// reader (ADR 0002 section 15.3 step 5).
//
// These are the checks that read the built files directly. The repository's
// own checks -- links, the public-tree audit, the rendering split -- run as
// commands inside the workspace, because they already exist and duplicating
// them here would create two definitions of the same rule.
//
// One check is new in this block: every article the export wrote must have a
// built page. Without it, an article that the build silently dropped -- a
// schema change, a loader filter, a rename -- would go live as a 404 while the
// database happily recorded it as live.
//
// Refusals name what is wrong, not where it is on disk. src/server/errors.ts
// requires a user message to carry no filesystem path, and these messages reach
// an operator's terminal and, later, an author's screen.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { AdminError } from '../errors.ts';
import type { ExportedArticle } from '../export/content-export.ts';

const LANGUAGES = ['zh', 'ja', 'en'] as const;

function refuse(message: string): never {
  throw new AdminError('release-failed', `The built release is not servable: ${message}`);
}

/** Refuses unless the file exists and has content. */
function requireNonEmpty(file: string, description: string): void {
  let size: number;
  try {
    const stats = statSync(file);
    if (!stats.isFile()) refuse(`${description} is not a file.`);
    size = stats.size;
  } catch (cause) {
    if (cause instanceof AdminError) throw cause;
    refuse(`${description} is missing.`);
  }
  if (size === 0) refuse(`${description} is empty.`);
}

/** Any zero-byte HTML file is a build that failed without saying so. */
function refuseEmptyHtml(root: string, directory: string): void {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) refuseEmptyHtml(root, full);
    else if (entry.name.endsWith('.html') && statSync(full).size === 0) {
      refuse(`${relative(root, full).split('\\').join('/')} is an empty HTML file.`);
    }
  }
}

/**
 * The public route of an exported article, as a path inside the release.
 *
 * `trailingSlash: 'always'` makes every page a directory with an index.html,
 * so this mirrors what Nginx will resolve rather than guessing at a filename.
 */
export function pagePathFor(article: ExportedArticle): string {
  const tail = article.slug.replace(/^(zh|ja|en)\//, '');
  return join(article.lang, 'posts', tail, 'index.html');
}

export function assertServable(
  releaseDirectory: string,
  articles: readonly ExportedArticle[] = [],
): void {
  for (const language of LANGUAGES) {
    requireNonEmpty(join(releaseDirectory, language, 'index.html'), `the ${language} home page`);
  }
  requireNonEmpty(join(releaseDirectory, 'sitemap-index.xml'), 'the sitemap');

  const home = readFileSync(join(releaseDirectory, 'zh', 'index.html'), 'utf8');
  if (!home.includes('<title>')) refuse('the zh home page has no title element.');

  for (const article of articles) {
    requireNonEmpty(join(releaseDirectory, pagePathFor(article)), `the page for ${article.slug}`);
  }

  refuseEmptyHtml(releaseDirectory, releaseDirectory);
}

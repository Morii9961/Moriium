// Turning one published version back into a Markdown file.
//
// The database stores frontmatter as columns, but src/content.config.ts reads
// it as YAML, so the export has to serialize it again. Two decisions here are
// deliberate and would otherwise look like carelessness:
//
//   * Every string scalar is emitted as a JSON string. JSON is a subset of YAML
//     1.2, so `JSON.stringify` produces a valid double-quoted scalar for any
//     input -- a title holding a colon, a leading `#`, a `%`, a newline, or a
//     CJK sentence -- without this module owning a quoting heuristic. A quoting
//     heuristic is exactly the kind of code that works until the first title
//     that starts with `- `.
//   * Field order follows sharedMetadata in src/content.config.ts. Nothing
//     depends on it, but an exported file that reads like a hand-written one is
//     a file Morii can still edit by hand if the admin is ever unavailable.
//
// The output is deterministic: the same version always produces the same bytes,
// which is what lets the export verify by re-reading and lets an unchanged
// article export to an unchanged file.

import type { Article, Version } from '../articles.ts';

/**
 * A YAML double-quoted scalar. JSON's escapes are all valid YAML escapes.
 *
 * The two characters JSON leaves raw and the YAML versions disagree about are
 * escaped explicitly: U+2028 and U+2029 are line breaks in YAML 1.1 and plain
 * characters in YAML 1.2, so emitting them literally would make the file mean
 * different things to different parsers. Escaped, both read them as content.
 */
function scalar(value: string): string {
  return JSON.stringify(value).replace(
    /[\u2028\u2029]/g,
    (character) => (character === '\u2028' ? '\\u2028' : '\\u2029'),
  );
}

function line(key: string, value: string): string {
  return `${key}: ${value}`;
}

/**
 * Normalizes a stored body to what a Markdown file on disk looks like.
 *
 * CRLF becomes LF and trailing blank lines collapse to a single newline. Both
 * are invisible to Markdown, and both would otherwise make the same article
 * export to different bytes depending on which machine typed into it.
 */
export function normalizeBody(markdown: string): string {
  return `${markdown.replace(/\r\n/g, '\n').replace(/\s+$/, '')}\n`;
}

/**
 * Serializes one published version as the Markdown file the build will read.
 *
 * `draft` is emitted from the version rather than forced to false. The publish
 * gate already refuses a draft, so a `draft: true` reaching this function means
 * something upstream is wrong, and writing the truth makes the public build
 * fail loudly instead of quietly publishing what was never approved.
 */
export function toMarkdownFile(article: Article, version: Version): string {
  const fields: string[] = [
    line('title', scalar(version.title)),
    line('slug', scalar(article.slug)),
    line('summary', scalar(version.summary)),
    line('publishedAt', scalar(version.publishedAt)),
  ];
  if (version.updatedAt !== null) fields.push(line('updatedAt', scalar(version.updatedAt)));
  fields.push(
    line('lang', scalar(article.lang)),
    line('translationKey', scalar(article.translationKey)),
    line('category', scalar(version.category)),
  );
  if (version.tags.length === 0) {
    fields.push(line('tags', '[]'));
  } else {
    fields.push('tags:', ...version.tags.map((tag) => `  - ${scalar(tag)}`));
  }
  if (version.cover !== null) {
    fields.push(line('cover', scalar(version.cover)));
    // The schema requires coverAlt whenever cover is present, and so does a
    // CHECK constraint on the versions table. Emitting an empty string here
    // would satisfy YAML and fail the build, which is the correct order.
    fields.push(line('coverAlt', scalar(version.coverAlt ?? '')));
  }
  fields.push(
    line('draft', String(version.draft)),
    line('unlisted', String(version.unlisted)),
    line('copyProtection', String(version.copyProtection)),
  );

  return `---\n${fields.join('\n')}\n---\n\n${normalizeBody(version.markdown)}`;
}

/**
 * The path an exported article takes inside the export tree.
 *
 * Derived from the slug, which the schema makes unique, so two articles cannot
 * collide on one file. The Astro collection keys posts by `data.slug` rather
 * than by file id (src/utils/content.ts), so this name is free to be regular.
 */
export function exportPathFor(article: Article): string {
  const tail = article.slug.replace(/^(zh|ja|en)\//, '');
  return `posts/${article.lang}/${tail}.md`;
}

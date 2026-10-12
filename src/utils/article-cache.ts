import { createHash } from 'node:crypto';

type Entry = { id: string; data: unknown; body?: string | undefined };
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

/** Metadata outside the current article changes translations, navigation and taxonomy. */
export function articleContextKey(entries: readonly Entry[], external: readonly string[] = []): string {
  return hash({ entries: entries.map(({ id, data }) => ({ id, data })).sort((a, b) => a.id.localeCompare(b.id, 'en')), external });
}

export function articleCacheKey(post: Entry, context: string): string {
  return hash({ id: post.id, data: post.data, body: post.body ?? '', context });
}

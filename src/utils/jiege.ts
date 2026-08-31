import { jgPath } from '../data/jiege';
import { postPath, routeSlug, type Post, type ProtectedPost } from './content';

/**
 * Where a listing entry points inside the 「界格」 study.
 *
 * The study implements the reader for the `posts` collection only. An encrypted
 * post keeps its production route: the decryption flow is behaviour this
 * direction does not restyle and must not silently break.
 */
export function jgEntryHref(entry: Post | ProtectedPost) {
  if (entry.collection === 'protected') return postPath(entry);
  return jgPath(entry.data.lang, 'posts', routeSlug(entry));
}

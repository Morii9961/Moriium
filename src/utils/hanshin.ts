import { hsPath } from '../data/hanshin';
import { postPath, routeSlug, type Post, type ProtectedPost } from './content';

/**
 * Where a listing entry points inside the 「版心」 study.
 *
 * The study implements the reader for the `posts` collection only. An encrypted
 * post keeps its production route, because the decryption flow is behaviour
 * this direction does not restyle and must not silently break.
 */
export function hsEntryHref(entry: Post | ProtectedPost) {
  if (entry.collection === 'protected') return postPath(entry);
  return hsPath(entry.data.lang, 'posts', routeSlug(entry));
}

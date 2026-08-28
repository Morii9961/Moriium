import { getCollection, type CollectionEntry } from 'astro:content';
import type { Language } from '../data/site';

export type Post = CollectionEntry<'posts'>;
export type ProtectedPost = CollectionEntry<'protected'>;

export function postPath(post: Post | ProtectedPost) {
  const section = post.collection === 'protected' ? 'protected' : 'posts';
  return `/${post.data.lang}/${section}/${routeSlug(post)}/`;
}

export function routeSlug(post: Post | ProtectedPost) {
  return post.data.slug.replace(/^(zh|ja|en)\//, '');
}

export async function getPublishedPosts(lang?: Language) {
  const posts = await getCollection('posts', ({ data }) => !data.draft);
  return posts
    .filter((post) => !lang || post.data.lang === lang)
    .sort((a, b) => b.data.publishedAt.valueOf() - a.data.publishedAt.valueOf());
}

export async function getListedPosts(lang?: Language) {
  const [posts, protectedPosts] = await Promise.all([
    getPublishedPosts(lang),
    getCollection('protected', ({ data }) => !data.draft && data.listed && (!lang || data.lang === lang)),
  ]);

  return [...posts.filter((post) => !post.data.unlisted), ...protectedPosts].sort(
    (a, b) => b.data.publishedAt.valueOf() - a.data.publishedAt.valueOf(),
  );
}

export async function getTranslations(translationKey: string) {
  const [posts, protectedPosts] = await Promise.all([
    getCollection('posts', ({ data }) => !data.draft && data.translationKey === translationKey),
    getCollection('protected', ({ data }) => !data.draft && data.translationKey === translationKey),
  ]);
  return [...posts, ...protectedPosts];
}

export function formatDate(date: Date, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date);
}

export function uniqueTaxonomy(posts: Array<Post | ProtectedPost>, key: 'category' | 'tags') {
  const values = posts.flatMap((post) => (key === 'tags' ? post.data.tags : [post.data.category]));
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

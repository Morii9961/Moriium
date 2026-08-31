import type { APIRoute, GetStaticPaths } from 'astro';
import { SITE, UI, type Language } from '../../../../data/site';
import { formatDate, getListedPosts } from '../../../../utils/content';
import { jgEntryHref } from '../../../../utils/jiege';

/**
 * The study's own search index.
 *
 * It mirrors the production endpoint's record shape so `src/scripts/search.ts`
 * works unchanged, but resolves every result to a study route. Without this the
 * search box in the study header would either error or quietly return the
 * reader to the production pages, and either one hides whatever navigation
 * problems this direction has.
 */
export const getStaticPaths = (() =>
  SITE.languages.map((lang) => ({ params: { lang }, props: { lang } }))) satisfies GetStaticPaths;

export const GET = (async ({ props }) => {
  const { lang } = props as { lang: Language };
  const posts = await getListedPosts(lang);
  const records = posts.map((post) => ({
    title: post.data.title,
    summary: post.data.summary,
    category: post.data.category,
    tags: post.data.tags,
    date: formatDate(post.data.publishedAt, UI[lang].locale),
    url: jgEntryHref(post),
  }));

  return new Response(JSON.stringify(records), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=0, must-revalidate',
    },
  });
}) satisfies APIRoute;

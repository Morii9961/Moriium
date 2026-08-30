import type { APIRoute, GetStaticPaths } from 'astro';
import { SITE, UI, type Language } from '../../../../data/site';
import { formatDate, getListedPosts } from '../../../../utils/content';
import { hsEntryHref } from '../../../../utils/hanshin';

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
    url: hsEntryHref(post),
  }));

  return new Response(JSON.stringify(records), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=0, must-revalidate',
    },
  });
}) satisfies APIRoute;

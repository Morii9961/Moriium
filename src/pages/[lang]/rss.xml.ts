import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { SITE, UI, type Language } from '../../data/site';
import { getListedPosts, postPath } from '../../utils/content';

export function getStaticPaths() {
  return SITE.languages.map((lang) => ({ params: { lang }, props: { lang } }));
}

export async function GET(context: APIContext) {
  const lang = context.props.lang as Language;
  const posts = await getListedPosts(lang);
  return rss({
    title: `${SITE.name} · ${UI[lang].label}`,
    description: UI[lang].description,
    site: context.site!,
    items: posts.map((post) => ({
      title: post.data.title,
      // A feed reader renders the title and this line and nothing else, so the
      // article page's notice never reaches a subscriber. Without the marker
      // here the variant would arrive under Morii's name with no sign that a
      // machine wrote the words (AGENTS.md).
      description: post.data.machineTranslation
        ? `${UI[lang].machineTranslatedFeed} ${post.data.summary}`
        : post.data.summary,
      pubDate: post.data.publishedAt,
      link: postPath(post),
      categories: [post.data.category, ...post.data.tags],
    })),
    customData: `<language>${UI[lang].locale}</language>`,
  });
}

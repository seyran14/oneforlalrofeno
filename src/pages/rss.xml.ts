import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { getPostsFromNotion, postSlug } from '../lib/notion';

export async function GET(context: APIContext) {
  const posts = await getPostsFromNotion();
  const site = (context.site?.toString() ?? 'https://seyran.cc').replace(/\/$/, '');

  return rss({
    title: 'Seyran',
    description: 'Posts and thoughts',
    site,
    items: posts.map((post) => ({
      title: post.title,
      // Отдельных страниц у постов нет — ведём на якорь в общем списке.
      // Ссылка абсолютная: относительную помощник нормализует и приклеивает
      // слеш после якоря
      link: `${site}/posts/#${postSlug(post.title)}`,
      pubDate: post.isoDate ? new Date(post.isoDate) : undefined,
      description: post.content,
    })),
    customData: '<language>en</language>',
  });
}

import type { APIRoute } from 'astro';
import { ArticleStore } from '../../../server/articles.ts';
import { getDatabase } from '../../../server/db/runtime.ts';
import { handleArticlesCollection } from '../../../server/http/article-handlers.ts';
import { adminJson } from '../../../server/http/boundary.ts';

export const prerender = false;

const handle: APIRoute = async ({ request, session }) => {
  if (!session) return adminJson({ error: 'Session storage unavailable.' }, 500);
  const db = getDatabase();
  return handleArticlesCollection(request, session, new ArticleStore(db), db);
};

export const GET = handle;
export const POST = handle;

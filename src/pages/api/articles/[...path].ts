import type { APIRoute } from 'astro';
import { ArticleStore } from '../../../server/articles.ts';
import { getDatabase } from '../../../server/db/runtime.ts';
import {
  handleArticleResource,
  type ArticleAction,
} from '../../../server/http/article-handlers.ts';
import { adminJson } from '../../../server/http/boundary.ts';

export const prerender = false;

const ARTICLE_PATH = /^(\d+)(?:\/(versions|autosave|preview|publish|rollback|unpublish))?$/;

const handle: APIRoute = async ({ request, session, params }) => {
  if (!session) return adminJson({ error: '会话存储不可用。' }, 500);
  const match = ARTICLE_PATH.exec(params.path ?? '');
  if (!match) return adminJson({ error: '文章接口路径不存在。' }, 404);
  const articleId = Number(match[1]);
  if (!Number.isSafeInteger(articleId) || articleId <= 0) {
    return adminJson({ error: '文章接口路径不存在。' }, 404);
  }
  const db = getDatabase();
  return handleArticleResource(
    request,
    session,
    new ArticleStore(db),
    db,
    articleId,
    match[2] as ArticleAction | undefined,
  );
};

export const GET = handle;
export const POST = handle;

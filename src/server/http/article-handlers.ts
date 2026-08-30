// Author-only article HTTP boundary. There is deliberately no anonymous
// runtime reader API: public readers continue to use prerendered files.

import type { DatabaseSync } from 'node:sqlite';
import { z } from 'astro/zod';
import { ArticleStore, type NewArticle, type SaveInput, type VersionFields } from '../articles.ts';
import { requireAuthor, verifyCsrfToken, type AuthorSession } from '../auth/session.ts';
import { AdminError, describeForLog, isAdminError } from '../errors.ts';
import { preparePublishValidator } from '../publishing/publish-gate.ts';
import { adminBoundaryAllows, adminJson, readJsonObject } from './boundary.ts';
import { toArticleDetailDto, toArticleListDto } from './article-dtos.ts';

const MAX_ARTICLE_BYTES = 2 * 1024 * 1024;

const versionFields = z
  .object({
    title: z.string(),
    summary: z.string(),
    publishedAt: z.string(),
    updatedAt: z.string().nullable(),
    category: z.string(),
    tags: z.array(z.string()),
    cover: z.string().nullable(),
    coverAlt: z.string().nullable(),
    draft: z.boolean(),
    unlisted: z.boolean(),
    copyProtection: z.boolean(),
    markdown: z.string(),
    editorJson: z.string().nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.cover && !value.coverAlt) {
      context.addIssue({
        code: 'custom',
        path: ['coverAlt'],
        message: 'coverAlt is required when cover is present',
      });
    }
  });

const createArticle = versionFields.extend({
  translationKey: z.string(),
  lang: z.enum(['zh', 'ja', 'en']),
  slug: z.string(),
});

const pointAtVersion = z
  .object({
    versionId: z.number().int().positive(),
    note: z.string().max(2_000).optional(),
  })
  .strict();

const noteOnly = z.object({ note: z.string().max(2_000).optional() }).strict();

export type ArticleAction = 'versions' | 'autosave' | 'publish' | 'rollback' | 'unpublish';

class RequestBodyError extends Error {
  readonly status: 400 | 413 | 415;

  constructor(status: 400 | 413 | 415, message: string) {
    super(message);
    this.name = 'RequestBodyError';
    this.status = status;
  }
}

async function authenticated(
  request: Request,
  session: AuthorSession,
  write: boolean,
): Promise<{ readonly ok: true; readonly authorId: number } | { readonly ok: false; readonly response: Response }> {
  if (!adminBoundaryAllows(request, write)) {
    return { ok: false, response: adminJson({ error: 'Request refused.' }, 403) };
  }
  const author = await requireAuthor(session);
  if (!author) {
    return { ok: false, response: adminJson({ error: 'Authentication required.' }, 401) };
  }
  if (write && !(await verifyCsrfToken(session, request.headers.get('X-CSRF-Token')))) {
    return { ok: false, response: adminJson({ error: 'Request refused.' }, 403) };
  }
  return { ok: true, authorId: author.id };
}

async function bodyObject(request: Request): Promise<Record<string, unknown>> {
  if (request.headers.get('Content-Type')?.split(';', 1)[0]?.trim() !== 'application/json') {
    throw new RequestBodyError(415, 'Expected a JSON request.');
  }
  const body = await readJsonObject(request, MAX_ARTICLE_BYTES);
  if (!body.ok) {
    if (body.status === 413) {
      throw new RequestBodyError(413, 'The article request is too large.');
    }
    throw new RequestBodyError(400, 'The article request is invalid.');
  }
  return body.value;
}

function responseForError(error: unknown): Response {
  if (error instanceof RequestBodyError) {
    return adminJson({ error: error.message }, error.status);
  }
  if (isAdminError(error)) {
    const status =
      error.code === 'unauthorized'
        ? 401
        : error.code === 'forbidden' ||
            error.code === 'path-outside-root' ||
            error.code === 'media-gate-refused'
          ? 403
          : error.code === 'conflict'
            ? 409
            : error.code === 'db-locked'
              ? 503
              : error.code === 'validation-failed'
                ? 400
                : 500;
    return adminJson({ error: error.userMessage, code: error.code }, status);
  }
  console.error(describeForLog(error));
  return adminJson({ error: 'The author API could not complete that request.' }, 500);
}

function parsed<T>(result: { success: true; data: T } | { success: false }): T {
  if (!result.success) throw new AdminError('validation-failed', 'The article request is invalid.');
  return result.data;
}

export async function handleArticlesCollection(
  request: Request,
  session: AuthorSession,
  store: ArticleStore,
  _db: DatabaseSync,
): Promise<Response> {
  const write = request.method !== 'GET';
  const auth = await authenticated(request, session, write);
  if (!auth.ok) return auth.response;

  try {
    if (request.method === 'GET') {
      return adminJson({ articles: store.listArticles().map((article) => toArticleListDto(store, article)) }, 200);
    }
    if (request.method !== 'POST') return adminJson({ error: 'Method not allowed.' }, 405);

    const input = parsed(createArticle.safeParse(await bodyObject(request)));
    const article = store.createArticle({ ...input, authorId: auth.authorId } satisfies NewArticle);
    return adminJson({ article, latest: store.getLatest(article.id) }, 201);
  } catch (error) {
    return responseForError(error);
  }
}

export async function handleArticleResource(
  request: Request,
  session: AuthorSession,
  store: ArticleStore,
  db: DatabaseSync,
  articleId: number,
  action?: ArticleAction,
): Promise<Response> {
  const write = request.method !== 'GET';
  const auth = await authenticated(request, session, write);
  if (!auth.ok) return auth.response;

  try {
    if (request.method === 'GET' && action === undefined) {
      const article = store.getArticle(articleId);
      if (!article) throw new AdminError('validation-failed', 'That article does not exist.');
      return adminJson(toArticleDetailDto(store, article), 200);
    }
    if (request.method !== 'POST' || action === undefined) {
      return adminJson({ error: 'Method not allowed.' }, 405);
    }

    const body = await bodyObject(request);
    if (action === 'versions' || action === 'autosave') {
      const input = parsed(versionFields.safeParse(body));
      const saveInput = { ...input, authorId: auth.authorId } satisfies SaveInput;
      const version = action === 'autosave'
        ? store.autosave(articleId, saveInput)
        : store.saveVersion(articleId, saveInput);
      return adminJson({ version }, 201);
    }

    if (action === 'publish' || action === 'rollback') {
      const input = parsed(pointAtVersion.safeParse(body));
      const version = store.getVersion(input.versionId);
      if (!version || version.articleId !== articleId) {
        throw new AdminError('validation-failed', 'That version does not belong to this article.');
      }
      const validate = await preparePublishValidator(store, db, version);
      const options = input.note === undefined
        ? { actorId: auth.authorId, validate }
        : { actorId: auth.authorId, note: input.note, validate };
      const article = store[action](articleId, input.versionId, options);
      return adminJson({ article, published: store.getPublished(article.id) }, 200);
    }

    const input = parsed(noteOnly.safeParse(body));
    const options = input.note === undefined
      ? { actorId: auth.authorId }
      : { actorId: auth.authorId, note: input.note };
    const article = store.unpublish(articleId, options);
    return adminJson({ article }, 200);
  } catch (error) {
    return responseForError(error);
  }
}

export type { VersionFields };

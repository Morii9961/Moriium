// Prototype B's HTTP boundary.
//
// This is deliberately a thin node:http adapter: routes authenticate the
// author, apply Host / Origin / CSRF guards, validate request shapes, and call
// the storage state machine. SQL stays in storage/store.ts and request objects
// do not escape this module.

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { isPrototypeError, describeForLog, PrototypeError } from '../../../shared/errors.ts';
import { LANGUAGES, SLUG_PATTERN, type Language } from '../../../shared/content-schema.ts';
import { verifyPassword } from '../auth/passwords.ts';
import { SESSION_COOKIE, SessionStore, type Session } from '../auth/sessions.ts';
import { Store, type SaveInput, type Version } from '../storage/store.ts';
import { renderPreview } from '../preview/render.ts';
import { validateVersionForPublishing } from '../publishing/publish-gate.ts';
import { checkHost, checkOrigin, guardRequest, readCookie } from './guards.ts';
import type { MediaManifest } from '../../../shared/media.ts';

const MAX_BODY_BYTES = 1024 * 1024;
const JSON_TYPE = 'application/json; charset=utf-8';

export type AdminServerOptions = {
  store: Store;
  sessions: SessionStore;
  passwordHash: string;
  allowedHosts: readonly string[];
  media: MediaManifest;
  log?: (message: string) => void;
};

type JsonObject = Record<string, unknown>;

function header(request: IncomingMessage, name: string): string | undefined {
  const value = request.headers[name];
  return typeof value === 'string' ? value : undefined;
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  const encoded = JSON.stringify(body);
  response.statusCode = status;
  response.setHeader('Content-Type', JSON_TYPE);
  response.setHeader('Content-Length', Buffer.byteLength(encoded));
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.end(encoded);
}

function sendRefusal(response: ServerResponse, result: { status: number; reason: string }): void {
  sendJson(response, result.status, { error: result.reason });
}

async function readJsonObject(request: IncomingMessage): Promise<JsonObject> {
  const declaredLength = Number(header(request, 'content-length') ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    throw new PrototypeError('validation-failed', 'Request body is too large.');
  }

  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) {
      throw new PrototypeError('validation-failed', 'Request body is too large.');
    }
    chunks.push(buffer);
  }

  if (chunks.length === 0) throw new PrototypeError('validation-failed', 'A JSON body is required.');
  try {
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new PrototypeError('validation-failed', 'The JSON body must be an object.');
    }
    return value as JsonObject;
  } catch (error) {
    if (isPrototypeError(error)) throw error;
    throw new PrototypeError('validation-failed', 'The request body is not valid JSON.');
  }
}

function requiredString(body: JsonObject, key: string, options: { trim?: boolean } = {}): string {
  const value = body[key];
  if (typeof value !== 'string') {
    throw new PrototypeError('validation-failed', `${key} must be a string.`);
  }
  const result = options.trim === false ? value : value.trim();
  if (result.length === 0) {
    throw new PrototypeError('validation-failed', `${key} must not be empty.`);
  }
  return result;
}

function optionalString(body: JsonObject, key: string): string | undefined {
  const value = body[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'string') {
    throw new PrototypeError('validation-failed', `${key} must be a string.`);
  }
  return value;
}

function versionId(body: JsonObject): number {
  const value = body.versionId;
  if (!Number.isInteger(value) || (value as number) <= 0) {
    throw new PrototypeError('validation-failed', 'versionId must be a positive integer.');
  }
  return value as number;
}

function saveInput(body: JsonObject): SaveInput {
  const editorJson = body.editorJson;
  if (editorJson !== undefined && editorJson !== null && typeof editorJson !== 'string') {
    throw new PrototypeError('validation-failed', 'editorJson must be a string or null.');
  }
  const input: SaveInput = {
    title: requiredString(body, 'title'),
    summary: requiredString(body, 'summary'),
    markdown: requiredString(body, 'markdown', { trim: false }),
  };
  if (editorJson !== undefined) input.editorJson = editorJson as string | null;
  return input;
}

function publicVersion(version: Version): Pick<Version, 'id' | 'title' | 'summary' | 'markdown'> {
  return {
    id: version.id,
    title: version.title,
    summary: version.summary,
    markdown: version.markdown,
  };
}

function sessionFor(request: IncomingMessage, sessions: SessionStore): Session | null {
  const sessionId = readCookie(header(request, 'cookie'), SESSION_COOKIE);
  return sessions.get(sessionId);
}

function requireSession(request: IncomingMessage, response: ServerResponse, sessions: SessionStore): Session | null {
  const session = sessionFor(request, sessions);
  if (!session) sendJson(response, 401, { error: 'Authentication required.' });
  return session;
}

function statusForError(error: PrototypeError): number {
  switch (error.code) {
    case 'unauthorized':
      return 401;
    case 'forbidden':
    case 'path-outside-root':
    case 'media-gate-refused':
      return 403;
    case 'conflict':
      return 409;
    case 'validation-failed':
      return 400;
    case 'db-locked':
      return 503;
    default:
      return 500;
  }
}

function factsFor(request: IncomingMessage) {
  return {
    method: request.method ?? 'GET',
    host: header(request, 'host'),
    origin: header(request, 'origin'),
    sessionId: readCookie(header(request, 'cookie'), SESSION_COOKIE),
    csrfToken: header(request, 'x-csrf-token'),
  };
}

async function handleLogin(
  request: IncomingMessage,
  response: ServerResponse,
  options: AdminServerOptions,
): Promise<void> {
  const host = checkHost(header(request, 'host'), options);
  if (!host.ok) return sendRefusal(response, host);
  const origin = checkOrigin(request.method ?? 'POST', header(request, 'origin'), options);
  if (!origin.ok) return sendRefusal(response, origin);

  if (options.sessions.isLockedOut()) {
    response.setHeader('Retry-After', Math.ceil(options.sessions.retryAfterMs() / 1000));
    return sendJson(response, 429, { error: 'Too many failed login attempts. Try again later.' });
  }

  const body = await readJsonObject(request);
  const password = requiredString(body, 'password', { trim: false });
  if (!(await verifyPassword(password, options.passwordHash))) {
    options.sessions.recordFailedLogin();
    return sendJson(response, 401, { error: 'Invalid password.' });
  }

  options.sessions.recordSuccessfulLogin();
  const session = options.sessions.create();
  response.setHeader('Set-Cookie', options.sessions.cookieFor(session));
  sendJson(response, 200, { csrfToken: session.csrfToken, expiresAt: session.expiresAt });
}

function articleIdFrom(pathname: string): { id: number; action: string | undefined } | null {
  const match = /^\/api\/articles\/(\d+)(?:\/(versions|autosave|preview|publish|rollback))?$/.exec(pathname);
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isSafeInteger(id) && id > 0 ? { id, action: match[2] } : null;
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  options: AdminServerOptions,
): Promise<void> {
  const method = (request.method ?? 'GET').toUpperCase();
  const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;

  if (method === 'POST' && pathname === '/api/login') {
    return handleLogin(request, response, options);
  }

  const host = checkHost(header(request, 'host'), options);
  if (!host.ok) return sendRefusal(response, host);

  const publicMatch = /^\/api\/public\/articles\/(\d+)$/.exec(pathname);
  if (method === 'GET' && publicMatch) {
    const id = Number(publicMatch[1]);
    const article = options.store.getArticle(id);
    const version = article ? options.store.getPublished(article.id) : null;
    if (!article || !version) return sendJson(response, 404, { error: 'Article not found.' });
    return sendJson(response, 200, {
      article: {
        id: article.id,
        lang: article.lang,
        slug: article.slug,
        translationKey: article.translationKey,
      },
      version: publicVersion(version),
    });
  }

  const session = requireSession(request, response, options.sessions);
  if (!session) return;

  if (method === 'GET' && pathname === '/api/articles') {
    const articles = options.store.listArticles().map((article) => ({
      ...article,
      latest: options.store.getLatest(article.id),
      hasUnpublishedChanges: options.store.hasUnpublishedChanges(article.id),
    }));
    return sendJson(response, 200, { articles });
  }

  const route = articleIdFrom(pathname);
  if (method === 'GET' && route && route.action === undefined) {
    const article = options.store.getArticle(route.id);
    if (!article) return sendJson(response, 404, { error: 'Article not found.' });
    return sendJson(response, 200, {
      article,
      latest: options.store.getLatest(article.id),
      published: options.store.getPublished(article.id),
      versions: options.store.listVersions(article.id),
      audit: options.store.listAudit(article.id),
    });
  }

  const guarded = guardRequest(factsFor(request), options.sessions, options);
  if (!guarded.ok) return sendRefusal(response, guarded);

  if (method === 'POST' && pathname === '/api/logout') {
    options.sessions.destroy(session.id);
    response.statusCode = 204;
    response.setHeader('Set-Cookie', options.sessions.clearedCookie());
    response.end();
    return;
  }

  if (method === 'POST' && pathname === '/api/articles') {
    const body = await readJsonObject(request);
    const lang = requiredString(body, 'lang') as Language;
    if (!(LANGUAGES as readonly string[]).includes(lang)) {
      throw new PrototypeError('validation-failed', 'lang must be zh, ja or en.');
    }
    const slug = requiredString(body, 'slug');
    if (!SLUG_PATTERN.test(slug) || !slug.startsWith(`${lang}/`)) {
      throw new PrototypeError('validation-failed', 'slug must start with the selected language.');
    }
    const article = options.store.createArticle({
      translationKey: requiredString(body, 'translationKey'),
      lang,
      slug,
      title: requiredString(body, 'title'),
      summary: requiredString(body, 'summary'),
      markdown: requiredString(body, 'markdown', { trim: false }),
    });
    return sendJson(response, 201, { article, latest: options.store.getLatest(article.id) });
  }

  if (method === 'POST' && route?.action === 'versions') {
    const version = options.store.saveVersion(route.id, saveInput(await readJsonObject(request)));
    return sendJson(response, 201, { version });
  }

  if (method === 'POST' && route?.action === 'autosave') {
    const version = options.store.autosave(route.id, saveInput(await readJsonObject(request)));
    return sendJson(response, 201, { version });
  }

  // Preview is a POST because it carries the body being edited, which has not
  // been saved yet and can be larger than a URL should hold. Sitting behind
  // guardRequest is the point rather than a side effect: an unpublished draft
  // must not be renderable by an anonymous request or from another origin.
  if (method === 'POST' && route?.action === 'preview') {
    const article = options.store.getArticle(route.id);
    if (!article) return sendJson(response, 404, { error: 'Article not found.' });

    const body = await readJsonObject(request);
    const supplied = body.markdown;
    if (supplied !== undefined && typeof supplied !== 'string') {
      throw new PrototypeError('validation-failed', 'markdown must be a string.');
    }
    const markdown = supplied ?? options.store.getLatest(article.id)?.markdown;
    if (markdown === undefined) {
      return sendJson(response, 404, { error: 'The article has no version to preview.' });
    }
    return sendJson(response, 200, { html: await renderPreview(markdown) });
  }

  if (method === 'POST' && (route?.action === 'publish' || route?.action === 'rollback')) {
    const body = await readJsonObject(request);
    const action = route.action;
    const note = optionalString(body, 'note');
    const validate = (version: Version): void =>
      validateVersionForPublishing(options.store, version, options.media);
    const publishOptions = note === undefined ? { validate } : { note, validate };
    const article = options.store[action](route.id, versionId(body), publishOptions);
    return sendJson(response, 200, { article, published: options.store.getPublished(article.id) });
  }

  sendJson(response, 404, { error: 'Route not found.' });
}

export function createAdminServer(options: AdminServerOptions): Server {
  return createServer((request, response) => {
    void handleRequest(request, response, options).catch((error: unknown) => {
      options.log?.(describeForLog(error));
      if (response.headersSent) {
        response.destroy();
        return;
      }
      if (isPrototypeError(error)) {
        sendJson(response, statusForError(error), { error: error.userMessage, code: error.code });
        return;
      }
      sendJson(response, 500, { error: 'Unexpected server error.' });
    });
  });
}

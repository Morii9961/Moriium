// The browser side of prototype B's HTTP boundary.
//
// Every write carries the CSRF token the login response handed back, because
// the server refuses writes without it. The token lives in memory only: a
// reload sends Morii back through the login form, which is the honest
// behaviour for a spike whose sessions also live in memory.

export type Language = 'zh' | 'ja' | 'en';

export type Article = {
  id: number;
  translationKey: string;
  lang: Language;
  slug: string;
  publishedVersionId: number | null;
  createdAt: string;
};

export type Version = {
  id: number;
  articleId: number;
  title: string;
  summary: string;
  markdown: string;
  editorJson: string | null;
  kind: 'autosave' | 'manual';
  createdAt: string;
};

export type AuditEntry = {
  id: number;
  articleId: number;
  action: 'publish' | 'rollback' | 'unpublish';
  versionId: number | null;
  note: string | null;
  createdAt: string;
};

export type ArticleRow = Article & { latest: Version | null; hasUnpublishedChanges: boolean };

export type ArticleDetail = {
  article: Article;
  latest: Version | null;
  published: Version | null;
  versions: Version[];
  audit: AuditEntry[];
};

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

let csrfToken = '';

async function send<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET' && csrfToken) headers['X-CSRF-Token'] = csrfToken;

  // exactOptionalPropertyTypes means an absent body must be an absent key, not
  // a key set to undefined.
  const init: RequestInit = { method, headers, credentials: 'same-origin' };
  if (body !== undefined) init.body = JSON.stringify(body);

  const response = await fetch(path, init);

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  const payload: unknown = text ? JSON.parse(text) : {};
  if (!response.ok) {
    const message =
      typeof payload === 'object' && payload !== null && 'error' in payload
        ? String((payload as { error: unknown }).error)
        : `Request failed with ${response.status}.`;
    throw new ApiError(response.status, message);
  }
  return payload as T;
}

export const api = {
  get signedIn(): boolean {
    return csrfToken !== '';
  },

  async login(password: string): Promise<void> {
    const result = await send<{ csrfToken: string }>('POST', '/api/login', { password });
    csrfToken = result.csrfToken;
  },

  async logout(): Promise<void> {
    await send<void>('POST', '/api/logout');
    csrfToken = '';
  },

  listArticles(): Promise<{ articles: ArticleRow[] }> {
    return send('GET', '/api/articles');
  },

  getArticle(id: number): Promise<ArticleDetail> {
    return send('GET', `/api/articles/${id}`);
  },

  createArticle(input: {
    translationKey: string;
    lang: Language;
    slug: string;
    title: string;
    summary: string;
    markdown: string;
  }): Promise<{ article: Article }> {
    return send('POST', '/api/articles', input);
  },

  saveVersion(
    id: number,
    input: { title: string; summary: string; markdown: string; editorJson?: string },
  ): Promise<{ version: Version }> {
    return send('POST', `/api/articles/${id}/versions`, input);
  },

  autosave(
    id: number,
    input: { title: string; summary: string; markdown: string; editorJson?: string },
  ): Promise<{ version: Version }> {
    return send('POST', `/api/articles/${id}/autosave`, input);
  },

  publish(id: number, versionId: number, note?: string): Promise<{ article: Article }> {
    return send('POST', `/api/articles/${id}/publish`, { versionId, note });
  },

  rollback(id: number, versionId: number, note?: string): Promise<{ article: Article }> {
    return send('POST', `/api/articles/${id}/rollback`, { versionId, note });
  },

  /** What an anonymous reader would get. Used by the reader-view panel. */
  async readerView(id: number): Promise<{ version: Version } | null> {
    try {
      return await send('GET', `/api/public/articles/${id}`);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return null;
      throw error;
    }
  },
};

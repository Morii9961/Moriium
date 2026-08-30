// Browser client for the author-only production API.

export type Language = 'zh' | 'ja' | 'en';
export type VersionKind = 'autosave' | 'manual';

export type Author = { readonly id: number; readonly name: string };

export type Article = {
  readonly id: number;
  readonly translationKey: string;
  readonly lang: Language;
  readonly slug: string;
  readonly createdAt: string;
  readonly publishedVersionId: number | null;
  readonly liveVersionId: number | null;
};

export type VersionFields = {
  title: string;
  summary: string;
  publishedAt: string;
  updatedAt: string | null;
  category: string;
  tags: string[];
  cover: string | null;
  coverAlt: string | null;
  draft: boolean;
  unlisted: boolean;
  copyProtection: boolean;
  markdown: string;
  editorJson: string | null;
};

export type Version = VersionFields & {
  readonly id: number;
  readonly articleId: number;
  readonly authorId: number;
  readonly kind: VersionKind;
  readonly createdAt: string;
};

export type AuditEntry = {
  readonly id: number;
  readonly at: string;
  readonly actorId: number;
  readonly action: 'publish' | 'rollback' | 'unpublish';
  readonly articleId: number;
  readonly fromVersionId: number | null;
  readonly toVersionId: number | null;
  readonly note: string | null;
};

export type ArticleRow = {
  readonly article: Article;
  readonly latest: Pick<Version, 'id' | 'kind' | 'createdAt' | 'title' | 'summary'> | null;
  readonly hasUnpublishedChanges: boolean;
  readonly awaitingExport: boolean;
};

export type ArticleDetail = {
  readonly article: Article;
  readonly latest: Version | null;
  readonly published: Version | null;
  readonly live: Version | null;
  readonly versions: Version[];
  readonly audit: AuditEntry[];
  readonly hasUnpublishedChanges: boolean;
  readonly awaitingExport: boolean;
};

export type MediaAsset = {
  readonly id: number;
  readonly publicPath: string;
  readonly format: string;
  readonly width: number | null;
  readonly height: number | null;
  readonly alt: string;
  readonly caption: string | null;
  readonly copyright: string | null;
  readonly exif: Readonly<Record<string, string>>;
  readonly sanitizedAt: string | null;
  readonly createdAt: string;
};

export type MediaUpload = {
  file: File;
  alt: string;
  // Explicitly `| undefined` because exactOptionalPropertyTypes otherwise
  // refuses the caller passing an absent field as undefined.
  group?: string | undefined;
  caption?: string | undefined;
  copyright?: string | undefined;
};

export type NewArticleInput = VersionFields & {
  translationKey: string;
  lang: Language;
  slug: string;
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
  const init: RequestInit = { method, headers, credentials: 'same-origin' };
  if (body !== undefined) init.body = JSON.stringify(body);

  const response = await fetch(path, init);
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  let payload: unknown = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    throw new ApiError(response.status, 'The author API returned an unreadable response.');
  }
  if (!response.ok) {
    if (response.status === 401) csrfToken = '';
    const message =
      typeof payload === 'object' && payload !== null && 'error' in payload
        ? String((payload as { error: unknown }).error)
        : `Request failed with ${response.status}.`;
    throw new ApiError(response.status, message);
  }
  return payload as T;
}

/**
 * Sends a multipart upload.
 *
 * Content-Type is deliberately left unset: the browser has to add the
 * multipart boundary, and naming the type by hand produces a body no parser
 * can read. The CSRF header is still explicit, because Astro's own origin
 * check does not cover the request shapes this API uses.
 */
async function sendForm<T>(path: string, form: FormData): Promise<T> {
  const headers: Record<string, string> = {};
  if (csrfToken) headers['X-CSRF-Token'] = csrfToken;
  const response = await fetch(path, {
    method: 'POST',
    headers,
    body: form,
    credentials: 'same-origin',
  });
  const text = await response.text();
  let payload: unknown = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    throw new ApiError(response.status, 'The author API returned an unreadable response.');
  }
  if (!response.ok) {
    if (response.status === 401) csrfToken = '';
    const message =
      typeof payload === 'object' && payload !== null && 'error' in payload
        ? String((payload as { error: unknown }).error)
        : `Request failed with ${response.status}.`;
    throw new ApiError(response.status, message);
  }
  return payload as T;
}

export const api = {
  async session(): Promise<Author | null> {
    try {
      const result = await send<{ author: Author; csrfToken: string }>('GET', '/api/session/');
      csrfToken = result.csrfToken;
      return result.author;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return null;
      throw error;
    }
  },

  async login(name: string, password: string): Promise<Author> {
    const result = await send<{ author: Author; csrfToken: string }>('POST', '/api/login/', {
      name,
      password,
    });
    csrfToken = result.csrfToken;
    return result.author;
  },

  async logout(): Promise<void> {
    await send<void>('POST', '/api/logout/');
    csrfToken = '';
  },

  listArticles(): Promise<{ articles: ArticleRow[] }> {
    return send('GET', '/api/articles/');
  },

  getArticle(id: number): Promise<ArticleDetail> {
    return send('GET', `/api/articles/${id}/`);
  },

  createArticle(input: NewArticleInput): Promise<{ article: Article; latest: Version }> {
    return send('POST', '/api/articles/', input);
  },

  saveVersion(id: number, input: VersionFields): Promise<{ version: Version }> {
    return send('POST', `/api/articles/${id}/versions/`, input);
  },

  autosave(id: number, input: VersionFields): Promise<{ version: Version }> {
    return send('POST', `/api/articles/${id}/autosave/`, input);
  },

  publish(id: number, versionId: number, note?: string): Promise<{ article: Article; published: Version }> {
    const body = note === undefined ? { versionId } : { versionId, note };
    return send('POST', `/api/articles/${id}/publish/`, body);
  },

  rollback(id: number, versionId: number, note?: string): Promise<{ article: Article; published: Version }> {
    const body = note === undefined ? { versionId } : { versionId, note };
    return send('POST', `/api/articles/${id}/rollback/`, body);
  },

  unpublish(id: number, note?: string): Promise<{ article: Article }> {
    return send('POST', `/api/articles/${id}/unpublish/`, note === undefined ? {} : { note });
  },

  preview(id: number, markdown: string): Promise<{ html: string }> {
    return send('POST', `/api/articles/${id}/preview/`, { markdown });
  },

  listMedia(): Promise<{ assets: MediaAsset[] }> {
    return send('GET', '/api/media/');
  },

  importMedia(upload: MediaUpload): Promise<{ asset: MediaAsset }> {
    const form = new FormData();
    form.set('file', upload.file, upload.file.name);
    form.set('alt', upload.alt);
    if (upload.group) form.set('group', upload.group);
    if (upload.caption) form.set('caption', upload.caption);
    if (upload.copyright) form.set('copyright', upload.copyright);
    return sendForm('/api/media/', form);
  },

  /**
   * Where an author can see an imported file before the next export.
   *
   * `publicPath` is where a reader will find it once the site is rebuilt; until
   * then only this route can resolve it, and only for a signed-in author.
   */
  mediaFileUrl(asset: MediaAsset): string {
    return `/api/media/${asset.id}/file/`;
  },
};

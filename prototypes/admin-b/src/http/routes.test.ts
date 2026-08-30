import assert from 'node:assert/strict';
import { request as httpRequest, type Server } from 'node:http';
import { afterEach, describe, it } from 'node:test';
import { hashPassword } from '../auth/passwords.ts';
import { SESSION_COOKIE, SessionStore } from '../auth/sessions.ts';
import { Store } from '../storage/store.ts';
import { createAdminServer } from './server.ts';
import { mediaManifest } from '../../../shared/media.ts';

const PASSWORD = 'a-sufficiently-long-fixture-password';

type Response = {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  json: unknown;
};

type RunningApp = {
  server: Server;
  store: Store;
  host: string;
  origin: string;
};

const running: RunningApp[] = [];

afterEach(async () => {
  while (running.length > 0) {
    const app = running.pop()!;
    await new Promise<void>((resolve, reject) => {
      app.server.close((error) => (error ? reject(error) : resolve()));
    });
    app.store.close();
  }
});

async function startApp(): Promise<RunningApp> {
  const store = Store.open(':memory:');
  const allowedHosts: string[] = [];
  const server = createAdminServer({
    store,
    sessions: new SessionStore(),
    passwordHash: await hashPassword(PASSWORD),
    allowedHosts,
    media: mediaManifest.parse({ version: 1, assets: [] }),
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const host = `127.0.0.1:${address.port}`;
  allowedHosts.push(host);
  const app = { server, store, host, origin: `http://${host}` };
  running.push(app);
  return app;
}

async function send(
  app: RunningApp,
  options: {
    method?: string;
    path: string;
    body?: unknown;
    headers?: Record<string, string>;
  },
): Promise<Response> {
  const address = app.server.address();
  assert.ok(address && typeof address === 'object');
  const encoded = options.body === undefined ? undefined : JSON.stringify(options.body);
  return new Promise((resolve, reject) => {
    const request = httpRequest(
      {
        hostname: '127.0.0.1',
        port: address.port,
        method: options.method ?? 'GET',
        path: options.path,
        headers: {
          Host: app.host,
          ...(encoded === undefined
            ? {}
            : {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(encoded).toString(),
              }),
          ...options.headers,
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          resolve({
            status: response.statusCode ?? 0,
            headers: response.headers,
            json: text.length === 0 ? null : JSON.parse(text),
          });
        });
      },
    );
    request.on('error', reject);
    if (encoded !== undefined) request.write(encoded);
    request.end();
  });
}

async function login(app: RunningApp): Promise<{ cookie: string; csrf: string }> {
  const response = await send(app, {
    method: 'POST',
    path: '/api/login',
    body: { password: PASSWORD },
    headers: { Origin: app.origin },
  });
  assert.equal(response.status, 200);
  const setCookie = response.headers['set-cookie'];
  assert.ok(Array.isArray(setCookie) && setCookie[0]);
  const cookie = setCookie[0].split(';')[0]!;
  assert.match(cookie, new RegExp(`^${SESSION_COOKIE}=`));
  const body = response.json as { csrfToken?: string };
  assert.equal(typeof body.csrfToken, 'string');
  return { cookie, csrf: body.csrfToken! };
}

function writeHeaders(app: RunningApp, auth: { cookie: string; csrf: string }): Record<string, string> {
  return {
    Cookie: auth.cookie,
    Origin: app.origin,
    'X-CSRF-Token': auth.csrf,
  };
}

describe('login route', () => {
  it('issues a session only for the configured author password', async () => {
    const app = await startApp();
    const refused = await send(app, {
      method: 'POST',
      path: '/api/login',
      body: { password: `${PASSWORD}-wrong` },
      headers: { Origin: app.origin },
    });
    assert.equal(refused.status, 401);
    assert.equal(refused.headers['set-cookie'], undefined);

    const auth = await login(app);
    assert.match(auth.cookie, /^moriium_admin_session=/);
    assert.ok(auth.csrf.length >= 43);

    const loggedOut = await send(app, {
      method: 'POST',
      path: '/api/logout',
      headers: writeHeaders(app, auth),
    });
    assert.equal(loggedOut.status, 204);
    assert.equal(
      (await send(app, { path: '/api/articles', headers: { Cookie: auth.cookie } })).status,
      401,
    );
  });
});

describe('object-level authorization', () => {
  it('never exposes a draft or its newer autosave through an unauthenticated read', async () => {
    const app = await startApp();
    const article = app.store.createArticle({
      translationKey: 'private-draft',
      lang: 'zh',
      slug: 'zh/private-draft',
      title: 'Draft title',
      summary: 'Draft summary',
      markdown: 'private draft body',
    });

    assert.equal((await send(app, { path: `/api/articles/${article.id}` })).status, 401);
    assert.equal((await send(app, { path: `/api/public/articles/${article.id}` })).status, 404);

    const first = app.store.getLatest(article.id)!;
    app.store.publish(article.id, first.id);
    app.store.autosave(article.id, {
      title: 'New private title',
      summary: 'New private summary',
      markdown: 'new private autosave',
    });
    const publicResponse = await send(app, { path: `/api/public/articles/${article.id}` });
    assert.equal(publicResponse.status, 200);
    assert.deepEqual(publicResponse.json, {
      article: {
        id: article.id,
        lang: 'zh',
        slug: 'zh/private-draft',
        translationKey: 'private-draft',
      },
      version: {
        id: first.id,
        title: 'Draft title',
        summary: 'Draft summary',
        markdown: 'private draft body',
      },
    });
    assert.equal(JSON.stringify(publicResponse.json).includes('new private'), false);
  });
});

describe('article routes', () => {
  it('keeps autosave separate from publish and can roll back through the HTTP boundary', async () => {
    const app = await startApp();
    const auth = await login(app);
    const headers = writeHeaders(app, auth);

    const created = await send(app, {
      method: 'POST',
      path: '/api/articles',
      headers,
      body: {
        translationKey: 'route-lifecycle',
        lang: 'ja',
        slug: 'ja/route-lifecycle',
        title: 'First',
        summary: 'First summary',
        markdown: '# First\n',
      },
    });
    assert.equal(created.status, 201);
    const articleId = (created.json as { article: { id: number } }).article.id;
    const firstVersionId = (created.json as { latest: { id: number } }).latest.id;

    const listed = await send(app, { path: '/api/articles', headers: { Cookie: auth.cookie } });
    assert.equal(listed.status, 200);
    assert.deepEqual(
      (listed.json as { articles: Array<{ id: number; hasUnpublishedChanges: boolean }> }).articles.map(
        ({ id, hasUnpublishedChanges }) => ({ id, hasUnpublishedChanges }),
      ),
      [{ id: articleId, hasUnpublishedChanges: true }],
    );

    const autosaved = await send(app, {
      method: 'POST',
      path: `/api/articles/${articleId}/autosave`,
      headers,
      body: {
        title: 'Autosaved',
        summary: 'Autosaved summary',
        markdown: '# Autosaved\n',
        editorJson: '{"type":"doc"}',
      },
    });
    assert.equal(autosaved.status, 201);
    const autosaveId = (autosaved.json as { version: { id: number } }).version.id;
    assert.equal((await send(app, { path: `/api/public/articles/${articleId}` })).status, 404);

    const published = await send(app, {
      method: 'POST',
      path: `/api/articles/${articleId}/publish`,
      headers,
      body: { versionId: autosaveId, note: 'publish from integration test' },
    });
    assert.equal(published.status, 200);
    assert.equal(
      ((await send(app, { path: `/api/public/articles/${articleId}` })).json as {
        version: { markdown: string };
      }).version.markdown,
      '# Autosaved\n',
    );

    const saved = await send(app, {
      method: 'POST',
      path: `/api/articles/${articleId}/versions`,
      headers,
      body: {
        title: 'Manual edit',
        summary: 'Manual summary',
        markdown: '# Manual edit\n',
      },
    });
    assert.equal(saved.status, 201);
    assert.equal(
      ((await send(app, { path: `/api/public/articles/${articleId}` })).json as {
        version: { id: number };
      }).version.id,
      autosaveId,
    );

    const rolledBack = await send(app, {
      method: 'POST',
      path: `/api/articles/${articleId}/rollback`,
      headers,
      body: { versionId: firstVersionId, note: 'restore first version' },
    });
    assert.equal(rolledBack.status, 200);

    const detail = await send(app, {
      path: `/api/articles/${articleId}`,
      headers: { Cookie: auth.cookie },
    });
    assert.equal(detail.status, 200);
    const detailBody = detail.json as {
      article: { publishedVersionId: number };
      versions: Array<{ id: number; kind: string }>;
      audit: Array<{ action: string }>;
    };
    assert.equal(detailBody.article.publishedVersionId, firstVersionId);
    assert.equal(detailBody.versions.length, 3);
    assert.deepEqual(
      detailBody.audit.map((entry) => entry.action),
      ['rollback', 'publish'],
    );
  });

  it('leaves the public pointer and audit trail untouched when the publish gate refuses a version', async () => {
    const app = await startApp();
    const auth = await login(app);
    const headers = writeHeaders(app, auth);
    const created = await send(app, {
      method: 'POST',
      path: '/api/articles',
      headers,
      body: {
        translationKey: 'blocked-publish',
        lang: 'zh',
        slug: 'zh/blocked-publish',
        title: 'Blocked publish',
        summary: 'The image is not in the manifest.',
        markdown: '![Unknown](/media/fixtures/missing.svg)\n',
      },
    });
    const articleId = (created.json as { article: { id: number } }).article.id;
    const versionId = (created.json as { latest: { id: number } }).latest.id;

    const refused = await send(app, {
      method: 'POST',
      path: `/api/articles/${articleId}/publish`,
      headers,
      body: { versionId },
    });

    assert.equal(refused.status, 403);
    assert.match((refused.json as { error: string }).error, /missing\.svg/);
    assert.equal(app.store.getArticle(articleId)?.publishedVersionId, null);
    assert.deepEqual(app.store.listAudit(articleId), []);
    assert.equal((await send(app, { path: `/api/public/articles/${articleId}` })).status, 404);
  });
});

describe('request boundary', () => {
  it('enforces Host, Origin and CSRF on real route requests', async () => {
    const app = await startApp();
    const auth = await login(app);
    const body = {
      translationKey: 'guarded',
      lang: 'en',
      slug: 'en/guarded',
      title: 'Guarded',
      summary: 'Guarded summary',
      markdown: 'Guarded body',
    };

    const rebound = await send(app, {
      method: 'POST',
      path: '/api/articles',
      body,
      headers: {
        ...writeHeaders(app, auth),
        Host: 'evil.example',
      },
    });
    assert.equal(rebound.status, 403);

    const crossed = await send(app, {
      method: 'POST',
      path: '/api/articles',
      body,
      headers: {
        ...writeHeaders(app, auth),
        Origin: 'http://evil.example',
      },
    });
    assert.equal(crossed.status, 403);

    const noCsrf = await send(app, {
      method: 'POST',
      path: '/api/articles',
      body,
      headers: { Cookie: auth.cookie, Origin: app.origin },
    });
    assert.equal(noCsrf.status, 403);
    assert.equal(app.store.listArticles().length, 0);
  });
});

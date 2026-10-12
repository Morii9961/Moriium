import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { acceptDelivery, receiver, verifySignature } from '../deploy/automation/receiver.mjs';
import { REPOSITORY, WORKFLOW, readState, requestRelease, writeState } from '../deploy/automation/state.mjs';
import { affectedMain, findVerification, reconcile } from '../deploy/automation/worker.mjs';
import { copyReleaseTree, retainAssets } from '../src/server/release/files.ts';
import { articleCacheKey, articleContextKey } from '../src/utils/article-cache.ts';

const directories = [];
afterEach(() => { for (const path of directories.splice(0)) rmSync(path, { recursive: true, force: true }); });
const temporary = () => { const path = mkdtempSync(join(tmpdir(), 'moriium-incremental-')); directories.push(path); return path; };
const sha = 'a'.repeat(40);
const oldSha = 'b'.repeat(40);
const secret = 'synthetic-webhook-secret-'.repeat(3);
const signature = (body) => `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
const runEvidence = (overrides = {}) => ({ id: 12, run_attempt: 1, head_sha: sha, head_branch: 'main',
  head_repository: { id: REPOSITORY.id }, path: WORKFLOW, event: 'push', status: 'completed', conclusion: 'success', ...overrides });
const push = (overrides = {}) => ({ repository: REPOSITORY, ref: 'refs/heads/main', after: sha, deleted: false, ...overrides });

describe('signed deployment deliveries', () => {
  it('rejects a changed body and malformed or missing signatures', () => {
    const body = Buffer.from(JSON.stringify(push()));
    assert.equal(verifySignature(body, signature(body), secret), true);
    assert.equal(verifySignature(Buffer.concat([body, Buffer.from(' ')]), signature(body), secret), false);
    for (const value of [undefined, 'sha256=0', 'sha1=' + '0'.repeat(40)]) assert.equal(verifySignature(body, value, secret), false);
  });

  it('persists one request for a duplicate delivery and ignores other branches', () => {
    const root = temporary();
    const body = Buffer.from(JSON.stringify(push()));
    const delivery = randomUUID();
    const input = { body, signature: signature(body), delivery, secret, root, event: 'push', now: 100 };
    assert.equal(acceptDelivery(input), 202);
    assert.equal(acceptDelivery({ ...input, now: 200 }), 202);
    assert.equal(readState(join(root, 'pending', `${sha}.json`)).receivedAt, 100);
    const branch = Buffer.from(JSON.stringify(push({ ref: 'refs/heads/feature' })));
    assert.equal(acceptDelivery({ ...input, body: branch, signature: signature(branch), delivery: randomUUID() }), 204);
  });

  it('rejects a signed event for another repository and a shell-like SHA', () => {
    const root = temporary();
    for (const [payload, expected] of [[push({ repository: { ...REPOSITORY, id: 5 } }), 403], [push({ after: '../bad;sh' }), 400]]) {
      const body = Buffer.from(JSON.stringify(payload));
      assert.equal(acceptDelivery({ body, signature: signature(body), secret, root, delivery: randomUUID(), event: 'push' }), expected);
    }
    assert.equal(existsSync(join(root, 'pending')), false);
  });

  it('keeps latest workflow attempt evidence and does not allow a PR success to authorize main', () => {
    const root = temporary();
    const deliver = (run) => {
      const body = Buffer.from(JSON.stringify({ repository: REPOSITORY, action: 'completed', workflow: { path: WORKFLOW }, workflow_run: run }));
      return acceptDelivery({ body, signature: signature(body), secret, root, delivery: randomUUID(), event: 'workflow_run' });
    };
    assert.equal(deliver(runEvidence({ event: 'pull_request' })), 204);
    assert.equal(existsSync(join(root, 'verified')), false);
    deliver(runEvidence({ run_attempt: 2, conclusion: 'failure' }));
    deliver(runEvidence());
    assert.equal(readState(join(root, 'verified', `${sha}.json`)).conclusion, 'failure');
  });

  it('answers authenticated HTTP after durable persistence without running a deploy', async () => {
    const root = temporary();
    const server = receiver({ secret, root });
    await new Promise((done) => server.listen(0, '127.0.0.1', done));
    try {
      const body = Buffer.from(JSON.stringify(push()));
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api/deploy-hook/`, {
        method: 'POST', body, headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': signature(body),
          'X-GitHub-Delivery': randomUUID(), 'X-GitHub-Event': 'push' }, signal: AbortSignal.timeout(2000),
      });
      assert.equal(response.status, 202);
      assert.equal(readState(join(root, 'pending', `${sha}.json`)).sha, sha);
      assert.equal(existsSync(join(root, 'status.json')), false);
    } finally { server.closeAllConnections(); await new Promise((done) => server.close(done)); }
  });
});

function workerFixture({ evidence = runEvidence(), changes = ['src/data/activity.json'], head = sha, fail = false, advance = 0 } = {}) {
  const state = temporary();
  const root = temporary();
  const calls = [];
  let clock = 1000;
  writeState(join(root, 'current', 'release-version.json'), { id: oldSha });
  requestRelease(state, sha, clock);
  const options = { state, root, publicUrl: 'https://example.invalid/zh/', adminUrl: 'https://example.invalid/admin/',
    driver: join(state, 'installed-driver.sh'), now: () => clock, verify: async () => evidence,
    probe: async (expected) => assert.equal(readState(join(root, 'current', 'release-version.json')).id, expected),
    run: async (command, args) => {
      calls.push([command, ...args]);
      clock += advance;
      if (args.includes('init')) mkdirSync(join(state, 'repository.git'));
      if (args.includes('rev-parse')) return sha;
      if (args.includes('diff')) return changes.join('\n');
      if (args.includes('ls-remote')) return `${head}\trefs/heads/main`;
      if (args.includes('archive')) writeFileSync(args.find((arg) => arg.startsWith('--output=')).slice(9), 'synthetic archive');
      if (command === 'bash') {
        if (fail) throw new Error('Synthetic build failure');
        writeState(join(root, 'current', 'release-version.json'), { id: sha });
      }
      return '';
    } };
  return { options, calls, state, root, setClock: (value) => { clock = value; } };
}

describe('verified current-head release selection', () => {
  it('blocks failed, missing, unrelated and PR verification', async () => {
    for (const evidence of [null, runEvidence({ conclusion: 'failure' }), runEvidence({ head_sha: oldSha }), runEvidence({ event: 'pull_request' })]) {
      const fixture = workerFixture({ evidence });
      assert.equal(await reconcile(fixture.options), 'waiting-verification');
      assert.equal(fixture.calls.some(([command]) => command === 'bash'), false);
    }
  });

  it('refreshes pending CI evidence when the workflow later succeeds', async () => {
    const fixture = workerFixture();
    writeState(join(fixture.state, 'verified', `${sha}.json`), runEvidence({ status: 'in_progress', conclusion: null }));
    assert.equal(await reconcile(fixture.options), 'live');
  });

  it('fetches incrementally and confirms the expected formal-host version', async () => {
    const fixture = workerFixture();
    assert.equal(await reconcile(fixture.options), 'live');
    assert.equal(fixture.calls.filter(([, ...args]) => args.includes('fetch')).length, 1);
    assert.equal(fixture.calls.some(([, ...args]) => args.includes('clone')), false);
    assert.equal(readState(join(fixture.state, 'status.json')).sha, sha);
    assert.equal(await reconcile(fixture.options), 'live');
    assert.equal(fixture.calls.filter(([command]) => command === 'bash').length, 1);
  });

  it('does not invoke the driver if a newer head arrives during preparation', async () => {
    const fixture = workerFixture({ head: 'c'.repeat(40) });
    assert.equal(await reconcile(fixture.options), 'superseded');
    assert.equal(fixture.calls.some(([command]) => command === 'bash'), false);
    assert.equal(readState(join(fixture.root, 'current', 'release-version.json')).id, oldSha);
  });

  it('records failure and requires explicit retry instead of repeatedly building', async () => {
    const fixture = workerFixture({ fail: true });
    assert.equal(await reconcile(fixture.options), 'failed');
    assert.equal(await reconcile(fixture.options), 'failed');
    assert.equal(fixture.calls.filter(([command]) => command === 'bash').length, 1);
    assert.equal(readState(join(fixture.root, 'current', 'release-version.json')).id, oldSha);
  });

  it('counts verification and queue wait against the five-minute deadline', async () => {
    const fixture = workerFixture();
    fixture.setClock(301001);
    assert.equal(await reconcile(fixture.options), 'deadline');
    assert.equal(fixture.calls.some(([command]) => command === 'bash'), false);
  });

  it('defers database changes and skips unrelated main-site changes', async () => {
    for (const [changes, status] of [[['src/server/db/schema.sql'], 'manual-migration'], [['enouia/src/pages/index.astro'], 'unaffected-main']]) {
      const fixture = workerFixture({ changes });
      assert.equal(await reconcile(fixture.options), status);
      assert.equal(fixture.calls.some(([command]) => command === 'bash'), false);
    }
    assert.equal(affectedMain(['docs/deployment.md']), false);
    assert.equal(affectedMain(['new-unknown-file']), true);
  });

  it('ignores older successful runs when the latest attempt has failed', async () => {
    const run = await findVerification(sha, async () => ({ ok: true, json: async () => ({ workflow_runs: [
      runEvidence(), runEvidence({ id: 13, conclusion: 'failure' }), runEvidence({ id: 14, head_sha: oldSha }),
    ] }) }));
    assert.equal(run.id, 13);
    assert.equal(run.conclusion, 'failure');
  });
});

describe('immutable incremental output', () => {
  it('makes only public output readable under the deployment service umask', { skip: process.platform === 'win32' }, () => {
    const built = temporary(), next = temporary();
    writeFileSync(join(built, 'index.html'), 'public');
    chmodSync(join(built, 'index.html'), 0o640);
    const before = process.umask(0o027);
    try { copyReleaseTree(built, next); } finally { process.umask(before); }
    assert.equal(statSync(next).mode & 0o777, 0o755);
    assert.equal(statSync(join(next, 'index.html')).mode & 0o777, 0o644);
    assert.equal(statSync(join(built, 'index.html')).mode & 0o777, 0o640);
  });
  it('links identical bytes, copies changed bytes and excludes deleted files', () => {
    const previous = temporary(), built = temporary(), next = temporary();
    for (const path of [previous, built]) writeFileSync(join(path, 'same.css'), 'same');
    chmodSync(join(previous, 'same.css'), 0o644); // The immutable public-release contract.
    writeFileSync(join(previous, 'changed.html'), 'old');
    writeFileSync(join(previous, 'removed.html'), 'removed');
    writeFileSync(join(built, 'changed.html'), 'new');
    assert.deepEqual(copyReleaseTree(built, next, previous), { copied: 1, reused: 1 });
    assert.equal(statSync(join(previous, 'same.css')).ino, statSync(join(next, 'same.css')).ino);
    assert.equal(readFileSync(join(previous, 'changed.html'), 'utf8'), 'old');
    assert.equal(readFileSync(join(next, 'changed.html'), 'utf8'), 'new');
    assert.equal(existsSync(join(next, 'removed.html')), false);
    writeFileSync(join(built, 'same.css'), 'later build');
    assert.equal(readFileSync(join(next, 'same.css'), 'utf8'), 'same');
  });

  it('retains old hashed assets and refuses an immutable-name collision', () => {
    const built = temporary(), pool = temporary();
    writeFileSync(join(built, 'hash-a.js'), 'first');
    retainAssets(built, pool);
    rmSync(join(built, 'hash-a.js'));
    writeFileSync(join(built, 'hash-b.js'), 'second');
    retainAssets(built, pool);
    assert.equal(readFileSync(join(pool, 'hash-a.js'), 'utf8'), 'first');
    writeFileSync(join(built, 'hash-a.js'), 'different');
    assert.throws(() => retainAssets(built, pool), /changed its bytes/);
  });
});

describe('article data cache dependencies', () => {
  it('invalidates the edited article without rerendering unrelated article bodies', () => {
    const article = { id: 'zh/a', data: { title: 'A' }, body: 'one' };
    const neighbor = { id: 'zh/b', data: { title: 'B' }, body: 'two' };
    const context = articleContextKey([article, neighbor]);
    const edited = { ...article, body: 'changed' };
    assert.equal(context, articleContextKey([edited, neighbor]));
    assert.notEqual(articleCacheKey(article, context), articleCacheKey(edited, context));
    assert.equal(articleCacheKey(neighbor, context), articleCacheKey(neighbor, articleContextKey([edited, neighbor])));
  });

  it('invalidates translation, adjacency, taxonomy and dynamic render metadata changes', () => {
    const article = { id: 'zh/a', data: { title: 'A', translationKey: 'a' }, body: 'one' };
    const context = articleContextKey([article]);
    for (const entries of [[article, { id: 'ja/a', data: { title: 'J', translationKey: 'a' } }],
      [{ ...article, data: { ...article.data, tags: ['new'] } }], []]) assert.notEqual(context, articleContextKey(entries));
    assert.notEqual(context, articleContextKey([article], ['changed public media metadata']));
  });
});

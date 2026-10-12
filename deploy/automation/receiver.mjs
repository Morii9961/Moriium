// Root-installed deployment infrastructure; never import fetched repository code.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { REPOSITORY, WORKFLOW, readState, recordRun, requestRelease, validSha, writeState } from './state.mjs';

export const MAX_BODY = 1024 * 1024;

export function verifySignature(body, signature, secret) {
  if (!secret || typeof signature !== 'string' || !/^sha256=[a-f0-9]{64}$/.test(signature)) return false;
  return timingSafeEqual(createHmac('sha256', secret).update(body).digest(), Buffer.from(signature.slice(7), 'hex'));
}

export function acceptDelivery({ body, signature, event, delivery, secret, root, now = Date.now() }) {
  if (body.length > MAX_BODY) return 413;
  if (!verifySignature(body, signature, secret)) return 401;
  if (typeof delivery !== 'string' || !/^[a-f0-9-]{36}$/.test(delivery)) return 400;
  let payload;
  try { payload = JSON.parse(body.toString('utf8')); } catch { return 400; }
  if (payload?.repository?.id !== REPOSITORY.id || payload.repository.full_name !== REPOSITORY.full_name) return 403;
  const receipt = join(root, 'deliveries', `${delivery}.json`);
  if (readState(receipt)) return 202;
  if (event === 'push') {
    if (payload.ref !== 'refs/heads/main' || payload.deleted === true) return 204;
    if (!validSha(payload.after)) return 400;
    requestRelease(root, payload.after, now);
  } else if (event === 'workflow_run') {
    const run = payload.workflow_run;
    if (payload.action !== 'completed' || payload.workflow?.path !== WORKFLOW ||
        run?.head_repository?.id !== REPOSITORY.id || run.head_branch !== 'main' ||
        !['push', 'workflow_dispatch'].includes(run.event) || run.path !== WORKFLOW || !validSha(run.head_sha)) return 204;
    // Retain only public verification metadata, never the full webhook payload.
    recordRun(root, { id: run.id, run_attempt: run.run_attempt, head_sha: run.head_sha, head_branch: run.head_branch,
      head_repository: { id: run.head_repository.id }, event: run.event, path: run.path,
      status: run.status, conclusion: run.conclusion, created_at: run.created_at });
    const created = Date.parse(run.created_at);
    requestRelease(root, run.head_sha, Number.isFinite(created) ? Math.min(now, created) : now);
  } else if (event !== 'ping') return 204;
  writeState(receipt, { receivedAt: now });
  // Bound receipt storage. Replays still cannot bypass the current-head and CI gates.
  const files = readdirSync(join(root, 'deliveries')).filter((name) => /^[a-f0-9-]{36}\.json$/.test(name));
  files.sort((a, b) => statSync(join(root, 'deliveries', b)).mtimeMs - statSync(join(root, 'deliveries', a)).mtimeMs);
  for (const file of files.slice(256)) unlinkSync(join(root, 'deliveries', file));
  return 202;
}

export function receiver({ secret, root }) {
  if (!secret || secret.length < 32 || !root) throw new Error('Deployment receiver configuration is incomplete.');
  mkdirSync(root, { recursive: true, mode: 0o750 });
  const server = createServer(async (request, response) => {
    const reply = (status) => { response.writeHead(status, { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain' }); response.end(); };
    if (request.method !== 'POST' || request.url !== '/api/deploy-hook/') return reply(404);
    if (request.headers['content-type']?.split(';')[0]?.trim() !== 'application/json') return reply(415);
    const chunks = [];
    let size = 0;
    try {
      for await (const chunk of request) {
        size += chunk.length;
        if (size > MAX_BODY) { reply(413); request.destroy(); return; }
        chunks.push(chunk);
      }
      reply(acceptDelivery({ body: Buffer.concat(chunks), signature: request.headers['x-hub-signature-256'],
        event: request.headers['x-github-event'], delivery: request.headers['x-github-delivery'], secret, root }));
    } catch { if (!response.headersSent) reply(503); }
  });
  server.requestTimeout = 10_000;
  server.headersTimeout = 10_000;
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.env.MORIIUM_DEPLOY_ENABLED !== 'true') throw new Error('Automatic deployment is disabled.');
  receiver({ secret: process.env.MORIIUM_DEPLOY_SECRET, root: process.env.MORIIUM_DEPLOY_STATE }).listen(4322, '127.0.0.1');
}

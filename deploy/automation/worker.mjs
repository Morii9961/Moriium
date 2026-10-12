import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readlinkSync, unlinkSync } from 'node:fs';
import { basename, isAbsolute, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { REPOSITORY, WORKFLOW, readState, recordRun, requestRelease, successfulRun, validSha, writeState } from './state.mjs';

const SOURCE = `https://github.com/${REPOSITORY.full_name}.git`;
export const DEADLINE_MS = 300_000;

export function runCommand(command, args, { timeout = 30_000, env = process.env } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, windowsHide: true, shell: false, detached: process.platform === 'linux' });
    let output = '';
    let expired = false;
    let killTimer;
    const stop = (signal) => {
      try {
        if (process.platform === 'linux') process.kill(-child.pid, signal);
        else child.kill(signal);
      } catch { /* The process group already exited. */ }
    };
    const timer = setTimeout(() => {
      expired = true;
      stop('SIGTERM');
      killTimer = setTimeout(() => stop('SIGKILL'), 10_000);
    }, Math.max(1, timeout));
    child.stdout.on('data', (chunk) => { output = (output + chunk.toString()).slice(-1024 * 1024); });
    // Driver errors enter the systemd journal without logging environment or HTTP credentials.
    child.stderr.on('data', (chunk) => process.stderr.write(chunk));
    child.on('error', (error) => { clearTimeout(timer); clearTimeout(killTimer); reject(error); });
    child.on('close', (code) => {
      clearTimeout(timer); clearTimeout(killTimer);
      if (expired) reject(new Error('Deployment deadline exceeded.'));
      else if (code !== 0) reject(new Error(`${command} failed with exit ${code}.`));
      else resolve(output.trim());
    });
  });
}

export function affectedMain(paths) {
  return paths.some((file) => !file.startsWith('enouia/') && !file.startsWith('docs/') &&
    !['README.md', 'AGENTS.md', 'CLAUDE.md', 'DESIGN.md', 'LICENSE'].includes(file));
}

export async function findVerification(sha, fetcher = fetch) {
  const url = new URL(`https://api.github.com/repos/${REPOSITORY.full_name}/actions/workflows/ci.yml/runs`);
  url.search = new URLSearchParams({ branch: 'main', head_sha: sha, per_page: '10' }).toString();
  const response = await fetcher(url, { redirect: 'error', signal: AbortSignal.timeout(10_000),
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Moriium-Deploy', 'X-GitHub-Api-Version': '2022-11-28' } });
  if (!response.ok) throw new Error('GitHub verification lookup is unavailable.');
  const report = await response.json();
  if (!Array.isArray(report.workflow_runs)) throw new Error('Invalid GitHub verification response.');
  return report.workflow_runs.filter((run) => run.head_sha === sha && run.path === WORKFLOW &&
    run.head_branch === 'main' && ['push', 'workflow_dispatch'].includes(run.event))
    .sort((a, b) => b.id - a.id || b.run_attempt - a.run_attempt)[0] ?? null;
}

export async function probeVersion(sha, url, timeout = 5_000) {
  const response = await fetch(new URL('/release-version.json', url), {
    redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(Math.max(1, timeout)),
  });
  if (!response.ok || (await response.json()).id !== sha) throw new Error('The formal host did not confirm the expected version.');
}

/** One invocation always selects fetched main, never the last-arriving webhook SHA. */
export async function reconcile({ state, root, publicUrl, adminUrl, driver, run = runCommand,
  verify = findVerification, probe = probeVersion, now = Date.now }) {
  if (![state, root, driver].every(isAbsolute)) throw new Error('Deployment paths must be absolute.');
  const repository = join(state, 'repository.git');
  const started = now();
  mkdirSync(state, { recursive: true, mode: 0o750 });
  if (!existsSync(repository)) await run('git', ['init', '--bare', repository]);
  // No payload-controlled remote, branch, command or filename.
  await run('git', ['--git-dir', repository, 'fetch', '--atomic', '--no-tags', SOURCE,
    '+refs/heads/main:refs/heads/main'], { timeout: 30_000 });
  const sha = await run('git', ['--git-dir', repository, 'rev-parse', 'refs/heads/main']);
  if (!validSha(sha)) throw new Error('Fetched main is not a commit SHA.');
  const live = readState(join(root, 'current', 'release-version.json'));
  if (live?.id === sha) {
    await probe(sha, publicUrl);
    // A worker can be interrupted after a successful driver return but before recording status.
    writeState(join(state, 'status.json'), { sha, status: 'live', recovered: true, at: now() });
    return 'live';
  }
  requestRelease(state, sha, started);
  const request = readState(join(state, 'pending', `${sha}.json`));
  if (!Number.isFinite(request?.receivedAt)) throw new Error('Invalid deployment request.');
  const remaining = () => DEADLINE_MS - (now() - request.receivedAt);
  const finish = (status, detail = {}) => {
    const record = { sha, status, at: now(), elapsedMs: now() - request.receivedAt, ...detail };
    writeState(join(state, 'results', `${sha}.json`), record);
    writeState(join(state, 'status.json'), record);
    return status;
  };
  // Failed jobs require an explicit operator retry; the minute timer cannot create an endless build loop.
  const completed = readState(join(state, 'results', `${sha}.json`));
  if (completed && ['failed', 'deadline', 'manual-migration', 'manual-baseline', 'unaffected-main'].includes(completed.status)) return completed.status;
  if (remaining() <= 0) return finish('deadline');
  let evidence = readState(join(state, 'verified', `${sha}.json`));
  if (!successfulRun(evidence) || evidence.head_sha !== sha) {
    evidence = await verify(sha);
    if (evidence) recordRun(state, evidence);
  }
  if (!successfulRun(evidence) || evidence.head_sha !== sha) return finish('waiting-verification');
  const created = Date.parse(evidence.created_at);
  if (!request.retry && Number.isFinite(created) && created < request.receivedAt) {
    request.receivedAt = created;
    writeState(join(state, 'pending', `${sha}.json`), request);
  }
  if (remaining() <= 0) return finish('deadline');
  let base = live?.id;
  if (!validSha(base)) {
    try { base = basename(readlinkSync(join(root, 'current'))); } catch { /* Explicit bootstrap required. */ }
  }
  if (!validSha(base)) return finish('manual-baseline');
  if (validSha(base)) {
    // Unknown ancestry or missing base objects fail closed; do not guess which paths changed.
    const paths = (await run('git', ['--git-dir', repository, 'diff', '--name-only', base, sha])).split('\n').filter(Boolean);
    if (paths.some((file) => file.startsWith('src/server/db/'))) return finish('manual-migration');
    if (!affectedMain(paths)) return finish('unaffected-main');
  }
  const archive = join(state, 'archives', `${sha}.tar.gz`);
  mkdirSync(join(state, 'archives'), { recursive: true, mode: 0o750 });
  await run('git', ['--git-dir', repository, 'archive', '--format=tar.gz', `--output=${archive}`, sha], { timeout: Math.min(remaining(), 30_000) });
  // Check main again before the driver can touch a running workspace.
  const head = (await run('git', ['ls-remote', SOURCE, 'refs/heads/main'], { timeout: Math.min(remaining(), 15_000) })).split(/\s/)[0];
  if (head !== sha) { unlinkSync(archive); return finish('superseded'); }
  if (remaining() <= 10_000) { unlinkSync(archive); return finish('deadline'); }
  writeState(join(state, 'status.json'), { sha, status: 'running', startedAt: now(), receivedAt: request.receivedAt });
  try {
    await run('bash', [driver, sha, root, publicUrl, adminUrl], {
      timeout: remaining() - 10_000,
      env: { ...process.env, MORIIUM_DEPLOY_ARCHIVE: archive, MORIIUM_DEPLOY_CHECK_HEAD: 'true' },
    });
    await probe(sha, publicUrl, Math.min(remaining(), 5_000));
    return finish(remaining() >= 0 ? 'live' : 'live-over-deadline');
  } catch {
    return finish(remaining() <= 10_000 ? 'deadline' : 'failed');
  } finally {
    if (existsSync(archive)) unlinkSync(archive);
    // Only metadata we own, never persistent author content or active source.
    for (const sub of ['pending', 'verified', 'results']) {
      const directory = join(state, sub);
      if (!existsSync(directory)) continue;
      const files = readdirSync(directory).filter((name) => /^[a-f0-9]{40}\.json$/.test(name)).sort();
      // Keep the current SHA and bounded recent request evidence by received timestamp/result time.
      files.sort((a, b) => {
        const stamp = (name) => { const value = readState(join(directory, name)); return value?.receivedAt ?? value?.at ?? 0; };
        return stamp(b) - stamp(a);
      });
      for (const file of files.slice(256)) if (file !== `${sha}.json`) unlinkSync(join(directory, file));
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.env.MORIIUM_DEPLOY_ENABLED !== 'true') throw new Error('Automatic deployment is disabled.');
  const result = await reconcile({ state: process.env.MORIIUM_DEPLOY_STATE, root: '/var/www/moriium',
    publicUrl: 'https://morii9961.top/zh/', adminUrl: 'https://morii9961.top/admin/',
    driver: '/usr/local/lib/moriium-deploy/deploy-code.sh' });
  console.log(`Moriium deployment: ${result}`);
}

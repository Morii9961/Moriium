import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';

export const REPOSITORY = { id: 1350319032, full_name: 'Morii9961/Moriium' };
export const WORKFLOW = '.github/workflows/ci.yml';
export const validSha = (value) => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);

export function readState(file) {
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, 'utf8'));
}

export function writeState(file, value) {
  mkdirSync(dirname(file), { recursive: true, mode: 0o750 });
  const temporary = `${file}.${randomUUID()}.next`;
  const fd = openSync(temporary, 'wx', 0o640);
  try {
    writeFileSync(fd, `${JSON.stringify(value)}\n`);
    fsyncSync(fd);
  } finally { closeSync(fd); }
  renameSync(temporary, file);
  if (process.platform !== 'win32') {
    const directory = openSync(dirname(file), 'r');
    try { fsyncSync(directory); } finally { closeSync(directory); }
  }
}

export function successfulRun(run) {
  return run?.head_repository?.id === REPOSITORY.id && run.head_branch === 'main' &&
    ['push', 'workflow_dispatch'].includes(run.event) && run.path === WORKFLOW &&
    run.status === 'completed' && run.conclusion === 'success' && validSha(run.head_sha) &&
    Number.isSafeInteger(run.id) && run.id > 0 && Number.isSafeInteger(run.run_attempt) && run.run_attempt > 0;
}

export function requestRelease(root, sha, now = Date.now()) {
  if (!validSha(sha)) throw new Error('Invalid release SHA.');
  const file = join(root, 'pending', `${sha}.json`);
  const previous = readState(file);
  if (!previous || (!previous.retry && previous.receivedAt > now)) writeState(file, { sha, receivedAt: now });
}

export function recordRun(root, run) {
  if (!validSha(run?.head_sha) || !Number.isSafeInteger(run.id) || !Number.isSafeInteger(run.run_attempt)) return;
  const file = join(root, 'verified', `${run.head_sha}.json`);
  const previous = readState(file);
  if (previous && (previous.id > run.id || (previous.id === run.id && previous.run_attempt > run.run_attempt))) return;
  writeState(file, { id: run.id, run_attempt: run.run_attempt, head_sha: run.head_sha, head_branch: run.head_branch,
    head_repository: { id: run.head_repository?.id }, event: run.event, path: run.path,
    status: run.status, conclusion: run.conclusion, created_at: run.created_at });
}

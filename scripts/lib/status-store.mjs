import { mkdir, readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

export async function readJson(path, fallback) {
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return fallback; throw error; }
}
export async function atomicJson(path, data) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  try { await writeFile(temporary, `${JSON.stringify(data)}\n`, { mode: 0o640 }); await rename(temporary, path); }
  finally { await unlink(temporary).catch(() => {}); }
}
// Fail closed after a crashed writer. Operators inspect and remove an abandoned
// lock only with the timer stopped; racing writers must never reclaim each other.
export async function withLock(path, operation) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, String(process.pid), { flag: 'wx', mode: 0o600 });
  try { return await operation(); } finally { await unlink(path); }
}

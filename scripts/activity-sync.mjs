// Local-only collector and restricted uploader. Credentials never enter a batch.
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, copyFile, readFile, unlink, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { readJson, atomicJson, withLock } from './lib/status-store.mjs';
import { validateBatch } from './lib/status-batch.mjs';

const root = resolve(import.meta.dirname, '..');
const local = resolve(process.env.MORIIUM_ACTIVITY_WORK || resolve(root, '.cache/activity-sync'));
const exec = promisify(execFile);
try {
  await mkdir(local, { recursive: true });
  await withLock(resolve(local, 'sync.lock'), async () => {
    const config = await readJson(process.env.MORIIUM_ACTIVITY_SYNC_CONFIG || resolve(local, 'config.json'), null);
    if (!config || typeof config.sshAlias !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(config.sshAlias)) throw new Error('Configure a restricted SSH alias.');
    const output = resolve(local, 'activity.json');
    if (!await stat(output).catch(() => null)) await copyFile(resolve(root, 'src/data/activity.json'), output);
    const report = resolve(local, 'report.json');
    const pendingPath = resolve(local, 'pending.json');
    const upload = async batch => {
      await new Promise((accept, reject) => {
        const child = spawn('ssh', ['-T', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=15', config.sshAlias], { windowsHide: true, stdio: ['pipe', 'ignore', 'ignore'] });
        const timer = setTimeout(() => { child.kill(); reject(new Error('Upload timeout.')); }, 60_000);
        child.on('error', () => { clearTimeout(timer); reject(new Error('Upload unavailable.')); });
        child.stdin.on('error', () => {});
        child.on('exit', code => { clearTimeout(timer); code === 0 ? accept() : reject(new Error('Upload rejected.')); });
        child.stdin.end(JSON.stringify(batch));
      });
    };
    // Retry the exact batch first; do not overwrite unsent aggregates or sequence.
    const pending = await readJson(pendingPath, null);
    if (pending) { await upload(validateBatch(pending)); await unlink(pendingPath); }
    await unlink(report).catch(() => {});
    try {
      await exec(process.execPath, [resolve(root, 'scripts/refresh-activity.mjs')], { cwd: root, windowsHide: true, timeout: 600_000, maxBuffer: 1024 * 1024,
        env: { ...process.env, MORIIUM_ACTIVITY_OUTPUT: output, MORIIUM_ACTIVITY_REPORT: report, MORIIUM_ACTIVITY_ARCHIVE: resolve(local, 'archive') } });
    } catch { /* Partial success remains publishable only with a completed report. */ }
    const sources = await readJson(report, null);
    const statePath = resolve(local, 'sequence.json');
    const state = await readJson(statePath, { sequence: 0 });
    const sequence = state.sequence + 1;
    const batch = validateBatch({ version: 1, producer: 'morii-workstation', sequence, createdAt: new Date().toISOString(), sources, data: JSON.parse(await readFile(output, 'utf8')) });
    await atomicJson(statePath, { sequence });
    await atomicJson(pendingPath, batch);
    await upload(batch);
    await unlink(pendingPath);
    console.log('Activity batch uploaded; the status publisher will make it public.');
  });
} catch { console.error('Activity sync failed; local data and any pending batch retained.'); process.exitCode = 1; }

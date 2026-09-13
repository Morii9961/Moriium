// OpenSSH forced command: stdin is the only input, never SSH_ORIGINAL_COMMAND.
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { atomicJson, readJson, withLock } from './lib/status-store.mjs';
import { validateBatch } from './lib/status-batch.mjs';

export async function receiveBatch(root, raw, now = Date.now()) {
  const batch = validateBatch(raw, now);
  return withLock(resolve(root, 'receive.lock'), async () => {
    const path = resolve(root, 'pending.json');
    const previous = await readJson(path, null);
    if (previous && previous.batch.sequence >= batch.sequence) return false;
    await atomicJson(path, { receivedAt: new Date(now).toISOString(), batch });
    return true;
  });
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const timeout = setTimeout(() => process.exit(1), 30_000);
  try {
    const chunks = []; let length = 0;
    for await (const chunk of process.stdin) {
      length += chunk.length;
      if (length > 4 * 1024 * 1024) throw new Error('Batch too large.');
      chunks.push(chunk);
    }
    await receiveBatch(process.env.MORIIUM_STATUS_INBOX || '/var/lib/moriium-status/inbox', JSON.parse(Buffer.concat(chunks).toString('utf8')));
    console.log('Activity batch accepted.');
  } catch { console.error('Activity batch rejected.'); process.exitCode = 1; }
  finally { clearTimeout(timeout); }
}

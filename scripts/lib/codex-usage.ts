import { spawn } from 'node:child_process';
import { validDate, type ActivityDay, type ActivitySnapshot } from '../../src/lib/activity.ts';

/**
 * Codex reports account-wide token activity from the server, so it covers the iOS app,
 * Codex Cloud and every other surface that never touches this computer. Local session
 * logs cannot see those. The request goes through the app-server rather than
 * `GET /backend-api/wham/usage` on purpose: the CLI holds its own credentials and this
 * repository never handles a bearer token.
 *
 * Protocol: `codex app-server generate-json-schema --out <dir>` prints the contract.
 * `account/usage/read` answers with `summary` and `dailyUsageBuckets[{startDate, tokens}]`.
 */

const METHOD = 'account/usage/read';
const CLIENT = { name: 'moriium-activity', version: '1.0.0' };

/** The buckets carry the server's own day boundaries, which are not Asia/Shanghai. */
export const CODEX_TIMEZONE = 'Codex';

export async function readCodexUsage(timeoutMs = 90_000): Promise<unknown> {
  const executable = process.env.MORIIUM_CODEX_CLI || 'codex';
  const child = spawn(executable, ['app-server'], { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
  const send = (message: unknown) => child.stdin.write(`${JSON.stringify(message)}\n`);
  try {
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Codex app-server timed out.')), timeoutMs);
      let buffer = '';
      child.on('error', reject);
      child.on('exit', () => reject(new Error('Codex app-server exited before answering.')));
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (chunk: string) => {
        buffer += chunk;
        for (let end = buffer.indexOf('\n'); end >= 0; end = buffer.indexOf('\n')) {
          const line = buffer.slice(0, end).trim();
          buffer = buffer.slice(end + 1);
          if (!line) continue;
          let message; try { message = JSON.parse(line); } catch { continue; }
          if (message.id === 1) {
            send({ jsonrpc: '2.0', method: 'initialized', params: {} });
            send({ jsonrpc: '2.0', id: 2, method: METHOD, params: null });
          }
          if (message.id !== 2) continue;
          clearTimeout(timer);
          if (message.error) reject(new Error('Codex app-server refused the usage request.'));
          else resolve(message.result);
          return;
        }
      });
      send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { clientInfo: CLIENT } });
    });
  } finally {
    child.kill();
  }
}

/** Fail closed on any shape the pinned protocol does not describe. */
export function importCodexUsage(result: unknown, updatedAt: string): ActivitySnapshot {
  if (!result || typeof result !== 'object') throw new Error('Expected a Codex usage result.');
  const buckets = (result as { dailyUsageBuckets?: unknown }).dailyUsageBuckets;
  if (!Array.isArray(buckets) || !buckets.length) throw new Error('Codex returned no daily usage buckets.');
  const dates = new Set<string>();
  const days: ActivityDay[] = buckets.map((bucket) => {
    const { startDate, tokens } = (bucket ?? {}) as { startDate?: unknown; tokens?: unknown };
    if (!validDate(startDate) || dates.has(startDate)) throw new Error('Invalid or repeated Codex bucket date.');
    if (!Number.isSafeInteger(tokens) || Number(tokens) < 0) throw new Error('Invalid Codex bucket total.');
    dates.add(startDate);
    return { date: startDate, value: Number(tokens) };
  });
  // The summary is the account's own lifetime figure; the buckets must reconstruct it,
  // otherwise a silently truncated page would read as a genuine drop in usage.
  const lifetime = (result as { summary?: { lifetimeTokens?: unknown } }).summary?.lifetimeTokens;
  const total = days.reduce((sum, day) => sum + day.value, 0);
  if (Number.isSafeInteger(lifetime) && Number(lifetime) !== total) throw new Error('Codex buckets do not add up to the reported lifetime total.');
  return { updatedAt, timezone: CODEX_TIMEZONE, metric: 'tokens', days };
}

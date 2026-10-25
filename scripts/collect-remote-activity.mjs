import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { readJson, atomicJson, withLock } from './lib/status-store.mjs';
import { TOKENS_URL, USERNAME, fetchJson, parseTokens, parseGitHub, validateFeed, validateFeedPointer, updateFeed, validateLegacy } from './lib/remote-activity.mjs';
import { validateManifest } from '../src/lib/status.ts';
import { validDate } from '../src/lib/activity.ts';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
async function readHashed(root, kind, hash) {
  const bytes = await readFile(resolve(root, `public/${kind}/${hash}.json`));
  if (bytes.length > 4 * 1024 * 1024 || digest(bytes) !== hash) throw new Error('Invalid retained activity.');
  return JSON.parse(bytes.toString('utf8'));
}
async function githubHistory(now, from, token, request) {
  if (!token) throw new Error('GitHub credential unavailable.');
  const to = new Date(now).toISOString().slice(0, 10);
  if (!validDate(from) || from > to) throw new Error('Invalid GitHub archive start.');
  const days = [];
  for (let year = Number(from.slice(0, 4)); year <= Number(to.slice(0, 4)); year++) {
    const start = year === Number(from.slice(0, 4)) ? from : `${year}-01-01`;
    const end = year === Number(to.slice(0, 4)) ? to : `${year}-12-31`;
    const query = 'query($login:String!,$from:DateTime!,$to:DateTime!){user(login:$login){contributionsCollection(from:$from,to:$to){contributionCalendar{weeks{contributionDays{date contributionCount}}}}}}';
    const raw = await request('https://api.github.com/graphql', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables: { login: USERNAME, from: `${start}T00:00:00Z`, to: `${end}T23:59:59Z` } }) });
    days.push(...parseGitHub(raw, now, start, end));
  }
  return { updatedAt: new Date(now).toISOString(), days };
}

// A separate namespace and lock keep the legacy workstation publisher from overwriting this feed.
// Only the complete hash-addressed file is visible before the pointer switches.
export async function collectRemoteActivity({ root, legacyFile = resolve(import.meta.dirname, '../src/data/activity.json'),
  now = Date.now(), githubFrom = '2026-01-01', githubToken, request = fetchJson, beforePointer = async () => {} }) {
  return withLock(resolve(root, 'activity-feed.lock'), async () => {
    const pointerPath = resolve(root, 'public/activity-v2/current.json');
    const rawPointer = await readJson(pointerPath, null);
    const pointer = rawPointer === null ? null : validateFeedPointer(rawPointer);
    const previous = pointer ? validateFeed(await readHashed(root, 'activity-v2', pointer.hash), now) : null;
    if (pointer && pointer.generatedAt !== previous.generatedAt) throw new Error('Activity pointer mismatch.');
    let legacy = previous?.legacy;
    if (!legacy) {
      const current = await readJson(resolve(root, 'public/current.json'), null);
      const prior = current ? validateManifest(current).activity : null;
      const data = validateLegacy(prior ? await readHashed(root, 'activity', prior.hash) : JSON.parse(await readFile(legacyFile, 'utf8')));
      const hash = digest(`${JSON.stringify(data)}\n`);
      await atomicJson(resolve(root, `public/activity/${hash}.json`), data);
      legacy = { hash, url: `/status-data/activity/${hash}.json` };
    }
    const attempts = {};
    const from = previous?.sources.github.snapshot?.days[0]?.date ?? githubFrom;
    await Promise.all([
      (async () => { try { attempts.github = await githubHistory(now, from, githubToken, request); } catch { /* per-source failure, no raw reports */ } })(),
      (async () => { try { Object.assign(attempts, parseTokens(await request(TOKENS_URL), now)); } catch { /* keep both previous snapshots */ } })(),
    ]);
    const feed = updateFeed(previous, attempts, legacy, now);
    const hash = digest(`${JSON.stringify(feed)}\n`);
    await atomicJson(resolve(root, `public/activity-v2/${hash}.json`), feed);
    await beforePointer();
    const next = { version: 2, generatedAt: feed.generatedAt, hash, url: `/status-data/activity-v2/${hash}.json` };
    await atomicJson(pointerPath, next);
    return { pointer: next, feed };
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    if (process.argv.length !== 2) throw new Error('Unexpected arguments.');
    const { feed } = await collectRemoteActivity({ root: process.env.MORIIUM_STATUS_ROOT || '/var/lib/moriium-status',
      legacyFile: process.env.MORIIUM_ACTIVITY_LEGACY, githubFrom: process.env.MORIIUM_GITHUB_FROM || '2026-01-01',
      githubToken: process.env.GITHUB_TOKEN || process.env.GH_TOKEN });
    const failed = Object.values(feed.sources).filter(s => s.result !== 'success').length;
    console.log(`Remote activity published; ${failed} unavailable sources.`);
    if (failed) process.exitCode = 1;
  } catch { console.error('Remote activity publication failed; previous public pointer retained.'); process.exitCode = 1; }
}

import { validateActivity, SOURCES } from '../../src/lib/activity.ts';
import { timestamp } from '../../src/lib/status.ts';

export function validateBatch(raw, now = Date.now()) {
  const fail = () => { throw new Error('Invalid activity batch.'); };
  if (!raw || raw.version !== 1 || raw.producer !== 'morii-workstation' || !Number.isSafeInteger(raw.sequence) || raw.sequence < 1 || !timestamp(raw.createdAt) || Date.parse(raw.createdAt) > now + 300_000) fail();
  const data = validateActivity(raw.data);
  const sources = {};
  for (const id of SOURCES) {
    const source = raw.sources?.[id];
    if (!source || !timestamp(source.attemptedAt) || Date.parse(source.attemptedAt) > Date.parse(raw.createdAt) || !['success', 'failed'].includes(source.result)) fail();
    const snapshot = data.sources[id];
    if (snapshot && Date.parse(snapshot.updatedAt) > Date.parse(source.attemptedAt)) fail();
    if (source.result === 'success' && (!snapshot || snapshot.updatedAt !== source.attemptedAt)) fail();
    sources[id] = { attemptedAt: source.attemptedAt, succeededAt: snapshot?.updatedAt ?? null, result: source.result };
  }
  return { version: 1, producer: raw.producer, sequence: raw.sequence, createdAt: raw.createdAt, sources, data };
}

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  EDGE_TRANSLATE_URL,
  serviceLanguage,
  translateTexts,
} from '../src/server/translation/edge.ts';

/** A fetch that replays scripted outcomes and records what it was asked. */
function scriptedFetch(outcomes) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    const outcome = outcomes.shift();
    if (outcome instanceof Error) throw outcome;
    return {
      ok: outcome.status === 200,
      status: outcome.status,
      text: async () => JSON.stringify(outcome.body ?? []),
    };
  };
  return { fetchImpl, calls };
}

function reply(texts) {
  return { status: 200, body: texts.map((text) => ({ translations: [{ text, to: 'ja' }] })) };
}

describe('edge translation client', () => {
  it('maps site languages onto the service ids the endpoint expects', () => {
    // The endpoint does not accept "zh"; sending it returns the source text
    // unchanged, which would look like a translation that decided not to.
    assert.equal(serviceLanguage('zh'), 'zh-CHS');
    assert.equal(serviceLanguage('ja'), 'ja');
    assert.equal(serviceLanguage('en'), 'en');
  });

  it('sends a bare string array and reads the translations back in order', async () => {
    const { fetchImpl, calls } = scriptedFetch([reply(['一', '二'])]);

    const result = await translateTexts(['A', 'B'], {
      from: 'zh',
      to: 'ja',
      fetchImpl,
      sleep: async () => {},
    });

    assert.deepEqual(result, ['一', '二']);
    assert.deepEqual(calls[0].body, ['A', 'B']);
    assert.match(calls[0].url, /^https:\/\/edge\.microsoft\.com\//);
    assert.match(calls[0].url, /from=zh-CHS&to=ja/);
    assert.equal(EDGE_TRANSLATE_URL.includes('{from}'), true);
  });

  it('retries a reset connection, which this endpoint does without warning', async () => {
    // Measured against the live endpoint: three of four opening attempts were
    // reset before any byte arrived. Without a retry the publish flow would
    // fail more often than it succeeds.
    const { fetchImpl, calls } = scriptedFetch([
      Object.assign(new Error('fetch failed'), { cause: { code: 'ECONNRESET' } }),
      Object.assign(new Error('fetch failed'), { cause: { code: 'ECONNRESET' } }),
      reply(['一']),
    ]);

    const result = await translateTexts(['A'], { from: 'zh', to: 'ja', fetchImpl, sleep: async () => {} });

    assert.deepEqual(result, ['一']);
    assert.equal(calls.length, 3);
  });

  it('gives up rather than returning a partial document', async () => {
    const { fetchImpl } = scriptedFetch(
      Array.from({ length: 12 }, () => new Error('fetch failed')),
    );

    // Asserting the code, not the wording: the message is author-facing Chinese
    // and belongs to the interface, while the code is what callers branch on.
    await assert.rejects(
      translateTexts(['A'], { from: 'zh', to: 'ja', fetchImpl, sleep: async () => {} }),
      (error) => error.code === 'translation-failed',
    );
  });

  it('refuses a reply that does not answer every piece', async () => {
    // Two pieces in, one out would splice the wrong paragraph into the article.
    const { fetchImpl } = scriptedFetch([reply(['一'])]);

    await assert.rejects(
      translateTexts(['A', 'B'], { from: 'zh', to: 'ja', fetchImpl, sleep: async () => {} }),
      (error) => error.code === 'translation-failed' && /应为 2 段/.test(error.userMessage),
    );
  });

  it('asks for nothing when there is nothing to translate', async () => {
    const { fetchImpl, calls } = scriptedFetch([]);

    assert.deepEqual(await translateTexts([], { from: 'zh', to: 'ja', fetchImpl }), []);
    assert.equal(calls.length, 0);
  });
});

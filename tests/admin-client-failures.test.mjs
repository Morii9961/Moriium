import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { api, ApiError, messageForApiFailure } from '../src/admin/api.ts';

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('admin client failure messages', () => {
  it('turns a disconnected author API into contextual copy without exposing the browser exception', async () => {
    globalThis.fetch = async () => {
      throw new TypeError('Failed to fetch');
    };

    const failure = await api.login('Morii', 'x'.repeat(24)).then(
      () => null,
      (error) => error,
    );
    const message = messageForApiFailure(
      failure,
      '连接不上后台，请检查网络后重试。',
    );

    assert.equal(message, '连接不上后台，请检查网络后重试。');
    assert.doesNotMatch(message, /Failed to fetch|TypeError/);
  });

  it('keeps a readable refusal returned by the author API', () => {
    const message = messageForApiFailure(
      new ApiError(503, '数据库正忙，请稍后重试。'),
      '连接不上后台，请检查网络后重试。',
    );

    assert.equal(message, '数据库正忙，请稍后重试。');
  });
});

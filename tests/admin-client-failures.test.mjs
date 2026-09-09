import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import {
  api,
  ApiError,
  messageForApiFailure,
  messageForSignInFailure,
} from '../src/admin/api.ts';

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
      '后台连接失败。请检查网络后重试。',
    );

    assert.equal(message, '后台连接失败。请检查网络后重试。');
    assert.doesNotMatch(message, /Failed to fetch|TypeError/);
  });

  it('answers a rejected credential with the reason, not with an expired session', () => {
    // Signing in is the one place where 401 cannot mean "your session ended":
    // there was no session. Answering it that way sends the author looking for
    // a session problem instead of at what they typed.
    const message = messageForSignInFailure(new ApiError(401, '账户名或口令错误。'));

    assert.equal(message, '账户名或口令错误。');
    assert.doesNotMatch(message, /会话/);
  });

  it('explains a refused origin instead of repeating the bare refusal', () => {
    // The boundary answers a mismatched Host/Origin with "请求已拒绝。", which
    // names the refusal and not its cause. Only the address the author opened
    // can be wrong here, so the message has to say so.
    const message = messageForSignInFailure(new ApiError(403, '请求已拒绝。'));

    assert.match(message, /地址/);
    assert.match(message, /端口/);
  });

  it('keeps the browser exception out of a sign-in network failure', () => {
    const message = messageForSignInFailure(new TypeError('Failed to fetch'));

    assert.doesNotMatch(message, /Failed to fetch|TypeError/);
  });

  it('keeps a readable refusal returned by the author API', () => {
    const message = messageForApiFailure(
      new ApiError(503, '数据库正忙，请稍后重试。'),
      '后台连接失败。请检查网络后重试。',
    );

    assert.equal(message, '数据库正忙，请稍后重试。');
  });
});

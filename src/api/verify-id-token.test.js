import { describe, it, expect, vi } from 'vitest';
import { createIdTokenVerifier, AuthError } from './verify-id-token.js';

function fakeFetch(status, payload) {
  return vi.fn().mockResolvedValue({ ok: status >= 200 && status < 300, status, json: async () => payload });
}

describe('createIdTokenVerifier', () => {
  it('posts the token to LINE and returns the LINE user id', async () => {
    const fetchImpl = fakeFetch(200, { sub: 'U123', aud: '1234567890' });
    const verify = createIdTokenVerifier({ channelId: '1234567890', fetchImpl });

    expect(await verify('token-abc')).toBe('U123');

    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.line.me/oauth2/v2.1/verify');
    expect(options.method).toBe('POST');
    expect(options.headers).toEqual({ 'Content-Type': 'application/x-www-form-urlencoded' });
    expect(new URLSearchParams(options.body).get('id_token')).toBe('token-abc');
    expect(new URLSearchParams(options.body).get('client_id')).toBe('1234567890');
    expect(options.signal).toEqual(expect.any(AbortSignal));
  });

  it('rejects a missing token without calling LINE', async () => {
    const fetchImpl = fakeFetch(200, { sub: 'U123' });
    const verify = createIdTokenVerifier({ channelId: '1', fetchImpl });

    await expect(verify('')).rejects.toBeInstanceOf(AuthError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects a token LINE does not accept', async () => {
    const verify = createIdTokenVerifier({
      channelId: '1',
      fetchImpl: fakeFetch(400, { error: 'invalid_request', error_description: 'IdToken expired.' }),
    });

    const promise = verify('expired');
    await expect(promise).rejects.toThrow('ID token rejected with status 400');
    await expect(promise).rejects.toBeInstanceOf(AuthError);
  });

  it('rejects when LINE answers 401', async () => {
    const verify = createIdTokenVerifier({ channelId: '1', fetchImpl: fakeFetch(401, {}) });

    const promise = verify('token');
    await expect(promise).rejects.toThrow('ID token rejected with status 401');
    await expect(promise).rejects.toBeInstanceOf(AuthError);
  });

  it('aborts the LINE request after 5 seconds', async () => {
    const controller = new AbortController();
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
    const fetchImpl = vi.fn(
      (url, options) =>
        new Promise((resolve, reject) => {
          options.signal.addEventListener('abort', () => reject(options.signal.reason));
        })
    );
    const verify = createIdTokenVerifier({ channelId: '1', fetchImpl });

    const promise = verify('token');
    expect(timeoutSpy).toHaveBeenCalledWith(5000);
    expect(fetchImpl.mock.calls[0][1].signal).toBe(controller.signal);
    controller.abort(new DOMException('The operation timed out.', 'TimeoutError'));

    await expect(promise).rejects.toMatchObject({ name: 'TimeoutError' });
    await expect(promise).rejects.not.toBeInstanceOf(AuthError);
    timeoutSpy.mockRestore();
  });

  it('rejects a response without a subject', async () => {
    const verify = createIdTokenVerifier({ channelId: '1', fetchImpl: fakeFetch(200, {}) });

    await expect(verify('token')).rejects.toBeInstanceOf(AuthError);
  });

  it('passes network errors through as they are', async () => {
    const verify = createIdTokenVerifier({
      channelId: '1',
      fetchImpl: vi.fn().mockRejectedValue(new TypeError('fetch failed')),
    });

    const promise = verify('token');
    await expect(promise).rejects.toThrow('fetch failed');
    await expect(promise).rejects.not.toBeInstanceOf(AuthError);
  });
});

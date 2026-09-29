import { describe, it, expect, vi } from 'vitest';
import { createFetchWithTimeout } from './fetch-with-timeout.js';

function abortableFetch() {
  return vi.fn(
    (url, options) =>
      new Promise((resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(options.signal.reason));
      })
  );
}

describe('createFetchWithTimeout', () => {
  it('passes url and options through with a signal', async () => {
    const baseFetch = vi.fn().mockResolvedValue('response');
    const fetchWithTimeout = createFetchWithTimeout(1000, baseFetch);

    const result = await fetchWithTimeout('https://example.test/x', { method: 'POST', body: 'b' });

    expect(result).toBe('response');
    expect(baseFetch).toHaveBeenCalledWith('https://example.test/x', {
      method: 'POST',
      body: 'b',
      signal: expect.any(AbortSignal),
    });
  });

  it('aborts the signal after the timeout', async () => {
    const fetchWithTimeout = createFetchWithTimeout(20, abortableFetch());

    await expect(fetchWithTimeout('https://example.test/x')).rejects.toMatchObject({
      name: 'TimeoutError',
    });
  });

  it('aborts when the caller signal aborts', async () => {
    const controller = new AbortController();
    const fetchWithTimeout = createFetchWithTimeout(5000, abortableFetch());

    const pending = fetchWithTimeout('https://example.test/x', { signal: controller.signal });
    controller.abort(new Error('caller aborted'));

    await expect(pending).rejects.toThrow('caller aborted');
  });
});

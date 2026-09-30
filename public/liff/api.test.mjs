import { describe, it, expect, vi } from 'vitest';
import { createApi, ApiError } from './api.mjs';

function fakeFetch(status, body) {
  return vi.fn().mockResolvedValue({ ok: status >= 200 && status < 300, status, json: async () => body });
}

function setup(fetchImpl) {
  return createApi({ fetchImpl, getIdToken: () => 'token-1' });
}

describe('createApi', () => {
  it('sends the ID token and reads JSON', async () => {
    const fetchImpl = fakeFetch(200, { categories: [] });

    expect(await setup(fetchImpl).listCategories()).toEqual({ categories: [] });
    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toBe('/api/categories');
    expect(options.headers.Authorization).toBe('Bearer token-1');
  });

  it('sends the ngrok skip-warning header', async () => {
    const fetchImpl = fakeFetch(200, { categories: [] });

    await setup(fetchImpl).listCategories();

    expect(fetchImpl.mock.calls[0][1].headers['ngrok-skip-browser-warning']).toBe('1');
  });

  it('asks for one month of entries', async () => {
    const fetchImpl = fakeFetch(200, { transactions: [] });

    await setup(fetchImpl).listTransactions('2026-09');

    expect(fetchImpl.mock.calls[0][0]).toBe('/api/transactions?month=2026-09');
  });

  it('sends updates as JSON with PATCH and returns null on 204', async () => {
    const fetchImpl = fakeFetch(204, null);
    const body = { amount: 60, categoryId: 'c1', occurredOn: '2026-09-29', note: '' };

    expect(await setup(fetchImpl).updateTransaction('t1', body)).toBeNull();
    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toBe('/api/transactions/t1');
    expect(options.method).toBe('PATCH');
    expect(JSON.parse(options.body)).toEqual(body);
  });

  it('deletes with DELETE', async () => {
    const fetchImpl = fakeFetch(204, null);

    await setup(fetchImpl).deleteTransaction('t1');

    expect(fetchImpl.mock.calls[0][1].method).toBe('DELETE');
  });

  it('throws ApiError with the status when the server refuses', async () => {
    const promise = setup(fakeFetch(401, { error: 'Unauthorized' })).listCategories();

    await expect(promise).rejects.toBeInstanceOf(ApiError);
    await expect(promise).rejects.toMatchObject({ status: 401 });
  });

  it('asks for an export link of one month with POST', async () => {
    const fetchImpl = fakeFetch(201, { path: '/exports/abc' });

    expect(await setup(fetchImpl).createExport('2026-09')).toEqual({ path: '/exports/abc' });
    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toBe('/api/exports');
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body)).toEqual({ month: '2026-09' });
    expect(options.headers.Authorization).toBe('Bearer token-1');
  });

  it('passes a 15 second timeout signal to fetch', async () => {
    const signal = new AbortController().signal;
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(signal);
    const fetchImpl = fakeFetch(200, { categories: [] });

    await setup(fetchImpl).listCategories();

    expect(timeoutSpy).toHaveBeenCalledWith(15000);
    expect(fetchImpl.mock.calls[0][1].signal).toBe(signal);
    timeoutSpy.mockRestore();
  });
});

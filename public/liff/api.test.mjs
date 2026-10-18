import { describe, it, expect, vi } from 'vitest';
import { createApi, ApiError, RECEIPT_TIMEOUT_MS } from './api.mjs';

function fakeFetch(status, body) {
  return vi.fn().mockResolvedValue({ ok: status >= 200 && status < 300, status, json: async () => body });
}

function setup(fetchImpl) {
  return createApi({ fetchImpl, getIdToken: () => 'token-1' });
}

describe('createApi', () => {
  it('creates and updates categories', async () => {
    const fetchImpl = fakeFetch(200, { category: {} });
    const api = setup(fetchImpl);

    await api.createCategory({ type: 'expense', name: 'ค่าแมว' });
    await api.updateCategory('c 1', { hidden: true });

    expect(fetchImpl.mock.calls.map(([url, options]) => [url, options.method, options.body])).toEqual([
      ['/api/categories', 'POST', JSON.stringify({ type: 'expense', name: 'ค่าแมว' })],
      ['/api/categories/c%201', 'PATCH', JSON.stringify({ hidden: true })],
    ]);
  });

  it('reads the usage of a category and deletes it', async () => {
    const fetchImpl = fakeFetch(200, { usage: { transactions: 1, recurring: 0, bills: 0 } });
    const api = setup(fetchImpl);

    const usage = await api.getCategoryUsage('c 1');
    fetchImpl.mockResolvedValueOnce({ ok: true, status: 204, json: async () => { throw new Error('no body'); } });
    const deleted = await api.deleteCategory('c 1');

    expect(usage).toEqual({ usage: { transactions: 1, recurring: 0, bills: 0 } });
    expect(deleted).toBe(true);
    expect(fetchImpl.mock.calls.map(([url, options]) => [url, options.method ?? 'GET'])).toEqual([
      ['/api/categories/c%201/usage', 'GET'],
      ['/api/categories/c%201', 'DELETE'],
    ]);
  });

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

  it('keeps the error code from the response body', async () => {
    const promise = setup(fakeFetch(400, { error: 'Not friends' })).createBill({});

    await expect(promise).rejects.toBeInstanceOf(ApiError);
    await expect(promise).rejects.toMatchObject({ status: 400, error: 'Not friends' });
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

  it('asks for the budgets of one month', async () => {
    const fetchImpl = fakeFetch(200, { budgets: [] });

    expect(await setup(fetchImpl).listBudgets('2026-09')).toEqual({ budgets: [] });
    expect(fetchImpl.mock.calls[0][0]).toBe('/api/budgets?month=2026-09');
  });

  it('sets a budget with PUT', async () => {
    const fetchImpl = fakeFetch(204, null);

    expect(await setup(fetchImpl).setBudget('c1', { month: '2026-09', amount: null })).toBeNull();
    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toBe('/api/budgets/c1');
    expect(options.method).toBe('PUT');
    expect(JSON.parse(options.body)).toEqual({ month: '2026-09', amount: null });
  });

  it('lists, creates, updates and deletes recurring rules', async () => {
    const fetchImpl = fakeFetch(200, { rules: [] });
    const api = setup(fetchImpl);
    const body = { categoryId: 'c1', amount: 590, dayOfMonth: 5, note: '', active: true };

    await api.listRecurring();
    await api.createRecurring(body);
    await api.updateRecurring('r 1', body);
    await api.deleteRecurring('r 1');

    expect(fetchImpl.mock.calls.map(([url, options]) => [url, options.method])).toEqual([
      ['/api/recurring', undefined],
      ['/api/recurring', 'POST'],
      ['/api/recurring/r%201', 'PUT'],
      ['/api/recurring/r%201', 'DELETE'],
    ]);
    expect(fetchImpl.mock.calls[1][1].body).toBe(JSON.stringify(body));
  });

  it('asks for the trend of a month and the profile', async () => {
    const fetchImpl = fakeFetch(200, {});
    const api = setup(fetchImpl);

    await api.getTrend('2026-09');
    await api.getProfile();

    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual(['/api/trend?month=2026-09', '/api/profile']);
  });

  it('reads, looks up, adds and removes friends and renews the code', async () => {
    const fetchImpl = fakeFetch(200, {});
    const api = setup(fetchImpl);

    await api.getFriends();
    await api.lookupFriend('AB CD');
    await api.addFriend('ABCD2345');
    await api.removeFriend('id/1');
    await api.regenerateFriendCode();

    expect(fetchImpl.mock.calls.map(([url, options]) => [options.method ?? 'GET', url])).toEqual([
      ['GET', '/api/friends'],
      ['POST', '/api/friends/lookup'],
      ['POST', '/api/friends'],
      ['DELETE', '/api/friends/id%2F1'],
      ['POST', '/api/friends/code'],
    ]);
    expect(JSON.parse(fetchImpl.mock.calls[1][1].body)).toEqual({ code: 'AB CD' });
    expect(JSON.parse(fetchImpl.mock.calls[2][1].body)).toEqual({ code: 'ABCD2345' });
  });

  it('reads, creates, cancels, marks paid and answers bills', async () => {
    const fetchImpl = fakeFetch(200, {});
    const api = setup(fetchImpl);

    await api.listBills();
    await api.createBill({ title: 'x' });
    await api.cancelBill('b/1');
    await api.setBillPaid('b1', 'm1', true);
    await api.confirmBill('b1');
    await api.declineBill('b1');

    expect(fetchImpl.mock.calls.map(([url, options]) => [options.method ?? 'GET', url])).toEqual([
      ['GET', '/api/bills'],
      ['POST', '/api/bills'],
      ['POST', '/api/bills/b%2F1/cancel'],
      ['POST', '/api/bills/b1/members/m1/paid'],
      ['POST', '/api/bills/b1/confirm'],
      ['POST', '/api/bills/b1/decline'],
    ]);
    expect(JSON.parse(fetchImpl.mock.calls[1][1].body)).toEqual({ title: 'x' });
    expect(JSON.parse(fetchImpl.mock.calls[3][1].body)).toEqual({ paid: true });
  });
});

describe('readReceipt', () => {
  it('sends the picked file as the raw body with a longer timeout, since Claude reads it', async () => {
    const fetchImpl = fakeFetch(200, { amount: 600 });
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    const file = new Blob(['jpeg-bytes'], { type: 'image/jpeg' });

    expect(await setup(fetchImpl).readReceipt(file)).toEqual({ amount: 600 });
    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toBe('/api/bills/read-receipt');
    expect(options.method).toBe('POST');
    expect(options.body).toBe(file);
    expect(options.headers['Content-Type']).toBe('application/octet-stream');
    expect(options.headers.Authorization).toBe('Bearer token-1');
    expect(timeout).toHaveBeenCalledWith(RECEIPT_TIMEOUT_MS);
    expect(RECEIPT_TIMEOUT_MS).toBeGreaterThan(30000);
    timeout.mockRestore();
  });
});

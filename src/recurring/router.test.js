import { describe, it, expect, vi, afterEach } from 'vitest';
import express from 'express';
import { createRecurringRouter } from './router.js';

let server;

async function start(deps) {
  const app = express();
  app.use('/internal', createRecurringRouter(deps));
  server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  return `http://127.0.0.1:${server.address().port}/internal`;
}

function post(base, token) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  return fetch(`${base}/recurring/run`, { method: 'POST', headers });
}

afterEach(async () => {
  if (!server) return;
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  server = undefined;
});

describe('createRecurringRouter', () => {
  it('refuses to build without a secret so the endpoint is never open', () => {
    expect(() => createRecurringRouter({ cronSecret: '', run: vi.fn() })).toThrow('cronSecret');
  });

  it('refuses a secret that is not a non-empty string', () => {
    expect(() => createRecurringRouter({ cronSecret: 12345, run: vi.fn() })).toThrow('requires cronSecret');
    expect(() => createRecurringRouter({ cronSecret: undefined, run: vi.fn() })).toThrow('requires cronSecret');
  });

  it('runs the job and returns the counts when the bearer secret matches', async () => {
    const run = vi.fn().mockResolvedValue({ due: 2, created: 1, skipped: 1, failed: 0, pushFailed: 1 });
    const base = await start({ cronSecret: 's3cret', run });

    const res = await post(base, 's3cret');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ due: 2, created: 1, skipped: 1, failed: 0, pushFailed: 1 });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('returns 500 with the counts when any rule failed', async () => {
    const counts = { due: 2, created: 1, skipped: 0, failed: 1, pushFailed: 0 };
    const base = await start({ cronSecret: 's3cret', run: vi.fn().mockResolvedValue(counts) });

    const res = await post(base, 's3cret');

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual(counts);
  });

  it('returns 401 and does not run for a missing or wrong secret', async () => {
    const run = vi.fn();
    const base = await start({ cronSecret: 's3cret', run });

    expect((await post(base, undefined)).status).toBe(401);
    expect((await post(base, 'wrong')).status).toBe(401);
    expect((await post(base, 's3cret-longer')).status).toBe(401);
    expect(run).not.toHaveBeenCalled();
  });

  it('returns 500 and logs when the job throws', async () => {
    const logger = { error: vi.fn() };
    const base = await start({ cronSecret: 's3cret', run: vi.fn().mockRejectedValue(new Error('db down')), logger });

    const res = await post(base, 's3cret');

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal error' });
    expect(logger.error).toHaveBeenCalled();
  });

  it('answers only POST', async () => {
    const base = await start({ cronSecret: 's3cret', run: vi.fn() });

    const res = await fetch(`${base}/recurring/run`, { headers: { Authorization: 'Bearer s3cret' } });

    expect(res.status).toBe(404);
  });
});

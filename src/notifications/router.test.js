import { describe, it, expect, vi, afterEach } from 'vitest';
import express from 'express';
import { createNotificationsRouter } from './router.js';

const COUNTS = { eligible: 2, sent: 1, skipped: 1, failed: 0, pushFailed: 0 };

let server;

function deps(overrides = {}) {
  return {
    cronSecret: 's3cret',
    runWeeklySummary: vi.fn().mockResolvedValue(COUNTS),
    logger: { error: vi.fn() },
    ...overrides,
  };
}

async function start(options) {
  const app = express();
  app.use('/internal', createNotificationsRouter(options));
  server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  return `http://127.0.0.1:${server.address().port}/internal`;
}

function post(base, path, token) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  return fetch(`${base}${path}`, { method: 'POST', headers });
}

afterEach(async () => {
  if (!server) return;
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  server = undefined;
});

describe('createNotificationsRouter', () => {
  it('refuses to build without a secret so the endpoint is never open', () => {
    expect(() => createNotificationsRouter(deps({ cronSecret: '' }))).toThrow('createNotificationsRouter requires cronSecret');
  });

  it('refuses to build without the weekly job', () => {
    expect(() => createNotificationsRouter(deps({ runWeeklySummary: undefined }))).toThrow('runWeeklySummary');
  });
});

describe('POST /internal/notifications/weekly', () => {
  it('runs the weekly summary and returns the counts when the bearer secret matches', async () => {
    const options = deps();
    const base = await start(options);

    const res = await post(base, '/notifications/weekly', 's3cret');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(COUNTS);
    expect(options.runWeeklySummary).toHaveBeenCalledTimes(1);
  });

  it('returns 500 with the counts when reading or reserving failed for a user', async () => {
    const counts = { eligible: 2, sent: 1, skipped: 0, failed: 1, pushFailed: 0 };
    const base = await start(deps({ runWeeklySummary: vi.fn().mockResolvedValue(counts) }));

    const res = await post(base, '/notifications/weekly', 's3cret');

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual(counts);
  });

  // push พังนับใน pushFailed แต่ไม่ทำให้ cron ล้มเหลว เหมือนรายการประจำ
  it('returns 200 with the counts when only pushes failed', async () => {
    const counts = { eligible: 2, sent: 1, skipped: 0, failed: 0, pushFailed: 1 };
    const base = await start(deps({ runWeeklySummary: vi.fn().mockResolvedValue(counts) }));

    const res = await post(base, '/notifications/weekly', 's3cret');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(counts);
  });

  it('returns 401 and does not run for a missing or wrong secret', async () => {
    const options = deps();
    const base = await start(options);

    expect((await post(base, '/notifications/weekly')).status).toBe(401);
    expect((await post(base, '/notifications/weekly', 'wrong')).status).toBe(401);
    expect(options.runWeeklySummary).not.toHaveBeenCalled();
  });

  it('returns 500 and logs only the reason when the job throws', async () => {
    const options = deps({ runWeeklySummary: vi.fn().mockRejectedValue(new Error('db down')) });
    const base = await start(options);

    const res = await post(base, '/notifications/weekly', 's3cret');

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal error' });
    expect(options.logger.error).toHaveBeenCalledWith('Weekly summary run failed', { reason: 'db down' });
  });

  it('answers only POST', async () => {
    const base = await start(deps());

    const res = await fetch(`${base}/notifications/weekly`, { headers: { Authorization: 'Bearer s3cret' } });

    expect(res.status).toBe(404);
  });
});

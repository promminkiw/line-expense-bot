import { describe, it, expect, vi, afterEach } from 'vitest';
import express from 'express';
import { createExportRouter } from './router.js';
import { createLinkToken, hashLinkToken } from './link-token.js';

const EXPIRED = 'ลิงก์นี้หมดอายุหรือถูกใช้ไปแล้ว กลับไปกด Export CSV ในหน้าเว็บอีกครั้ง';

let server;

function setup(overrides = {}) {
  return {
    repository: {
      claimExportLink: vi.fn().mockResolvedValue({ userId: 'user-1', month: '2026-09' }),
      listAllTransactions: vi.fn().mockResolvedValue([
        { id: 't1', type: 'expense', amount: 60, note: 'กินข้าว', occurredOn: '2026-09-29', categoryId: 'c-food' },
      ]),
      listCategories: vi.fn().mockResolvedValue([{ id: 'c-food', name: 'อาหาร', type: 'expense' }]),
    },
    now: () => new Date('2026-09-30T03:01:00.000Z'),
    logger: { error: vi.fn() },
    ...overrides,
  };
}

async function start(deps) {
  const app = express();
  app.use('/exports', createExportRouter(deps));
  server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  return `http://127.0.0.1:${server.address().port}/exports`;
}

afterEach(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

describe('GET /exports/:token', () => {
  it('claims the link and downloads the month as CSV with a BOM', async () => {
    const deps = setup();
    const base = await start(deps);
    const { token } = createLinkToken();

    const res = await fetch(`${base}/${token}`);

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="transactions-2026-09.csv"');
    expect(res.headers.get('cache-control')).toBe('no-store');
    // อ่านเป็น byte เพราะ res.text() ตัด BOM ทิ้ง
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder().decode(bytes)).toContain('2026-09-29,รายจ่าย,อาหาร,60.00,กินข้าว\r\n');
    expect(deps.repository.claimExportLink).toHaveBeenCalledWith(hashLinkToken(token), '2026-09-30T03:01:00.000Z');
    expect(deps.repository.listAllTransactions).toHaveBeenCalledWith('user-1', '2026-09-01', '2026-09-30');
    expect(deps.repository.listCategories).toHaveBeenCalledWith('user-1');
  });

  it('returns 410 for a malformed token without touching the database', async () => {
    const deps = setup();
    const base = await start(deps);

    const res = await fetch(`${base}/not-a-token`);

    expect(res.status).toBe(410);
    expect(res.headers.get('content-type')).toBe('text/plain; charset=utf-8');
    expect(await res.text()).toBe(EXPIRED);
    expect(deps.repository.claimExportLink).not.toHaveBeenCalled();
  });

  it('returns 410 when the link is unknown, expired or already used', async () => {
    const deps = setup();
    deps.repository.claimExportLink.mockResolvedValue(null);
    const base = await start(deps);

    const res = await fetch(`${base}/${createLinkToken().token}`);

    expect(res.status).toBe(410);
    expect(await res.text()).toBe(EXPIRED);
    expect(deps.repository.listAllTransactions).not.toHaveBeenCalled();
  });

  it('returns 500 text and logs when the database fails', async () => {
    const deps = setup();
    const error = new Error('db down');
    deps.repository.listAllTransactions.mockRejectedValue(error);
    const base = await start(deps);

    const res = await fetch(`${base}/${createLinkToken().token}`);

    expect(res.status).toBe(500);
    expect(await res.text()).toBe('Export ไม่สำเร็จ กลับไปกด Export CSV ในหน้าเว็บอีกครั้ง');
    expect(deps.logger.error).toHaveBeenCalledWith('Export failed', error);
  });

  it('returns 410 without logging when the token has a broken percent escape', async () => {
    const deps = setup();
    const base = await start(deps);

    const res = await fetch(`${base}/${createLinkToken().token}%`);

    expect(res.status).toBe(410);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.text()).toBe(EXPIRED);
    expect(deps.logger.error).not.toHaveBeenCalled();
    expect(deps.repository.claimExportLink).not.toHaveBeenCalled();
  });

  it('does not claim the link on a HEAD request', async () => {
    const deps = setup();
    const base = await start(deps);

    const res = await fetch(`${base}/${createLinkToken().token}`, { method: 'HEAD' });

    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('GET');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(deps.repository.claimExportLink).not.toHaveBeenCalled();
  });
});

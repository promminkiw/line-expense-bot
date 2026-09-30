import { describe, it, expect, vi } from 'vitest';
import { createRepository, DatabaseError } from './repository.js';

// จำลอง query builder ของ supabase-js: ทุก method คืนตัวเอง และ await ได้ผล result
// ส่งผลเพิ่มได้ ใช้กับ repository method ที่ await หลายครั้ง ครั้งที่เกินใช้ผลสุดท้าย
function fakeSupabase(result, ...laterResults) {
  const queue = [result, ...laterResults];
  const nextResult = () => (queue.length > 1 ? queue.shift() : queue[0]);
  const calls = [];
  const builder = {};
  for (const method of ['select', 'eq', 'upsert', 'insert', 'delete', 'update', 'gte', 'lte', 'order', 'range', 'is', 'gt']) {
    builder[method] = vi.fn((...args) => {
      calls.push([method, ...args]);
      return builder;
    });
  }
  for (const method of ['single', 'maybeSingle']) {
    builder[method] = vi.fn(() => {
      calls.push([method]);
      return Promise.resolve(result);
    });
  }
  builder.then = (resolve, reject) => Promise.resolve(nextResult()).then(resolve, reject);
  const supabase = {
    from: vi.fn((table) => {
      calls.push(['from', table]);
      return builder;
    }),
    rpc: vi.fn((name, params) => {
      calls.push(['rpc', name, params]);
      return builder;
    }),
  };
  return { supabase, calls };
}

// เหมือน fakeSupabase แต่ await แต่ละครั้งได้ผลลัพธ์ถัดไป ใช้กับ query ที่อ่านทีละหน้า
function fakeSupabasePages(results) {
  const calls = [];
  let index = 0;
  const builder = {};
  for (const method of ['select', 'eq', 'gte', 'lte', 'order', 'range']) {
    builder[method] = vi.fn((...args) => {
      calls.push([method, ...args]);
      return builder;
    });
  }
  builder.then = (resolve, reject) => Promise.resolve(results[index++]).then(resolve, reject);
  const supabase = {
    from: vi.fn((table) => {
      calls.push(['from', table]);
      return builder;
    }),
  };
  return { supabase, calls };
}

describe('repository.findUserIdByLineId', () => {
  it('returns the user id when found', async () => {
    const { supabase, calls } = fakeSupabase({ data: { id: 'user-1' }, error: null });

    const id = await createRepository(supabase).findUserIdByLineId('U1');

    expect(id).toBe('user-1');
    expect(calls).toEqual([
      ['from', 'users'],
      ['select', 'id'],
      ['eq', 'line_user_id', 'U1'],
      ['maybeSingle'],
    ]);
  });

  it('returns null when not found', async () => {
    const { supabase } = fakeSupabase({ data: null, error: null });

    expect(await createRepository(supabase).findUserIdByLineId('U1')).toBeNull();
  });

  it('throws DatabaseError when Supabase returns an error', async () => {
    const { supabase } = fakeSupabase({ data: null, error: { message: 'boom' } });

    const promise = createRepository(supabase).findUserIdByLineId('U1');

    await expect(promise).rejects.toBeInstanceOf(DatabaseError);
    await expect(promise).rejects.toThrow('Database findUserIdByLineId failed: boom');
  });
});

describe('repository.createUser', () => {
  it('upserts by line_user_id and returns the id', async () => {
    const { supabase, calls } = fakeSupabase({ data: { id: 'user-1' }, error: null });

    const id = await createRepository(supabase).createUser({ lineUserId: 'U1', displayName: 'Aom' });

    expect(id).toBe('user-1');
    expect(calls).toEqual([
      ['from', 'users'],
      ['upsert', { line_user_id: 'U1', display_name: 'Aom' }, { onConflict: 'line_user_id' }],
      ['select', 'id'],
      ['single'],
    ]);
  });

  it('throws DatabaseError when Supabase returns an error', async () => {
    const { supabase } = fakeSupabase({ data: null, count: null, error: { message: 'boom' } });

    const promise = createRepository(supabase).createUser({ lineUserId: 'U1', displayName: 'Aom' });

    await expect(promise).rejects.toBeInstanceOf(DatabaseError);
    await expect(promise).rejects.toThrow('Database createUser failed: boom');
  });
});

describe('repository.seedDefaultCategories', () => {
  it('inserts every default category and ignores existing ones', async () => {
    const { supabase, calls } = fakeSupabase({ data: null, error: null });

    await createRepository(supabase).seedDefaultCategories('user-1');

    const [, upsertCall] = calls;
    const [method, rows, options] = upsertCall;
    expect(calls[0]).toEqual(['from', 'categories']);
    expect(method).toBe('upsert');
    expect(options).toEqual({ onConflict: 'user_id,type,name', ignoreDuplicates: true });
    expect(rows).toHaveLength(10);
    expect(rows).toContainEqual({ user_id: 'user-1', type: 'expense', name: 'อาหาร' });
    expect(rows).toContainEqual({ user_id: 'user-1', type: 'income', name: 'อื่นๆ' });
  });

  it('throws DatabaseError when Supabase returns an error', async () => {
    const { supabase } = fakeSupabase({ data: null, count: null, error: { message: 'boom' } });

    const promise = createRepository(supabase).seedDefaultCategories('user-1');

    await expect(promise).rejects.toBeInstanceOf(DatabaseError);
    await expect(promise).rejects.toThrow('Database seedDefaultCategories failed: boom');
  });
});

describe('repository.getCategoryIds', () => {
  it('returns a map keyed by type and name for this user only', async () => {
    const { supabase, calls } = fakeSupabase({
      data: [
        { id: 'c1', type: 'expense', name: 'อาหาร' },
        { id: 'c2', type: 'income', name: 'อื่นๆ' },
      ],
      error: null,
    });

    const ids = await createRepository(supabase).getCategoryIds('user-1');

    expect(ids).toEqual(
      new Map([
        ['expense:อาหาร', 'c1'],
        ['income:อื่นๆ', 'c2'],
      ])
    );
    expect(calls).toEqual([
      ['from', 'categories'],
      ['select', 'id, type, name'],
      ['eq', 'user_id', 'user-1'],
    ]);
  });

  it('throws DatabaseError when Supabase returns an error', async () => {
    const { supabase } = fakeSupabase({ data: null, count: null, error: { message: 'boom' } });

    const promise = createRepository(supabase).getCategoryIds('user-1');

    await expect(promise).rejects.toBeInstanceOf(DatabaseError);
    await expect(promise).rejects.toThrow('Database getCategoryIds failed: boom');
  });
});

describe('repository.claimEvent', () => {
  it('returns true when the event row was inserted', async () => {
    const { supabase, calls } = fakeSupabase({ data: [{ webhook_event_id: 'ev1' }], error: null });

    expect(await createRepository(supabase).claimEvent('ev1', 'user-1')).toBe(true);
    expect(calls).toEqual([
      ['from', 'line_events'],
      [
        'upsert',
        { webhook_event_id: 'ev1', user_id: 'user-1' },
        { onConflict: 'webhook_event_id', ignoreDuplicates: true },
      ],
      ['select', 'webhook_event_id'],
    ]);
  });

  it('returns false when the event was already claimed', async () => {
    const { supabase } = fakeSupabase({ data: [], error: null });

    expect(await createRepository(supabase).claimEvent('ev1', 'user-1')).toBe(false);
  });

  it('throws DatabaseError when Supabase returns an error', async () => {
    const { supabase } = fakeSupabase({ data: null, count: null, error: { message: 'boom' } });

    const promise = createRepository(supabase).claimEvent('ev1', 'user-1');

    await expect(promise).rejects.toBeInstanceOf(DatabaseError);
    await expect(promise).rejects.toThrow('Database claimEvent failed: boom');
  });
});

describe('repository.insertTransactions', () => {
  it('inserts all rows in one call', async () => {
    const { supabase, calls } = fakeSupabase({ data: null, error: null });
    const rows = [{ user_id: 'user-1', amount: 60 }];

    await createRepository(supabase).insertTransactions(rows);

    expect(calls).toEqual([
      ['from', 'transactions'],
      ['insert', rows],
    ]);
  });

  it('throws DatabaseError when insert fails', async () => {
    const { supabase } = fakeSupabase({ data: null, error: { message: 'check violation' } });

    await expect(createRepository(supabase).insertTransactions([])).rejects.toThrow(
      'Database insertTransactions failed: check violation'
    );
  });
});

describe('repository.deleteTransactionsByEvent', () => {
  it('deletes only this user rows for the event and returns the count', async () => {
    const { supabase, calls } = fakeSupabase({ count: 2, error: null });

    const count = await createRepository(supabase).deleteTransactionsByEvent('user-1', 'ev1');

    expect(count).toBe(2);
    expect(calls).toEqual([
      ['from', 'transactions'],
      ['delete', { count: 'exact' }],
      ['eq', 'user_id', 'user-1'],
      ['eq', 'line_event_id', 'ev1'],
    ]);
  });

  it('throws DatabaseError when Supabase returns an error', async () => {
    const { supabase } = fakeSupabase({ data: null, count: null, error: { message: 'boom' } });

    const promise = createRepository(supabase).deleteTransactionsByEvent('user-1', 'ev1');

    await expect(promise).rejects.toBeInstanceOf(DatabaseError);
    await expect(promise).rejects.toThrow('Database deleteTransactionsByEvent failed: boom');
  });
});

describe('repository.getPendingClarification', () => {
  it('returns messages and updatedAt for this user', async () => {
    const messages = [{ role: 'user', text: 'ซื้อรถ' }];
    const { supabase, calls } = fakeSupabase({
      data: { messages, updated_at: '2026-09-29T05:00:00Z' },
      error: null,
    });

    const pending = await createRepository(supabase).getPendingClarification('user-1');

    expect(pending).toEqual({ messages, updatedAt: '2026-09-29T05:00:00Z' });
    expect(calls).toEqual([
      ['from', 'pending_clarifications'],
      ['select', 'messages, updated_at'],
      ['eq', 'user_id', 'user-1'],
      ['maybeSingle'],
    ]);
  });

  it('returns null when nothing is pending', async () => {
    const { supabase } = fakeSupabase({ data: null, error: null });

    expect(await createRepository(supabase).getPendingClarification('user-1')).toBeNull();
  });

  it('throws DatabaseError when Supabase returns an error', async () => {
    const { supabase } = fakeSupabase({ data: null, error: { message: 'boom' } });

    const promise = createRepository(supabase).getPendingClarification('user-1');

    await expect(promise).rejects.toBeInstanceOf(DatabaseError);
    await expect(promise).rejects.toThrow('Database getPendingClarification failed: boom');
  });
});

describe('repository.savePendingClarification', () => {
  it('upserts messages by user_id with a fresh updated_at', async () => {
    const { supabase, calls } = fakeSupabase({ data: null, error: null });
    const messages = [{ role: 'user', text: 'ซื้อรถ' }];

    await createRepository(supabase).savePendingClarification('user-1', messages);

    expect(calls).toEqual([
      ['from', 'pending_clarifications'],
      [
        'upsert',
        { user_id: 'user-1', messages, updated_at: expect.any(String) },
        { onConflict: 'user_id' },
      ],
    ]);
  });

  it('throws DatabaseError when Supabase returns an error', async () => {
    const { supabase } = fakeSupabase({ data: null, error: { message: 'boom' } });

    const promise = createRepository(supabase).savePendingClarification('user-1', []);

    await expect(promise).rejects.toBeInstanceOf(DatabaseError);
    await expect(promise).rejects.toThrow('Database savePendingClarification failed: boom');
  });
});

describe('repository.clearPendingClarification', () => {
  it('deletes only this user row', async () => {
    const { supabase, calls } = fakeSupabase({ data: null, error: null });

    await createRepository(supabase).clearPendingClarification('user-1');

    expect(calls).toEqual([
      ['from', 'pending_clarifications'],
      ['delete'],
      ['eq', 'user_id', 'user-1'],
    ]);
  });

  it('throws DatabaseError when Supabase returns an error', async () => {
    const { supabase } = fakeSupabase({ data: null, error: { message: 'boom' } });

    const promise = createRepository(supabase).clearPendingClarification('user-1');

    await expect(promise).rejects.toBeInstanceOf(DatabaseError);
    await expect(promise).rejects.toThrow('Database clearPendingClarification failed: boom');
  });
});

describe('repository.summarizeTransactions', () => {
  it('calls the SQL function for this user and date range and converts numbers', async () => {
    const { supabase, calls } = fakeSupabase({
      data: [{ type: 'expense', category: 'อาหาร', total: '105.50', entry_count: '2' }],
      error: null,
    });

    const rows = await createRepository(supabase).summarizeTransactions('user-1', '2026-09-01', '2026-09-29');

    expect(rows).toEqual([{ type: 'expense', category: 'อาหาร', total: 105.5, entryCount: 2 }]);
    expect(calls).toEqual([
      ['rpc', 'summarize_transactions', { p_user_id: 'user-1', p_from: '2026-09-01', p_to: '2026-09-29' }],
    ]);
  });

  it('returns numbers unchanged when PostgREST sends numbers', async () => {
    const { supabase } = fakeSupabase({
      data: [{ type: 'income', category: 'เงินเดือน', total: 25000, entry_count: 1 }],
      error: null,
    });

    const rows = await createRepository(supabase).summarizeTransactions('user-1', '2026-09-01', '2026-09-29');

    expect(rows).toEqual([{ type: 'income', category: 'เงินเดือน', total: 25000, entryCount: 1 }]);
  });

  it('returns an empty array when the range has no entries', async () => {
    const { supabase } = fakeSupabase({ data: [], error: null });

    const rows = await createRepository(supabase).summarizeTransactions('user-1', '2026-09-01', '2026-09-29');

    expect(rows).toEqual([]);
  });

  it('throws DatabaseError when Supabase returns an error', async () => {
    const { supabase } = fakeSupabase({ data: null, error: { message: 'boom' } });

    const promise = createRepository(supabase).summarizeTransactions('user-1', '2026-09-01', '2026-09-29');

    await expect(promise).rejects.toBeInstanceOf(DatabaseError);
    await expect(promise).rejects.toThrow('Database summarizeTransactions failed: boom');
  });
});

describe('repository.listTransactions', () => {
  it('reads this user rows in the date range, newest first, with the total count', async () => {
    const { supabase, calls } = fakeSupabase({
      data: [{ id: 't1', type: 'expense', amount: '60.00', note: 'กินข้าว', occurred_on: '2026-09-29', category_id: 'c1' }],
      count: 1,
      error: null,
    });

    const result = await createRepository(supabase).listTransactions('user-1', '2026-09-01', '2026-09-30');

    expect(result).toEqual({
      transactions: [
        { id: 't1', type: 'expense', amount: 60, note: 'กินข้าว', occurredOn: '2026-09-29', categoryId: 'c1' },
      ],
      totalCount: 1,
    });
    expect(calls).toEqual([
      ['from', 'transactions'],
      ['select', 'id, type, amount, note, occurred_on, category_id', { count: 'exact' }],
      ['eq', 'user_id', 'user-1'],
      ['gte', 'occurred_on', '2026-09-01'],
      ['lte', 'occurred_on', '2026-09-30'],
      ['order', 'occurred_on', { ascending: false }],
      ['order', 'created_at', { ascending: false }],
    ]);
  });

  it('returns number amounts when PostgREST sends numbers', async () => {
    const { supabase } = fakeSupabase({
      data: [{ id: 't1', type: 'expense', amount: 60.5, note: null, occurred_on: '2026-09-29', category_id: 'c1' }],
      count: 1,
      error: null,
    });

    const { transactions } = await createRepository(supabase).listTransactions('user-1', '2026-09-01', '2026-09-30');

    expect(transactions[0].amount).toBe(60.5);
  });

  it('reports a total count larger than the rows returned', async () => {
    const { supabase } = fakeSupabase({
      data: [{ id: 't1', type: 'expense', amount: 1, note: '', occurred_on: '2026-09-29', category_id: 'c1' }],
      count: 1500,
      error: null,
    });

    const { totalCount } = await createRepository(supabase).listTransactions('user-1', '2026-09-01', '2026-09-30');

    expect(totalCount).toBe(1500);
  });

  it('throws DatabaseError when Supabase returns an error', async () => {
    const { supabase } = fakeSupabase({ data: null, count: null, error: { message: 'boom' } });

    const promise = createRepository(supabase).listTransactions('user-1', 'a', 'b');

    await expect(promise).rejects.toBeInstanceOf(DatabaseError);
    await expect(promise).rejects.toThrow('Database listTransactions failed: boom');
  });
});

describe('repository.listAllTransactions', () => {
  const dbRow = { id: 't1', type: 'expense', amount: '60.00', note: 'กินข้าว', occurred_on: '2026-09-01', category_id: 'c1' };

  it('reads this user rows oldest first in pages of 1000 until the total count', async () => {
    const fullPage = Array.from({ length: 1000 }, () => dbRow);
    const { supabase, calls } = fakeSupabasePages([
      { data: fullPage, count: 1001, error: null },
      { data: [dbRow], count: 1001, error: null },
    ]);

    const rows = await createRepository(supabase).listAllTransactions('user-1', '2026-09-01', '2026-09-30');

    expect(rows).toHaveLength(1001);
    expect(rows[0]).toEqual({ id: 't1', type: 'expense', amount: 60, note: 'กินข้าว', occurredOn: '2026-09-01', categoryId: 'c1' });
    expect(calls.slice(0, 9)).toEqual([
      ['from', 'transactions'],
      ['select', 'id, type, amount, note, occurred_on, category_id', { count: 'exact' }],
      ['eq', 'user_id', 'user-1'],
      ['gte', 'occurred_on', '2026-09-01'],
      ['lte', 'occurred_on', '2026-09-30'],
      ['order', 'occurred_on', { ascending: true }],
      ['order', 'created_at', { ascending: true }],
      ['order', 'id', { ascending: true }],
      ['range', 0, 999],
    ]);
    expect(calls[17]).toEqual(['range', 1000, 1999]);
    expect(calls).toHaveLength(18);
  });

  it('keeps reading when the server caps a page below 1000 rows', async () => {
    const { supabase, calls } = fakeSupabasePages([
      { data: Array.from({ length: 500 }, () => dbRow), count: 700, error: null },
      { data: Array.from({ length: 200 }, () => dbRow), count: 700, error: null },
    ]);

    const rows = await createRepository(supabase).listAllTransactions('user-1', '2026-09-01', '2026-09-30');

    expect(rows).toHaveLength(700);
    expect(calls.filter((call) => call[0] === 'range')).toEqual([
      ['range', 0, 999],
      ['range', 500, 1499],
    ]);
    // หน้าถัดไปไม่ขอ count เพราะถ้ามีคนลบแถวระหว่างหน้า PostgREST ตอบ 416 เมื่อ offset เกินจำนวนจริง
    expect(calls[10]).toEqual(['select', 'id, type, amount, note, occurred_on, category_id']);
    expect(calls.slice(11, 17)).toEqual(calls.slice(2, 8));
  });

  it('stops when a page comes back empty even if the count says more', async () => {
    const { supabase } = fakeSupabasePages([
      { data: [dbRow], count: 5, error: null },
      { data: [], count: 5, error: null },
    ]);

    expect(await createRepository(supabase).listAllTransactions('user-1', 'a', 'b')).toHaveLength(1);
  });

  it('reads until an empty page when the count is missing', async () => {
    const { supabase } = fakeSupabasePages([
      { data: [dbRow], count: null, error: null },
      { data: [dbRow], count: null, error: null },
      { data: [], count: null, error: null },
    ]);

    expect(await createRepository(supabase).listAllTransactions('user-1', 'a', 'b')).toHaveLength(2);
  });

  it('stops after one page when the month has fewer than 1000 rows', async () => {
    const { supabase, calls } = fakeSupabasePages([{ data: [], count: 0, error: null }]);

    expect(await createRepository(supabase).listAllTransactions('user-1', '2026-09-01', '2026-09-30')).toEqual([]);
    expect(calls.filter((call) => call[0] === 'range')).toEqual([['range', 0, 999]]);
  });

  it('throws DatabaseError when Supabase returns an error', async () => {
    const { supabase } = fakeSupabasePages([{ data: null, error: { message: 'boom' } }]);

    const promise = createRepository(supabase).listAllTransactions('user-1', 'a', 'b');

    await expect(promise).rejects.toBeInstanceOf(DatabaseError);
    await expect(promise).rejects.toThrow('Database listAllTransactions failed: boom');
  });
});

describe('repository.createExportLink', () => {
  it('stores the token hash for this user and month', async () => {
    const { supabase, calls } = fakeSupabase({ data: null, error: null });

    await createRepository(supabase).createExportLink({
      tokenHash: 'hash-1',
      userId: 'user-1',
      month: '2026-09',
      expiresAt: '2026-09-30T03:05:00.000Z',
    });

    expect(calls).toEqual([
      ['from', 'export_links'],
      ['insert', { token_hash: 'hash-1', user_id: 'user-1', month: '2026-09', expires_at: '2026-09-30T03:05:00.000Z' }],
    ]);
  });

  it('throws DatabaseError when Supabase returns an error', async () => {
    const { supabase } = fakeSupabase({ data: null, error: { message: 'boom' } });

    const promise = createRepository(supabase).createExportLink({
      tokenHash: 'h',
      userId: 'u',
      month: '2026-09',
      expiresAt: 'x',
    });

    await expect(promise).rejects.toBeInstanceOf(DatabaseError);
    await expect(promise).rejects.toThrow('Database createExportLink failed: boom');
  });
});

describe('repository.deleteExpiredExportLinks', () => {
  it('deletes only this user links that have expired', async () => {
    const { supabase, calls } = fakeSupabase({ data: null, error: null });

    await createRepository(supabase).deleteExpiredExportLinks('user-1', '2026-09-30T03:01:00.000Z');

    expect(calls).toEqual([
      ['from', 'export_links'],
      ['delete'],
      ['eq', 'user_id', 'user-1'],
      ['lte', 'expires_at', '2026-09-30T03:01:00.000Z'],
    ]);
  });

  it('throws DatabaseError when Supabase returns an error', async () => {
    const { supabase } = fakeSupabase({ data: null, error: { message: 'boom' } });

    const promise = createRepository(supabase).deleteExpiredExportLinks('u', 'x');

    await expect(promise).rejects.toBeInstanceOf(DatabaseError);
    await expect(promise).rejects.toThrow('Database deleteExpiredExportLinks failed: boom');
  });
});

describe('repository.claimExportLink', () => {
  it('marks an unused, unexpired link as used in one update and returns its owner and month', async () => {
    const { supabase, calls } = fakeSupabase({ data: [{ user_id: 'user-1', month: '2026-09' }], error: null });

    const link = await createRepository(supabase).claimExportLink('hash-1', '2026-09-30T03:01:00.000Z');

    expect(link).toEqual({ userId: 'user-1', month: '2026-09' });
    expect(calls).toEqual([
      ['from', 'export_links'],
      ['update', { used_at: '2026-09-30T03:01:00.000Z' }],
      ['eq', 'token_hash', 'hash-1'],
      ['is', 'used_at', null],
      ['gt', 'expires_at', '2026-09-30T03:01:00.000Z'],
      ['select', 'user_id, month'],
    ]);
  });

  it('returns null when no link matched', async () => {
    const { supabase } = fakeSupabase({ data: [], error: null });

    expect(await createRepository(supabase).claimExportLink('hash-1', '2026-09-30T03:01:00.000Z')).toBeNull();
  });

  it('throws DatabaseError when Supabase returns an error', async () => {
    const { supabase } = fakeSupabase({ data: null, error: { message: 'boom' } });

    const promise = createRepository(supabase).claimExportLink('hash-1', 'x');

    await expect(promise).rejects.toBeInstanceOf(DatabaseError);
    await expect(promise).rejects.toThrow('Database claimExportLink failed: boom');
  });
});

describe('repository.listCategories', () => {
  it('reads this user categories ordered by type and name', async () => {
    const { supabase, calls } = fakeSupabase({
      data: [{ id: 'c1', name: 'อาหาร', type: 'expense' }],
      error: null,
    });

    expect(await createRepository(supabase).listCategories('user-1')).toEqual([
      { id: 'c1', name: 'อาหาร', type: 'expense' },
    ]);
    expect(calls).toEqual([
      ['from', 'categories'],
      ['select', 'id, name, type'],
      ['eq', 'user_id', 'user-1'],
      ['order', 'type'],
      ['order', 'name'],
    ]);
  });

  it('throws DatabaseError when Supabase returns an error', async () => {
    const { supabase } = fakeSupabase({ data: null, error: { message: 'boom' } });

    await expect(createRepository(supabase).listCategories('user-1')).rejects.toThrow(
      'Database listCategories failed: boom'
    );
  });
});

describe('repository.updateTransaction', () => {
  const fields = { type: 'income', amount: 25000, categoryId: 'c9', occurredOn: '2026-09-01', note: 'เงินเดือน' };

  it('updates only this user row and reports whether it existed', async () => {
    const { supabase, calls } = fakeSupabase({ data: [{ id: 't1' }], error: null });

    expect(await createRepository(supabase).updateTransaction('user-1', 't1', fields)).toBe(true);
    expect(calls).toEqual([
      ['from', 'transactions'],
      ['update', { type: 'income', amount: 25000, category_id: 'c9', occurred_on: '2026-09-01', note: 'เงินเดือน' }],
      ['eq', 'user_id', 'user-1'],
      ['eq', 'id', 't1'],
      ['select', 'id'],
    ]);
  });

  it('returns false when no row matched', async () => {
    const { supabase } = fakeSupabase({ data: [], error: null });

    expect(await createRepository(supabase).updateTransaction('user-1', 't1', fields)).toBe(false);
  });

  it('throws DatabaseError when Supabase returns an error', async () => {
    const { supabase } = fakeSupabase({ data: null, error: { message: 'boom' } });

    await expect(createRepository(supabase).updateTransaction('user-1', 't1', fields)).rejects.toThrow(
      'Database updateTransaction failed: boom'
    );
  });
});

describe('repository.deleteTransaction', () => {
  it('deletes only this user row and reports whether it existed', async () => {
    const { supabase, calls } = fakeSupabase({ count: 1, error: null });

    expect(await createRepository(supabase).deleteTransaction('user-1', 't1')).toBe(true);
    expect(calls).toEqual([
      ['from', 'transactions'],
      ['delete', { count: 'exact' }],
      ['eq', 'user_id', 'user-1'],
      ['eq', 'id', 't1'],
    ]);
  });

  it('returns false when no row matched', async () => {
    const { supabase } = fakeSupabase({ count: 0, error: null });

    expect(await createRepository(supabase).deleteTransaction('user-1', 't1')).toBe(false);
  });

  it('throws DatabaseError when Supabase returns an error', async () => {
    const { supabase } = fakeSupabase({ count: null, error: { message: 'boom' } });

    await expect(createRepository(supabase).deleteTransaction('user-1', 't1')).rejects.toThrow(
      'Database deleteTransaction failed: boom'
    );
  });
});

describe('repository.getBudgetStatus', () => {
  it('calls the SQL function for the first day of the month and converts numbers', async () => {
    const { supabase, calls } = fakeSupabase({
      data: [
        { category_id: 'c1', category: 'อาหาร', budget: '5000.00', spent: '4030.50' },
        { category_id: 'c2', category: 'เดินทาง', budget: null, spent: '0' },
      ],
      error: null,
    });

    const rows = await createRepository(supabase).getBudgetStatus('user-1', '2026-09');

    expect(rows).toEqual([
      { categoryId: 'c1', category: 'อาหาร', budget: 5000, spent: 4030.5 },
      { categoryId: 'c2', category: 'เดินทาง', budget: null, spent: 0 },
    ]);
    expect(calls).toEqual([['rpc', 'budget_status', { p_user_id: 'user-1', p_month: '2026-09-01' }]]);
  });

  it('throws DatabaseError when Supabase returns an error', async () => {
    const { supabase } = fakeSupabase({ data: null, error: { message: 'boom' } });

    const promise = createRepository(supabase).getBudgetStatus('user-1', '2026-09');

    await expect(promise).rejects.toBeInstanceOf(DatabaseError);
    await expect(promise).rejects.toThrow('Database getBudgetStatus failed: boom');
  });
});

describe('repository.setBudget', () => {
  it('upserts this user budget for the category from the first day of the month', async () => {
    const { supabase, calls } = fakeSupabase({ data: null, error: null });

    await createRepository(supabase).setBudget({ userId: 'user-1', categoryId: 'c1', month: '2026-09', amount: 5000 });

    expect(calls.slice(0, 2)).toEqual([
      ['from', 'budgets'],
      [
        'upsert',
        { user_id: 'user-1', category_id: 'c1', month: '2026-09-01', amount: 5000 },
        { onConflict: 'user_id,category_id,month' },
      ],
    ]);
  });

  it('setBudget clears later months of the same category after saving', async () => {
    const { supabase, calls } = fakeSupabase({ data: null, error: null });

    await createRepository(supabase).setBudget({ userId: 'user-1', categoryId: 'c1', month: '2026-09', amount: 5000 });

    expect(calls.map((call) => call[0])).toEqual(['from', 'upsert', 'from', 'delete', 'eq', 'eq', 'gt']);
    expect(calls.slice(2)).toEqual([
      ['from', 'budgets'],
      ['delete'],
      ['eq', 'user_id', 'user-1'],
      ['eq', 'category_id', 'c1'],
      ['gt', 'month', '2026-09-01'],
    ]);
  });

  it('throws DatabaseError when clearing later months fails', async () => {
    const { supabase } = fakeSupabase({ data: null, error: null }, { data: null, error: { message: 'boom' } });

    const promise = createRepository(supabase).setBudget({ userId: 'u', categoryId: 'c', month: '2026-09', amount: 1 });

    await expect(promise).rejects.toBeInstanceOf(DatabaseError);
    await expect(promise).rejects.toThrow('Database setBudgetClearLater failed: boom');
  });

  it('does not delete later months when the upsert fails', async () => {
    const { supabase, calls } = fakeSupabase({ data: null, error: { message: 'boom' } });

    await expect(
      createRepository(supabase).setBudget({ userId: 'u', categoryId: 'c', month: '2026-09', amount: 1 })
    ).rejects.toThrow('Database setBudget failed: boom');

    expect(calls.some((call) => call[0] === 'delete')).toBe(false);
  });

  it('stores null to stop the budget from that month', async () => {
    const { supabase, calls } = fakeSupabase({ data: null, error: null });

    await createRepository(supabase).setBudget({ userId: 'user-1', categoryId: 'c1', month: '2026-10', amount: null });

    expect(calls[1][1]).toEqual({ user_id: 'user-1', category_id: 'c1', month: '2026-10-01', amount: null });
  });

  it('throws DatabaseError when Supabase returns an error', async () => {
    const { supabase } = fakeSupabase({ data: null, error: { message: 'boom' } });

    const promise = createRepository(supabase).setBudget({ userId: 'u', categoryId: 'c', month: '2026-09', amount: 1 });

    await expect(promise).rejects.toBeInstanceOf(DatabaseError);
    await expect(promise).rejects.toThrow('Database setBudget failed: boom');
  });
});

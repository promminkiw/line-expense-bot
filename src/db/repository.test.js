import { inspect } from 'node:util';
import { describe, it, expect } from 'vitest';
import { createRepository, DatabaseError } from './repository.js';
import { fakeSupabase, fakeSupabasePages } from './test-helpers.mjs';

describe('repository.seedDefaultCategories', () => {
  it('inserts every default category and ignores existing ones', async () => {
    const { supabase, calls } = fakeSupabase({ data: null, error: null });

    await createRepository(supabase).seedDefaultCategories('user-1');

    const [, upsertCall] = calls;
    const [method, rows, options] = upsertCall;
    expect(calls[0]).toEqual(['from', 'categories']);
    expect(method).toBe('upsert');
    expect(options).toEqual({ onConflict: 'user_id,type,name', ignoreDuplicates: true });
    expect(rows).toHaveLength(11);
    expect(rows).toContainEqual({ user_id: 'user-1', type: 'expense', name: 'อาหาร' });
    expect(rows).toContainEqual({ user_id: 'user-1', type: 'expense', name: 'ใบเสร็จ/สลิปโอนเงิน' });
    expect(rows).toContainEqual({ user_id: 'user-1', type: 'income', name: 'อื่นๆ' });
  });

  it('inserts only the given categories when a set is passed', async () => {
    const { supabase, calls } = fakeSupabase({ data: null, error: null });

    await createRepository(supabase).seedDefaultCategories('user-1', { expense: ['อื่นๆ'], income: ['อื่นๆ'] });

    expect(calls[1][1]).toEqual([
      { user_id: 'user-1', type: 'expense', name: 'อื่นๆ' },
      { user_id: 'user-1', type: 'income', name: 'อื่นๆ' },
    ]);
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

  it('leaves out hidden categories when asked for visible ones only', async () => {
    const { supabase, calls } = fakeSupabase({ data: [{ id: 'c1', type: 'expense', name: 'อาหาร' }], error: null });

    await createRepository(supabase).getCategoryIds('user-1', { visibleOnly: true });

    expect(calls).toEqual([
      ['from', 'categories'],
      ['select', 'id, type, name'],
      ['eq', 'user_id', 'user-1'],
      ['eq', 'hidden', false],
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
  it('inserts all rows in one call and returns the new ids in order', async () => {
    const { supabase, calls } = fakeSupabase({ data: [{ id: 'tx-1' }, { id: 'tx-2' }], error: null });
    const rows = [{ user_id: 'user-1', amount: 60 }, { user_id: 'user-1', amount: 40 }];

    const ids = await createRepository(supabase).insertTransactions(rows);

    expect(calls).toEqual([
      ['from', 'transactions'],
      ['insert', rows],
      ['select', 'id'],
    ]);
    expect(ids).toEqual(['tx-1', 'tx-2']);
  });

  it('returns an empty list when the database sends no rows back', async () => {
    const { supabase } = fakeSupabase({ data: null, error: null });

    expect(await createRepository(supabase).insertTransactions([{ amount: 1 }])).toEqual([]);
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

describe('repository.queryTotals', () => {
  const criteria = { from: '2026-10-01', to: '2026-10-18', type: 'expense', category: '', keyword: 'กาแฟ' };

  it('calls the SQL function with the question criteria and converts numbers', async () => {
    const { supabase, calls } = fakeSupabase({ data: [{ type: 'expense', total: '450.00', entry_count: '6' }], error: null });

    const rows = await createRepository(supabase).queryTotals('user-1', { ...criteria, isQuestion: true });

    expect(rows).toEqual([{ type: 'expense', total: 450, entryCount: 6 }]);
    expect(calls).toEqual([
      [
        'rpc',
        'query_totals',
        { p_user_id: 'user-1', p_from: '2026-10-01', p_to: '2026-10-18', p_type: 'expense', p_category: '', p_keyword: 'กาแฟ', p_wallet: '' },
      ],
    ]);
  });

  it('passes the wallet name of the question', async () => {
    const { supabase, calls } = fakeSupabase({ data: [], error: null });

    await createRepository(supabase).queryTotals('user-1', { ...criteria, wallet: 'บัตรเครดิต' });

    expect(calls[0][2].p_wallet).toBe('บัตรเครดิต');
  });

  it('returns an empty array when nothing matches', async () => {
    const { supabase } = fakeSupabase({ data: [], error: null });

    expect(await createRepository(supabase).queryTotals('user-1', criteria)).toEqual([]);
  });

  it('throws DatabaseError when Supabase returns an error', async () => {
    const { supabase } = fakeSupabase({ data: null, error: { message: 'boom' } });

    const promise = createRepository(supabase).queryTotals('user-1', criteria);

    await expect(promise).rejects.toBeInstanceOf(DatabaseError);
    await expect(promise).rejects.toThrow('Database queryTotals failed: boom');
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
        { id: 't1', type: 'expense', amount: 60, note: 'กินข้าว', occurredOn: '2026-09-29', categoryId: 'c1', walletId: null },
      ],
      totalCount: 1,
    });
    expect(calls).toEqual([
      ['from', 'transactions'],
      ['select', 'id, type, amount, note, occurred_on, category_id, wallet_id', { count: 'exact' }],
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
  const dbRow = (id, occurredOn = '2026-09-01', createdAt = '2026-09-01T10:00:00+00:00') => ({
    id,
    type: 'expense',
    amount: '60.00',
    note: 'กินข้าว',
    occurred_on: occurredOn,
    category_id: 'c1',
    created_at: createdAt,
  });
  const ids = (from, count) => Array.from({ length: count }, (_, index) => dbRow(`t${String(from + index).padStart(5, '0')}`));

  it('reads this user rows in id order, each page after the last id, until an empty page', async () => {
    const { supabase, calls } = fakeSupabasePages([
      { data: ids(0, 1000), error: null },
      { data: ids(1000, 1), error: null },
      { data: [], error: null },
    ]);

    const rows = await createRepository(supabase).listAllTransactions('user-1', '2026-09-01', '2026-09-30');

    expect(rows).toHaveLength(1001);
    expect(rows[0]).toEqual({ id: 't00000', type: 'expense', amount: 60, note: 'กินข้าว', occurredOn: '2026-09-01', categoryId: 'c1', walletId: null });
    expect(calls.slice(0, 7)).toEqual([
      ['from', 'transactions'],
      ['select', 'id, type, amount, note, occurred_on, category_id, wallet_id, created_at'],
      ['eq', 'user_id', 'user-1'],
      ['gte', 'occurred_on', '2026-09-01'],
      ['lte', 'occurred_on', '2026-09-30'],
      ['order', 'id', { ascending: true }],
      ['limit', 1000],
    ]);
    expect(calls.filter((call) => call[0] === 'gt')).toEqual([
      ['gt', 'id', 't00999'],
      ['gt', 'id', 't01000'],
    ]);
    // ไม่ใช้ offset อีกแล้ว แถวที่ถูกลบหรือเพิ่มระหว่างหน้าจึงไม่ทำให้แถวอื่นซ้ำหรือหาย
    expect(calls.some((call) => call[0] === 'range')).toBe(false);
  });

  it('keeps reading when the server caps a page below 1000 rows', async () => {
    const { supabase, calls } = fakeSupabasePages([
      { data: ids(0, 500), error: null },
      { data: ids(500, 200), error: null },
      { data: [], error: null },
    ]);

    const rows = await createRepository(supabase).listAllTransactions('user-1', '2026-09-01', '2026-09-30');

    expect(rows).toHaveLength(700);
    expect(calls.filter((call) => call[0] === 'gt')).toEqual([
      ['gt', 'id', 't00499'],
      ['gt', 'id', 't00699'],
    ]);
  });

  it('returns the rows oldest first by date, then by creation time, then by id', async () => {
    const { supabase } = fakeSupabasePages([
      {
        data: [
          dbRow('a', '2026-09-02', '2026-09-02T08:00:00+00:00'),
          dbRow('b', '2026-09-01', '2026-09-03T08:00:00+00:00'),
          dbRow('c', '2026-09-01', '2026-09-01T09:00:00.5+00:00'),
          dbRow('d', '2026-09-01', '2026-09-01T09:00:00.5+00:00'),
        ],
        error: null,
      },
      { data: [], error: null },
    ]);

    const rows = await createRepository(supabase).listAllTransactions('user-1', '2026-09-01', '2026-09-30');

    expect(rows.map((row) => row.id)).toEqual(['c', 'd', 'b', 'a']);
  });

  it('stops after one request when the month has no rows', async () => {
    const { supabase, calls } = fakeSupabasePages([{ data: [], error: null }]);

    expect(await createRepository(supabase).listAllTransactions('user-1', '2026-09-01', '2026-09-30')).toEqual([]);
    expect(calls.filter((call) => call[0] === 'from')).toHaveLength(1);
    expect(calls.some((call) => call[0] === 'gt')).toBe(false);
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
  it('reads this user categories with the hidden flag ordered by type and name', async () => {
    const { supabase, calls } = fakeSupabase({
      data: [{ id: 'c1', name: 'อาหาร', type: 'expense', hidden: false, icon: null }],
      error: null,
    });

    expect(await createRepository(supabase).listCategories('user-1')).toEqual([
      { id: 'c1', name: 'อาหาร', type: 'expense', hidden: false, icon: null },
    ]);
    expect(calls).toEqual([
      ['from', 'categories'],
      ['select', 'id, name, type, hidden, icon'],
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

describe('repository.createCategory', () => {
  it('inserts the category for this user and returns it', async () => {
    const row = { id: 'c9', name: 'ค่าแมว', type: 'expense', hidden: false, icon: null };
    const { supabase, calls } = fakeSupabase({ data: row, error: null });

    const result = await createRepository(supabase).createCategory('user-1', { type: 'expense', name: 'ค่าแมว' });

    expect(result).toEqual({ status: 'ok', category: row });
    expect(calls).toEqual([
      ['from', 'categories'],
      ['insert', { user_id: 'user-1', type: 'expense', name: 'ค่าแมว' }],
      ['select', 'id, name, type, hidden, icon'],
      ['single'],
    ]);
  });

  it('reports a duplicate name instead of throwing', async () => {
    const { supabase } = fakeSupabase({ data: null, error: { code: '23505', message: 'duplicate key' } });

    expect(await createRepository(supabase).createCategory('user-1', { type: 'expense', name: 'อาหาร' })).toEqual({
      status: 'duplicate',
    });
  });

  it('throws DatabaseError for other errors', async () => {
    const { supabase } = fakeSupabase({ data: null, error: { message: 'boom' } });

    await expect(createRepository(supabase).createCategory('user-1', { type: 'expense', name: 'x' })).rejects.toThrow(
      'Database createCategory failed: boom'
    );
  });
});

describe('repository.updateCategory', () => {
  const row = { id: 'c9', name: 'แมว', type: 'expense', hidden: false, icon: null };

  it('updates only the given fields of this user row and returns it', async () => {
    const { supabase, calls } = fakeSupabase({ data: [row], error: null });

    const result = await createRepository(supabase).updateCategory('user-1', 'c9', { name: 'แมว' });

    expect(result).toEqual({ status: 'ok', category: row });
    expect(calls).toEqual([
      ['from', 'categories'],
      ['update', { name: 'แมว' }],
      ['eq', 'user_id', 'user-1'],
      ['eq', 'id', 'c9'],
      ['select', 'id, name, type, hidden, icon'],
    ]);
  });

  it('sends only hidden when hiding', async () => {
    const { supabase, calls } = fakeSupabase({ data: [{ ...row, hidden: true }], error: null });

    await createRepository(supabase).updateCategory('user-1', 'c9', { hidden: true });

    expect(calls[1]).toEqual(['update', { hidden: true }]);
  });

  it('reports not_found when no row of this user matched', async () => {
    const { supabase } = fakeSupabase({ data: [], error: null });

    expect(await createRepository(supabase).updateCategory('user-1', 'c9', { hidden: true })).toEqual({
      status: 'not_found',
    });
  });

  it('reports a duplicate name instead of throwing', async () => {
    const { supabase } = fakeSupabase({ data: null, error: { code: '23505', message: 'duplicate key' } });

    expect(await createRepository(supabase).updateCategory('user-1', 'c9', { name: 'อาหาร' })).toEqual({
      status: 'duplicate',
    });
  });

  it('throws DatabaseError for other errors', async () => {
    const { supabase } = fakeSupabase({ data: null, error: { message: 'boom' } });

    await expect(createRepository(supabase).updateCategory('user-1', 'c9', { name: 'x' })).rejects.toThrow(
      'Database updateCategory failed: boom'
    );
  });
});

describe('repository wallets', () => {
  const card = { id: 'w-card', name: 'บัตรเครดิต', hidden: false };

  it('lists this user wallets and marks the default one', async () => {
    const { supabase, calls } = fakeSupabase({ data: [{ id: 'w-cash', name: 'เงินสด', hidden: false }, card], error: null });

    const wallets = await createRepository(supabase).listWallets('user-1');

    expect(wallets).toEqual([
      { id: 'w-cash', name: 'เงินสด', hidden: false, isDefault: true },
      { ...card, isDefault: false },
    ]);
    expect(calls).toEqual([
      ['from', 'wallets'],
      ['select', 'id, name, hidden'],
      ['eq', 'user_id', 'user-1'],
      ['order', 'created_at'],
      ['order', 'name'],
    ]);
  });

  it('seeds the cash wallet without overwriting an existing one', async () => {
    const { supabase, calls } = fakeSupabase({ data: null, error: null });

    await createRepository(supabase).seedDefaultWallet('user-1');

    expect(calls).toEqual([
      ['from', 'wallets'],
      ['upsert', { user_id: 'user-1', name: 'เงินสด' }, { onConflict: 'user_id,name', ignoreDuplicates: true }],
    ]);
  });

  it('creates a wallet and reports a duplicate name', async () => {
    const created = fakeSupabase({ data: card, error: null });
    const duplicate = fakeSupabase({ data: null, error: { code: '23505', message: 'duplicate key' } });

    expect(await createRepository(created.supabase).createWallet('user-1', { name: 'บัตรเครดิต' })).toEqual({
      status: 'ok',
      wallet: { ...card, isDefault: false },
    });
    expect(created.calls).toEqual([
      ['from', 'wallets'],
      ['insert', { user_id: 'user-1', name: 'บัตรเครดิต' }],
      ['select', 'id, name, hidden'],
      ['single'],
    ]);
    expect(await createRepository(duplicate.supabase).createWallet('user-1', { name: 'บัตรเครดิต' })).toEqual({ status: 'duplicate' });
  });

  it('updates only the given fields of this user wallet', async () => {
    const { supabase, calls } = fakeSupabase({ data: [{ ...card, hidden: true }], error: null });

    const result = await createRepository(supabase).updateWallet('user-1', 'w-card', { hidden: true });

    expect(result).toEqual({ status: 'ok', wallet: { ...card, hidden: true, isDefault: false } });
    expect(calls).toEqual([
      ['from', 'wallets'],
      ['update', { hidden: true }],
      ['eq', 'user_id', 'user-1'],
      ['eq', 'id', 'w-card'],
      ['select', 'id, name, hidden'],
    ]);
  });

  it('reports not_found and duplicate when updating a wallet', async () => {
    const missing = fakeSupabase({ data: [], error: null });
    const duplicate = fakeSupabase({ data: null, error: { code: '23505', message: 'duplicate key' } });

    expect(await createRepository(missing.supabase).updateWallet('user-1', 'w-x', { name: 'ก' })).toEqual({ status: 'not_found' });
    expect(await createRepository(duplicate.supabase).updateWallet('user-1', 'w-card', { name: 'ก' })).toEqual({ status: 'duplicate' });
  });

  it('reads wallet totals from SQL and converts numbers', async () => {
    const { supabase, calls } = fakeSupabase({
      data: [{ wallet_id: 'w-cash', name: 'เงินสด', hidden: false, income: '25000.00', expense: '100.50', entry_count: '3' }],
      error: null,
    });

    expect(await createRepository(supabase).getWalletTotals('user-1')).toEqual([
      { id: 'w-cash', name: 'เงินสด', hidden: false, isDefault: true, income: 25000, expense: 100.5, entryCount: 3 },
    ]);
    expect(calls).toEqual([['rpc', 'wallet_totals', { p_user_id: 'user-1' }]]);
  });

  it('throws DatabaseError when Supabase returns an error', async () => {
    const { supabase } = fakeSupabase({ data: null, error: { message: 'boom' } });
    const repository = createRepository(supabase);

    await expect(repository.listWallets('user-1')).rejects.toThrow('Database listWallets failed: boom');
    await expect(repository.seedDefaultWallet('user-1')).rejects.toThrow('Database seedDefaultWallet failed: boom');
    await expect(repository.createWallet('user-1', { name: 'x' })).rejects.toThrow('Database createWallet failed: boom');
    await expect(repository.updateWallet('user-1', 'w', { name: 'x' })).rejects.toThrow('Database updateWallet failed: boom');
    await expect(repository.getWalletTotals('user-1')).rejects.toThrow('Database getWalletTotals failed: boom');
  });
});

describe('repository.deleteCategory', () => {
  it('deletes through the rpc and returns its status', async () => {
    const { supabase, calls } = fakeSupabase({ data: 'deleted', error: null });

    expect(await createRepository(supabase).deleteCategory('user-1', 'c9')).toBe('deleted');
    expect(calls).toEqual([['rpc', 'delete_category', { p_user: 'user-1', p_category: 'c9' }]]);
  });

  it('throws a DatabaseError when the rpc fails', async () => {
    const { supabase } = fakeSupabase({ data: null, error: { message: 'boom' } });

    await expect(createRepository(supabase).deleteCategory('user-1', 'c9')).rejects.toThrow('Database deleteCategory failed: boom');
  });
});

describe('repository.countCategoryUsage', () => {
  it('counts the entries, recurring rules and bills of the category', async () => {
    const { supabase, calls } = fakeSupabase({ count: 3, error: null }, { count: 1, error: null }, { count: 2, error: null });

    expect(await createRepository(supabase).countCategoryUsage('user-1', 'c9')).toEqual({ transactions: 3, recurring: 1, bills: 2 });
    expect(calls.filter(([method]) => method === 'from')).toEqual([
      ['from', 'transactions'],
      ['from', 'recurring_rules'],
      ['from', 'bills'],
    ]);
    expect(calls).toContainEqual(['select', 'id', { count: 'exact', head: true }]);
    expect(calls).toContainEqual(['eq', 'owner_id', 'user-1']);
    expect(calls.filter((call) => call[0] === 'eq' && call[1] === 'category_id')).toHaveLength(3);
  });

  it('throws a DatabaseError when a count fails', async () => {
    const { supabase } = fakeSupabase({ count: null, error: { message: 'boom' } });

    await expect(createRepository(supabase).countCategoryUsage('user-1', 'c9')).rejects.toThrow('Database countCategoryUsage failed: boom');
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

  it('writes wallet_id only when walletId is given, null meaning the default wallet', async () => {
    const { supabase, calls } = fakeSupabase({ data: [{ id: 't1' }], error: null });
    const repository = createRepository(supabase);

    await repository.updateTransaction('user-1', 't1', { ...fields, walletId: 'w-card' });
    await repository.updateTransaction('user-1', 't1', { ...fields, walletId: null });

    const updates = calls.filter((call) => call[0] === 'update').map((call) => call[1]);
    expect(updates[0].wallet_id).toBe('w-card');
    expect(updates[1]).toHaveProperty('wallet_id', null);
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

const SLIP_ITEMS = [
  { type: 'expense', category: 'อาหาร', amount: 120, date: '2026-09-28', note: 'โอนให้ ร้านข้าวแกง' },
  { type: 'expense', category: 'สุขภาพ', amount: 59, date: '2026-09-28', note: 'ยาสีฟัน' },
];

describe('repository.savePendingSlip', () => {
  it('inserts the items array for this user and event and returns the new id', async () => {
    const { supabase, calls } = fakeSupabase({ data: { id: 'slip-1' }, error: null });

    const id = await createRepository(supabase).savePendingSlip('user-1', 'ev-img', SLIP_ITEMS);

    expect(id).toBe('slip-1');
    expect(calls).toEqual([
      ['from', 'pending_slips'],
      ['insert', { user_id: 'user-1', line_event_id: 'ev-img', items: SLIP_ITEMS }],
      ['select', 'id'],
      ['single'],
    ]);
  });

  it('throws DatabaseError when Supabase returns an error', async () => {
    const { supabase } = fakeSupabase({ data: null, error: { message: 'boom' } });

    const promise = createRepository(supabase).savePendingSlip('user-1', 'ev-img', SLIP_ITEMS);

    await expect(promise).rejects.toBeInstanceOf(DatabaseError);
    await expect(promise).rejects.toThrow('Database savePendingSlip failed: boom');
  });
});

describe('repository.claimPendingSlip', () => {
  it('deletes and returns only this user unexpired row in one statement', async () => {
    const { supabase, calls } = fakeSupabase({
      data: { line_event_id: 'ev-img', items: SLIP_ITEMS },
      error: null,
    });

    const slip = await createRepository(supabase).claimPendingSlip('user-1', 'slip-1', '2026-09-29T04:50:00.000Z');

    expect(slip).toEqual({ webhookEventId: 'ev-img', items: SLIP_ITEMS });
    expect(calls).toEqual([
      ['from', 'pending_slips'],
      ['delete'],
      ['eq', 'id', 'slip-1'],
      ['eq', 'user_id', 'user-1'],
      ['gte', 'created_at', '2026-09-29T04:50:00.000Z'],
      ['select', 'line_event_id, items'],
      ['maybeSingle'],
    ]);
  });

  it('returns null when the row is gone, expired or belongs to someone else', async () => {
    const { supabase } = fakeSupabase({ data: null, error: null });

    expect(await createRepository(supabase).claimPendingSlip('user-1', 'slip-1', '2026-09-29T04:50:00.000Z')).toBeNull();
  });

  it('throws DatabaseError when Supabase returns an error', async () => {
    const { supabase } = fakeSupabase({ data: null, error: { message: 'boom' } });

    const promise = createRepository(supabase).claimPendingSlip('user-1', 'slip-1', '2026-09-29T04:50:00.000Z');

    await expect(promise).rejects.toBeInstanceOf(DatabaseError);
    await expect(promise).rejects.toThrow('Database claimPendingSlip failed: boom');
  });
});

describe('repository.deleteAllExpiredPendingSlips', () => {
  it('deletes rows of every user created at or before the cutoff', async () => {
    const { supabase, calls } = fakeSupabase({ data: null, error: null });

    await createRepository(supabase).deleteAllExpiredPendingSlips('2026-09-29T04:50:00.000Z');

    expect(calls).toEqual([
      ['from', 'pending_slips'],
      ['delete'],
      ['lte', 'created_at', '2026-09-29T04:50:00.000Z'],
    ]);
  });

  it('throws DatabaseError when Supabase returns an error', async () => {
    const { supabase } = fakeSupabase({ data: null, error: { message: 'boom' } });

    const promise = createRepository(supabase).deleteAllExpiredPendingSlips('2026-09-29T04:50:00.000Z');

    await expect(promise).rejects.toBeInstanceOf(DatabaseError);
    await expect(promise).rejects.toThrow('Database deleteAllExpiredPendingSlips failed: boom');
  });
});

describe('repository.deleteExpiredPendingSlips', () => {
  it('deletes only this user rows created at or before the cutoff', async () => {
    const { supabase, calls } = fakeSupabase({ data: null, error: null });

    await createRepository(supabase).deleteExpiredPendingSlips('user-1', '2026-09-29T04:50:00.000Z');

    expect(calls).toEqual([
      ['from', 'pending_slips'],
      ['delete'],
      ['eq', 'user_id', 'user-1'],
      ['lte', 'created_at', '2026-09-29T04:50:00.000Z'],
    ]);
  });

  it('throws DatabaseError when Supabase returns an error', async () => {
    const { supabase } = fakeSupabase({ data: null, error: { message: 'boom' } });

    const promise = createRepository(supabase).deleteExpiredPendingSlips('user-1', '2026-09-29T04:50:00.000Z');

    await expect(promise).rejects.toBeInstanceOf(DatabaseError);
    await expect(promise).rejects.toThrow('Database deleteExpiredPendingSlips failed: boom');
  });
});

describe('repository recurring rules', () => {
  const ROW = {
    id: 'r1',
    type: 'expense',
    category_id: 'c1',
    amount: '590.00',
    note: 'ค่าเน็ต',
    day_of_month: 5,
    active: true,
    last_run_on: null,
  };
  const RULE = {
    id: 'r1',
    type: 'expense',
    categoryId: 'c1',
    amount: 590,
    note: 'ค่าเน็ต',
    dayOfMonth: 5,
    active: true,
    lastRunOn: null,
  };
  const COLUMNS = 'id, type, category_id, amount, note, day_of_month, active, last_run_on';

  it('lists the rules of one user in day order and converts amount to a number', async () => {
    const { supabase, calls } = fakeSupabase({ data: [ROW], error: null });

    expect(await createRepository(supabase).listRecurringRules('user-1')).toEqual([RULE]);
    expect(calls).toEqual([
      ['from', 'recurring_rules'],
      ['select', COLUMNS],
      ['eq', 'user_id', 'user-1'],
      ['order', 'day_of_month'],
      ['order', 'created_at'],
    ]);
  });

  it('creates a rule and returns it', async () => {
    const { supabase, calls } = fakeSupabase({ data: ROW, error: null });

    const rule = await createRepository(supabase).createRecurringRule({
      userId: 'user-1',
      type: 'expense',
      categoryId: 'c1',
      amount: 590,
      note: 'ค่าเน็ต',
      dayOfMonth: 5,
      active: true,
      lastRunOn: null,
    });

    expect(rule).toEqual(RULE);
    expect(calls).toEqual([
      ['from', 'recurring_rules'],
      [
        'insert',
        {
          user_id: 'user-1',
          type: 'expense',
          category_id: 'c1',
          amount: 590,
          note: 'ค่าเน็ต',
          day_of_month: 5,
          active: true,
          last_run_on: null,
        },
      ],
      ['select', COLUMNS],
      ['single'],
    ]);
  });

  it('updates only this user rule and reports whether it existed', async () => {
    const { supabase, calls } = fakeSupabase({ data: [{ id: 'r1' }], error: null });

    const updated = await createRepository(supabase).updateRecurringRule('user-1', 'r1', {
      type: 'expense',
      categoryId: 'c1',
      amount: 600,
      note: 'ค่าเน็ต',
      dayOfMonth: 6,
      active: false,
      lastRunOn: '2026-10-06',
    });

    expect(updated).toBe(true);
    expect(calls).toEqual([
      ['from', 'recurring_rules'],
      [
        'update',
        {
          type: 'expense',
          category_id: 'c1',
          amount: 600,
          note: 'ค่าเน็ต',
          day_of_month: 6,
          active: false,
          last_run_on: '2026-10-06',
        },
      ],
      ['eq', 'user_id', 'user-1'],
      ['eq', 'id', 'r1'],
      ['select', 'id'],
    ]);
  });

  it('returns false when updating or deleting a rule that does not exist', async () => {
    const empty = fakeSupabase({ data: [], count: 0, error: null }).supabase;

    expect(await createRepository(empty).updateRecurringRule('user-1', 'r1', {})).toBe(false);
    expect(await createRepository(empty).deleteRecurringRule('user-1', 'r1')).toBe(false);
  });

  it('deletes only this user rule', async () => {
    const { supabase, calls } = fakeSupabase({ count: 1, error: null });

    expect(await createRepository(supabase).deleteRecurringRule('user-1', 'r1')).toBe(true);
    expect(calls).toEqual([
      ['from', 'recurring_rules'],
      ['delete', { count: 'exact' }],
      ['eq', 'user_id', 'user-1'],
      ['eq', 'id', 'r1'],
    ]);
  });

  it('lists due rules with the line user id and category name, filtered by day before the last day of the month', async () => {
    const dueRow = { ...ROW, user_id: 'user-1', users: { line_user_id: 'U1' }, categories: { name: 'ค่าสาธารณูปโภค' } };
    const { supabase, calls } = fakeSupabase({ data: [dueRow], error: null });

    const rules = await createRepository(supabase).listDueRecurringRules('2026-10-15');

    expect(rules).toEqual([{ ...RULE, userId: 'user-1', lineUserId: 'U1', categoryName: 'ค่าสาธารณูปโภค' }]);
    expect(calls).toEqual([
      ['from', 'recurring_rules'],
      ['select', `${COLUMNS}, user_id, users(line_user_id), categories(name)`],
      ['eq', 'active', true],
      ['or', 'last_run_on.is.null,last_run_on.lt.2026-10-01'],
      ['lte', 'day_of_month', 15],
      ['order', 'created_at'],
      ['limit', 500],
    ]);
  });

  it('does not filter by day on the last day of the month so day 31 rules are caught up', async () => {
    const { supabase, calls } = fakeSupabase({ data: [], error: null });

    await createRepository(supabase).listDueRecurringRules('2026-02-28');

    expect(calls.some(([method]) => method === 'lte')).toBe(false);
  });

  it('applies a rule through the rpc and returns whether a transaction was created', async () => {
    const { supabase, calls } = fakeSupabase({ data: true, error: null });

    const created = await createRepository(supabase).applyRecurringRule({
      ruleId: 'r1',
      dueOn: '2026-10-05',
      eventId: 'recurring:r1:2026-10',
    });

    expect(created).toBe(true);
    expect(calls).toEqual([
      ['rpc', 'apply_recurring_rule', { p_rule_id: 'r1', p_due: '2026-10-05', p_event_id: 'recurring:r1:2026-10' }],
    ]);
  });

  it('throws DatabaseError when Supabase returns an error', async () => {
    const failing = fakeSupabase({ data: null, count: null, error: { message: 'boom' } }).supabase;
    const repository = createRepository(failing);

    await expect(repository.listRecurringRules('u')).rejects.toThrow('Database listRecurringRules failed: boom');
    await expect(repository.createRecurringRule({})).rejects.toThrow('Database createRecurringRule failed: boom');
    await expect(repository.updateRecurringRule('u', 'r', {})).rejects.toThrow('Database updateRecurringRule failed: boom');
    await expect(repository.deleteRecurringRule('u', 'r')).rejects.toThrow('Database deleteRecurringRule failed: boom');
    await expect(repository.listDueRecurringRules('2026-10-15')).rejects.toThrow('Database listDueRecurringRules failed: boom');
    await expect(repository.applyRecurringRule({})).rejects.toThrow('Database applyRecurringRule failed: boom');
  });
});

describe('DatabaseError', () => {
  const postgrestError = { message: 'insert failed', code: '23502', hint: 'check the column', details: 'Failing row contains (590, ค่าเน็ต)' };

  it('keeps the message format and only the safe fields of the cause', () => {
    const err = new DatabaseError('createTransaction', postgrestError);

    expect(err.message).toBe('Database createTransaction failed: insert failed');
    expect(err.cause).toEqual({ message: 'insert failed', code: '23502', hint: 'check the column' });
  });

  it('never exposes details through JSON or util.inspect', () => {
    const err = new DatabaseError('createTransaction', postgrestError);

    expect(JSON.stringify(err.cause)).not.toContain('details');
    expect(JSON.stringify(err.cause)).not.toContain('590');
    expect(inspect(err, { depth: 5 })).not.toContain('details');
    expect(inspect(err, { depth: 5 })).not.toContain('ค่าเน็ต');
  });

  it('omits safe fields that the original error does not have', () => {
    expect(new DatabaseError('x', { message: 'boom' }).cause).toEqual({ message: 'boom' });
  });
});

describe('repository.getLifetimeTotals', () => {
  it('calls the SQL function and converts numbers', async () => {
    const { supabase, calls } = fakeSupabase({
      data: [{ income: '25000.00', expense: '1234.50', entry_count: '12', first_date: '2026-08-03' }],
      error: null,
    });

    const totals = await createRepository(supabase).getLifetimeTotals('user-1');

    expect(totals).toEqual({ income: 25000, expense: 1234.5, entryCount: 12, firstDate: '2026-08-03' });
    expect(calls).toEqual([['rpc', 'lifetime_totals', { p_user_id: 'user-1' }]]);
  });

  it('returns zeros and a null first date when the user has no entries', async () => {
    const { supabase } = fakeSupabase({
      data: [{ income: 0, expense: 0, entry_count: 0, first_date: null }],
      error: null,
    });

    expect(await createRepository(supabase).getLifetimeTotals('user-1')).toEqual({
      income: 0,
      expense: 0,
      entryCount: 0,
      firstDate: null,
    });
  });

  it('treats an empty result as no entries', async () => {
    const { supabase } = fakeSupabase({ data: [], error: null });

    expect(await createRepository(supabase).getLifetimeTotals('user-1')).toEqual({
      income: 0,
      expense: 0,
      entryCount: 0,
      firstDate: null,
    });
  });

  it('throws DatabaseError when Supabase returns an error', async () => {
    const { supabase } = fakeSupabase({ data: null, error: { message: 'boom' } });

    await expect(createRepository(supabase).getLifetimeTotals('user-1')).rejects.toBeInstanceOf(DatabaseError);
  });
});

describe('repository.getMonthlyTotals', () => {
  it('calls the SQL function for this user and range and converts numbers', async () => {
    const { supabase, calls } = fakeSupabase({
      data: [
        { month: '2026-09', type: 'expense', total: '500.25' },
        { month: '2026-09', type: 'income', total: 25000 },
      ],
      error: null,
    });

    const rows = await createRepository(supabase).getMonthlyTotals('user-1', '2026-05-01', '2026-10-31');

    expect(rows).toEqual([
      { month: '2026-09', type: 'expense', total: 500.25 },
      { month: '2026-09', type: 'income', total: 25000 },
    ]);
    expect(calls).toEqual([
      ['rpc', 'monthly_totals', { p_user_id: 'user-1', p_from: '2026-05-01', p_to: '2026-10-31' }],
    ]);
  });

  it('throws DatabaseError when Supabase returns an error', async () => {
    const { supabase } = fakeSupabase({ data: null, error: { message: 'boom' } });

    await expect(createRepository(supabase).getMonthlyTotals('user-1', '2026-05-01', '2026-10-31')).rejects.toBeInstanceOf(DatabaseError);
  });
});

describe('repository friend codes', () => {
  it('reads the friend code of a user, or null when the user has none yet', async () => {
    const { supabase, calls } = fakeSupabase({ data: { friend_code: 'ABCD2345' }, error: null });

    expect(await createRepository(supabase).getFriendCode('user-1')).toBe('ABCD2345');
    expect(calls).toEqual([['from', 'users'], ['select', 'friend_code'], ['eq', 'id', 'user-1'], ['maybeSingle']]);
    const empty = fakeSupabase({ data: null, error: null });
    expect(await createRepository(empty.supabase).getFriendCode('user-1')).toBeNull();
  });

  it('stores a friend code and reports a clash with another user as taken', async () => {
    const ok = fakeSupabase({ count: 1, error: null });
    const clash = fakeSupabase({ data: null, error: { message: 'duplicate key', code: '23505' } });

    expect(await createRepository(ok.supabase).setFriendCode('user-1', 'ABCD2345')).toBe('set');
    expect(ok.calls).toEqual([['from', 'users'], ['update', { friend_code: 'ABCD2345' }, { count: 'exact' }], ['eq', 'id', 'user-1']]);
    expect(await createRepository(clash.supabase).setFriendCode('user-1', 'ABCD2345')).toBe('taken');
  });

  // สองหน้าเปิดส่วนเพื่อนครั้งแรกพร้อมกัน หน้าที่ช้ากว่าต้องไม่เขียนทับรหัสที่อีกหน้าแสดงไปแล้ว
  it('writes a first code only while the user still has none, and says when nothing changed', async () => {
    const first = fakeSupabase({ count: 1, error: null });
    const late = fakeSupabase({ count: 0, error: null });

    expect(await createRepository(first.supabase).setFriendCode('user-1', 'ABCD2345', { onlyIfEmpty: true })).toBe('set');
    expect(first.calls).toEqual([
      ['from', 'users'],
      ['update', { friend_code: 'ABCD2345' }, { count: 'exact' }],
      ['eq', 'id', 'user-1'],
      ['is', 'friend_code', null],
    ]);
    expect(await createRepository(late.supabase).setFriendCode('user-1', 'ABCD2345', { onlyIfEmpty: true })).toBe('unchanged');
  });

  it('throws DatabaseError for any other error while storing the code', async () => {
    const { supabase } = fakeSupabase({ data: null, error: { message: 'boom', code: 'XX000' } });

    await expect(createRepository(supabase).setFriendCode('user-1', 'ABCD2345')).rejects.toThrow(
      'Database setFriendCode failed: boom'
    );
  });

  it('finds the owner of a friend code', async () => {
    const { supabase, calls } = fakeSupabase({ data: { id: 'user-2', display_name: 'บี' }, error: null });

    expect(await createRepository(supabase).findUserByFriendCode('ABCD2345')).toEqual({ id: 'user-2', displayName: 'บี' });
    expect(calls).toEqual([
      ['from', 'users'],
      ['select', 'id, display_name'],
      ['eq', 'friend_code', 'ABCD2345'],
      ['maybeSingle'],
    ]);
    const missing = fakeSupabase({ data: null, error: null });
    expect(await createRepository(missing.supabase).findUserByFriendCode('ABCD2345')).toBeNull();
  });
});

describe('repository friendships', () => {
  it('lists this user friends with their display names', async () => {
    const { supabase, calls } = fakeSupabase({
      data: [
        { friend_id: 'user-2', friend: { display_name: 'บี' } },
        { friend_id: 'user-3', friend: { display_name: null } },
        { friend_id: 'user-4', friend: null },
      ],
      error: null,
    });

    expect(await createRepository(supabase).listFriends('user-1')).toEqual([
      { id: 'user-2', displayName: 'บี' },
      { id: 'user-3', displayName: null },
      { id: 'user-4', displayName: null },
    ]);
    expect(calls).toEqual([
      ['from', 'friendships'],
      ['select', 'friend_id, friend:users!friendships_friend_id_fkey(display_name)'],
      ['eq', 'user_id', 'user-1'],
    ]);
  });

  it('adds both directions in one write and ignores an existing pair', async () => {
    const { supabase, calls } = fakeSupabase({ data: null, error: null });

    expect(await createRepository(supabase).addFriendship('user-1', 'user-2')).toBe(true);

    expect(calls).toEqual([
      ['from', 'friendships'],
      [
        'upsert',
        [
          { user_id: 'user-1', friend_id: 'user-2' },
          { user_id: 'user-2', friend_id: 'user-1' },
        ],
        { onConflict: 'user_id,friend_id', ignoreDuplicates: true },
      ],
    ]);
  });

  // ผู้ใช้อีกฝั่งถูกลบระหว่างค้นหากับเพิ่ม ถือว่าไม่พบ ไม่ใช่ error ของระบบ
  it('reports a friend that no longer exists as not added', async () => {
    const { supabase } = fakeSupabase({ data: null, error: { code: '23503', message: 'violates foreign key constraint' } });

    expect(await createRepository(supabase).addFriendship('user-1', 'user-2')).toBe(false);
  });

  it('writes the pair rows ordered by user_id so concurrent mutual adds cannot deadlock', async () => {
    const { supabase, calls } = fakeSupabase({ data: null, error: null });

    await createRepository(supabase).addFriendship('user-2', 'user-1');

    expect(calls[1][1]).toEqual([
      { user_id: 'user-1', friend_id: 'user-2' },
      { user_id: 'user-2', friend_id: 'user-1' },
    ]);
  });

  it('removes both directions and reports whether the pair existed', async () => {
    const { supabase, calls } = fakeSupabase({ count: 2, error: null });

    expect(await createRepository(supabase).removeFriendship('user-1', 'user-2')).toBe(true);
    expect(calls).toEqual([
      ['from', 'friendships'],
      ['delete', { count: 'exact' }],
      ['or', 'and(user_id.eq.user-1,friend_id.eq.user-2),and(user_id.eq.user-2,friend_id.eq.user-1)'],
    ]);
    const none = fakeSupabase({ count: 0, error: null });
    expect(await createRepository(none.supabase).removeFriendship('user-1', 'user-2')).toBe(false);
  });

  it('throws DatabaseError when a friendship query fails', async () => {
    const failing = () => fakeSupabase({ data: null, count: null, error: { message: 'boom' } }).supabase;

    await expect(createRepository(failing()).listFriends('user-1')).rejects.toThrow('Database listFriends failed: boom');
    await expect(createRepository(failing()).listFriends('user-1')).rejects.toBeInstanceOf(DatabaseError);
    await expect(createRepository(failing()).addFriendship('user-1', 'user-2')).rejects.toBeInstanceOf(DatabaseError);
    await expect(createRepository(failing()).removeFriendship('user-1', 'user-2')).rejects.toBeInstanceOf(DatabaseError);
    await expect(createRepository(failing()).addFriendship('user-1', 'user-2')).rejects.toThrow(
      'Database addFriendship failed: boom'
    );
    await expect(createRepository(failing()).removeFriendship('user-1', 'user-2')).rejects.toThrow(
      'Database removeFriendship failed: boom'
    );
  });
});

describe('repository bills', () => {
  const BILL = 'b1';

  it('creates a bill through the create_bill function', async () => {
    const { supabase, calls } = fakeSupabase({ data: 'bill-1', error: null });

    const id = await createRepository(supabase).createBill({
      ownerId: 'user-1',
      title: 'เนื้อย่าง',
      total: 400,
      occurredOn: '2026-10-08',
      categoryId: 'c1',
      ownerShare: 100,
      members: [{ userId: 'user-2', share: 300 }],
    });

    expect(id).toBe('bill-1');
    expect(calls).toEqual([
      [
        'rpc',
        'create_bill',
        {
          p_owner: 'user-1',
          p_title: 'เนื้อย่าง',
          p_total: 400,
          p_category: 'c1',
          p_date: '2026-10-08',
          p_owner_share: 100,
          p_members: [{ user_id: 'user-2', share: 300 }],
        },
      ],
    ]);
  });

  it('marks a member as notified and says whether the row was there', async () => {
    const { supabase, calls } = fakeSupabase({ count: 1, error: null });

    expect(await createRepository(supabase).markBillMemberNotified(BILL, 'user-2')).toBe(true);
    expect(calls).toEqual([
      ['from', 'bill_members'],
      ['update', { notified: true }, { count: 'exact' }],
      ['eq', 'bill_id', BILL],
      ['eq', 'user_id', 'user-2'],
    ]);
    const missing = fakeSupabase({ count: 0, error: null });
    expect(await createRepository(missing.supabase).markBillMemberNotified(BILL, 'user-2')).toBe(false);
  });

  it('lists the owner bills newest first with members, names and numbers', async () => {
    const { supabase, calls } = fakeSupabase({
      data: [
        {
          id: BILL,
          title: 'เนื้อย่าง',
          total: '400.00',
          occurred_on: '2026-10-08',
          status: 'open',
          owner_share: '100.00',
          created_at: '2026-10-08T10:00:00+00:00',
          categories: { name: 'อาหาร' },
          bill_members: [
            { user_id: 'user-2', share: '300.00', status: 'pending', paid: false, notified: true, users: { display_name: 'บี' } },
          ],
        },
      ],
      error: null,
    });

    expect(await createRepository(supabase).listOwnedBills('user-1')).toEqual([
      {
        id: BILL,
        title: 'เนื้อย่าง',
        total: 400,
        occurredOn: '2026-10-08',
        categoryName: 'อาหาร',
        status: 'open',
        ownerShare: 100,
        createdAt: '2026-10-08T10:00:00+00:00',
        members: [{ userId: 'user-2', displayName: 'บี', share: 300, status: 'pending', paid: false, notified: true }],
      },
    ]);
    expect(calls).toEqual([
      ['from', 'bills'],
      [
        'select',
        'id, title, total, occurred_on, status, owner_share, created_at, categories(name), bill_members(user_id, share, status, paid, notified, users(display_name))',
      ],
      ['eq', 'owner_id', 'user-1'],
      ['order', 'created_at', { ascending: false }],
      ['limit', 50],
    ]);
  });

  // transaction_id เป็น null เมื่อยังไม่ยืนยัน หรือผู้ใช้ลบรายจ่ายไปแล้ว (on delete set null)
  it('says whether the expense of a confirmed share is still recorded', async () => {
    const row = (transactionId) => ({
      share: '150.00',
      status: 'confirmed',
      paid: false,
      transaction_id: transactionId,
      bills: { id: BILL, title: 'ชาบู', total: '300.00', occurred_on: '2026-10-08', status: 'cancelled', categories: null, owner: null },
    });
    const { supabase } = fakeSupabase({ data: [row('tx-1'), row(null)], error: null });

    const bills = await createRepository(supabase).listIncomingBills('user-2');

    expect(bills.map((bill) => bill.expenseRecorded)).toEqual([true, false]);
  });

  it('lists the bills shared with a user newest first', async () => {
    const { supabase, calls } = fakeSupabase({
      data: [
        {
          share: '150.00',
          status: 'pending',
          paid: false,
          transaction_id: null,
          bills: {
            id: BILL,
            title: 'เนื้อย่าง',
            total: '400.00',
            occurred_on: '2026-10-08',
            status: 'open',
            categories: { name: 'อาหาร' },
            owner: { display_name: null },
          },
        },
      ],
      error: null,
    });

    expect(await createRepository(supabase).listIncomingBills('user-2')).toEqual([
      {
        id: BILL,
        title: 'เนื้อย่าง',
        total: 400,
        occurredOn: '2026-10-08',
        categoryName: 'อาหาร',
        status: 'open',
        ownerName: null,
        myShare: 150,
        myStatus: 'pending',
        paid: false,
        expenseRecorded: false,
      },
    ]);
    expect(calls).toEqual([
      ['from', 'bill_members'],
      ['select', 'share, status, paid, transaction_id, bills(id, title, total, occurred_on, status, categories(name), owner:users!bills_owner_id_fkey(display_name))'],
      ['eq', 'user_id', 'user-2'],
      ['order', 'created_at', { ascending: false }],
      ['limit', 50],
    ]);
  });

  it('reads one member share with the bill category, or null', async () => {
    const { supabase, calls } = fakeSupabase({
      data: { share: '150.00', bills: { title: 'ชาบู', categories: { name: 'อาหาร' } } },
      error: null,
    });

    expect(await createRepository(supabase).getBillShare(BILL, 'user-2')).toEqual({ share: 150, title: 'ชาบู', categoryName: 'อาหาร' });
    expect(calls).toEqual([
      ['from', 'bill_members'],
      ['select', 'share, bills(title, categories(name))'],
      ['eq', 'bill_id', BILL],
      ['eq', 'user_id', 'user-2'],
      ['maybeSingle'],
    ]);
    const missing = fakeSupabase({ data: null, error: null });
    expect(await createRepository(missing.supabase).getBillShare(BILL, 'user-2')).toBeNull();
  });

  it('confirms and declines through the SQL functions', async () => {
    const confirm = fakeSupabase({ data: 'confirmed', error: null });
    const decline = fakeSupabase({ data: 'cancelled', error: null });

    expect(await createRepository(confirm.supabase).confirmBillShare(BILL, 'user-2', 'c2')).toBe('confirmed');
    expect(confirm.calls).toEqual([['rpc', 'confirm_bill_share', { p_bill: BILL, p_user: 'user-2', p_category: 'c2' }]]);
    expect(await createRepository(decline.supabase).declineBillShare(BILL, 'user-2')).toBe('cancelled');
    expect(decline.calls).toEqual([['rpc', 'decline_bill_share', { p_bill: BILL, p_user: 'user-2' }]]);
  });

  it('cancels through the SQL function that also removes the owner expense', async () => {
    const cancelled = fakeSupabase({ data: true, error: null });
    const refused = fakeSupabase({ data: false, error: null });

    expect(await createRepository(cancelled.supabase).cancelBill(BILL, 'user-1')).toBe(true);
    expect(cancelled.calls).toEqual([['rpc', 'cancel_bill', { p_bill: BILL, p_owner: 'user-1' }]]);
    expect(await createRepository(refused.supabase).cancelBill(BILL, 'user-1')).toBe(false);
  });

  it('passes an earlier answer through as its own status', async () => {
    const confirm = fakeSupabase({ data: 'already_confirmed', error: null });
    const decline = fakeSupabase({ data: 'already_declined', error: null });

    expect(await createRepository(confirm.supabase).confirmBillShare(BILL, 'user-2', 'c2')).toBe('already_confirmed');
    expect(await createRepository(decline.supabase).declineBillShare(BILL, 'user-2')).toBe('already_declined');
  });

  it('checks the owner and sets the paid flag of one member', async () => {
    const owner = fakeSupabase({ data: { id: BILL }, error: null });
    const paid = fakeSupabase({ count: 1, error: null });

    expect(await createRepository(owner.supabase).isBillOwner(BILL, 'user-1')).toBe(true);
    expect(owner.calls).toEqual([['from', 'bills'], ['select', 'id'], ['eq', 'id', BILL], ['eq', 'owner_id', 'user-1'], ['maybeSingle']]);
    expect(await createRepository(paid.supabase).setBillMemberPaid(BILL, 'user-2', true)).toBe(true);
    expect(paid.calls).toEqual([
      ['from', 'bill_members'],
      ['update', { paid: true }, { count: 'exact' }],
      ['eq', 'bill_id', BILL],
      ['eq', 'user_id', 'user-2'],
    ]);
  });

  it('reports a member that is not in the bill as not marked paid', async () => {
    const { supabase } = fakeSupabase({ count: 0, error: null });

    expect(await createRepository(supabase).setBillMemberPaid(BILL, 'user-9', true)).toBe(false);
  });

  it('passes a cancelled bill through when confirming', async () => {
    const { supabase } = fakeSupabase({ data: 'cancelled', error: null });

    expect(await createRepository(supabase).confirmBillShare(BILL, 'user-2', 'c2')).toBe('cancelled');
  });

  it('maps user ids to LINE user ids', async () => {
    const { supabase, calls } = fakeSupabase({
      data: [
        { id: 'user-2', line_user_id: 'U2' },
        { id: 'user-3', line_user_id: 'U3' },
      ],
      error: null,
    });

    const ids = await createRepository(supabase).getLineUserIds(['user-2', 'user-3']);

    expect([...ids]).toEqual([
      ['user-2', 'U2'],
      ['user-3', 'U3'],
    ]);
    expect(calls).toEqual([['from', 'users'], ['select', 'id, line_user_id'], ['in', 'id', ['user-2', 'user-3']]]);
  });

  it('throws DatabaseError when a bill query fails', async () => {
    const failing = () => fakeSupabase({ data: null, count: null, error: { message: 'boom' } }).supabase;

    await expect(createRepository(failing()).createBill({ ownerId: 'u', title: 't', total: 1, occurredOn: '2026-10-08', categoryId: 'c', ownerShare: 0, members: [] })).rejects.toThrow('Database createBill failed: boom');
    await expect(createRepository(failing()).markBillMemberNotified(BILL, 'u')).rejects.toThrow('Database markBillMemberNotified failed: boom');
    await expect(createRepository(failing()).listOwnedBills('u')).rejects.toThrow('Database listOwnedBills failed: boom');
    await expect(createRepository(failing()).listIncomingBills('u')).rejects.toThrow('Database listIncomingBills failed: boom');
    await expect(createRepository(failing()).getBillShare(BILL, 'u')).rejects.toThrow('Database getBillShare failed: boom');
    await expect(createRepository(failing()).confirmBillShare(BILL, 'u', 'c')).rejects.toThrow('Database confirmBillShare failed: boom');
    await expect(createRepository(failing()).declineBillShare(BILL, 'u')).rejects.toThrow('Database declineBillShare failed: boom');
    await expect(createRepository(failing()).cancelBill(BILL, 'u')).rejects.toThrow('Database cancelBill failed: boom');
    await expect(createRepository(failing()).isBillOwner(BILL, 'u')).rejects.toThrow('Database isBillOwner failed: boom');
    await expect(createRepository(failing()).setBillMemberPaid(BILL, 'u', true)).rejects.toThrow('Database setBillMemberPaid failed: boom');
    await expect(createRepository(failing()).getLineUserIds(['u'])).rejects.toThrow('Database getLineUserIds failed: boom');
  });
});

describe('repository category icons', () => {
  it('reads a missing icon as null', async () => {
    const { supabase } = fakeSupabase({ data: [{ id: 'c1', name: 'อาหาร', type: 'expense', hidden: false }], error: null });

    expect((await createRepository(supabase).listCategories('user-1'))[0].icon).toBeNull();
  });

  it('inserts the icon when one is given', async () => {
    const row = { id: 'c9', name: 'กาแฟ', type: 'expense', hidden: false, icon: 'coffee' };
    const { supabase, calls } = fakeSupabase({ data: row, error: null });

    const result = await createRepository(supabase).createCategory('user-1', { type: 'expense', name: 'กาแฟ', icon: 'coffee' });

    expect(result).toEqual({ status: 'ok', category: row });
    expect(calls[1]).toEqual(['insert', { user_id: 'user-1', type: 'expense', name: 'กาแฟ', icon: 'coffee' }]);
  });

  it('sends the icon, including null to reset it', async () => {
    const row = { id: 'c9', name: 'แมว', type: 'expense', hidden: false, icon: null };
    const first = fakeSupabase({ data: [{ ...row, icon: 'pet' }], error: null });
    await createRepository(first.supabase).updateCategory('user-1', 'c9', { icon: 'pet' });
    expect(first.calls[1]).toEqual(['update', { icon: 'pet' }]);

    const second = fakeSupabase({ data: [row], error: null });
    await createRepository(second.supabase).updateCategory('user-1', 'c9', { icon: null });
    expect(second.calls[1]).toEqual(['update', { icon: null }]);
  });
});

describe('repository savings goals', () => {
  const GOAL_ROW = { id: 'g1', name: 'เที่ยว', target_amount: '50000.00', target_date: null, closed: false };

  it('lists goals with their saved totals from the SQL function', async () => {
    const { supabase, calls } = fakeSupabase({
      data: [{ ...GOAL_ROW, target_date: '2026-12-31', saved: '6000.50', contribution_count: '2' }],
      error: null,
    });

    const goals = await createRepository(supabase).listGoals('user-1');

    expect(goals).toEqual([
      { id: 'g1', name: 'เที่ยว', targetAmount: 50000, targetDate: '2026-12-31', closed: false, saved: 6000.5, contributionCount: 2 },
    ]);
    expect(calls).toEqual([['rpc', 'goal_progress', { p_user_id: 'user-1' }]]);
  });

  it('creates a goal for this user', async () => {
    const { supabase, calls } = fakeSupabase({ data: GOAL_ROW, error: null });

    const result = await createRepository(supabase).createGoal('user-1', { name: 'เที่ยว', targetAmount: 50000, targetDate: null });

    expect(result).toEqual({ status: 'ok', goal: { id: 'g1', name: 'เที่ยว', targetAmount: 50000, targetDate: null, closed: false } });
    expect(calls).toEqual([
      ['from', 'savings_goals'],
      ['insert', { user_id: 'user-1', name: 'เที่ยว', target_amount: 50000, target_date: null }],
      ['select', 'id, name, target_amount, target_date, closed'],
      ['single'],
    ]);
  });

  it('reports a duplicate name when creating or renaming', async () => {
    const duplicate = () => fakeSupabase({ data: null, error: { message: 'dup', code: '23505' } }).supabase;

    expect(await createRepository(duplicate()).createGoal('user-1', { name: 'เที่ยว', targetAmount: 1, targetDate: null })).toEqual({
      status: 'duplicate',
    });
    expect(await createRepository(duplicate()).updateGoal('user-1', 'g1', { name: 'เที่ยว' })).toEqual({ status: 'duplicate' });
  });

  it('updates only the given fields of this user goal', async () => {
    const { supabase, calls } = fakeSupabase({ data: [{ ...GOAL_ROW, name: 'ทริป', closed: true }], error: null });

    const result = await createRepository(supabase).updateGoal('user-1', 'g1', { name: 'ทริป', closed: true });

    expect(result).toEqual({ status: 'ok', goal: { id: 'g1', name: 'ทริป', targetAmount: 50000, targetDate: null, closed: true } });
    expect(calls).toEqual([
      ['from', 'savings_goals'],
      ['update', { name: 'ทริป', closed: true }],
      ['eq', 'user_id', 'user-1'],
      ['eq', 'id', 'g1'],
      ['select', 'id, name, target_amount, target_date, closed'],
    ]);
  });

  it('maps the target fields to their columns and answers not_found when no row changed', async () => {
    const { supabase, calls } = fakeSupabase({ data: [], error: null });

    const result = await createRepository(supabase).updateGoal('user-1', 'g1', { targetAmount: 900, targetDate: '2027-01-31' });

    expect(result).toEqual({ status: 'not_found' });
    expect(calls[1]).toEqual(['update', { target_amount: 900, target_date: '2027-01-31' }]);
  });

  it('adds a contribution through the SQL function', async () => {
    const { supabase, calls } = fakeSupabase({ data: [{ status: 'ok', contribution_id: 'gc1', saved: '1250.50' }], error: null });

    const result = await createRepository(supabase).addGoalContribution('user-1', 'g1', {
      amount: 250.5,
      occurredOn: '2026-10-19',
      lineEventId: 'ev1',
    });

    expect(result).toEqual({ status: 'ok', contributionId: 'gc1', saved: 1250.5 });
    expect(calls).toEqual([
      [
        'rpc',
        'add_goal_contribution',
        { p_user_id: 'user-1', p_goal_id: 'g1', p_amount: 250.5, p_occurred_on: '2026-10-19', p_line_event_id: 'ev1' },
      ],
    ]);
  });

  it('sends no event id from the web and passes a refusal through', async () => {
    const { supabase, calls } = fakeSupabase({ data: [{ status: 'closed', contribution_id: null, saved: null }], error: null });

    const result = await createRepository(supabase).addGoalContribution('user-1', 'g1', { amount: 100, occurredOn: '2026-10-19' });

    expect(result).toEqual({ status: 'closed', contributionId: null, saved: null });
    expect(calls[0][2].p_line_event_id).toBeNull();
  });

  it('lists the latest contributions of this user goal', async () => {
    const { supabase, calls } = fakeSupabase({ data: [{ id: 'gc2', amount: '1000.00', occurred_on: '2026-10-14' }], error: null });

    expect(await createRepository(supabase).listGoalContributions('user-1', 'g1')).toEqual([
      { id: 'gc2', amount: 1000, occurredOn: '2026-10-14' },
    ]);
    expect(calls).toEqual([
      ['from', 'goal_contributions'],
      ['select', 'id, amount, occurred_on'],
      ['eq', 'user_id', 'user-1'],
      ['eq', 'goal_id', 'g1'],
      ['order', 'occurred_on', { ascending: false }],
      ['order', 'created_at', { ascending: false }],
      ['limit', 100],
    ]);
  });

  it('deletes one contribution of this user goal', async () => {
    const { supabase, calls } = fakeSupabase({ count: 1, error: null });

    expect(await createRepository(supabase).deleteGoalContribution('user-1', 'g1', 'gc1')).toBe(true);
    expect(calls).toEqual([
      ['from', 'goal_contributions'],
      ['delete', { count: 'exact' }],
      ['eq', 'user_id', 'user-1'],
      ['eq', 'goal_id', 'g1'],
      ['eq', 'id', 'gc1'],
    ]);
  });

  it('answers false when the contribution is not there', async () => {
    const { supabase } = fakeSupabase({ count: 0, error: null });

    expect(await createRepository(supabase).deleteGoalContribution('user-1', 'g1', 'gc1')).toBe(false);
  });

  it('deletes the contributions of a chat message for this user', async () => {
    const { supabase, calls } = fakeSupabase({ count: 1, error: null });

    expect(await createRepository(supabase).deleteGoalContributionsByEvent('user-1', 'ev1')).toBe(1);
    expect(calls).toEqual([
      ['from', 'goal_contributions'],
      ['delete', { count: 'exact' }],
      ['eq', 'user_id', 'user-1'],
      ['eq', 'line_event_id', 'ev1'],
    ]);
  });

  it.each([
    ['listGoals', (repo) => repo.listGoals('user-1')],
    ['createGoal', (repo) => repo.createGoal('user-1', { name: 'x', targetAmount: 1, targetDate: null })],
    ['updateGoal', (repo) => repo.updateGoal('user-1', 'g1', { closed: true })],
    ['addGoalContribution', (repo) => repo.addGoalContribution('user-1', 'g1', { amount: 1, occurredOn: '2026-10-19' })],
    ['listGoalContributions', (repo) => repo.listGoalContributions('user-1', 'g1')],
    ['deleteGoalContribution', (repo) => repo.deleteGoalContribution('user-1', 'g1', 'gc1')],
    ['deleteGoalContributionsByEvent', (repo) => repo.deleteGoalContributionsByEvent('user-1', 'ev1')],
  ])('throws DatabaseError when %s fails', async (name, run) => {
    const { supabase } = fakeSupabase({ data: null, count: null, error: { message: 'boom' } });

    const promise = run(createRepository(supabase));

    await expect(promise).rejects.toBeInstanceOf(DatabaseError);
    await expect(promise).rejects.toThrow(`Database ${name} failed: boom`);
  });
});

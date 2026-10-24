import { describe, it, expect } from 'vitest';
import { createTransactionsRepository } from './transactions.js';
import { DatabaseError } from '../repository.js';
import { fakeSupabase, fakeSupabasePages } from '../test-helpers.mjs';

describe('repository.claimEvent', () => {
  it('returns true when the event row was inserted', async () => {
    const { supabase, calls } = fakeSupabase({ data: [{ webhook_event_id: 'ev1' }], error: null });

    expect(await createTransactionsRepository(supabase).claimEvent('ev1', 'user-1')).toBe(true);
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

    expect(await createTransactionsRepository(supabase).claimEvent('ev1', 'user-1')).toBe(false);
  });

  it('throws DatabaseError when Supabase returns an error', async () => {
    const { supabase } = fakeSupabase({ data: null, count: null, error: { message: 'boom' } });

    const promise = createTransactionsRepository(supabase).claimEvent('ev1', 'user-1');

    await expect(promise).rejects.toBeInstanceOf(DatabaseError);
    await expect(promise).rejects.toThrow('Database claimEvent failed: boom');
  });
});

describe('repository.insertTransactions', () => {
  it('inserts all rows in one call and returns the new ids in order', async () => {
    const { supabase, calls } = fakeSupabase({ data: [{ id: 'tx-1' }, { id: 'tx-2' }], error: null });
    const rows = [{ user_id: 'user-1', amount: 60 }, { user_id: 'user-1', amount: 40 }];

    const ids = await createTransactionsRepository(supabase).insertTransactions(rows);

    expect(calls).toEqual([
      ['from', 'transactions'],
      ['insert', rows],
      ['select', 'id'],
    ]);
    expect(ids).toEqual(['tx-1', 'tx-2']);
  });

  it('returns an empty list when the database sends no rows back', async () => {
    const { supabase } = fakeSupabase({ data: null, error: null });

    expect(await createTransactionsRepository(supabase).insertTransactions([{ amount: 1 }])).toEqual([]);
  });

  it('throws DatabaseError when insert fails', async () => {
    const { supabase } = fakeSupabase({ data: null, error: { message: 'check violation' } });

    await expect(createTransactionsRepository(supabase).insertTransactions([])).rejects.toThrow(
      'Database insertTransactions failed: check violation'
    );
  });
});

describe('repository.deleteTransactionsByEvent', () => {
  it('deletes only this user rows for the event and returns the count', async () => {
    const { supabase, calls } = fakeSupabase({ count: 2, error: null });

    const count = await createTransactionsRepository(supabase).deleteTransactionsByEvent('user-1', 'ev1');

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

    const promise = createTransactionsRepository(supabase).deleteTransactionsByEvent('user-1', 'ev1');

    await expect(promise).rejects.toBeInstanceOf(DatabaseError);
    await expect(promise).rejects.toThrow('Database deleteTransactionsByEvent failed: boom');
  });
});

describe('repository.listTransactions', () => {
  it('reads this user rows in the date range, newest first, with the total count', async () => {
    const { supabase, calls } = fakeSupabase({
      data: [{ id: 't1', type: 'expense', amount: '60.00', note: 'กินข้าว', occurred_on: '2026-09-29', category_id: 'c1' }],
      count: 1,
      error: null,
    });

    const result = await createTransactionsRepository(supabase).listTransactions('user-1', '2026-09-01', '2026-09-30');

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

    const { transactions } = await createTransactionsRepository(supabase).listTransactions('user-1', '2026-09-01', '2026-09-30');

    expect(transactions[0].amount).toBe(60.5);
  });

  it('reports a total count larger than the rows returned', async () => {
    const { supabase } = fakeSupabase({
      data: [{ id: 't1', type: 'expense', amount: 1, note: '', occurred_on: '2026-09-29', category_id: 'c1' }],
      count: 1500,
      error: null,
    });

    const { totalCount } = await createTransactionsRepository(supabase).listTransactions('user-1', '2026-09-01', '2026-09-30');

    expect(totalCount).toBe(1500);
  });

  it('throws DatabaseError when Supabase returns an error', async () => {
    const { supabase } = fakeSupabase({ data: null, count: null, error: { message: 'boom' } });

    const promise = createTransactionsRepository(supabase).listTransactions('user-1', 'a', 'b');

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

    const rows = await createTransactionsRepository(supabase).listAllTransactions('user-1', '2026-09-01', '2026-09-30');

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

    const rows = await createTransactionsRepository(supabase).listAllTransactions('user-1', '2026-09-01', '2026-09-30');

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

    const rows = await createTransactionsRepository(supabase).listAllTransactions('user-1', '2026-09-01', '2026-09-30');

    expect(rows.map((row) => row.id)).toEqual(['c', 'd', 'b', 'a']);
  });

  it('stops after one request when the month has no rows', async () => {
    const { supabase, calls } = fakeSupabasePages([{ data: [], error: null }]);

    expect(await createTransactionsRepository(supabase).listAllTransactions('user-1', '2026-09-01', '2026-09-30')).toEqual([]);
    expect(calls.filter((call) => call[0] === 'from')).toHaveLength(1);
    expect(calls.some((call) => call[0] === 'gt')).toBe(false);
  });

  it('throws DatabaseError when Supabase returns an error', async () => {
    const { supabase } = fakeSupabasePages([{ data: null, error: { message: 'boom' } }]);

    const promise = createTransactionsRepository(supabase).listAllTransactions('user-1', 'a', 'b');

    await expect(promise).rejects.toBeInstanceOf(DatabaseError);
    await expect(promise).rejects.toThrow('Database listAllTransactions failed: boom');
  });
});

describe('repository.updateTransaction', () => {
  const fields = { type: 'income', amount: 25000, categoryId: 'c9', occurredOn: '2026-09-01', note: 'เงินเดือน' };

  it('updates only this user row and reports whether it existed', async () => {
    const { supabase, calls } = fakeSupabase({ data: [{ id: 't1' }], error: null });

    expect(await createTransactionsRepository(supabase).updateTransaction('user-1', 't1', fields)).toBe(true);
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
    const repository = createTransactionsRepository(supabase);

    await repository.updateTransaction('user-1', 't1', { ...fields, walletId: 'w-card' });
    await repository.updateTransaction('user-1', 't1', { ...fields, walletId: null });

    const updates = calls.filter((call) => call[0] === 'update').map((call) => call[1]);
    expect(updates[0].wallet_id).toBe('w-card');
    expect(updates[1]).toHaveProperty('wallet_id', null);
  });

  it('returns false when no row matched', async () => {
    const { supabase } = fakeSupabase({ data: [], error: null });

    expect(await createTransactionsRepository(supabase).updateTransaction('user-1', 't1', fields)).toBe(false);
  });

  it('throws DatabaseError when Supabase returns an error', async () => {
    const { supabase } = fakeSupabase({ data: null, error: { message: 'boom' } });

    await expect(createTransactionsRepository(supabase).updateTransaction('user-1', 't1', fields)).rejects.toThrow(
      'Database updateTransaction failed: boom'
    );
  });
});

describe('repository.deleteTransaction', () => {
  it('deletes only this user row and reports whether it existed', async () => {
    const { supabase, calls } = fakeSupabase({ count: 1, error: null });

    expect(await createTransactionsRepository(supabase).deleteTransaction('user-1', 't1')).toBe(true);
    expect(calls).toEqual([
      ['from', 'transactions'],
      ['delete', { count: 'exact' }],
      ['eq', 'user_id', 'user-1'],
      ['eq', 'id', 't1'],
    ]);
  });

  it('returns false when no row matched', async () => {
    const { supabase } = fakeSupabase({ count: 0, error: null });

    expect(await createTransactionsRepository(supabase).deleteTransaction('user-1', 't1')).toBe(false);
  });

  it('throws DatabaseError when Supabase returns an error', async () => {
    const { supabase } = fakeSupabase({ count: null, error: { message: 'boom' } });

    await expect(createTransactionsRepository(supabase).deleteTransaction('user-1', 't1')).rejects.toThrow(
      'Database deleteTransaction failed: boom'
    );
  });
});

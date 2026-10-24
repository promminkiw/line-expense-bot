import { describe, it, expect } from 'vitest';
import { createStatsRepository } from './stats.js';
import { DatabaseError } from '../repository.js';
import { fakeSupabase } from '../test-helpers.mjs';

describe('repository.summarizeTransactions', () => {
  it('calls the SQL function for this user and date range and converts numbers', async () => {
    const { supabase, calls } = fakeSupabase({
      data: [{ type: 'expense', category: 'อาหาร', total: '105.50', entry_count: '2' }],
      error: null,
    });

    const rows = await createStatsRepository(supabase).summarizeTransactions('user-1', '2026-09-01', '2026-09-29');

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

    const rows = await createStatsRepository(supabase).summarizeTransactions('user-1', '2026-09-01', '2026-09-29');

    expect(rows).toEqual([{ type: 'income', category: 'เงินเดือน', total: 25000, entryCount: 1 }]);
  });

  it('returns an empty array when the range has no entries', async () => {
    const { supabase } = fakeSupabase({ data: [], error: null });

    const rows = await createStatsRepository(supabase).summarizeTransactions('user-1', '2026-09-01', '2026-09-29');

    expect(rows).toEqual([]);
  });

  it('throws DatabaseError when Supabase returns an error', async () => {
    const { supabase } = fakeSupabase({ data: null, error: { message: 'boom' } });

    const promise = createStatsRepository(supabase).summarizeTransactions('user-1', '2026-09-01', '2026-09-29');

    await expect(promise).rejects.toBeInstanceOf(DatabaseError);
    await expect(promise).rejects.toThrow('Database summarizeTransactions failed: boom');
  });
});

describe('repository.queryTotals', () => {
  const criteria = { from: '2026-10-01', to: '2026-10-18', type: 'expense', category: '', keyword: 'กาแฟ' };

  it('calls the SQL function with the question criteria and converts numbers', async () => {
    const { supabase, calls } = fakeSupabase({ data: [{ type: 'expense', total: '450.00', entry_count: '6' }], error: null });

    const rows = await createStatsRepository(supabase).queryTotals('user-1', { ...criteria, isQuestion: true });

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

    await createStatsRepository(supabase).queryTotals('user-1', { ...criteria, wallet: 'บัตรเครดิต' });

    expect(calls[0][2].p_wallet).toBe('บัตรเครดิต');
  });

  it('returns an empty array when nothing matches', async () => {
    const { supabase } = fakeSupabase({ data: [], error: null });

    expect(await createStatsRepository(supabase).queryTotals('user-1', criteria)).toEqual([]);
  });

  it('throws DatabaseError when Supabase returns an error', async () => {
    const { supabase } = fakeSupabase({ data: null, error: { message: 'boom' } });

    const promise = createStatsRepository(supabase).queryTotals('user-1', criteria);

    await expect(promise).rejects.toBeInstanceOf(DatabaseError);
    await expect(promise).rejects.toThrow('Database queryTotals failed: boom');
  });
});

describe('repository.getLifetimeTotals', () => {
  it('calls the SQL function and converts numbers', async () => {
    const { supabase, calls } = fakeSupabase({
      data: [{ income: '25000.00', expense: '1234.50', entry_count: '12', first_date: '2026-08-03' }],
      error: null,
    });

    const totals = await createStatsRepository(supabase).getLifetimeTotals('user-1');

    expect(totals).toEqual({ income: 25000, expense: 1234.5, entryCount: 12, firstDate: '2026-08-03' });
    expect(calls).toEqual([['rpc', 'lifetime_totals', { p_user_id: 'user-1' }]]);
  });

  it('returns zeros and a null first date when the user has no entries', async () => {
    const { supabase } = fakeSupabase({
      data: [{ income: 0, expense: 0, entry_count: 0, first_date: null }],
      error: null,
    });

    expect(await createStatsRepository(supabase).getLifetimeTotals('user-1')).toEqual({
      income: 0,
      expense: 0,
      entryCount: 0,
      firstDate: null,
    });
  });

  it('treats an empty result as no entries', async () => {
    const { supabase } = fakeSupabase({ data: [], error: null });

    expect(await createStatsRepository(supabase).getLifetimeTotals('user-1')).toEqual({
      income: 0,
      expense: 0,
      entryCount: 0,
      firstDate: null,
    });
  });

  it('throws DatabaseError when Supabase returns an error', async () => {
    const { supabase } = fakeSupabase({ data: null, error: { message: 'boom' } });

    await expect(createStatsRepository(supabase).getLifetimeTotals('user-1')).rejects.toBeInstanceOf(DatabaseError);
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

    const rows = await createStatsRepository(supabase).getMonthlyTotals('user-1', '2026-05-01', '2026-10-31');

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

    await expect(createStatsRepository(supabase).getMonthlyTotals('user-1', '2026-05-01', '2026-10-31')).rejects.toBeInstanceOf(DatabaseError);
  });
});

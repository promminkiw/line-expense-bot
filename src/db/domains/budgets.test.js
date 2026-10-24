import { describe, it, expect } from 'vitest';
import { DatabaseError } from '../repository.js';
import { createBudgetsRepository } from './budgets.js';
import { fakeSupabase } from '../test-helpers.mjs';

describe('repository.getBudgetStatus', () => {
  it('calls the SQL function for the first day of the month and converts numbers', async () => {
    const { supabase, calls } = fakeSupabase({
      data: [
        { category_id: 'c1', category: 'อาหาร', budget: '5000.00', spent: '4030.50' },
        { category_id: 'c2', category: 'เดินทาง', budget: null, spent: '0' },
      ],
      error: null,
    });

    const rows = await createBudgetsRepository(supabase).getBudgetStatus('user-1', '2026-09');

    expect(rows).toEqual([
      { categoryId: 'c1', category: 'อาหาร', budget: 5000, spent: 4030.5 },
      { categoryId: 'c2', category: 'เดินทาง', budget: null, spent: 0 },
    ]);
    expect(calls).toEqual([['rpc', 'budget_status', { p_user_id: 'user-1', p_month: '2026-09-01' }]]);
  });

  it('throws DatabaseError when Supabase returns an error', async () => {
    const { supabase } = fakeSupabase({ data: null, error: { message: 'boom' } });

    const promise = createBudgetsRepository(supabase).getBudgetStatus('user-1', '2026-09');

    await expect(promise).rejects.toBeInstanceOf(DatabaseError);
    await expect(promise).rejects.toThrow('Database getBudgetStatus failed: boom');
  });
});

describe('repository.setBudget', () => {
  it('upserts this user budget for the category from the first day of the month', async () => {
    const { supabase, calls } = fakeSupabase({ data: null, error: null });

    await createBudgetsRepository(supabase).setBudget({ userId: 'user-1', categoryId: 'c1', month: '2026-09', amount: 5000 });

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

    await createBudgetsRepository(supabase).setBudget({ userId: 'user-1', categoryId: 'c1', month: '2026-09', amount: 5000 });

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

    const promise = createBudgetsRepository(supabase).setBudget({ userId: 'u', categoryId: 'c', month: '2026-09', amount: 1 });

    await expect(promise).rejects.toBeInstanceOf(DatabaseError);
    await expect(promise).rejects.toThrow('Database setBudgetClearLater failed: boom');
  });

  it('does not delete later months when the upsert fails', async () => {
    const { supabase, calls } = fakeSupabase({ data: null, error: { message: 'boom' } });

    await expect(
      createBudgetsRepository(supabase).setBudget({ userId: 'u', categoryId: 'c', month: '2026-09', amount: 1 })
    ).rejects.toThrow('Database setBudget failed: boom');

    expect(calls.some((call) => call[0] === 'delete')).toBe(false);
  });

  it('stores null to stop the budget from that month', async () => {
    const { supabase, calls } = fakeSupabase({ data: null, error: null });

    await createBudgetsRepository(supabase).setBudget({ userId: 'user-1', categoryId: 'c1', month: '2026-10', amount: null });

    expect(calls[1][1]).toEqual({ user_id: 'user-1', category_id: 'c1', month: '2026-10-01', amount: null });
  });

  it('throws DatabaseError when Supabase returns an error', async () => {
    const { supabase } = fakeSupabase({ data: null, error: { message: 'boom' } });

    const promise = createBudgetsRepository(supabase).setBudget({ userId: 'u', categoryId: 'c', month: '2026-09', amount: 1 });

    await expect(promise).rejects.toBeInstanceOf(DatabaseError);
    await expect(promise).rejects.toThrow('Database setBudget failed: boom');
  });
});

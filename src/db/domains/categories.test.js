import { describe, it, expect } from 'vitest';
import { createCategoriesRepository } from './categories.js';
import { DatabaseError } from '../repository.js';
import { fakeSupabase } from '../test-helpers.mjs';

describe('repository.seedDefaultCategories', () => {
  it('inserts every default category and ignores existing ones', async () => {
    const { supabase, calls } = fakeSupabase({ data: null, error: null });

    await createCategoriesRepository(supabase).seedDefaultCategories('user-1');

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

    await createCategoriesRepository(supabase).seedDefaultCategories('user-1', { expense: ['อื่นๆ'], income: ['อื่นๆ'] });

    expect(calls[1][1]).toEqual([
      { user_id: 'user-1', type: 'expense', name: 'อื่นๆ' },
      { user_id: 'user-1', type: 'income', name: 'อื่นๆ' },
    ]);
  });

  it('throws DatabaseError when Supabase returns an error', async () => {
    const { supabase } = fakeSupabase({ data: null, count: null, error: { message: 'boom' } });

    const promise = createCategoriesRepository(supabase).seedDefaultCategories('user-1');

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

    const ids = await createCategoriesRepository(supabase).getCategoryIds('user-1');

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

    await createCategoriesRepository(supabase).getCategoryIds('user-1', { visibleOnly: true });

    expect(calls).toEqual([
      ['from', 'categories'],
      ['select', 'id, type, name'],
      ['eq', 'user_id', 'user-1'],
      ['eq', 'hidden', false],
    ]);
  });

  it('throws DatabaseError when Supabase returns an error', async () => {
    const { supabase } = fakeSupabase({ data: null, count: null, error: { message: 'boom' } });

    const promise = createCategoriesRepository(supabase).getCategoryIds('user-1');

    await expect(promise).rejects.toBeInstanceOf(DatabaseError);
    await expect(promise).rejects.toThrow('Database getCategoryIds failed: boom');
  });
});

describe('repository.listCategories', () => {
  it('reads this user categories with the hidden flag ordered by type and name', async () => {
    const { supabase, calls } = fakeSupabase({
      data: [{ id: 'c1', name: 'อาหาร', type: 'expense', hidden: false, icon: null }],
      error: null,
    });

    expect(await createCategoriesRepository(supabase).listCategories('user-1')).toEqual([
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

    await expect(createCategoriesRepository(supabase).listCategories('user-1')).rejects.toThrow(
      'Database listCategories failed: boom'
    );
  });
});

describe('repository.createCategory', () => {
  it('inserts the category for this user and returns it', async () => {
    const row = { id: 'c9', name: 'ค่าแมว', type: 'expense', hidden: false, icon: null };
    const { supabase, calls } = fakeSupabase({ data: row, error: null });

    const result = await createCategoriesRepository(supabase).createCategory('user-1', { type: 'expense', name: 'ค่าแมว' });

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

    expect(await createCategoriesRepository(supabase).createCategory('user-1', { type: 'expense', name: 'อาหาร' })).toEqual({
      status: 'duplicate',
    });
  });

  it('throws DatabaseError for other errors', async () => {
    const { supabase } = fakeSupabase({ data: null, error: { message: 'boom' } });

    await expect(createCategoriesRepository(supabase).createCategory('user-1', { type: 'expense', name: 'x' })).rejects.toThrow(
      'Database createCategory failed: boom'
    );
  });
});

describe('repository.updateCategory', () => {
  const row = { id: 'c9', name: 'แมว', type: 'expense', hidden: false, icon: null };

  it('updates only the given fields of this user row and returns it', async () => {
    const { supabase, calls } = fakeSupabase({ data: [row], error: null });

    const result = await createCategoriesRepository(supabase).updateCategory('user-1', 'c9', { name: 'แมว' });

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

    await createCategoriesRepository(supabase).updateCategory('user-1', 'c9', { hidden: true });

    expect(calls[1]).toEqual(['update', { hidden: true }]);
  });

  it('reports not_found when no row of this user matched', async () => {
    const { supabase } = fakeSupabase({ data: [], error: null });

    expect(await createCategoriesRepository(supabase).updateCategory('user-1', 'c9', { hidden: true })).toEqual({
      status: 'not_found',
    });
  });

  it('reports a duplicate name instead of throwing', async () => {
    const { supabase } = fakeSupabase({ data: null, error: { code: '23505', message: 'duplicate key' } });

    expect(await createCategoriesRepository(supabase).updateCategory('user-1', 'c9', { name: 'อาหาร' })).toEqual({
      status: 'duplicate',
    });
  });

  it('throws DatabaseError for other errors', async () => {
    const { supabase } = fakeSupabase({ data: null, error: { message: 'boom' } });

    await expect(createCategoriesRepository(supabase).updateCategory('user-1', 'c9', { name: 'x' })).rejects.toThrow(
      'Database updateCategory failed: boom'
    );
  });
});

describe('repository.deleteCategory', () => {
  it('deletes through the rpc and returns its status', async () => {
    const { supabase, calls } = fakeSupabase({ data: 'deleted', error: null });

    expect(await createCategoriesRepository(supabase).deleteCategory('user-1', 'c9')).toBe('deleted');
    expect(calls).toEqual([['rpc', 'delete_category', { p_user: 'user-1', p_category: 'c9' }]]);
  });

  it('throws a DatabaseError when the rpc fails', async () => {
    const { supabase } = fakeSupabase({ data: null, error: { message: 'boom' } });

    await expect(createCategoriesRepository(supabase).deleteCategory('user-1', 'c9')).rejects.toThrow('Database deleteCategory failed: boom');
  });
});

describe('repository.countCategoryUsage', () => {
  it('counts the entries, recurring rules and bills of the category', async () => {
    const { supabase, calls } = fakeSupabase({ count: 3, error: null }, { count: 1, error: null }, { count: 2, error: null });

    expect(await createCategoriesRepository(supabase).countCategoryUsage('user-1', 'c9')).toEqual({ transactions: 3, recurring: 1, bills: 2 });
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

    await expect(createCategoriesRepository(supabase).countCategoryUsage('user-1', 'c9')).rejects.toThrow('Database countCategoryUsage failed: boom');
  });
});

describe('repository category icons', () => {
  it('reads a missing icon as null', async () => {
    const { supabase } = fakeSupabase({ data: [{ id: 'c1', name: 'อาหาร', type: 'expense', hidden: false }], error: null });

    expect((await createCategoriesRepository(supabase).listCategories('user-1'))[0].icon).toBeNull();
  });

  it('inserts the icon when one is given', async () => {
    const row = { id: 'c9', name: 'กาแฟ', type: 'expense', hidden: false, icon: 'coffee' };
    const { supabase, calls } = fakeSupabase({ data: row, error: null });

    const result = await createCategoriesRepository(supabase).createCategory('user-1', { type: 'expense', name: 'กาแฟ', icon: 'coffee' });

    expect(result).toEqual({ status: 'ok', category: row });
    expect(calls[1]).toEqual(['insert', { user_id: 'user-1', type: 'expense', name: 'กาแฟ', icon: 'coffee' }]);
  });

  it('sends the icon, including null to reset it', async () => {
    const row = { id: 'c9', name: 'แมว', type: 'expense', hidden: false, icon: null };
    const first = fakeSupabase({ data: [{ ...row, icon: 'pet' }], error: null });
    await createCategoriesRepository(first.supabase).updateCategory('user-1', 'c9', { icon: 'pet' });
    expect(first.calls[1]).toEqual(['update', { icon: 'pet' }]);

    const second = fakeSupabase({ data: [row], error: null });
    await createCategoriesRepository(second.supabase).updateCategory('user-1', 'c9', { icon: null });
    expect(second.calls[1]).toEqual(['update', { icon: null }]);
  });
});

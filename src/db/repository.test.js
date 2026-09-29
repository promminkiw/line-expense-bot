import { describe, it, expect, vi } from 'vitest';
import { createRepository, DatabaseError } from './repository.js';

// จำลอง query builder ของ supabase-js: ทุก method คืนตัวเอง และ await ได้ผล result
function fakeSupabase(result) {
  const calls = [];
  const builder = {};
  for (const method of ['select', 'eq', 'upsert', 'insert', 'delete']) {
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
  builder.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
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

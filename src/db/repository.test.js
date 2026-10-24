import { describe, it, expect } from 'vitest';
import { createRepository } from './repository.js';
import { fakeSupabase } from './test-helpers.mjs';

describe('repository cross-domain', () => {
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

    await expect(createRepository(fakeSupabase({ data: null, count: null, error: { message: 'boom' } }).supabase).getLineUserIds(['u'])).rejects.toThrow('Database getLineUserIds failed: boom');
  });
});

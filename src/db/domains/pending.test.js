import { describe, it, expect } from 'vitest';
import { createPendingRepository } from './pending.js';
import { DatabaseError } from '../repository.js';
import { fakeSupabase } from '../test-helpers.mjs';

describe('repository.getPendingClarification', () => {
  it('returns messages and updatedAt for this user', async () => {
    const messages = [{ role: 'user', text: 'ซื้อรถ' }];
    const { supabase, calls } = fakeSupabase({
      data: { messages, updated_at: '2026-09-29T05:00:00Z' },
      error: null,
    });

    const pending = await createPendingRepository(supabase).getPendingClarification('user-1');

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

    expect(await createPendingRepository(supabase).getPendingClarification('user-1')).toBeNull();
  });

  it('throws DatabaseError when Supabase returns an error', async () => {
    const { supabase } = fakeSupabase({ data: null, error: { message: 'boom' } });

    const promise = createPendingRepository(supabase).getPendingClarification('user-1');

    await expect(promise).rejects.toBeInstanceOf(DatabaseError);
    await expect(promise).rejects.toThrow('Database getPendingClarification failed: boom');
  });
});

describe('repository.savePendingClarification', () => {
  it('upserts messages by user_id with a fresh updated_at', async () => {
    const { supabase, calls } = fakeSupabase({ data: null, error: null });
    const messages = [{ role: 'user', text: 'ซื้อรถ' }];

    await createPendingRepository(supabase).savePendingClarification('user-1', messages);

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

    const promise = createPendingRepository(supabase).savePendingClarification('user-1', []);

    await expect(promise).rejects.toBeInstanceOf(DatabaseError);
    await expect(promise).rejects.toThrow('Database savePendingClarification failed: boom');
  });
});

describe('repository.clearPendingClarification', () => {
  it('deletes only this user row', async () => {
    const { supabase, calls } = fakeSupabase({ data: null, error: null });

    await createPendingRepository(supabase).clearPendingClarification('user-1');

    expect(calls).toEqual([
      ['from', 'pending_clarifications'],
      ['delete'],
      ['eq', 'user_id', 'user-1'],
    ]);
  });

  it('throws DatabaseError when Supabase returns an error', async () => {
    const { supabase } = fakeSupabase({ data: null, error: { message: 'boom' } });

    const promise = createPendingRepository(supabase).clearPendingClarification('user-1');

    await expect(promise).rejects.toBeInstanceOf(DatabaseError);
    await expect(promise).rejects.toThrow('Database clearPendingClarification failed: boom');
  });
});

const SLIP_ITEMS = [
  { type: 'expense', category: 'อาหาร', amount: 120, date: '2026-09-28', note: 'โอนให้ ร้านข้าวแกง' },
  { type: 'expense', category: 'สุขภาพ', amount: 59, date: '2026-09-28', note: 'ยาสีฟัน' },
];

describe('repository.savePendingSlip', () => {
  it('inserts the items array for this user and event and returns the new id', async () => {
    const { supabase, calls } = fakeSupabase({ data: { id: 'slip-1' }, error: null });

    const id = await createPendingRepository(supabase).savePendingSlip('user-1', 'ev-img', SLIP_ITEMS);

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

    const promise = createPendingRepository(supabase).savePendingSlip('user-1', 'ev-img', SLIP_ITEMS);

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

    const slip = await createPendingRepository(supabase).claimPendingSlip('user-1', 'slip-1', '2026-09-29T04:50:00.000Z');

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

    expect(await createPendingRepository(supabase).claimPendingSlip('user-1', 'slip-1', '2026-09-29T04:50:00.000Z')).toBeNull();
  });

  it('throws DatabaseError when Supabase returns an error', async () => {
    const { supabase } = fakeSupabase({ data: null, error: { message: 'boom' } });

    const promise = createPendingRepository(supabase).claimPendingSlip('user-1', 'slip-1', '2026-09-29T04:50:00.000Z');

    await expect(promise).rejects.toBeInstanceOf(DatabaseError);
    await expect(promise).rejects.toThrow('Database claimPendingSlip failed: boom');
  });
});

describe('repository.deleteAllExpiredPendingSlips', () => {
  it('deletes rows of every user created at or before the cutoff', async () => {
    const { supabase, calls } = fakeSupabase({ data: null, error: null });

    await createPendingRepository(supabase).deleteAllExpiredPendingSlips('2026-09-29T04:50:00.000Z');

    expect(calls).toEqual([
      ['from', 'pending_slips'],
      ['delete'],
      ['lte', 'created_at', '2026-09-29T04:50:00.000Z'],
    ]);
  });

  it('throws DatabaseError when Supabase returns an error', async () => {
    const { supabase } = fakeSupabase({ data: null, error: { message: 'boom' } });

    const promise = createPendingRepository(supabase).deleteAllExpiredPendingSlips('2026-09-29T04:50:00.000Z');

    await expect(promise).rejects.toBeInstanceOf(DatabaseError);
    await expect(promise).rejects.toThrow('Database deleteAllExpiredPendingSlips failed: boom');
  });
});

describe('repository.deleteExpiredPendingSlips', () => {
  it('deletes only this user rows created at or before the cutoff', async () => {
    const { supabase, calls } = fakeSupabase({ data: null, error: null });

    await createPendingRepository(supabase).deleteExpiredPendingSlips('user-1', '2026-09-29T04:50:00.000Z');

    expect(calls).toEqual([
      ['from', 'pending_slips'],
      ['delete'],
      ['eq', 'user_id', 'user-1'],
      ['lte', 'created_at', '2026-09-29T04:50:00.000Z'],
    ]);
  });

  it('throws DatabaseError when Supabase returns an error', async () => {
    const { supabase } = fakeSupabase({ data: null, error: { message: 'boom' } });

    const promise = createPendingRepository(supabase).deleteExpiredPendingSlips('user-1', '2026-09-29T04:50:00.000Z');

    await expect(promise).rejects.toBeInstanceOf(DatabaseError);
    await expect(promise).rejects.toThrow('Database deleteExpiredPendingSlips failed: boom');
  });
});

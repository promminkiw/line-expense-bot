import { describe, it, expect } from 'vitest';
import { createExportsRepository } from './exports.js';
import { DatabaseError } from '../repository.js';
import { fakeSupabase } from '../test-helpers.mjs';

describe('repository.createExportLink', () => {
  it('stores the token hash for this user and month', async () => {
    const { supabase, calls } = fakeSupabase({ data: null, error: null });

    await createExportsRepository(supabase).createExportLink({
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

    const promise = createExportsRepository(supabase).createExportLink({
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

    await createExportsRepository(supabase).deleteExpiredExportLinks('user-1', '2026-09-30T03:01:00.000Z');

    expect(calls).toEqual([
      ['from', 'export_links'],
      ['delete'],
      ['eq', 'user_id', 'user-1'],
      ['lte', 'expires_at', '2026-09-30T03:01:00.000Z'],
    ]);
  });

  it('throws DatabaseError when Supabase returns an error', async () => {
    const { supabase } = fakeSupabase({ data: null, error: { message: 'boom' } });

    const promise = createExportsRepository(supabase).deleteExpiredExportLinks('u', 'x');

    await expect(promise).rejects.toBeInstanceOf(DatabaseError);
    await expect(promise).rejects.toThrow('Database deleteExpiredExportLinks failed: boom');
  });
});

describe('repository.claimExportLink', () => {
  it('marks an unused, unexpired link as used in one update and returns its owner and month', async () => {
    const { supabase, calls } = fakeSupabase({ data: [{ user_id: 'user-1', month: '2026-09' }], error: null });

    const link = await createExportsRepository(supabase).claimExportLink('hash-1', '2026-09-30T03:01:00.000Z');

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

    expect(await createExportsRepository(supabase).claimExportLink('hash-1', '2026-09-30T03:01:00.000Z')).toBeNull();
  });

  it('throws DatabaseError when Supabase returns an error', async () => {
    const { supabase } = fakeSupabase({ data: null, error: { message: 'boom' } });

    const promise = createExportsRepository(supabase).claimExportLink('hash-1', 'x');

    await expect(promise).rejects.toBeInstanceOf(DatabaseError);
    await expect(promise).rejects.toThrow('Database claimExportLink failed: boom');
  });
});

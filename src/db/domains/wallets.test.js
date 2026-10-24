import { describe, it, expect } from 'vitest';
import { createWalletsRepository } from './wallets.js';
import { fakeSupabase } from '../test-helpers.mjs';

describe('repository wallets', () => {
  const card = { id: 'w-card', name: 'บัตรเครดิต', hidden: false };

  it('lists this user wallets and marks the default one', async () => {
    const { supabase, calls } = fakeSupabase({ data: [{ id: 'w-cash', name: 'เงินสด', hidden: false }, card], error: null });

    const wallets = await createWalletsRepository(supabase).listWallets('user-1');

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

    await createWalletsRepository(supabase).seedDefaultWallet('user-1');

    expect(calls).toEqual([
      ['from', 'wallets'],
      ['upsert', { user_id: 'user-1', name: 'เงินสด' }, { onConflict: 'user_id,name', ignoreDuplicates: true }],
    ]);
  });

  it('creates a wallet and reports a duplicate name', async () => {
    const created = fakeSupabase({ data: card, error: null });
    const duplicate = fakeSupabase({ data: null, error: { code: '23505', message: 'duplicate key' } });

    expect(await createWalletsRepository(created.supabase).createWallet('user-1', { name: 'บัตรเครดิต' })).toEqual({
      status: 'ok',
      wallet: { ...card, isDefault: false },
    });
    expect(created.calls).toEqual([
      ['from', 'wallets'],
      ['insert', { user_id: 'user-1', name: 'บัตรเครดิต' }],
      ['select', 'id, name, hidden'],
      ['single'],
    ]);
    expect(await createWalletsRepository(duplicate.supabase).createWallet('user-1', { name: 'บัตรเครดิต' })).toEqual({ status: 'duplicate' });
  });

  it('updates only the given fields of this user wallet', async () => {
    const { supabase, calls } = fakeSupabase({ data: [{ ...card, hidden: true }], error: null });

    const result = await createWalletsRepository(supabase).updateWallet('user-1', 'w-card', { hidden: true });

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

    expect(await createWalletsRepository(missing.supabase).updateWallet('user-1', 'w-x', { name: 'ก' })).toEqual({ status: 'not_found' });
    expect(await createWalletsRepository(duplicate.supabase).updateWallet('user-1', 'w-card', { name: 'ก' })).toEqual({ status: 'duplicate' });
  });

  it('reads wallet totals from SQL and converts numbers', async () => {
    const { supabase, calls } = fakeSupabase({
      data: [{ wallet_id: 'w-cash', name: 'เงินสด', hidden: false, income: '25000.00', expense: '100.50', entry_count: '3' }],
      error: null,
    });

    expect(await createWalletsRepository(supabase).getWalletTotals('user-1')).toEqual([
      { id: 'w-cash', name: 'เงินสด', hidden: false, isDefault: true, income: 25000, expense: 100.5, entryCount: 3 },
    ]);
    expect(calls).toEqual([['rpc', 'wallet_totals', { p_user_id: 'user-1' }]]);
  });

  it('throws DatabaseError when Supabase returns an error', async () => {
    const { supabase } = fakeSupabase({ data: null, error: { message: 'boom' } });
    const repository = createWalletsRepository(supabase);

    await expect(repository.listWallets('user-1')).rejects.toThrow('Database listWallets failed: boom');
    await expect(repository.seedDefaultWallet('user-1')).rejects.toThrow('Database seedDefaultWallet failed: boom');
    await expect(repository.createWallet('user-1', { name: 'x' })).rejects.toThrow('Database createWallet failed: boom');
    await expect(repository.updateWallet('user-1', 'w', { name: 'x' })).rejects.toThrow('Database updateWallet failed: boom');
    await expect(repository.getWalletTotals('user-1')).rejects.toThrow('Database getWalletTotals failed: boom');
  });
});

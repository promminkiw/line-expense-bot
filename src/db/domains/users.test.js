import { describe, it, expect } from 'vitest';
import { createUsersRepository } from './users.js';
import { DatabaseError } from '../repository.js';
import { fakeSupabase } from '../test-helpers.mjs';

describe('repository.findUserByLineId', () => {
  it('returns the id and raw language when found', async () => {
    const { supabase, calls } = fakeSupabase({ data: { id: 'user-1', language: 'en' }, error: null });

    const user = await createUsersRepository(supabase).findUserByLineId('U1');

    expect(user).toEqual({ id: 'user-1', language: 'en' });
    expect(calls).toEqual([
      ['from', 'users'],
      ['select', 'id, language'],
      ['eq', 'line_user_id', 'U1'],
      ['maybeSingle'],
    ]);
  });

  it('keeps a null language as null', async () => {
    const { supabase } = fakeSupabase({ data: { id: 'user-1', language: null }, error: null });

    expect(await createUsersRepository(supabase).findUserByLineId('U1')).toEqual({ id: 'user-1', language: null });
  });

  it('returns null when not found', async () => {
    const { supabase } = fakeSupabase({ data: null, error: null });

    expect(await createUsersRepository(supabase).findUserByLineId('U1')).toBeNull();
  });

  it('throws DatabaseError when Supabase returns an error', async () => {
    const { supabase } = fakeSupabase({ data: null, error: { message: 'boom' } });

    const promise = createUsersRepository(supabase).findUserByLineId('U1');

    await expect(promise).rejects.toBeInstanceOf(DatabaseError);
    await expect(promise).rejects.toThrow('Database findUserByLineId failed: boom');
  });
});

describe('repository.createUser', () => {
  it('upserts by line_user_id and returns the id', async () => {
    const { supabase, calls } = fakeSupabase({ data: { id: 'user-1' }, error: null });

    const id = await createUsersRepository(supabase).createUser({ lineUserId: 'U1', displayName: 'Aom', language: 'en' });

    expect(id).toBe('user-1');
    expect(calls).toEqual([
      ['from', 'users'],
      ['upsert', { line_user_id: 'U1', display_name: 'Aom', language: 'en' }, { onConflict: 'line_user_id' }],
      ['select', 'id'],
      ['single'],
    ]);
  });

  it('throws DatabaseError when Supabase returns an error', async () => {
    const { supabase } = fakeSupabase({ data: null, count: null, error: { message: 'boom' } });

    const promise = createUsersRepository(supabase).createUser({ lineUserId: 'U1', displayName: 'Aom', language: null });

    await expect(promise).rejects.toBeInstanceOf(DatabaseError);
    await expect(promise).rejects.toThrow('Database createUser failed: boom');
  });
});

describe('repository.fillMissingDisplayName', () => {
  it('updates the name only while it is still null', async () => {
    const { supabase, calls } = fakeSupabase({ error: null });

    await createUsersRepository(supabase).fillMissingDisplayName('user-1', 'Aom');

    expect(calls).toEqual([
      ['from', 'users'],
      ['update', { display_name: 'Aom' }],
      ['eq', 'id', 'user-1'],
      ['is', 'display_name', null],
    ]);
  });

  it('throws DatabaseError when Supabase returns an error', async () => {
    const { supabase } = fakeSupabase({ error: { message: 'boom' } });

    await expect(createUsersRepository(supabase).fillMissingDisplayName('user-1', 'Aom')).rejects.toThrow(
      'Database fillMissingDisplayName failed: boom'
    );
  });
});

describe('repository.getDisplayName', () => {
  it('reads the display name of this user', async () => {
    const { supabase, calls } = fakeSupabase({ data: { display_name: 'สมชาย' }, error: null });

    expect(await createUsersRepository(supabase).getDisplayName('user-1')).toBe('สมชาย');
    expect(calls).toEqual([
      ['from', 'users'],
      ['select', 'display_name'],
      ['eq', 'id', 'user-1'],
      ['maybeSingle'],
    ]);
  });

  it('returns null when the user or the name is missing', async () => {
    expect(await createUsersRepository(fakeSupabase({ data: null, error: null }).supabase).getDisplayName('user-1')).toBeNull();
    expect(
      await createUsersRepository(fakeSupabase({ data: { display_name: null }, error: null }).supabase).getDisplayName('user-1')
    ).toBeNull();
  });

  it('throws DatabaseError when Supabase returns an error', async () => {
    const { supabase } = fakeSupabase({ data: null, error: { message: 'boom' } });

    await expect(createUsersRepository(supabase).getDisplayName('user-1')).rejects.toBeInstanceOf(DatabaseError);
  });
});

describe('repository.getUserLanguage', () => {
  it('returns the stored language', async () => {
    const { supabase, calls } = fakeSupabase({ data: { language: 'en' }, error: null });

    expect(await createUsersRepository(supabase).getUserLanguage('user-1')).toBe('en');
    expect(calls).toEqual([['from', 'users'], ['select', 'language'], ['eq', 'id', 'user-1'], ['maybeSingle']]);
  });

  it('returns null when the user is missing or has not chosen', async () => {
    expect(await createUsersRepository(fakeSupabase({ data: null, error: null }).supabase).getUserLanguage('user-1')).toBeNull();
    expect(
      await createUsersRepository(fakeSupabase({ data: { language: null }, error: null }).supabase).getUserLanguage('user-1')
    ).toBeNull();
  });

  it('throws DatabaseError when Supabase returns an error', async () => {
    const { supabase } = fakeSupabase({ data: null, error: { message: 'boom' } });

    await expect(createUsersRepository(supabase).getUserLanguage('user-1')).rejects.toThrow(
      'Database getUserLanguage failed: boom'
    );
  });
});

describe('repository.setUserLanguage', () => {
  it('updates the language of one user', async () => {
    const { supabase, calls } = fakeSupabase({ error: null });

    await createUsersRepository(supabase).setUserLanguage('user-1', 'en');

    expect(calls).toEqual([['from', 'users'], ['update', { language: 'en' }], ['eq', 'id', 'user-1']]);
  });

  it('throws DatabaseError when Supabase returns an error', async () => {
    const { supabase } = fakeSupabase({ error: { message: 'boom' } });

    await expect(createUsersRepository(supabase).setUserLanguage('user-1', 'en')).rejects.toThrow(
      'Database setUserLanguage failed: boom'
    );
  });
});

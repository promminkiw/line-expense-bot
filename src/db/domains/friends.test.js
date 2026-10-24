import { describe, it, expect } from 'vitest';
import { DatabaseError } from '../repository.js';
import { createFriendsRepository } from './friends.js';
import { fakeSupabase } from '../test-helpers.mjs';

describe('repository friend codes', () => {
  it('reads the friend code of a user, or null when the user has none yet', async () => {
    const { supabase, calls } = fakeSupabase({ data: { friend_code: 'ABCD2345' }, error: null });

    expect(await createFriendsRepository(supabase).getFriendCode('user-1')).toBe('ABCD2345');
    expect(calls).toEqual([['from', 'users'], ['select', 'friend_code'], ['eq', 'id', 'user-1'], ['maybeSingle']]);
    const empty = fakeSupabase({ data: null, error: null });
    expect(await createFriendsRepository(empty.supabase).getFriendCode('user-1')).toBeNull();
  });

  it('stores a friend code and reports a clash with another user as taken', async () => {
    const ok = fakeSupabase({ count: 1, error: null });
    const clash = fakeSupabase({ data: null, error: { message: 'duplicate key', code: '23505' } });

    expect(await createFriendsRepository(ok.supabase).setFriendCode('user-1', 'ABCD2345')).toBe('set');
    expect(ok.calls).toEqual([['from', 'users'], ['update', { friend_code: 'ABCD2345' }, { count: 'exact' }], ['eq', 'id', 'user-1']]);
    expect(await createFriendsRepository(clash.supabase).setFriendCode('user-1', 'ABCD2345')).toBe('taken');
  });

  // สองหน้าเปิดส่วนเพื่อนครั้งแรกพร้อมกัน หน้าที่ช้ากว่าต้องไม่เขียนทับรหัสที่อีกหน้าแสดงไปแล้ว
  it('writes a first code only while the user still has none, and says when nothing changed', async () => {
    const first = fakeSupabase({ count: 1, error: null });
    const late = fakeSupabase({ count: 0, error: null });

    expect(await createFriendsRepository(first.supabase).setFriendCode('user-1', 'ABCD2345', { onlyIfEmpty: true })).toBe('set');
    expect(first.calls).toEqual([
      ['from', 'users'],
      ['update', { friend_code: 'ABCD2345' }, { count: 'exact' }],
      ['eq', 'id', 'user-1'],
      ['is', 'friend_code', null],
    ]);
    expect(await createFriendsRepository(late.supabase).setFriendCode('user-1', 'ABCD2345', { onlyIfEmpty: true })).toBe('unchanged');
  });

  it('throws DatabaseError for any other error while storing the code', async () => {
    const { supabase } = fakeSupabase({ data: null, error: { message: 'boom', code: 'XX000' } });

    await expect(createFriendsRepository(supabase).setFriendCode('user-1', 'ABCD2345')).rejects.toThrow(
      'Database setFriendCode failed: boom'
    );
  });

  it('finds the owner of a friend code', async () => {
    const { supabase, calls } = fakeSupabase({ data: { id: 'user-2', display_name: 'บี' }, error: null });

    expect(await createFriendsRepository(supabase).findUserByFriendCode('ABCD2345')).toEqual({ id: 'user-2', displayName: 'บี' });
    expect(calls).toEqual([
      ['from', 'users'],
      ['select', 'id, display_name'],
      ['eq', 'friend_code', 'ABCD2345'],
      ['maybeSingle'],
    ]);
    const missing = fakeSupabase({ data: null, error: null });
    expect(await createFriendsRepository(missing.supabase).findUserByFriendCode('ABCD2345')).toBeNull();
  });
});

describe('repository friendships', () => {
  it('lists this user friends with their display names', async () => {
    const { supabase, calls } = fakeSupabase({
      data: [
        { friend_id: 'user-2', friend: { display_name: 'บี' } },
        { friend_id: 'user-3', friend: { display_name: null } },
        { friend_id: 'user-4', friend: null },
      ],
      error: null,
    });

    expect(await createFriendsRepository(supabase).listFriends('user-1')).toEqual([
      { id: 'user-2', displayName: 'บี' },
      { id: 'user-3', displayName: null },
      { id: 'user-4', displayName: null },
    ]);
    expect(calls).toEqual([
      ['from', 'friendships'],
      ['select', 'friend_id, friend:users!friendships_friend_id_fkey(display_name)'],
      ['eq', 'user_id', 'user-1'],
    ]);
  });

  it('adds both directions in one write and ignores an existing pair', async () => {
    const { supabase, calls } = fakeSupabase({ data: null, error: null });

    expect(await createFriendsRepository(supabase).addFriendship('user-1', 'user-2')).toBe(true);

    expect(calls).toEqual([
      ['from', 'friendships'],
      [
        'upsert',
        [
          { user_id: 'user-1', friend_id: 'user-2' },
          { user_id: 'user-2', friend_id: 'user-1' },
        ],
        { onConflict: 'user_id,friend_id', ignoreDuplicates: true },
      ],
    ]);
  });

  // ผู้ใช้อีกฝั่งถูกลบระหว่างค้นหากับเพิ่ม ถือว่าไม่พบ ไม่ใช่ error ของระบบ
  it('reports a friend that no longer exists as not added', async () => {
    const { supabase } = fakeSupabase({ data: null, error: { code: '23503', message: 'violates foreign key constraint' } });

    expect(await createFriendsRepository(supabase).addFriendship('user-1', 'user-2')).toBe(false);
  });

  it('writes the pair rows ordered by user_id so concurrent mutual adds cannot deadlock', async () => {
    const { supabase, calls } = fakeSupabase({ data: null, error: null });

    await createFriendsRepository(supabase).addFriendship('user-2', 'user-1');

    expect(calls[1][1]).toEqual([
      { user_id: 'user-1', friend_id: 'user-2' },
      { user_id: 'user-2', friend_id: 'user-1' },
    ]);
  });

  it('removes both directions and reports whether the pair existed', async () => {
    const { supabase, calls } = fakeSupabase({ count: 2, error: null });

    expect(await createFriendsRepository(supabase).removeFriendship('user-1', 'user-2')).toBe(true);
    expect(calls).toEqual([
      ['from', 'friendships'],
      ['delete', { count: 'exact' }],
      ['or', 'and(user_id.eq.user-1,friend_id.eq.user-2),and(user_id.eq.user-2,friend_id.eq.user-1)'],
    ]);
    const none = fakeSupabase({ count: 0, error: null });
    expect(await createFriendsRepository(none.supabase).removeFriendship('user-1', 'user-2')).toBe(false);
  });

  it('throws DatabaseError when a friendship query fails', async () => {
    const failing = () => fakeSupabase({ data: null, count: null, error: { message: 'boom' } }).supabase;

    await expect(createFriendsRepository(failing()).listFriends('user-1')).rejects.toThrow('Database listFriends failed: boom');
    await expect(createFriendsRepository(failing()).listFriends('user-1')).rejects.toBeInstanceOf(DatabaseError);
    await expect(createFriendsRepository(failing()).addFriendship('user-1', 'user-2')).rejects.toBeInstanceOf(DatabaseError);
    await expect(createFriendsRepository(failing()).removeFriendship('user-1', 'user-2')).rejects.toBeInstanceOf(DatabaseError);
    await expect(createFriendsRepository(failing()).addFriendship('user-1', 'user-2')).rejects.toThrow(
      'Database addFriendship failed: boom'
    );
    await expect(createFriendsRepository(failing()).removeFriendship('user-1', 'user-2')).rejects.toThrow(
      'Database removeFriendship failed: boom'
    );
  });
});

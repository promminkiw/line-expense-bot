import { inspect } from 'node:util';
import { describe, it, expect } from 'vitest';
import { createRepository, DatabaseError } from './repository.js';
import { fakeSupabase } from './test-helpers.mjs';

describe('DatabaseError', () => {
  const postgrestError = { message: 'insert failed', code: '23502', hint: 'check the column', details: 'Failing row contains (590, ค่าเน็ต)' };

  it('keeps the message format and only the safe fields of the cause', () => {
    const err = new DatabaseError('createTransaction', postgrestError);

    expect(err.message).toBe('Database createTransaction failed: insert failed');
    expect(err.cause).toEqual({ message: 'insert failed', code: '23502', hint: 'check the column' });
  });

  it('never exposes details through JSON or util.inspect', () => {
    const err = new DatabaseError('createTransaction', postgrestError);

    expect(JSON.stringify(err.cause)).not.toContain('details');
    expect(JSON.stringify(err.cause)).not.toContain('590');
    expect(inspect(err, { depth: 5 })).not.toContain('details');
    expect(inspect(err, { depth: 5 })).not.toContain('ค่าเน็ต');
  });

  it('omits safe fields that the original error does not have', () => {
    expect(new DatabaseError('x', { message: 'boom' }).cause).toEqual({ message: 'boom' });
  });
});

describe('repository friend codes', () => {
  it('reads the friend code of a user, or null when the user has none yet', async () => {
    const { supabase, calls } = fakeSupabase({ data: { friend_code: 'ABCD2345' }, error: null });

    expect(await createRepository(supabase).getFriendCode('user-1')).toBe('ABCD2345');
    expect(calls).toEqual([['from', 'users'], ['select', 'friend_code'], ['eq', 'id', 'user-1'], ['maybeSingle']]);
    const empty = fakeSupabase({ data: null, error: null });
    expect(await createRepository(empty.supabase).getFriendCode('user-1')).toBeNull();
  });

  it('stores a friend code and reports a clash with another user as taken', async () => {
    const ok = fakeSupabase({ count: 1, error: null });
    const clash = fakeSupabase({ data: null, error: { message: 'duplicate key', code: '23505' } });

    expect(await createRepository(ok.supabase).setFriendCode('user-1', 'ABCD2345')).toBe('set');
    expect(ok.calls).toEqual([['from', 'users'], ['update', { friend_code: 'ABCD2345' }, { count: 'exact' }], ['eq', 'id', 'user-1']]);
    expect(await createRepository(clash.supabase).setFriendCode('user-1', 'ABCD2345')).toBe('taken');
  });

  // สองหน้าเปิดส่วนเพื่อนครั้งแรกพร้อมกัน หน้าที่ช้ากว่าต้องไม่เขียนทับรหัสที่อีกหน้าแสดงไปแล้ว
  it('writes a first code only while the user still has none, and says when nothing changed', async () => {
    const first = fakeSupabase({ count: 1, error: null });
    const late = fakeSupabase({ count: 0, error: null });

    expect(await createRepository(first.supabase).setFriendCode('user-1', 'ABCD2345', { onlyIfEmpty: true })).toBe('set');
    expect(first.calls).toEqual([
      ['from', 'users'],
      ['update', { friend_code: 'ABCD2345' }, { count: 'exact' }],
      ['eq', 'id', 'user-1'],
      ['is', 'friend_code', null],
    ]);
    expect(await createRepository(late.supabase).setFriendCode('user-1', 'ABCD2345', { onlyIfEmpty: true })).toBe('unchanged');
  });

  it('throws DatabaseError for any other error while storing the code', async () => {
    const { supabase } = fakeSupabase({ data: null, error: { message: 'boom', code: 'XX000' } });

    await expect(createRepository(supabase).setFriendCode('user-1', 'ABCD2345')).rejects.toThrow(
      'Database setFriendCode failed: boom'
    );
  });

  it('finds the owner of a friend code', async () => {
    const { supabase, calls } = fakeSupabase({ data: { id: 'user-2', display_name: 'บี' }, error: null });

    expect(await createRepository(supabase).findUserByFriendCode('ABCD2345')).toEqual({ id: 'user-2', displayName: 'บี' });
    expect(calls).toEqual([
      ['from', 'users'],
      ['select', 'id, display_name'],
      ['eq', 'friend_code', 'ABCD2345'],
      ['maybeSingle'],
    ]);
    const missing = fakeSupabase({ data: null, error: null });
    expect(await createRepository(missing.supabase).findUserByFriendCode('ABCD2345')).toBeNull();
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

    expect(await createRepository(supabase).listFriends('user-1')).toEqual([
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

    expect(await createRepository(supabase).addFriendship('user-1', 'user-2')).toBe(true);

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

    expect(await createRepository(supabase).addFriendship('user-1', 'user-2')).toBe(false);
  });

  it('writes the pair rows ordered by user_id so concurrent mutual adds cannot deadlock', async () => {
    const { supabase, calls } = fakeSupabase({ data: null, error: null });

    await createRepository(supabase).addFriendship('user-2', 'user-1');

    expect(calls[1][1]).toEqual([
      { user_id: 'user-1', friend_id: 'user-2' },
      { user_id: 'user-2', friend_id: 'user-1' },
    ]);
  });

  it('removes both directions and reports whether the pair existed', async () => {
    const { supabase, calls } = fakeSupabase({ count: 2, error: null });

    expect(await createRepository(supabase).removeFriendship('user-1', 'user-2')).toBe(true);
    expect(calls).toEqual([
      ['from', 'friendships'],
      ['delete', { count: 'exact' }],
      ['or', 'and(user_id.eq.user-1,friend_id.eq.user-2),and(user_id.eq.user-2,friend_id.eq.user-1)'],
    ]);
    const none = fakeSupabase({ count: 0, error: null });
    expect(await createRepository(none.supabase).removeFriendship('user-1', 'user-2')).toBe(false);
  });

  it('throws DatabaseError when a friendship query fails', async () => {
    const failing = () => fakeSupabase({ data: null, count: null, error: { message: 'boom' } }).supabase;

    await expect(createRepository(failing()).listFriends('user-1')).rejects.toThrow('Database listFriends failed: boom');
    await expect(createRepository(failing()).listFriends('user-1')).rejects.toBeInstanceOf(DatabaseError);
    await expect(createRepository(failing()).addFriendship('user-1', 'user-2')).rejects.toBeInstanceOf(DatabaseError);
    await expect(createRepository(failing()).removeFriendship('user-1', 'user-2')).rejects.toBeInstanceOf(DatabaseError);
    await expect(createRepository(failing()).addFriendship('user-1', 'user-2')).rejects.toThrow(
      'Database addFriendship failed: boom'
    );
    await expect(createRepository(failing()).removeFriendship('user-1', 'user-2')).rejects.toThrow(
      'Database removeFriendship failed: boom'
    );
  });
});

describe('repository bills', () => {
  const BILL = 'b1';

  it('creates a bill through the create_bill function', async () => {
    const { supabase, calls } = fakeSupabase({ data: 'bill-1', error: null });

    const id = await createRepository(supabase).createBill({
      ownerId: 'user-1',
      title: 'เนื้อย่าง',
      total: 400,
      occurredOn: '2026-10-08',
      categoryId: 'c1',
      ownerShare: 100,
      members: [{ userId: 'user-2', share: 300 }],
    });

    expect(id).toBe('bill-1');
    expect(calls).toEqual([
      [
        'rpc',
        'create_bill',
        {
          p_owner: 'user-1',
          p_title: 'เนื้อย่าง',
          p_total: 400,
          p_category: 'c1',
          p_date: '2026-10-08',
          p_owner_share: 100,
          p_members: [{ user_id: 'user-2', share: 300 }],
        },
      ],
    ]);
  });

  it('marks a member as notified and says whether the row was there', async () => {
    const { supabase, calls } = fakeSupabase({ count: 1, error: null });

    expect(await createRepository(supabase).markBillMemberNotified(BILL, 'user-2')).toBe(true);
    expect(calls).toEqual([
      ['from', 'bill_members'],
      ['update', { notified: true }, { count: 'exact' }],
      ['eq', 'bill_id', BILL],
      ['eq', 'user_id', 'user-2'],
    ]);
    const missing = fakeSupabase({ count: 0, error: null });
    expect(await createRepository(missing.supabase).markBillMemberNotified(BILL, 'user-2')).toBe(false);
  });

  it('lists the owner bills newest first with members, names and numbers', async () => {
    const { supabase, calls } = fakeSupabase({
      data: [
        {
          id: BILL,
          title: 'เนื้อย่าง',
          total: '400.00',
          occurred_on: '2026-10-08',
          status: 'open',
          owner_share: '100.00',
          created_at: '2026-10-08T10:00:00+00:00',
          categories: { name: 'อาหาร' },
          bill_members: [
            { user_id: 'user-2', share: '300.00', status: 'pending', paid: false, notified: true, users: { display_name: 'บี' } },
          ],
        },
      ],
      error: null,
    });

    expect(await createRepository(supabase).listOwnedBills('user-1')).toEqual([
      {
        id: BILL,
        title: 'เนื้อย่าง',
        total: 400,
        occurredOn: '2026-10-08',
        categoryName: 'อาหาร',
        status: 'open',
        ownerShare: 100,
        createdAt: '2026-10-08T10:00:00+00:00',
        members: [{ userId: 'user-2', displayName: 'บี', share: 300, status: 'pending', paid: false, notified: true }],
      },
    ]);
    expect(calls).toEqual([
      ['from', 'bills'],
      [
        'select',
        'id, title, total, occurred_on, status, owner_share, created_at, categories(name), bill_members(user_id, share, status, paid, notified, users(display_name))',
      ],
      ['eq', 'owner_id', 'user-1'],
      ['order', 'created_at', { ascending: false }],
      ['limit', 50],
    ]);
  });

  // transaction_id เป็น null เมื่อยังไม่ยืนยัน หรือผู้ใช้ลบรายจ่ายไปแล้ว (on delete set null)
  it('says whether the expense of a confirmed share is still recorded', async () => {
    const row = (transactionId) => ({
      share: '150.00',
      status: 'confirmed',
      paid: false,
      transaction_id: transactionId,
      bills: { id: BILL, title: 'ชาบู', total: '300.00', occurred_on: '2026-10-08', status: 'cancelled', categories: null, owner: null },
    });
    const { supabase } = fakeSupabase({ data: [row('tx-1'), row(null)], error: null });

    const bills = await createRepository(supabase).listIncomingBills('user-2');

    expect(bills.map((bill) => bill.expenseRecorded)).toEqual([true, false]);
  });

  it('lists the bills shared with a user newest first', async () => {
    const { supabase, calls } = fakeSupabase({
      data: [
        {
          share: '150.00',
          status: 'pending',
          paid: false,
          transaction_id: null,
          bills: {
            id: BILL,
            title: 'เนื้อย่าง',
            total: '400.00',
            occurred_on: '2026-10-08',
            status: 'open',
            categories: { name: 'อาหาร' },
            owner: { display_name: null },
          },
        },
      ],
      error: null,
    });

    expect(await createRepository(supabase).listIncomingBills('user-2')).toEqual([
      {
        id: BILL,
        title: 'เนื้อย่าง',
        total: 400,
        occurredOn: '2026-10-08',
        categoryName: 'อาหาร',
        status: 'open',
        ownerName: null,
        myShare: 150,
        myStatus: 'pending',
        paid: false,
        expenseRecorded: false,
      },
    ]);
    expect(calls).toEqual([
      ['from', 'bill_members'],
      ['select', 'share, status, paid, transaction_id, bills(id, title, total, occurred_on, status, categories(name), owner:users!bills_owner_id_fkey(display_name))'],
      ['eq', 'user_id', 'user-2'],
      ['order', 'created_at', { ascending: false }],
      ['limit', 50],
    ]);
  });

  it('reads one member share with the bill category, or null', async () => {
    const { supabase, calls } = fakeSupabase({
      data: { share: '150.00', bills: { title: 'ชาบู', categories: { name: 'อาหาร' } } },
      error: null,
    });

    expect(await createRepository(supabase).getBillShare(BILL, 'user-2')).toEqual({ share: 150, title: 'ชาบู', categoryName: 'อาหาร' });
    expect(calls).toEqual([
      ['from', 'bill_members'],
      ['select', 'share, bills(title, categories(name))'],
      ['eq', 'bill_id', BILL],
      ['eq', 'user_id', 'user-2'],
      ['maybeSingle'],
    ]);
    const missing = fakeSupabase({ data: null, error: null });
    expect(await createRepository(missing.supabase).getBillShare(BILL, 'user-2')).toBeNull();
  });

  it('confirms and declines through the SQL functions', async () => {
    const confirm = fakeSupabase({ data: 'confirmed', error: null });
    const decline = fakeSupabase({ data: 'cancelled', error: null });

    expect(await createRepository(confirm.supabase).confirmBillShare(BILL, 'user-2', 'c2')).toBe('confirmed');
    expect(confirm.calls).toEqual([['rpc', 'confirm_bill_share', { p_bill: BILL, p_user: 'user-2', p_category: 'c2' }]]);
    expect(await createRepository(decline.supabase).declineBillShare(BILL, 'user-2')).toBe('cancelled');
    expect(decline.calls).toEqual([['rpc', 'decline_bill_share', { p_bill: BILL, p_user: 'user-2' }]]);
  });

  it('cancels through the SQL function that also removes the owner expense', async () => {
    const cancelled = fakeSupabase({ data: true, error: null });
    const refused = fakeSupabase({ data: false, error: null });

    expect(await createRepository(cancelled.supabase).cancelBill(BILL, 'user-1')).toBe(true);
    expect(cancelled.calls).toEqual([['rpc', 'cancel_bill', { p_bill: BILL, p_owner: 'user-1' }]]);
    expect(await createRepository(refused.supabase).cancelBill(BILL, 'user-1')).toBe(false);
  });

  it('passes an earlier answer through as its own status', async () => {
    const confirm = fakeSupabase({ data: 'already_confirmed', error: null });
    const decline = fakeSupabase({ data: 'already_declined', error: null });

    expect(await createRepository(confirm.supabase).confirmBillShare(BILL, 'user-2', 'c2')).toBe('already_confirmed');
    expect(await createRepository(decline.supabase).declineBillShare(BILL, 'user-2')).toBe('already_declined');
  });

  it('checks the owner and sets the paid flag of one member', async () => {
    const owner = fakeSupabase({ data: { id: BILL }, error: null });
    const paid = fakeSupabase({ count: 1, error: null });

    expect(await createRepository(owner.supabase).isBillOwner(BILL, 'user-1')).toBe(true);
    expect(owner.calls).toEqual([['from', 'bills'], ['select', 'id'], ['eq', 'id', BILL], ['eq', 'owner_id', 'user-1'], ['maybeSingle']]);
    expect(await createRepository(paid.supabase).setBillMemberPaid(BILL, 'user-2', true)).toBe(true);
    expect(paid.calls).toEqual([
      ['from', 'bill_members'],
      ['update', { paid: true }, { count: 'exact' }],
      ['eq', 'bill_id', BILL],
      ['eq', 'user_id', 'user-2'],
    ]);
  });

  it('reports a member that is not in the bill as not marked paid', async () => {
    const { supabase } = fakeSupabase({ count: 0, error: null });

    expect(await createRepository(supabase).setBillMemberPaid(BILL, 'user-9', true)).toBe(false);
  });

  it('passes a cancelled bill through when confirming', async () => {
    const { supabase } = fakeSupabase({ data: 'cancelled', error: null });

    expect(await createRepository(supabase).confirmBillShare(BILL, 'user-2', 'c2')).toBe('cancelled');
  });

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
  });

  it('throws DatabaseError when a bill query fails', async () => {
    const failing = () => fakeSupabase({ data: null, count: null, error: { message: 'boom' } }).supabase;

    await expect(createRepository(failing()).createBill({ ownerId: 'u', title: 't', total: 1, occurredOn: '2026-10-08', categoryId: 'c', ownerShare: 0, members: [] })).rejects.toThrow('Database createBill failed: boom');
    await expect(createRepository(failing()).markBillMemberNotified(BILL, 'u')).rejects.toThrow('Database markBillMemberNotified failed: boom');
    await expect(createRepository(failing()).listOwnedBills('u')).rejects.toThrow('Database listOwnedBills failed: boom');
    await expect(createRepository(failing()).listIncomingBills('u')).rejects.toThrow('Database listIncomingBills failed: boom');
    await expect(createRepository(failing()).getBillShare(BILL, 'u')).rejects.toThrow('Database getBillShare failed: boom');
    await expect(createRepository(failing()).confirmBillShare(BILL, 'u', 'c')).rejects.toThrow('Database confirmBillShare failed: boom');
    await expect(createRepository(failing()).declineBillShare(BILL, 'u')).rejects.toThrow('Database declineBillShare failed: boom');
    await expect(createRepository(failing()).cancelBill(BILL, 'u')).rejects.toThrow('Database cancelBill failed: boom');
    await expect(createRepository(failing()).isBillOwner(BILL, 'u')).rejects.toThrow('Database isBillOwner failed: boom');
    await expect(createRepository(failing()).setBillMemberPaid(BILL, 'u', true)).rejects.toThrow('Database setBillMemberPaid failed: boom');
    await expect(createRepository(failing()).getLineUserIds(['u'])).rejects.toThrow('Database getLineUserIds failed: boom');
  });
});

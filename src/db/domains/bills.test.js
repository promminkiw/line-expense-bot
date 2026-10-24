import { describe, it, expect } from 'vitest';
import { createBillsRepository } from './bills.js';
import { fakeSupabase } from '../test-helpers.mjs';

describe('repository bills', () => {
  const BILL = 'b1';

  it('creates a bill through the create_bill function', async () => {
    const { supabase, calls } = fakeSupabase({ data: 'bill-1', error: null });

    const id = await createBillsRepository(supabase).createBill({
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

    expect(await createBillsRepository(supabase).markBillMemberNotified(BILL, 'user-2')).toBe(true);
    expect(calls).toEqual([
      ['from', 'bill_members'],
      ['update', { notified: true }, { count: 'exact' }],
      ['eq', 'bill_id', BILL],
      ['eq', 'user_id', 'user-2'],
    ]);
    const missing = fakeSupabase({ count: 0, error: null });
    expect(await createBillsRepository(missing.supabase).markBillMemberNotified(BILL, 'user-2')).toBe(false);
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

    expect(await createBillsRepository(supabase).listOwnedBills('user-1')).toEqual([
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

    const bills = await createBillsRepository(supabase).listIncomingBills('user-2');

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

    expect(await createBillsRepository(supabase).listIncomingBills('user-2')).toEqual([
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

    expect(await createBillsRepository(supabase).getBillShare(BILL, 'user-2')).toEqual({ share: 150, title: 'ชาบู', categoryName: 'อาหาร' });
    expect(calls).toEqual([
      ['from', 'bill_members'],
      ['select', 'share, bills(title, categories(name))'],
      ['eq', 'bill_id', BILL],
      ['eq', 'user_id', 'user-2'],
      ['maybeSingle'],
    ]);
    const missing = fakeSupabase({ data: null, error: null });
    expect(await createBillsRepository(missing.supabase).getBillShare(BILL, 'user-2')).toBeNull();
  });

  it('confirms and declines through the SQL functions', async () => {
    const confirm = fakeSupabase({ data: 'confirmed', error: null });
    const decline = fakeSupabase({ data: 'cancelled', error: null });

    expect(await createBillsRepository(confirm.supabase).confirmBillShare(BILL, 'user-2', 'c2')).toBe('confirmed');
    expect(confirm.calls).toEqual([['rpc', 'confirm_bill_share', { p_bill: BILL, p_user: 'user-2', p_category: 'c2' }]]);
    expect(await createBillsRepository(decline.supabase).declineBillShare(BILL, 'user-2')).toBe('cancelled');
    expect(decline.calls).toEqual([['rpc', 'decline_bill_share', { p_bill: BILL, p_user: 'user-2' }]]);
  });

  it('cancels through the SQL function that also removes the owner expense', async () => {
    const cancelled = fakeSupabase({ data: true, error: null });
    const refused = fakeSupabase({ data: false, error: null });

    expect(await createBillsRepository(cancelled.supabase).cancelBill(BILL, 'user-1')).toBe(true);
    expect(cancelled.calls).toEqual([['rpc', 'cancel_bill', { p_bill: BILL, p_owner: 'user-1' }]]);
    expect(await createBillsRepository(refused.supabase).cancelBill(BILL, 'user-1')).toBe(false);
  });

  it('passes an earlier answer through as its own status', async () => {
    const confirm = fakeSupabase({ data: 'already_confirmed', error: null });
    const decline = fakeSupabase({ data: 'already_declined', error: null });

    expect(await createBillsRepository(confirm.supabase).confirmBillShare(BILL, 'user-2', 'c2')).toBe('already_confirmed');
    expect(await createBillsRepository(decline.supabase).declineBillShare(BILL, 'user-2')).toBe('already_declined');
  });

  it('checks the owner and sets the paid flag of one member', async () => {
    const owner = fakeSupabase({ data: { id: BILL }, error: null });
    const paid = fakeSupabase({ count: 1, error: null });

    expect(await createBillsRepository(owner.supabase).isBillOwner(BILL, 'user-1')).toBe(true);
    expect(owner.calls).toEqual([['from', 'bills'], ['select', 'id'], ['eq', 'id', BILL], ['eq', 'owner_id', 'user-1'], ['maybeSingle']]);
    expect(await createBillsRepository(paid.supabase).setBillMemberPaid(BILL, 'user-2', true)).toBe(true);
    expect(paid.calls).toEqual([
      ['from', 'bill_members'],
      ['update', { paid: true }, { count: 'exact' }],
      ['eq', 'bill_id', BILL],
      ['eq', 'user_id', 'user-2'],
    ]);
  });

  it('reports a member that is not in the bill as not marked paid', async () => {
    const { supabase } = fakeSupabase({ count: 0, error: null });

    expect(await createBillsRepository(supabase).setBillMemberPaid(BILL, 'user-9', true)).toBe(false);
  });

  it('passes a cancelled bill through when confirming', async () => {
    const { supabase } = fakeSupabase({ data: 'cancelled', error: null });

    expect(await createBillsRepository(supabase).confirmBillShare(BILL, 'user-2', 'c2')).toBe('cancelled');
  });

  it('throws DatabaseError when a bill query fails', async () => {
    const failing = () => fakeSupabase({ data: null, count: null, error: { message: 'boom' } }).supabase;

    await expect(createBillsRepository(failing()).createBill({ ownerId: 'u', title: 't', total: 1, occurredOn: '2026-10-08', categoryId: 'c', ownerShare: 0, members: [] })).rejects.toThrow('Database createBill failed: boom');
    await expect(createBillsRepository(failing()).markBillMemberNotified(BILL, 'u')).rejects.toThrow('Database markBillMemberNotified failed: boom');
    await expect(createBillsRepository(failing()).listOwnedBills('u')).rejects.toThrow('Database listOwnedBills failed: boom');
    await expect(createBillsRepository(failing()).listIncomingBills('u')).rejects.toThrow('Database listIncomingBills failed: boom');
    await expect(createBillsRepository(failing()).getBillShare(BILL, 'u')).rejects.toThrow('Database getBillShare failed: boom');
    await expect(createBillsRepository(failing()).confirmBillShare(BILL, 'u', 'c')).rejects.toThrow('Database confirmBillShare failed: boom');
    await expect(createBillsRepository(failing()).declineBillShare(BILL, 'u')).rejects.toThrow('Database declineBillShare failed: boom');
    await expect(createBillsRepository(failing()).cancelBill(BILL, 'u')).rejects.toThrow('Database cancelBill failed: boom');
    await expect(createBillsRepository(failing()).isBillOwner(BILL, 'u')).rejects.toThrow('Database isBillOwner failed: boom');
    await expect(createBillsRepository(failing()).setBillMemberPaid(BILL, 'u', true)).rejects.toThrow('Database setBillMemberPaid failed: boom');
  });
});

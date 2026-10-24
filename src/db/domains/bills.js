const { throwIfError } = require('../errors');

// รายการบิลในหน้าเว็บแสดงเฉพาะของล่าสุด กันหน้าโหลดช้าเมื่อใช้ไปนาน
const BILL_LIST_LIMIT = 50;

function toOwnedBill(row) {
  return {
    id: row.id,
    title: row.title,
    total: Number(row.total),
    occurredOn: row.occurred_on,
    categoryName: row.categories ? row.categories.name : '',
    status: row.status,
    ownerShare: Number(row.owner_share),
    createdAt: row.created_at,
    members: (row.bill_members || []).map((member) => ({
      userId: member.user_id,
      displayName: member.users ? member.users.display_name : null,
      share: Number(member.share),
      status: member.status,
      paid: member.paid,
      notified: member.notified,
    })),
  };
}

function toIncomingBill(row) {
  const bill = row.bills;
  return {
    id: bill.id,
    title: bill.title,
    total: Number(bill.total),
    occurredOn: bill.occurred_on,
    categoryName: bill.categories ? bill.categories.name : '',
    status: bill.status,
    ownerName: bill.owner ? bill.owner.display_name : null,
    myShare: Number(row.share),
    myStatus: row.status,
    paid: row.paid,
    // null เมื่อยังไม่ยืนยัน หรือผู้ใช้ลบรายจ่ายนั้นไปแล้ว
    expenseRecorded: row.transaction_id !== null && row.transaction_id !== undefined,
  };
}

function createBillsRepository(supabase) {
  async function createBill({ ownerId, title, total, occurredOn, categoryId, ownerShare, members }) {
    const { data, error } = await supabase.rpc('create_bill', {
      p_owner: ownerId,
      p_title: title,
      p_total: total,
      p_category: categoryId,
      p_date: occurredOn,
      p_owner_share: ownerShare,
      p_members: members.map((member) => ({ user_id: member.userId, share: member.share })),
    });
    throwIfError('createBill', error);
    return data;
  }

  async function markBillMemberNotified(billId, userId) {
    const { count, error } = await supabase
      .from('bill_members')
      .update({ notified: true }, { count: 'exact' })
      .eq('bill_id', billId)
      .eq('user_id', userId);
    throwIfError('markBillMemberNotified', error);
    return count > 0;
  }

  async function listOwnedBills(ownerId) {
    const { data, error } = await supabase
      .from('bills')
      .select(
        'id, title, total, occurred_on, status, owner_share, created_at, categories(name), bill_members(user_id, share, status, paid, notified, users(display_name))'
      )
      .eq('owner_id', ownerId)
      .order('created_at', { ascending: false })
      .limit(BILL_LIST_LIMIT);
    throwIfError('listOwnedBills', error);
    return data.map(toOwnedBill);
  }

  async function listIncomingBills(userId) {
    const { data, error } = await supabase
      .from('bill_members')
      .select('share, status, paid, transaction_id, bills(id, title, total, occurred_on, status, categories(name), owner:users!bills_owner_id_fkey(display_name))')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(BILL_LIST_LIMIT);
    throwIfError('listIncomingBills', error);
    return data.map(toIncomingBill);
  }

  async function getBillShare(billId, userId) {
    const { data, error } = await supabase
      .from('bill_members')
      .select('share, bills(title, categories(name))')
      .eq('bill_id', billId)
      .eq('user_id', userId)
      .maybeSingle();
    throwIfError('getBillShare', error);
    if (!data) return null;
    const category = data.bills && data.bills.categories ? data.bills.categories.name : '';
    const title = data.bills ? data.bills.title : '';
    return { share: Number(data.share), title, categoryName: category };
  }

  async function confirmBillShare(billId, userId, categoryId) {
    const { data, error } = await supabase.rpc('confirm_bill_share', { p_bill: billId, p_user: userId, p_category: categoryId });
    throwIfError('confirmBillShare', error);
    return data;
  }

  async function declineBillShare(billId, userId) {
    const { data, error } = await supabase.rpc('decline_bill_share', { p_bill: billId, p_user: userId });
    throwIfError('declineBillShare', error);
    return data;
  }

  async function cancelBill(billId, ownerId) {
    const { data, error } = await supabase.rpc('cancel_bill', { p_bill: billId, p_owner: ownerId });
    throwIfError('cancelBill', error);
    return data === true;
  }

  async function isBillOwner(billId, ownerId) {
    const { data, error } = await supabase.from('bills').select('id').eq('id', billId).eq('owner_id', ownerId).maybeSingle();
    throwIfError('isBillOwner', error);
    return Boolean(data);
  }

  async function setBillMemberPaid(billId, userId, paid) {
    const { count, error } = await supabase
      .from('bill_members')
      .update({ paid }, { count: 'exact' })
      .eq('bill_id', billId)
      .eq('user_id', userId);
    throwIfError('setBillMemberPaid', error);
    return count > 0;
  }

  return {
    createBill,
    markBillMemberNotified,
    listOwnedBills,
    listIncomingBills,
    getBillShare,
    confirmBillShare,
    declineBillShare,
    cancelBill,
    isBillOwner,
    setBillMemberPaid,
  };
}

module.exports = { createBillsRepository };

const { lastDayOf, monthStartOf } = require('../recurring/schedule');
const { DatabaseError, throwIfError, UNIQUE_VIOLATION, FOREIGN_KEY_VIOLATION } = require('./errors');
const { createNotificationsRepository } = require('./domains/notifications');
const { createWalletsRepository } = require('./domains/wallets');
const { createCategoriesRepository } = require('./domains/categories');
const { createExportsRepository } = require('./domains/exports');
const { createPendingRepository } = require('./domains/pending');
const { createUsersRepository } = require('./domains/users');
const { createStatsRepository } = require('./domains/stats');
const { createTransactionsRepository } = require('./domains/transactions');
const { createGoalsRepository } = require('./domains/goals');

const RULE_COLUMNS = 'id, type, category_id, amount, note, day_of_month, active, last_run_on';
// กันงานรอบเดียวหนักเกินไป ที่เหลือจะถูกหยิบในรอบถัดไป
const DUE_RULE_BATCH = 500;
// รายการบิลในหน้าเว็บแสดงเฉพาะของล่าสุด กันหน้าโหลดช้าเมื่อใช้ไปนาน
const BILL_LIST_LIMIT = 50;

function toRule(row) {
  return {
    id: row.id,
    type: row.type,
    categoryId: row.category_id,
    amount: Number(row.amount),
    note: row.note,
    dayOfMonth: row.day_of_month,
    active: row.active,
    lastRunOn: row.last_run_on,
  };
}

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

function createRepository(supabase) {

  async function getFriendCode(userId) {
    const { data, error } = await supabase.from('users').select('friend_code').eq('id', userId).maybeSingle();
    throwIfError('getFriendCode', error);
    return data ? data.friend_code : null;
  }

  // รหัสชนกับของคนอื่นคืน taken ให้ผู้เรียกสุ่มใหม่ แทนการ throw
  // onlyIfEmpty กันหน้าที่เปิดพร้อมกันเขียนทับรหัสแรกที่อีกหน้าแสดงไปแล้ว
  async function setFriendCode(userId, code, { onlyIfEmpty = false } = {}) {
    let query = supabase.from('users').update({ friend_code: code }, { count: 'exact' }).eq('id', userId);
    if (onlyIfEmpty) {
      query = query.is('friend_code', null);
    }
    const { count, error } = await query;
    if (error && error.code === UNIQUE_VIOLATION) {
      return 'taken';
    }
    throwIfError('setFriendCode', error);
    return count > 0 ? 'set' : 'unchanged';
  }

  async function findUserByFriendCode(code) {
    const { data, error } = await supabase
      .from('users')
      .select('id, display_name')
      .eq('friend_code', code)
      .maybeSingle();
    throwIfError('findUserByFriendCode', error);
    return data ? { id: data.id, displayName: data.display_name } : null;
  }

  async function listFriends(userId) {
    const { data, error } = await supabase
      .from('friendships')
      .select('friend_id, friend:users!friendships_friend_id_fkey(display_name)')
      .eq('user_id', userId);
    throwIfError('listFriends', error);
    return data.map((row) => ({ id: row.friend_id, displayName: row.friend ? row.friend.display_name : null }));
  }

  // สองแถวอยู่ในคำสั่งเดียว จึงเกิดพร้อมกันหรือไม่เกิดเลย
  async function addFriendship(userId, friendId) {
    const rows = [
      { user_id: userId, friend_id: friendId },
      { user_id: friendId, friend_id: userId },
    ];
    // เรียงตาม user_id ให้การเพิ่มพร้อมกันสองฝั่งล็อกแถวลำดับเดียวกัน จะได้ไม่ deadlock
    rows.sort((a, b) => (a.user_id < b.user_id ? -1 : 1));
    const { error } = await supabase.from('friendships').upsert(
      rows,
      { onConflict: 'user_id,friend_id', ignoreDuplicates: true }
    );
    // อีกฝั่งถูกลบไประหว่างค้นหากับเพิ่ม ให้ผู้เรียกตอบว่าไม่พบแทน error ของระบบ
    if (error && error.code === FOREIGN_KEY_VIOLATION) {
      return false;
    }
    throwIfError('addFriendship', error);
    return true;
  }

  // ผู้เรียกต้องตรวจว่า friendId เป็น UUID ก่อน เพราะค่าถูกต่อเข้าไปในตัวกรอง or
  async function removeFriendship(userId, friendId) {
    const { count, error } = await supabase
      .from('friendships')
      .delete({ count: 'exact' })
      .or(`and(user_id.eq.${userId},friend_id.eq.${friendId}),and(user_id.eq.${friendId},friend_id.eq.${userId})`);
    throwIfError('removeFriendship', error);
    return count > 0;
  }

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

  async function getBudgetStatus(userId, month) {
    const { data, error } = await supabase.rpc('budget_status', { p_user_id: userId, p_month: `${month}-01` });
    throwIfError('getBudgetStatus', error);
    return data.map((row) => ({
      categoryId: row.category_id,
      category: row.category,
      budget: row.budget === null ? null : Number(row.budget),
      spent: Number(row.spent),
    }));
  }

  // เดือนก่อนหน้ายังใช้งบเดิม ส่วนแถวของเดือนหลังลบทิ้งเพื่อไม่ให้บังค่าที่เพิ่งตั้ง
  async function setBudget({ userId, categoryId, month, amount }) {
    const monthStart = `${month}-01`;
    const { error } = await supabase
      .from('budgets')
      .upsert(
        { user_id: userId, category_id: categoryId, month: monthStart, amount },
        { onConflict: 'user_id,category_id,month' }
      );
    throwIfError('setBudget', error);
    const { error: clearError } = await supabase
      .from('budgets')
      .delete()
      .eq('user_id', userId)
      .eq('category_id', categoryId)
      .gt('month', monthStart);
    throwIfError('setBudgetClearLater', clearError);
  }


  async function listRecurringRules(userId) {
    const { data, error } = await supabase
      .from('recurring_rules')
      .select(RULE_COLUMNS)
      .eq('user_id', userId)
      .order('day_of_month')
      .order('created_at');
    throwIfError('listRecurringRules', error);
    return data.map(toRule);
  }

  async function createRecurringRule({ userId, type, categoryId, amount, note, dayOfMonth, active, lastRunOn }) {
    const { data, error } = await supabase
      .from('recurring_rules')
      .insert({
        user_id: userId,
        type,
        category_id: categoryId,
        amount,
        note,
        day_of_month: dayOfMonth,
        active,
        last_run_on: lastRunOn,
      })
      .select(RULE_COLUMNS)
      .single();
    throwIfError('createRecurringRule', error);
    return toRule(data);
  }

  async function updateRecurringRule(userId, id, fields) {
    const { data, error } = await supabase
      .from('recurring_rules')
      .update({
        type: fields.type,
        category_id: fields.categoryId,
        amount: fields.amount,
        note: fields.note,
        day_of_month: fields.dayOfMonth,
        active: fields.active,
        last_run_on: fields.lastRunOn,
      })
      .eq('user_id', userId)
      .eq('id', id)
      .select('id');
    throwIfError('updateRecurringRule', error);
    return data.length > 0;
  }

  async function deleteRecurringRule(userId, id) {
    const { count, error } = await supabase
      .from('recurring_rules')
      .delete({ count: 'exact' })
      .eq('user_id', userId)
      .eq('id', id);
    throwIfError('deleteRecurringRule', error);
    return count > 0;
  }

  // กรองใน SQL ให้เหลือเฉพาะกฎที่ยังไม่ทำเดือนนี้และถึงวันแล้ว วันสุดท้ายของเดือนไม่กรองวัน เพื่อเก็บกฎวันที่ 29-31
  async function listDueRecurringRules(today) {
    const todayDay = Number(today.slice(8, 10));
    let query = supabase
      .from('recurring_rules')
      .select(`${RULE_COLUMNS}, user_id, users(line_user_id), categories(name)`)
      .eq('active', true)
      .or(`last_run_on.is.null,last_run_on.lt.${monthStartOf(today)}`);
    if (todayDay < lastDayOf(today)) {
      query = query.lte('day_of_month', todayDay);
    }
    const { data, error } = await query.order('created_at').limit(DUE_RULE_BATCH);
    throwIfError('listDueRecurringRules', error);
    return data.map((row) => ({
      ...toRule(row),
      userId: row.user_id,
      lineUserId: row.users.line_user_id,
      categoryName: row.categories.name,
    }));
  }

  async function applyRecurringRule({ ruleId, dueOn, eventId }) {
    const { data, error } = await supabase.rpc('apply_recurring_rule', {
      p_rule_id: ruleId,
      p_due: dueOn,
      p_event_id: eventId,
    });
    throwIfError('applyRecurringRule', error);
    return data === true;
  }

  return {
    ...createNotificationsRepository(supabase),
    ...createUsersRepository(supabase),
    ...createExportsRepository(supabase),
    ...createPendingRepository(supabase),
    ...createWalletsRepository(supabase),
    ...createCategoriesRepository(supabase),
    ...createStatsRepository(supabase),
    ...createTransactionsRepository(supabase),
    ...createGoalsRepository(supabase),
    listRecurringRules,
    createRecurringRule,
    updateRecurringRule,
    deleteRecurringRule,
    listDueRecurringRules,
    applyRecurringRule,
    getFriendCode,
    setFriendCode,
    findUserByFriendCode,
    listFriends,
    addFriendship,
    removeFriendship,
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
    getBudgetStatus,
    setBudget,
  };
}

module.exports = { createRepository, DatabaseError };

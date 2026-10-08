const { DEFAULT_CATEGORIES } = require('../parser/categories');
const { categoryKey } = require('./transaction-rows');
const { lastDayOf, monthStartOf } = require('../recurring/schedule');

const TRANSACTION_COLUMNS = 'id, type, amount, note, occurred_on, category_id';
// PostgREST ตัดผลลัพธ์ตาม max-rows (ค่าเริ่มต้นของ Supabase คือ 1000) จึงต้องอ่านทีละหน้าเมื่อต้องการครบทุกแถว
const EXPORT_PAGE_SIZE = 1000;
const EXPORT_COLUMNS = `${TRANSACTION_COLUMNS}, created_at`;
const RULE_COLUMNS = 'id, type, category_id, amount, note, day_of_month, active, last_run_on';
// กันงานรอบเดียวหนักเกินไป ที่เหลือจะถูกหยิบในรอบถัดไป
const DUE_RULE_BATCH = 500;

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

// แปลงเป็น number เผื่อไว้ ให้ได้ชนิดเดียวกันเสมอไม่ว่า PostgREST จะส่งแบบไหน
function toTransaction(row) {
  return {
    id: row.id,
    type: row.type,
    amount: Number(row.amount),
    note: row.note,
    occurredOn: row.occurred_on,
    categoryId: row.category_id,
  };
}

// เทียบ created_at เป็นเวลาแทนข้อความ เพราะ Postgres ตัดเลขศูนย์ท้ายทศนิยมวินาทีทิ้ง
function compareOldestFirst(a, b) {
  if (a.occurred_on !== b.occurred_on) return a.occurred_on < b.occurred_on ? -1 : 1;
  const created = Date.parse(a.created_at) - Date.parse(b.created_at);
  if (created !== 0) return created;
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}

const SAFE_CAUSE_FIELDS = ['message', 'code', 'hint'];

class DatabaseError extends Error {
  constructor(operation, cause) {
    super(`Database ${operation} failed: ${cause.message}`);
    this.name = 'DatabaseError';
    // details ของ Postgres อาจมีแถวที่พัง (ยอดเงิน โน้ต) จึงเก็บเฉพาะ field ที่ปลอดภัย
    this.cause = Object.fromEntries(
      SAFE_CAUSE_FIELDS.filter((field) => cause[field] !== undefined).map((field) => [field, cause[field]]),
    );
  }
}

function throwIfError(operation, error) {
  if (error) {
    throw new DatabaseError(operation, error);
  }
}

function createRepository(supabase) {
  async function findUserIdByLineId(lineUserId) {
    const { data, error } = await supabase
      .from('users')
      .select('id')
      .eq('line_user_id', lineUserId)
      .maybeSingle();
    throwIfError('findUserIdByLineId', error);
    return data ? data.id : null;
  }

  async function createUser({ lineUserId, displayName }) {
    // upsert กันกรณี event แรกของผู้ใช้ใหม่มาพร้อมกันหลายอัน
    const { data, error } = await supabase
      .from('users')
      .upsert({ line_user_id: lineUserId, display_name: displayName }, { onConflict: 'line_user_id' })
      .select('id')
      .single();
    throwIfError('createUser', error);
    return data.id;
  }

  async function seedDefaultCategories(userId) {
    const rows = Object.entries(DEFAULT_CATEGORIES).flatMap(([type, names]) =>
      names.map((name) => ({ user_id: userId, type, name }))
    );
    const { error } = await supabase
      .from('categories')
      .upsert(rows, { onConflict: 'user_id,type,name', ignoreDuplicates: true });
    throwIfError('seedDefaultCategories', error);
  }

  async function getCategoryIds(userId) {
    const { data, error } = await supabase
      .from('categories')
      .select('id, type, name')
      .eq('user_id', userId);
    throwIfError('getCategoryIds', error);
    return new Map(data.map((row) => [categoryKey(row.type, row.name), row.id]));
  }

  async function claimEvent(webhookEventId, userId) {
    // ignoreDuplicates คืนเฉพาะแถวที่เพิ่ง insert ได้ แถวว่างแปลว่าเคยประมวลผลแล้ว
    const { data, error } = await supabase
      .from('line_events')
      .upsert(
        { webhook_event_id: webhookEventId, user_id: userId },
        { onConflict: 'webhook_event_id', ignoreDuplicates: true }
      )
      .select('webhook_event_id');
    throwIfError('claimEvent', error);
    return data.length > 0;
  }

  // คืน id ตามลำดับแถวที่ใส่ ใช้ทำลิงก์จากการ์ดไปหน้าแก้ไข
  async function insertTransactions(rows) {
    const { data, error } = await supabase.from('transactions').insert(rows).select('id');
    throwIfError('insertTransactions', error);
    return (data ?? []).map((row) => row.id);
  }

  async function deleteTransactionsByEvent(userId, webhookEventId) {
    const { count, error } = await supabase
      .from('transactions')
      .delete({ count: 'exact' })
      .eq('user_id', userId)
      .eq('line_event_id', webhookEventId);
    throwIfError('deleteTransactionsByEvent', error);
    return count;
  }

  async function getPendingClarification(userId) {
    const { data, error } = await supabase
      .from('pending_clarifications')
      .select('messages, updated_at')
      .eq('user_id', userId)
      .maybeSingle();
    throwIfError('getPendingClarification', error);
    return data ? { messages: data.messages, updatedAt: data.updated_at } : null;
  }

  async function savePendingClarification(userId, messages) {
    // ส่ง updated_at เองทุกครั้ง เพราะค่า default ใช้ตอน insert เท่านั้น ไม่ใช้ตอน upsert ทับแถวเดิม
    const { error } = await supabase
      .from('pending_clarifications')
      .upsert(
        { user_id: userId, messages, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      );
    throwIfError('savePendingClarification', error);
  }

  async function clearPendingClarification(userId) {
    const { error } = await supabase.from('pending_clarifications').delete().eq('user_id', userId);
    throwIfError('clearPendingClarification', error);
  }

  async function savePendingSlip(userId, webhookEventId, items) {
    const { data, error } = await supabase
      .from('pending_slips')
      .insert({ user_id: userId, line_event_id: webhookEventId, items })
      .select('id')
      .single();
    throwIfError('savePendingSlip', error);
    return data.id;
  }

  // delete พร้อมคืนแถวในคำสั่งเดียว กันกดบันทึกซ้ำสองครั้งพร้อมกัน
  async function claimPendingSlip(userId, slipId, sinceIso) {
    const { data, error } = await supabase
      .from('pending_slips')
      .delete()
      .eq('id', slipId)
      .eq('user_id', userId)
      .gte('created_at', sinceIso)
      .select('line_event_id, items')
      .maybeSingle();
    throwIfError('claimPendingSlip', error);
    return data ? { webhookEventId: data.line_event_id, items: data.items } : null;
  }

  async function deleteExpiredPendingSlips(userId, beforeIso) {
    const { error } = await supabase
      .from('pending_slips')
      .delete()
      .eq('user_id', userId)
      .lte('created_at', beforeIso);
    throwIfError('deleteExpiredPendingSlips', error);
  }

  // งานกวาดทั้งระบบ ไม่กรอง user (ใช้ service role)
  async function deleteAllExpiredPendingSlips(beforeIso) {
    const { error } = await supabase.from('pending_slips').delete().lte('created_at', beforeIso);
    throwIfError('deleteAllExpiredPendingSlips', error);
  }

  async function summarizeTransactions(userId, from, to) {
    const { data, error } = await supabase.rpc('summarize_transactions', {
      p_user_id: userId,
      p_from: from,
      p_to: to,
    });
    throwIfError('summarizeTransactions', error);
    // แปลงเป็น number เผื่อไว้ ให้ได้ชนิดเดียวกันเสมอไม่ว่า PostgREST จะส่งแบบไหน
    return data.map((row) => ({
      type: row.type,
      category: row.category,
      total: Number(row.total),
      entryCount: Number(row.entry_count),
    }));
  }

  async function getLifetimeTotals(userId) {
    const { data, error } = await supabase.rpc('lifetime_totals', { p_user_id: userId });
    throwIfError('getLifetimeTotals', error);
    // aggregate คืนหนึ่งแถวเสมอ แต่กันไว้เผื่อผลว่าง
    const row = data[0] || {};
    return {
      income: Number(row.income ?? 0),
      expense: Number(row.expense ?? 0),
      entryCount: Number(row.entry_count ?? 0),
      firstDate: row.first_date ?? null,
    };
  }

  async function getMonthlyTotals(userId, from, to) {
    const { data, error } = await supabase.rpc('monthly_totals', { p_user_id: userId, p_from: from, p_to: to });
    throwIfError('getMonthlyTotals', error);
    return data.map((row) => ({ month: row.month, type: row.type, total: Number(row.total) }));
  }

  async function getDisplayName(userId) {
    const { data, error } = await supabase.from('users').select('display_name').eq('id', userId).maybeSingle();
    throwIfError('getDisplayName', error);
    return data ? data.display_name : null;
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

  async function listTransactions(userId, from, to) {
    const { data, count, error } = await supabase
      .from('transactions')
      .select(TRANSACTION_COLUMNS, { count: 'exact' })
      .eq('user_id', userId)
      .gte('occurred_on', from)
      .lte('occurred_on', to)
      .order('occurred_on', { ascending: false })
      .order('created_at', { ascending: false });
    throwIfError('listTransactions', error);
    return { transactions: data.map(toTransaction), totalCount: count };
  }

  async function listAllTransactions(userId, from, to) {
    const rows = [];
    let lastId = null;
    for (;;) {
      // keyset ด้วย id แทน offset: แถวที่ถูกลบหรือเพิ่มระหว่างหน้าจะไม่ทำให้แถวอื่นซ้ำหรือหาย
      let query = supabase
        .from('transactions')
        .select(EXPORT_COLUMNS)
        .eq('user_id', userId)
        .gte('occurred_on', from)
        .lte('occurred_on', to);
      if (lastId !== null) query = query.gt('id', lastId);
      const { data, error } = await query.order('id', { ascending: true }).limit(EXPORT_PAGE_SIZE);
      throwIfError('listAllTransactions', error);
      // หยุดที่หน้าว่างเท่านั้น เพราะ server อาจตั้ง max-rows ต่ำกว่า 1000 แล้วหน้าสั้นลงทั้งที่ยังไม่หมด
      if (data.length === 0) break;
      rows.push(...data);
      lastId = data[data.length - 1].id;
    }
    rows.sort(compareOldestFirst);
    return rows.map(toTransaction);
  }


  async function deleteExpiredExportLinks(userId, nowIso) {
    const { error } = await supabase
      .from('export_links')
      .delete()
      .eq('user_id', userId)
      .lte('expires_at', nowIso);
    throwIfError('deleteExpiredExportLinks', error);
  }

  async function createExportLink({ tokenHash, userId, month, expiresAt }) {
    const { error } = await supabase
      .from('export_links')
      .insert({ token_hash: tokenHash, user_id: userId, month, expires_at: expiresAt });
    throwIfError('createExportLink', error);
  }

  // update แบบมีเงื่อนไขในคำสั่งเดียว กันลิงก์เดียวถูกใช้สองครั้งพร้อมกัน
  async function claimExportLink(tokenHash, nowIso) {
    const { data, error } = await supabase
      .from('export_links')
      .update({ used_at: nowIso })
      .eq('token_hash', tokenHash)
      .is('used_at', null)
      .gt('expires_at', nowIso)
      .select('user_id, month');
    throwIfError('claimExportLink', error);
    return data.length > 0 ? { userId: data[0].user_id, month: data[0].month } : null;
  }

  async function listCategories(userId) {
    const { data, error } = await supabase
      .from('categories')
      .select('id, name, type')
      .eq('user_id', userId)
      .order('type')
      .order('name');
    throwIfError('listCategories', error);
    return data.map((row) => ({ id: row.id, name: row.name, type: row.type }));
  }

  async function updateTransaction(userId, id, fields) {
    // select('id') ทำให้รู้ว่ามีแถวถูกแก้จริงไหม
    const { data, error } = await supabase
      .from('transactions')
      .update({
        type: fields.type,
        amount: fields.amount,
        category_id: fields.categoryId,
        occurred_on: fields.occurredOn,
        note: fields.note,
      })
      .eq('user_id', userId)
      .eq('id', id)
      .select('id');
    throwIfError('updateTransaction', error);
    return data.length > 0;
  }

  async function deleteTransaction(userId, id) {
    const { count, error } = await supabase
      .from('transactions')
      .delete({ count: 'exact' })
      .eq('user_id', userId)
      .eq('id', id);
    throwIfError('deleteTransaction', error);
    return count > 0;
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
    listTransactions,
    listAllTransactions,
    createExportLink,
    deleteExpiredExportLinks,
    claimExportLink,
    listCategories,
    updateTransaction,
    deleteTransaction,
    listRecurringRules,
    createRecurringRule,
    updateRecurringRule,
    deleteRecurringRule,
    listDueRecurringRules,
    applyRecurringRule,
    summarizeTransactions,
    getLifetimeTotals,
    getMonthlyTotals,
    getDisplayName,
    getBudgetStatus,
    setBudget,
    getPendingClarification,
    savePendingClarification,
    clearPendingClarification,
    savePendingSlip,
    claimPendingSlip,
    deleteExpiredPendingSlips,
    deleteAllExpiredPendingSlips,
    findUserIdByLineId,
    createUser,
    seedDefaultCategories,
    getCategoryIds,
    claimEvent,
    insertTransactions,
    deleteTransactionsByEvent,
  };
}

module.exports = { createRepository, DatabaseError };

const { DEFAULT_CATEGORIES } = require('../parser/categories');
const { categoryKey } = require('./transaction-rows');

const TRANSACTION_COLUMNS = 'id, type, amount, note, occurred_on, category_id';
// PostgREST ตัดผลลัพธ์ตาม max-rows (ค่าเริ่มต้นของ Supabase คือ 1000) จึงต้องอ่านทีละหน้าเมื่อต้องการครบทุกแถว
const EXPORT_PAGE_SIZE = 1000;

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

class DatabaseError extends Error {
  constructor(operation, cause) {
    super(`Database ${operation} failed: ${cause.message}`);
    this.name = 'DatabaseError';
    this.cause = cause;
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

  async function insertTransactions(rows) {
    const { error } = await supabase.from('transactions').insert(rows);
    throwIfError('insertTransactions', error);
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
    let total = null;
    for (;;) {
      const start = rows.length;
      const table = supabase.from('transactions');
      // ขอ count แค่หน้าแรก ถ้าขอทุกหน้าแล้วมีคนลบแถวระหว่างหน้า PostgREST จะตอบ 416 แทนหน้าว่าง
      const query = start === 0 ? table.select(TRANSACTION_COLUMNS, { count: 'exact' }) : table.select(TRANSACTION_COLUMNS);
      // เรียงด้วย id ด้วยเพื่อให้ลำดับคงที่ระหว่างหน้า
      const { data, count, error } = await query
        .eq('user_id', userId)
        .gte('occurred_on', from)
        .lte('occurred_on', to)
        .order('occurred_on', { ascending: true })
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(start, start + EXPORT_PAGE_SIZE - 1);
      throwIfError('listAllTransactions', error);
      if (start === 0) total = count;
      rows.push(...data.map(toTransaction));
      // เทียบกับจำนวนทั้งหมดแทนขนาดหน้า เพราะ server อาจตั้ง max-rows ต่ำกว่า 1000 แล้วหน้าสั้นลงทั้งที่ยังไม่หมด
      if (data.length === 0 || (typeof total === 'number' && rows.length >= total)) {
        return rows;
      }
    }
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

  return {
    listTransactions,
    listAllTransactions,
    createExportLink,
    deleteExpiredExportLinks,
    claimExportLink,
    listCategories,
    updateTransaction,
    deleteTransaction,
    summarizeTransactions,
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

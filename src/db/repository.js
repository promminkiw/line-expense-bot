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
    for (let start = 0; ; start += EXPORT_PAGE_SIZE) {
      // เรียงด้วย id ด้วยเพื่อให้ลำดับคงที่ระหว่างหน้า
      const { data, error } = await supabase
        .from('transactions')
        .select(TRANSACTION_COLUMNS)
        .eq('user_id', userId)
        .gte('occurred_on', from)
        .lte('occurred_on', to)
        .order('occurred_on', { ascending: true })
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(start, start + EXPORT_PAGE_SIZE - 1);
      throwIfError('listAllTransactions', error);
      rows.push(...data.map(toTransaction));
      if (data.length < EXPORT_PAGE_SIZE) {
        return rows;
      }
    }
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
    claimExportLink,
    listCategories,
    updateTransaction,
    deleteTransaction,
    summarizeTransactions,
    getPendingClarification,
    savePendingClarification,
    clearPendingClarification,
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

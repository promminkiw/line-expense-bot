const { DEFAULT_CATEGORIES } = require('../parser/categories');
const { categoryKey } = require('./transaction-rows');

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

  return {
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

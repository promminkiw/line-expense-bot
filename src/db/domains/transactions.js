const { throwIfError } = require('../errors');

const TRANSACTION_COLUMNS = 'id, type, amount, note, occurred_on, category_id, wallet_id';
// PostgREST ตัดผลลัพธ์ตาม max-rows (ค่าเริ่มต้นของ Supabase คือ 1000) จึงต้องอ่านทีละหน้าเมื่อต้องการครบทุกแถว
const EXPORT_PAGE_SIZE = 1000;
const EXPORT_COLUMNS = `${TRANSACTION_COLUMNS}, created_at`;

// แปลงเป็น number เผื่อไว้ ให้ได้ชนิดเดียวกันเสมอไม่ว่า PostgREST จะส่งแบบไหน
function toTransaction(row) {
  return {
    id: row.id,
    type: row.type,
    amount: Number(row.amount),
    note: row.note,
    occurredOn: row.occurred_on,
    categoryId: row.category_id,
    // null คือกระเป๋าตั้งต้น
    walletId: row.wallet_id ?? null,
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

function createTransactionsRepository(supabase) {
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

  async function updateTransaction(userId, id, fields) {
    const changes = {
      type: fields.type,
      amount: fields.amount,
      category_id: fields.categoryId,
      occurred_on: fields.occurredOn,
      note: fields.note,
    };
    // ไม่ส่ง walletId คือไม่แตะกระเป๋าเดิม หน้าเว็บรุ่นเก่าที่ยังไม่รู้จักกระเป๋าจะได้ไม่ล้างค่า
    if (fields.walletId !== undefined) changes.wallet_id = fields.walletId;
    // select('id') ทำให้รู้ว่ามีแถวถูกแก้จริงไหม
    const { data, error } = await supabase
      .from('transactions')
      .update(changes)
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
    claimEvent,
    insertTransactions,
    deleteTransactionsByEvent,
    listTransactions,
    listAllTransactions,
    updateTransaction,
    deleteTransaction,
  };
}

module.exports = { createTransactionsRepository };

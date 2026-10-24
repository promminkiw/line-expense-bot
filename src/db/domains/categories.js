const { throwIfError, UNIQUE_VIOLATION } = require('../errors');
const { DEFAULT_CATEGORIES } = require('../../parser/categories');
const { categoryKey } = require('../transaction-rows');

const CATEGORY_COLUMNS = 'id, name, type, hidden, icon';

function toCategory(row) {
  return { id: row.id, name: row.name, type: row.type, hidden: row.hidden, icon: row.icon ?? null };
}

function createCategoriesRepository(supabase) {
  async function seedDefaultCategories(userId, categories = DEFAULT_CATEGORIES) {
    const rows = Object.entries(categories).flatMap(([type, names]) =>
      names.map((name) => ({ user_id: userId, type, name }))
    );
    const { error } = await supabase
      .from('categories')
      .upsert(rows, { onConflict: 'user_id,type,name', ignoreDuplicates: true });
    throwIfError('seedDefaultCategories', error);
  }

  async function getCategoryIds(userId, { visibleOnly = false } = {}) {
    const query = supabase.from('categories').select('id, type, name').eq('user_id', userId);
    const { data, error } = await (visibleOnly ? query.eq('hidden', false) : query);
    throwIfError('getCategoryIds', error);
    return new Map(data.map((row) => [categoryKey(row.type, row.name), row.id]));
  }

  async function listCategories(userId) {
    const { data, error } = await supabase
      .from('categories')
      .select(CATEGORY_COLUMNS)
      .eq('user_id', userId)
      .order('type')
      .order('name');
    throwIfError('listCategories', error);
    return data.map(toCategory);
  }

  // ชื่อซ้ำในประเภทเดียวกันชน unique (user_id, type, name) จึงคืน duplicate ให้ API ตอบ 409
  async function createCategory(userId, { type, name, icon }) {
    const row = { user_id: userId, type, name };
    // ใส่ icon เฉพาะเมื่อส่งมา เพื่อไม่ทับค่า default ของ DB
    if (icon !== undefined) row.icon = icon;
    const { data, error } = await supabase
      .from('categories')
      .insert(row)
      .select(CATEGORY_COLUMNS)
      .single();
    if (error && error.code === UNIQUE_VIOLATION) {
      return { status: 'duplicate' };
    }
    throwIfError('createCategory', error);
    return { status: 'ok', category: toCategory(data) };
  }

  async function updateCategory(userId, id, fields) {
    const changes = {};
    if (fields.name !== undefined) changes.name = fields.name;
    if (fields.hidden !== undefined) changes.hidden = fields.hidden;
    if (fields.icon !== undefined) changes.icon = fields.icon;
    const { data, error } = await supabase
      .from('categories')
      .update(changes)
      .eq('user_id', userId)
      .eq('id', id)
      .select(CATEGORY_COLUMNS);
    if (error && error.code === UNIQUE_VIOLATION) {
      return { status: 'duplicate' };
    }
    throwIfError('updateCategory', error);
    return data.length > 0 ? { status: 'ok', category: toCategory(data[0]) } : { status: 'not_found' };
  }

  async function deleteCategory(userId, id) {
    const { data, error } = await supabase.rpc('delete_category', { p_user: userId, p_category: id });
    throwIfError('deleteCategory', error);
    return data;
  }

  // ใช้บอกผู้ใช้ก่อนยืนยันว่าจะมีกี่แถวย้ายไปหมวด อื่นๆ
  async function countCategoryUsage(userId, id) {
    const count = (table, ownerColumn) =>
      supabase.from(table).select('id', { count: 'exact', head: true }).eq(ownerColumn, userId).eq('category_id', id);
    const results = await Promise.all([count('transactions', 'user_id'), count('recurring_rules', 'user_id'), count('bills', 'owner_id')]);
    for (const { error } of results) throwIfError('countCategoryUsage', error);
    const [transactions, recurring, bills] = results.map((result) => result.count);
    return { transactions, recurring, bills };
  }

  return {
    seedDefaultCategories,
    getCategoryIds,
    listCategories,
    createCategory,
    updateCategory,
    deleteCategory,
    countCategoryUsage,
  };
}

module.exports = { createCategoriesRepository };

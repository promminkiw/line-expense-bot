const { throwIfError } = require('../errors');

function createBudgetsRepository(supabase) {
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

  return {
    getBudgetStatus,
    setBudget,
  };
}

module.exports = { createBudgetsRepository };

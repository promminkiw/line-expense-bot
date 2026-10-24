const { throwIfError } = require('../errors');

function createStatsRepository(supabase) {
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

  async function queryTotals(userId, { from, to, type, category, keyword, wallet }) {
    const { data, error } = await supabase.rpc('query_totals', {
      p_user_id: userId,
      p_from: from,
      p_to: to,
      p_type: type,
      p_category: category,
      p_keyword: keyword,
      p_wallet: wallet ?? '',
    });
    throwIfError('queryTotals', error);
    return data.map((row) => ({ type: row.type, total: Number(row.total), entryCount: Number(row.entry_count) }));
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

  return {
    summarizeTransactions,
    queryTotals,
    getLifetimeTotals,
    getMonthlyTotals,
  };
}

module.exports = { createStatsRepository };

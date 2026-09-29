const TOP_EXPENSE_COUNT = 5;

// รวมเป็นสตางค์ (จำนวนเต็ม) เพื่อไม่ให้ทศนิยมของ JavaScript คลาดเคลื่อน
function toSatang(baht) {
  return Math.round(Number(baht) * 100);
}

function buildSummary(rows, label) {
  let income = 0;
  let expense = 0;
  let entryCount = 0;
  const expenses = [];
  for (const row of rows) {
    const satang = toSatang(row.total);
    entryCount += row.entryCount;
    if (row.type === 'income') {
      income += satang;
    } else {
      expense += satang;
      expenses.push({ category: row.category, satang });
    }
  }
  expenses.sort((a, b) => b.satang - a.satang || a.category.localeCompare(b.category));
  const other = expenses.slice(TOP_EXPENSE_COUNT).reduce((sum, entry) => sum + entry.satang, 0);

  return {
    label,
    incomeTotal: income / 100,
    expenseTotal: expense / 100,
    net: (income - expense) / 100,
    topExpenses: expenses
      .slice(0, TOP_EXPENSE_COUNT)
      .map((entry) => ({ category: entry.category, total: entry.satang / 100 })),
    otherExpenseTotal: other / 100,
    entryCount,
  };
}

module.exports = { buildSummary };

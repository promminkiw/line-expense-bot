const TREND_MONTHS = 6;

// ใช้ UTC ล้วนเพื่อไม่ให้ timezone ของเครื่องทำให้เดือนเลื่อน
function monthsEndingAt(month, count = TREND_MONTHS) {
  const [year, value] = month.split('-').map(Number);
  const months = [];
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const date = new Date(Date.UTC(year, value - 1 - offset, 1));
    months.push(`${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return months;
}

function buildTrend(month, rows) {
  const byMonth = new Map(monthsEndingAt(month).map((key) => [key, { month: key, income: 0, expense: 0 }]));
  for (const row of rows) {
    const entry = byMonth.get(row.month);
    if (entry && (row.type === 'income' || row.type === 'expense')) {
      entry[row.type] = row.total;
    }
  }
  return [...byMonth.values()];
}

module.exports = { TREND_MONTHS, monthsEndingAt, buildTrend };

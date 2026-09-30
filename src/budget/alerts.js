const { formatAmount } = require('../parser/format-reply');

// เทียบเป็นสตางค์แบบจำนวนเต็ม กันทศนิยมของ float ทำให้ข้ามเส้นผิด
function toSatang(amount) {
  return Math.round(amount * 100);
}

function monthOf(isoDate) {
  return isoDate.slice(0, 7);
}

function budgetMonths(rows) {
  return [...new Set(rows.filter((row) => row.type === 'expense').map((row) => monthOf(row.occurred_on)))];
}

function findBudgetAlerts(rows, statusByMonth) {
  // เก็บเฉพาะคู่เดือน+หมวดที่ข้อความนี้แตะ เพื่อให้ได้ alert เดียวต่อคู่
  const touched = new Set();
  for (const row of rows) {
    if (row.type !== 'expense') continue;
    touched.add(`${monthOf(row.occurred_on)}|${row.category_id}`);
  }
  const alerts = [];
  for (const key of touched) {
    const [month, categoryId] = key.split('|');
    const status = (statusByMonth.get(month) || []).find((item) => item.categoryId === categoryId);
    if (!status || status.budget === null) continue;
    const budget = toSatang(status.budget);
    const spent = toSatang(status.spent);
    // เตือนทุกครั้งที่บันทึกขณะยอดรวมถึงเส้น ไม่ดูว่าก่อนหน้าข้ามเส้นมาหรือยัง
    let level = null;
    if (spent >= budget) {
      level = 'over';
    } else if (spent * 5 >= budget * 4) {
      level = 'warn';
    }
    if (level) {
      alerts.push({ level, month, category: status.category, spent: status.spent, budget: status.budget });
    }
  }
  return alerts;
}

function formatBudgetAlerts(alerts) {
  return alerts
    .map((alert) => {
      const [year, month] = alert.month.split('-');
      const percent = Math.floor((toSatang(alert.spent) * 100) / toSatang(alert.budget));
      const label = alert.level === 'over' ? 'เกินงบ' : 'ใกล้เต็มงบ';
      return `${label} ${alert.category} เดือน ${month}/${year}: ใช้ไป ${formatAmount(alert.spent)} จาก ${formatAmount(alert.budget)} บาท (${percent}%)`;
    })
    .join('\n');
}

module.exports = { budgetMonths, findBudgetAlerts, formatBudgetAlerts };

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
  const added = new Map();
  for (const row of rows) {
    if (row.type !== 'expense') continue;
    const key = `${monthOf(row.occurred_on)}|${row.category_id}`;
    added.set(key, (added.get(key) || 0) + toSatang(row.amount));
  }
  const alerts = [];
  for (const [key, addedSatang] of added) {
    const [month, categoryId] = key.split('|');
    const status = (statusByMonth.get(month) || []).find((item) => item.categoryId === categoryId);
    if (!status || status.budget === null) continue;
    const budget = toSatang(status.budget);
    const after = toSatang(status.spent);
    // ยอดจาก SQL นับรายการที่เพิ่งบันทึกแล้ว ยอดก่อนหน้าจึงต้องหักออก
    const before = after - addedSatang;
    // เตือนเฉพาะข้อความที่ทำให้ข้ามเส้น รายการถัดไปจึงไม่เตือนซ้ำโดยไม่ต้องเก็บสถานะ
    let level = null;
    if (before < budget && after >= budget) {
      level = 'over';
    } else if (before * 5 < budget * 4 && after * 5 >= budget * 4) {
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

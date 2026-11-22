const { formatAmount } = require('../parser/format-reply');
const { displayCategoryName } = require('../parser/categories');
const { t } = require('../i18n');

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
    // งบ 0 บาทเทียบเป็นเปอร์เซ็นต์ไม่ได้ จึงถือว่าไม่ได้ตั้งงบ
    if (!status || status.budget === null || status.budget <= 0) continue;
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

function budgetCheckFailedNotice(lang = 'th') {
  return t(lang, 'budget.checkFailed');
}

// ไทยมีหน่วยบาทท้ายประโยคครั้งเดียว จึงส่งตัวเลขเปล่าแล้วให้ข้อความในชุดแปลใส่หน่วยเอง
function alertParts(alert, lang) {
  const [year, month] = alert.month.split('-');
  return {
    month: `${month}/${year}`,
    percent: Math.floor((toSatang(alert.spent) * 100) / toSatang(alert.budget)),
    label: t(lang, `budget.level.${alert.level === 'over' ? 'over' : 'warn'}`),
    category: displayCategoryName(lang, 'expense', alert.category),
    spent: formatAmount(alert.spent),
    budget: formatAmount(alert.budget),
  };
}

function formatBudgetAlerts(alerts, lang = 'th') {
  return alerts.map((alert) => t(lang, 'budget.alert.line', alertParts(alert, lang))).join('\n');
}

// รูปแบบสั้นสำหรับการ์ด: ชื่อเรื่องบรรทัดเดียว + รายละเอียดแยกบรรทัดเล็ก
function describeBudgetAlert(alert, lang = 'th') {
  const parts = alertParts(alert, lang);
  return {
    level: alert.level,
    title: t(lang, 'budget.alert.title', parts),
    detail: t(lang, 'budget.alert.detail', parts),
  };
}

// แถบงบในการ์ดบันทึก: ป้ายซ้าย ตัวเลขขวา คิดยอดเหลือเป็นสตางค์กันทศนิยมเพี้ยน
function describeBudgetGauge(alert, lang = 'th') {
  const parts = alertParts(alert, lang);
  const left = toSatang(alert.budget) - toSatang(alert.spent);
  const remainder =
    left >= 0
      ? t(lang, 'budget.gauge.left', { amount: formatAmount(left / 100) })
      : t(lang, 'budget.gauge.over', { amount: formatAmount(-left / 100) });
  return {
    level: alert.level,
    percent: parts.percent,
    label: t(lang, 'budget.gauge.label', parts),
    value: `${parts.percent}% · ${remainder}`,
    detail: t(lang, 'budget.alert.detail', parts),
  };
}

module.exports = {
  budgetMonths,
  findBudgetAlerts,
  formatBudgetAlerts,
  describeBudgetAlert,
  describeBudgetGauge,
  budgetCheckFailedNotice,
};

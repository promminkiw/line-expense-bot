const { t, formatAmount } = require('../i18n');
const { displayCategoryName } = require('../parser/categories');

const TOP_SHARE_WARNING = 40;
const GOOD_SAVING_RATE = 20;

// ไม่เรียก Claude เพื่อไม่เสียค่าใช้จ่ายและให้ทัน timeout 30 วินาทีของ cron-job.org
function pickMonthlyComment(summary, monthName, lang = 'th') {
  const top = summary.topExpenses[0];
  const topShare = top && summary.expenseTotal > 0 ? Math.round((top.total / summary.expenseTotal) * 100) : 0;
  const category = top ? displayCategoryName(lang, 'expense', top.category) : '';
  if (summary.incomeTotal === 0) {
    return t(lang, 'monthly.comment.noIncome', { month: monthName });
  }
  if (summary.net < 0) {
    return t(lang, 'monthly.comment.overspent', { month: monthName, amount: formatAmount(lang, -summary.net), category, share: topShare });
  }
  if (summary.expenseTotal === 0) {
    return t(lang, 'monthly.comment.noExpense', { month: monthName, amount: formatAmount(lang, summary.net) });
  }
  const amount = formatAmount(lang, summary.net);
  if (topShare >= TOP_SHARE_WARNING) {
    return t(lang, 'monthly.comment.topHeavy', { amount, category, share: topShare });
  }
  // คิดเป็นสตางค์จำนวนเต็มก่อนหาร ไม่งั้นทศนิยมของ JavaScript ทำให้ปัดลงหาย 1%
  const rate = Math.floor((Math.round(summary.net * 100) * 100) / Math.round(summary.incomeTotal * 100));
  if (rate >= GOOD_SAVING_RATE) {
    return t(lang, 'monthly.comment.goodRate', { amount, rate });
  }
  return t(lang, 'monthly.comment.lowRate', { amount, rate, target: GOOD_SAVING_RATE });
}

function buildEmptyMonthText({ monthName, nextMonthName }, lang = 'th') {
  return t(lang, 'notify.monthly.empty', { month: monthName, nextMonth: nextMonthName });
}

module.exports = { pickMonthlyComment, buildEmptyMonthText };

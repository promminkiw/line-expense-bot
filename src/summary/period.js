const { toBangkokDateString, shortDate } = require('../utils/date');
const { t, formatMonth } = require('../i18n');

function addDays(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function startOf(period, today) {
  if (period === 'today') {
    return today;
  }
  if (period === 'week') {
    // getUTCDay ให้ 0 = อาทิตย์ จึงเลื่อนให้จันทร์เป็นวันแรกของสัปดาห์
    const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
    return addDays(today, -((weekday + 6) % 7));
  }
  if (period === 'month') {
    return `${today.slice(0, 8)}01`;
  }
  throw new Error(`Unknown period: ${period}`);
}

function getPeriodRange(period, now, lang = 'th') {
  const today = toBangkokDateString(now);
  const from = startOf(period, today);
  const dates = from === today ? shortDate(today) : `${shortDate(from)} - ${shortDate(today)}`;
  return { from, to: today, label: `${t(lang, `summary.period.${period}`)} (${dates})` };
}

function getPreviousMonthRange(now, lang = 'th') {
  const firstOfThisMonth = `${toBangkokDateString(now).slice(0, 8)}01`;
  const to = addDays(firstOfThisMonth, -1);
  const month = Number(to.slice(5, 7));
  return {
    from: `${to.slice(0, 8)}01`,
    to,
    month: to.slice(0, 7),
    monthName: t(lang, `common.month.full.${month}`),
    nextMonthName: t(lang, `common.month.full.${(month % 12) + 1}`),
    label: t(lang, 'summary.monthLabel', { month: formatMonth(lang, to.slice(0, 7)) }),
  };
}

module.exports = { getPeriodRange, getPreviousMonthRange };

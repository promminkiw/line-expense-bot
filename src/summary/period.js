const { toBangkokDateString } = require('../utils/date');

const PERIOD_NAMES = { today: 'วันนี้', week: 'สัปดาห์นี้', month: 'เดือนนี้' };

function addDays(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function shortDate(isoDate) {
  const [, month, day] = isoDate.split('-');
  return `${day}/${month}`;
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

function getPeriodRange(period, now) {
  const today = toBangkokDateString(now);
  const from = startOf(period, today);
  const dates = from === today ? shortDate(today) : `${shortDate(from)} - ${shortDate(today)}`;
  return { from, to: today, label: `${PERIOD_NAMES[period]} (${dates})` };
}

module.exports = { getPeriodRange };

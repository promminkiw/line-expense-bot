const { toBangkokDateString, shortDate } = require('../utils/date');

const PERIOD_NAMES = { today: 'วันนี้', week: 'สัปดาห์นี้', month: 'เดือนนี้' };

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

function getPeriodRange(period, now) {
  const today = toBangkokDateString(now);
  const from = startOf(period, today);
  const dates = from === today ? shortDate(today) : `${shortDate(from)} - ${shortDate(today)}`;
  return { from, to: today, label: `${PERIOD_NAMES[period]} (${dates})` };
}

const THAI_MONTH_NAMES = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];

function getPreviousMonthRange(now) {
  const firstOfThisMonth = `${toBangkokDateString(now).slice(0, 8)}01`;
  const to = addDays(firstOfThisMonth, -1);
  const [year, month] = to.split('-').map(Number);
  return {
    from: `${to.slice(0, 8)}01`,
    to,
    month: to.slice(0, 7),
    monthName: THAI_MONTH_NAMES[month - 1],
    nextMonthName: THAI_MONTH_NAMES[month % 12],
    label: `เดือน${THAI_MONTH_NAMES[month - 1]} ${year + 543}`,
  };
}

module.exports = { getPeriodRange, getPreviousMonthRange };

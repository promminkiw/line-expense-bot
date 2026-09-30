// locale en-CA ให้รูปแบบ YYYY-MM-DD ตรงกับคอลัมน์ date ของ Postgres
const bangkokDateFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Bangkok',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function toBangkokDateString(date) {
  return bangkokDateFormat.format(date);
}

// round-trip เทียบผลเพื่อกันวันที่ที่ Date ปัดให้เอง เช่น 2026-02-30
function isValidCalendarDate(value) {
  if (typeof value !== 'string' || !ISO_DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

module.exports = { toBangkokDateString, isValidCalendarDate };

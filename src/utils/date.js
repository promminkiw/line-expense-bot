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

function shortDate(isoDate) {
  const [, month, day] = isoDate.split('-');
  return `${day}/${month}`;
}

// การ์ดที่เพื่อนเปิดดูทีหลังได้ต้องมีปีด้วย ใช้ พ.ศ. ตามที่คนไทยอ่าน
function thaiDateWithYear(isoDate) {
  const [year, month, day] = isoDate.split('-');
  return `${day}/${month}/${Number(year) + 543}`;
}

module.exports = { toBangkokDateString, isValidCalendarDate, shortDate, thaiDateWithYear };

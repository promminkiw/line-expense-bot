// locale en-CA ให้รูปแบบ YYYY-MM-DD ตรงกับคอลัมน์ date ของ Postgres
const bangkokDateFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Bangkok',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function toBangkokDateString(date) {
  return bangkokDateFormat.format(date);
}

module.exports = { toBangkokDateString };

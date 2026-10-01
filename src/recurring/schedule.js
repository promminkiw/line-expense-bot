function lastDayOf(todayStr) {
  const year = Number(todayStr.slice(0, 4));
  const month = Number(todayStr.slice(5, 7));
  // วันที่ 0 ของเดือนถัดไปคือวันสุดท้ายของเดือนนี้
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function monthStartOf(todayStr) {
  return `${todayStr.slice(0, 7)}-01`;
}

function dueDateFor(todayStr, dayOfMonth) {
  const day = Math.min(dayOfMonth, lastDayOf(todayStr));
  return `${todayStr.slice(0, 7)}-${String(day).padStart(2, '0')}`;
}

// เดือนละครั้งสูงสุด เทียบกับต้นเดือน ไม่เทียบกับวันครบกำหนด กันบันทึกซ้ำเมื่อผู้ใช้แก้วันที่ทีหลัง
function isDue(rule, todayStr) {
  if (!rule.active) return false;
  if (rule.lastRunOn && rule.lastRunOn >= monthStartOf(todayStr)) return false;
  return dueDateFor(todayStr, rule.dayOfMonth) <= todayStr;
}

// รอบของเดือนนี้ที่ผ่านไปแล้วตอนสร้าง/แก้/เปิดใช้ไม่ย้อนบันทึก เริ่มนับจากรอบถัดไป
function lastRunOnAfterSave(lastRunOn, dayOfMonth, todayStr) {
  const dueOn = dueDateFor(todayStr, dayOfMonth);
  return dueOn <= todayStr ? dueOn : lastRunOn;
}

module.exports = { lastDayOf, monthStartOf, dueDateFor, isDue, lastRunOnAfterSave };

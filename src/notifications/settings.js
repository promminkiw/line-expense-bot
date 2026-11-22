// ชื่อ field ของ API คู่กับคอลัมน์ใน users เพิ่มสวิตช์ใหม่ที่นี่ที่เดียว validate repository และ API จะรู้จักเอง
const NOTIFICATION_SETTINGS = { weeklySummary: 'weekly_summary_enabled', dailyReminder: 'daily_reminder_enabled' };
// ภาษาไม่ใช่สวิตช์ boolean จึงแยกออกจาก NOTIFICATION_SETTINGS แต่อ่าน/เขียนใน query เดียวกับสวิตช์
const LANGUAGE_COLUMN = 'language';
const SETTINGS_COLUMNS = [...Object.values(NOTIFICATION_SETTINGS), LANGUAGE_COLUMN].join(', ');

function toNotificationSettings(row) {
  const switches = Object.fromEntries(
    Object.entries(NOTIFICATION_SETTINGS).map(([field, column]) => [field, row ? row[column] === true : false]),
  );
  // คืนค่าดิบ (null = ยังไม่เลือก) เว็บใช้ null เป็นสัญญาณให้ส่งภาษาของแอป LINE มาตั้งให้
  return { ...switches, language: row?.[LANGUAGE_COLUMN] ?? null };
}

function toSettingsColumns(changes) {
  return Object.fromEntries(
    Object.entries(changes).map(([field, value]) => [field === 'language' ? LANGUAGE_COLUMN : NOTIFICATION_SETTINGS[field], value]),
  );
}

module.exports = { NOTIFICATION_SETTINGS, SETTINGS_COLUMNS, toNotificationSettings, toSettingsColumns };

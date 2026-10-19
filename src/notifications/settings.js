// ชื่อ field ของ API คู่กับคอลัมน์ใน users เพิ่มสวิตช์ใหม่ที่นี่ที่เดียว validate repository และ API จะรู้จักเอง
const NOTIFICATION_SETTINGS = { weeklySummary: 'weekly_summary_enabled', dailyReminder: 'daily_reminder_enabled' };
const SETTINGS_COLUMNS = Object.values(NOTIFICATION_SETTINGS).join(', ');

function toNotificationSettings(row) {
  return Object.fromEntries(
    Object.entries(NOTIFICATION_SETTINGS).map(([field, column]) => [field, row ? row[column] === true : false]),
  );
}

function toSettingsColumns(changes) {
  return Object.fromEntries(Object.entries(changes).map(([field, value]) => [NOTIFICATION_SETTINGS[field], value]));
}

module.exports = { NOTIFICATION_SETTINGS, SETTINGS_COLUMNS, toNotificationSettings, toSettingsColumns };

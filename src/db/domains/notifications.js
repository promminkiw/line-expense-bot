const { throwIfError } = require('../errors');
const { SETTINGS_COLUMNS, toNotificationSettings, toSettingsColumns } = require('../../notifications/settings');

function createNotificationsRepository(supabase) {
  async function getNotificationSettings(userId) {
    const { data, error } = await supabase.from('users').select(SETTINGS_COLUMNS).eq('id', userId).maybeSingle();
    throwIfError('getNotificationSettings', error);
    return toNotificationSettings(data);
  }

  async function updateNotificationSettings(userId, changes) {
    const { data, error } = await supabase
      .from('users')
      .update(toSettingsColumns(changes))
      .eq('id', userId)
      .select(SETTINGS_COLUMNS)
      .maybeSingle();
    throwIfError('updateNotificationSettings', error);
    return toNotificationSettings(data);
  }

  // ผู้ใช้ block บอทแล้ว push ไม่ถึง จึงปิดทุกสวิตช์ ถ้ากลับมาเพิ่มเพื่อนต้องเปิดเองในแท็บโปรไฟล์
  async function disableNotifications(lineUserId) {
    const { error } = await supabase
      .from('users')
      .update({ weekly_summary_enabled: false, daily_reminder_enabled: false })
      .eq('line_user_id', lineUserId);
    throwIfError('disableNotifications', error);
  }

  async function listWeeklySummaryUsers() {
    const { data, error } = await supabase
      .from('users')
      .select('id, line_user_id')
      .eq('weekly_summary_enabled', true)
      .order('id');
    throwIfError('listWeeklySummaryUsers', error);
    return data.map((row) => ({ userId: row.id, lineUserId: row.line_user_id }));
  }

  // ignoreDuplicates คืนเฉพาะแถวที่เพิ่ง insert ได้ แถวว่างแปลว่าเคยจองแล้ว จึงไม่ push ซ้ำ
  async function reserveNotification({ userId, kind, period }) {
    const { data, error } = await supabase
      .from('notification_log')
      .upsert({ user_id: userId, kind, period }, { onConflict: 'user_id,kind,period', ignoreDuplicates: true })
      .select('user_id');
    throwIfError('reserveNotification', error);
    return data.length > 0;
  }

  async function listUsersToRemind(day) {
    const { data, error } = await supabase.rpc('users_to_remind', { p_day: day });
    throwIfError('listUsersToRemind', error);
    return data.map((row) => ({ userId: row.user_id, lineUserId: row.line_user_id }));
  }

  return {
    getNotificationSettings,
    updateNotificationSettings,
    disableNotifications,
    listWeeklySummaryUsers,
    reserveNotification,
    listUsersToRemind,
  };
}

module.exports = { createNotificationsRepository };

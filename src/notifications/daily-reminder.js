const { toBangkokDateString } = require('../utils/date');
const { t, normalizeLanguage } = require('../i18n');

const DAILY_REMINDER_KIND = 'daily_reminder';
const DAILY_REMINDER_TEXT = t('th', 'notify.dailyReminder');

// users_to_remind คืนแค่ id กับ line id และไม่อยากแก้ SQL function จึงดึงภาษาครั้งเดียวต่อรอบ
// อ่านไม่ได้ก็ยังเตือนเป็นไทย เพราะภาษาไม่สำคัญเท่าการได้เตือน
async function loadLanguages(repository, users, logger) {
  if (users.length === 0) return new Map();
  try {
    return await repository.getLineUserIds(users.map((user) => user.userId));
  } catch (err) {
    logger.error('Failed to read reminder languages', { reason: err?.message ?? String(err) });
    return new Map();
  }
}

function createDailyReminderRunner({ repository, pushText, now = () => new Date(), logger = console }) {
  return async function run() {
    const today = toBangkokDateString(now());
    // SQL คัดเฉพาะคนที่เปิดสวิตช์และวันนี้ยังไม่ได้จดเอง
    const users = await repository.listUsersToRemind(today);
    const languages = await loadLanguages(repository, users, logger);
    const result = { eligible: users.length, sent: 0, skipped: 0, failed: 0, pushFailed: 0 };
    for (const user of users) {
      try {
        // จองก่อน push เพื่อให้ cron ที่ถูกเรียกซ้ำในวันเดียวกันไม่เตือนซ้ำ
        const reserved = await repository.reserveNotification({ userId: user.userId, kind: DAILY_REMINDER_KIND, period: today });
        if (!reserved) {
          result.skipped += 1;
          continue;
        }
      } catch (err) {
        logger.error('Failed to reserve daily reminder', { userId: user.userId, reason: err?.message ?? String(err) });
        result.failed += 1;
        continue;
      }
      try {
        const lang = normalizeLanguage(languages.get(user.userId)?.language);
        await pushText(user.lineUserId, t(lang, 'notify.dailyReminder'));
        result.sent += 1;
      } catch (err) {
        // ไม่ลบการจองและไม่ลองซ้ำเพราะ LINE อาจส่งถึงแล้ว นับแยกจาก failed เพื่อไม่ให้ cron ตอบ 500 เหมือนรายการประจำ
        logger.error('Failed to push daily reminder', { userId: user.userId, reason: err?.message ?? String(err) });
        result.pushFailed += 1;
      }
    }
    return result;
  };
}

module.exports = { createDailyReminderRunner, DAILY_REMINDER_KIND, DAILY_REMINDER_TEXT };

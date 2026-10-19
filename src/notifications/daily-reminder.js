const { toBangkokDateString } = require('../utils/date');

const DAILY_REMINDER_KIND = 'daily_reminder';
const DAILY_REMINDER_TEXT = 'วันนี้ยังไม่ได้จดรายการเลย ใช้อะไรไปบ้าง พิมพ์มาได้เลย เช่น "กินข้าว 60"';

function createDailyReminderRunner({ repository, pushText, now = () => new Date(), logger = console }) {
  return async function run() {
    const today = toBangkokDateString(now());
    // SQL คัดเฉพาะคนที่เปิดสวิตช์และวันนี้ยังไม่ได้จดเอง
    const users = await repository.listUsersToRemind(today);
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
        await pushText(user.lineUserId, DAILY_REMINDER_TEXT);
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

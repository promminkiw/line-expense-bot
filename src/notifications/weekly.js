const { getPeriodRange } = require('../summary/period');
const { buildSummary } = require('../summary/summary');
const { buildSummaryFlex } = require('../summary/flex');

const WEEKLY_SUMMARY_KIND = 'weekly_summary';

function createWeeklySummaryRunner({ repository, pushFlex, now = () => new Date(), logger = console }) {
  return async function run() {
    const range = getPeriodRange('week', now());
    const users = await repository.listWeeklySummaryUsers();
    const result = { eligible: users.length, sent: 0, skipped: 0, failed: 0, pushFailed: 0 };
    // ส่งทีละคน ความผิดพลาดของคนหนึ่งไม่หยุดคนอื่น
    for (const user of users) {
      let summary;
      try {
        const rows = await repository.summarizeTransactions(user.userId, range.from, range.to);
        summary = buildSummary(rows, range.label);
        // สัปดาห์ที่ไม่มีรายการไม่ส่ง เพื่อไม่เสียโควตา push
        if (summary.entryCount === 0) {
          result.skipped += 1;
          continue;
        }
        // period คือวันจันทร์ของสัปดาห์ จองก่อน push เพื่อให้ cron ที่ถูกเรียกซ้ำไม่ส่งซ้ำ
        const reserved = await repository.reserveNotification({
          userId: user.userId,
          kind: WEEKLY_SUMMARY_KIND,
          period: range.from,
        });
        if (!reserved) {
          result.skipped += 1;
          continue;
        }
      } catch (err) {
        // ไม่ log err ทั้งก้อนเพราะ cause อาจมียอดเงิน
        logger.error('Failed to prepare weekly summary', { userId: user.userId, reason: err?.message ?? String(err) });
        result.failed += 1;
        continue;
      }
      try {
        // ไม่เรียก Claude เขียนคอมเมนต์ ให้ทัน timeout 30 วินาทีของ cron-job.org และไม่เสียค่า Claude
        await pushFlex(user.lineUserId, buildSummaryFlex(summary, ''));
        result.sent += 1;
      } catch (err) {
        // ไม่ลบการจองและไม่ลองซ้ำเพราะ LINE อาจส่งถึงแล้ว นับแยกจาก failed เพื่อไม่ให้ cron ตอบ 500 เหมือนรายการประจำ
        logger.error('Failed to push weekly summary', { userId: user.userId, reason: err?.message ?? String(err) });
        result.pushFailed += 1;
      }
    }
    return result;
  };
}

module.exports = { createWeeklySummaryRunner, WEEKLY_SUMMARY_KIND };

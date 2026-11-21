const { getPreviousMonthRange } = require('../summary/period');
const { buildSummary } = require('../summary/summary');
const { buildSummaryFlex } = require('../summary/flex');
const { pickMonthlyComment, buildEmptyMonthText } = require('./monthly-comment');
const { normalizeLanguage } = require('../i18n');

const MONTHLY_SUMMARY_KIND = 'monthly_summary';

function createMonthlySummaryRunner({ repository, pushFlex, pushText, buildSummaryUrl, now = () => new Date(), logger = console }) {
  return async function run() {
    const today = now();
    const users = await repository.listMonthlySummaryUsers();
    const result = { eligible: users.length, sent: 0, nudged: 0, skipped: 0, failed: 0, pushFailed: 0 };
    // ส่งทีละคน ความผิดพลาดของคนหนึ่งไม่หยุดคนอื่น
    for (const user of users) {
      const lang = normalizeLanguage(user.language);
      // ช่วงวันเหมือนกันทุกภาษา ต่างแค่ชื่อเดือนใน label และคอมเมนต์
      const range = getPreviousMonthRange(today, lang);
      let summary;
      try {
        const rows = await repository.summarizeTransactions(user.userId, range.from, range.to);
        summary = buildSummary(rows, range.label);
        // period คือวันที่ 1 ของเดือนที่สรุป จองก่อน push เพื่อให้ cron ที่ถูกเรียกซ้ำหรือช้าไม่ส่งซ้ำ
        const reserved = await repository.reserveNotification({ userId: user.userId, kind: MONTHLY_SUMMARY_KIND, period: range.from });
        if (!reserved) {
          result.skipped += 1;
          continue;
        }
      } catch (err) {
        // ไม่ log err ทั้งก้อนเพราะ cause อาจมียอดเงิน
        logger.error('Failed to prepare monthly summary', { userId: user.userId, reason: err?.message ?? String(err) });
        result.failed += 1;
        continue;
      }
      try {
        if (summary.entryCount === 0) {
          await pushText(user.lineUserId, buildEmptyMonthText(range, lang));
          result.nudged += 1;
        } else {
          const comment = pickMonthlyComment(summary, range.monthName, lang);
          await pushFlex(user.lineUserId, buildSummaryFlex(summary, comment, { summaryUrl: buildSummaryUrl(range.month), lang }));
          result.sent += 1;
        }
      } catch (err) {
        // ไม่ลบการจองและไม่ลองซ้ำเพราะ LINE อาจส่งถึงแล้ว
        logger.error('Failed to push monthly summary', { userId: user.userId, reason: err?.message ?? String(err) });
        result.pushFailed += 1;
      }
    }
    return result;
  };
}

module.exports = { createMonthlySummaryRunner, MONTHLY_SUMMARY_KIND };

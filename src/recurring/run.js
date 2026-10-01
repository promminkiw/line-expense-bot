const { toBangkokDateString } = require('../utils/date');
const { dueDateFor, isDue } = require('./schedule');
const { formatItem } = require('../parser/format-reply');
const { buildUndoQuickReply } = require('../bot');

function createRecurringRunner({ repository, pushText, now = () => new Date(), logger = console }) {
  return async function run() {
    const today = toBangkokDateString(now());
    const rules = await repository.listDueRecurringRules(today);
    const result = { due: 0, created: 0, skipped: 0, failed: 0 };
    for (const rule of rules) {
      // SQL กรองมาแล้ว เช็กซ้ำที่นี่เพื่อให้กติกาอยู่ที่ schedule.js ที่เดียว
      if (!isDue(rule, today)) continue;
      result.due += 1;
      const dueOn = dueDateFor(today, rule.dayOfMonth);
      // event id ต่อเดือนทำให้ยกเลิกผ่านปุ่มเดิมได้ และกันบันทึกซ้ำเดือนเดียวกัน
      const eventId = `recurring:${rule.id}:${dueOn.slice(0, 7)}`;
      let created;
      try {
        created = await repository.applyRecurringRule({ ruleId: rule.id, dueOn, eventId });
      } catch (err) {
        logger.error('Failed to apply recurring rule', { ruleId: rule.id }, err);
        result.failed += 1;
        continue;
      }
      if (!created) {
        result.skipped += 1;
        continue;
      }
      result.created += 1;
      const text = [
        'บันทึกรายการประจำให้อัตโนมัติ',
        formatItem({
          type: rule.type,
          category: rule.categoryName,
          amount: rule.amount,
          date: dueOn,
          note: rule.note,
        }),
      ].join('\n');
      try {
        await pushText(rule.lineUserId, text, buildUndoQuickReply(eventId));
      } catch (err) {
        // บันทึกสำเร็จแล้ว push พังไม่ต้องย้อนรายการ
        logger.error('Failed to push recurring notice', { ruleId: rule.id }, err);
      }
    }
    return result;
  };
}

module.exports = { createRecurringRunner };

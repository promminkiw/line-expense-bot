const { t, SUPPORTED_LANGUAGES } = require('../i18n');

const COMMAND_NAMES = ['menu', 'today', 'week', 'month'];

// ตัดช่องว่างทั้งหมดและไม่สนตัวพิมพ์ เพื่อให้ "สรุป เดือนนี้" และ "Summary  This Week" ใช้ได้
function normalizeCommand(text) {
  return text.replace(/\s+/g, '').toLowerCase();
}

// รับคำสั่งทุกภาษาไม่ว่าผู้ใช้เลือกภาษาไหน จึงสร้างจากชุดแปลของทุกภาษา
const COMMANDS = new Map(
  SUPPORTED_LANGUAGES.flatMap((lang) => COMMAND_NAMES.map((name) => [normalizeCommand(t(lang, `summary.command.${name}`)), name]))
);

function parseSummaryCommand(text) {
  return COMMANDS.get(normalizeCommand(text)) ?? null;
}

module.exports = { parseSummaryCommand };

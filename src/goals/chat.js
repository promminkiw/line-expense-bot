const { formatAmount } = require('../parser/format-reply');
const { isValidAmount } = require('../api/validate');

// รูปแบบตายตัวจึงไม่ต้องใช้ Claude ชื่อเป้ามีตัวเลขได้ เพราะยอดต้องอยู่ท้ายสุดเสมอ
const SAVING_PATTERN = /^ออม\s*(.+?)\s+([\d,]+(?:\.\d{1,2})?)\s*(?:บาท)?$/;

const SAVING_AMOUNT_REPLY = 'จำนวนเงินออมต้องมากกว่า 0 และไม่เกิน 10,000,000 บาท';
const GOAL_GONE_REPLY = 'ไม่พบเป้านี้แล้ว อาจถูกปิดไปแล้ว ดูเป้าที่เปิดอยู่ในหน้าเว็บ แท็บ ออม';

function parseSavingCommand(text) {
  const match = SAVING_PATTERN.exec(text.trim());
  if (!match) {
    return null;
  }
  const amount = Number(match[2].replace(/,/g, ''));
  return { name: match[1].trim(), amount: isValidAmount(amount) ? amount : null };
}

// คนที่ไม่มีเป้าเปิดอยู่ไม่ได้ใช้คำสั่งออม ข้อความอย่าง "ออมสิน 1000" ของเขาต้องเป็นรายการตามเดิม
function hasOpenGoal(goals) {
  return goals.some((goal) => !goal.closed);
}

function normalizeGoalName(name) {
  return name.trim().toLowerCase();
}

function findOpenGoal(goals, name) {
  const wanted = normalizeGoalName(name);
  return goals.find((goal) => !goal.closed && normalizeGoalName(goal.name) === wanted) ?? null;
}

// คิดเป็นสตางค์และปัดลง ให้ตรงกับหลอดในหน้าเว็บ
function goalPercent(saved, target) {
  return Math.floor((Math.round(saved * 100) * 100) / Math.round(target * 100));
}

function formatSavingReply({ name, amount, saved, target }) {
  const percent = goalPercent(saved, target);
  const lines = [
    `ออมเข้าเป้า ${name} ${formatAmount(amount)} บาทแล้ว`,
    `ยอดสะสม ${formatAmount(saved)} / ${formatAmount(target)} บาท (${percent}%)`,
  ];
  if (percent >= 100) {
    lines.push('ถึงเป้าแล้ว ปิดเป้าได้ในหน้าเว็บ แท็บ ออม');
  }
  return lines.join('\n');
}

function formatGoalNotFoundReply(name, goals) {
  const open = goals.filter((goal) => !goal.closed);
  return [
    `ไม่พบเป้า "${name}"`,
    `เป้าที่เปิดอยู่: ${open.map((goal) => goal.name).join(', ')}`,
    `พิมพ์ เช่น ออม ${open[0].name} 1000`,
  ].join('\n');
}

module.exports = {
  parseSavingCommand,
  hasOpenGoal,
  findOpenGoal,
  formatSavingReply,
  formatGoalNotFoundReply,
  SAVING_AMOUNT_REPLY,
  GOAL_GONE_REPLY,
};

const { formatAmount } = require('../parser/format-reply');
const { isValidAmount } = require('../api/validate');

// รูปแบบตายตัวจึงไม่ต้องใช้ Claude ชื่อเป้ามีตัวเลขได้ เพราะยอดต้องอยู่ท้ายสุดเสมอ
const SAVING_PREFIX = 'ออม';
const BAHT_SUFFIX = 'บาท';
const SAVING_AMOUNT_TOKEN = /^[\d,]+(?:\.\d{1,2})?$/;
const WHITESPACE = /\s/;
// . ไม่จับตัวขึ้นบรรทัด ชื่อเป้าที่ขึ้นบรรทัดกลางชื่อจึงไม่ผ่านเหมือน regex เดิม
const SINGLE_LINE = /^.+$/;

// "ออม 1000" ไม่มีชื่อเป้า ถ้าไม่จับไว้จะถูกจดเป็นรายจ่าย
const NAMELESS_SAVING_PATTERN = /^ออม\s*([\d,]+(?:\.\d{1,2})?)\s*(?:บาท)?$/;
// เท่าชื่อเป้าที่ยาวที่สุด ชื่อที่พิมพ์ยาวกว่านี้ไม่มีทางตรงกับเป้าใด
const MAX_REPLY_NAME_LENGTH = 30;

const SAVING_AMOUNT_REPLY = 'จำนวนเงินออมต้องมากกว่า 0 และไม่เกิน 10,000,000 บาท\nเขียนยอดแบบ 1,500 หรือ 60.50';
const GOAL_GONE_REPLY = 'เฮียไม่พบเป้านี้แล้ว อาจถูกปิดไปแล้ว ดูเป้าที่เปิดอยู่ในหน้าเว็บ แท็บ ออม';

// คอมมายอมเฉพาะเป็นตัวคั่นหลักพัน กันอ่าน 60,50 เป็น 6050
const AMOUNT_SHAPE = /^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/;

function toSavingAmount(text) {
  if (!AMOUNT_SHAPE.test(text)) {
    return null;
  }
  const amount = Number(text.replace(/,/g, ''));
  return isValidAmount(amount) ? amount : null;
}

// หาช่องว่างตัวสุดท้ายแทน regex ตัวเดียว เพราะ regex เดิม backtrack แบบ O(n²) กับข้อความที่มีช่องว่างยาว
function splitNamedSaving(text) {
  if (!text.startsWith(SAVING_PREFIX)) return null;
  let rest = text.slice(SAVING_PREFIX.length);
  if (rest.endsWith(BAHT_SUFFIX)) rest = rest.slice(0, -BAHT_SUFFIX.length);
  rest = rest.trimEnd();
  let start = rest.length;
  while (start > 0 && !WHITESPACE.test(rest[start - 1])) start -= 1;
  const amountText = rest.slice(start);
  const name = rest.slice(0, start).trim();
  if (!name || !SINGLE_LINE.test(name) || !SAVING_AMOUNT_TOKEN.test(amountText)) return null;
  return { name, amountText };
}

function parseSavingCommand(text) {
  const nameless = NAMELESS_SAVING_PATTERN.exec(text.trim());
  if (nameless) {
    return { name: '', amount: toSavingAmount(nameless[1]) };
  }
  const named = splitNamedSaving(text.trim());
  if (!named) {
    return null;
  }
  return { name: named.name, amount: toSavingAmount(named.amountText) };
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
    `เฮียจดออมเข้าเป้า ${name} ${formatAmount(amount)} บาทแล้ว`,
    `ยอดสะสม ${formatAmount(saved)} / ${formatAmount(target)} บาท (${percent}%)`,
  ];
  if (percent >= 100) {
    lines.push('ถึงเป้าแล้ว ปิดเป้าได้ในหน้าเว็บ แท็บ ออม');
  }
  return lines.join('\n');
}

function openGoalNames(goals) {
  return goals.filter((goal) => !goal.closed).map((goal) => goal.name);
}

function shortenName(name) {
  const chars = Array.from(name);
  return chars.length > MAX_REPLY_NAME_LENGTH ? `${chars.slice(0, MAX_REPLY_NAME_LENGTH).join('')}…` : name;
}

function formatGoalNotFoundReply(name, goals) {
  const open = openGoalNames(goals);
  return [`เฮียไม่พบเป้า "${shortenName(name)}"`, `เป้าที่เปิดอยู่: ${open.join(', ')}`, `พิมพ์ เช่น ออม ${open[0]} 1000`].join('\n');
}

function formatGoalNameMissingReply(goals) {
  const open = openGoalNames(goals);
  return [`ใส่ชื่อเป้าให้เฮียด้วย เช่น ออม ${open[0]} 1000`, `เป้าที่เปิดอยู่: ${open.join(', ')}`].join('\n');
}

module.exports = {
  parseSavingCommand,
  hasOpenGoal,
  findOpenGoal,
  formatSavingReply,
  formatGoalNotFoundReply,
  formatGoalNameMissingReply,
  goalPercent,
  SAVING_AMOUNT_REPLY,
  GOAL_GONE_REPLY,
};

const { formatAmount: formatNumber } = require('../parser/format-reply');
const { t, formatAmount } = require('../i18n');
const { isValidAmount } = require('../api/validate');

// รูปแบบตายตัวจึงไม่ต้องใช้ Claude ชื่อเป้ามีตัวเลขได้ เพราะยอดต้องอยู่ท้ายสุดเสมอ
// รับคำสั่งทั้งสองภาษาไม่ว่าผู้ใช้เลือกภาษาไหน
const SAVING_PREFIX = 'ออม';
const ENGLISH_SAVING_PREFIX = 'save';
const BAHT_SUFFIX = 'บาท';
const SAVING_AMOUNT_TOKEN = /^[\d,]+(?:\.\d{1,2})?$/;
const WHITESPACE = /\s/;
// . ไม่จับตัวขึ้นบรรทัด ชื่อเป้าที่ขึ้นบรรทัดกลางชื่อจึงไม่ผ่านเหมือน regex เดิม
const SINGLE_LINE = /^.+$/;

// "ออม 1000" ไม่มีชื่อเป้า ถ้าไม่จับไว้จะถูกจดเป็นรายจ่าย ใช้กับข้อความหลังตัดคำสั่งออกแล้ว
const NAMELESS_SAVING_PATTERN = /^([\d,]+(?:\.\d{1,2})?)\s*(?:บาท)?$/;
// เท่าชื่อเป้าที่ยาวที่สุด ชื่อที่พิมพ์ยาวกว่านี้ไม่มีทางตรงกับเป้าใด
const MAX_REPLY_NAME_LENGTH = 30;

function savingAmountReply(lang) {
  return t(lang, 'goals.savingAmountInvalid');
}

function goalGoneReply(lang) {
  return t(lang, 'goals.gone');
}

// ค่าไทยคงไว้ให้ผู้เรียกที่ยังไม่ส่งภาษา
const SAVING_AMOUNT_REPLY = savingAmountReply('th');
const GOAL_GONE_REPLY = goalGoneReply('th');

// คอมมายอมเฉพาะเป็นตัวคั่นหลักพัน กันอ่าน 60,50 เป็น 6050
const AMOUNT_SHAPE = /^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/;

function toSavingAmount(text) {
  if (!AMOUNT_SHAPE.test(text)) {
    return null;
  }
  const amount = Number(text.replace(/,/g, ''));
  return isValidAmount(amount) ? amount : null;
}

// ภาษาไทยไม่เว้นวรรคระหว่างคำ จึงไม่บังคับช่องว่างหลัง ออม แต่ save ต้องมี กัน savings 500 ถูกอ่านเป็นคำสั่ง
function stripSavingPrefix(text) {
  if (text.startsWith(SAVING_PREFIX)) return text.slice(SAVING_PREFIX.length);
  const prefixLength = ENGLISH_SAVING_PREFIX.length;
  if (text.slice(0, prefixLength).toLowerCase() === ENGLISH_SAVING_PREFIX && WHITESPACE.test(text.charAt(prefixLength))) {
    return text.slice(prefixLength);
  }
  return null;
}

// หาช่องว่างตัวสุดท้ายแทน regex ตัวเดียว เพราะ regex เดิม backtrack แบบ O(n²) กับข้อความที่มีช่องว่างยาว
function splitNamedSaving(afterPrefix) {
  let rest = afterPrefix;
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
  const afterPrefix = stripSavingPrefix(text.trim());
  if (afterPrefix === null) {
    return null;
  }
  const nameless = NAMELESS_SAVING_PATTERN.exec(afterPrefix.trimStart());
  if (nameless) {
    return { name: '', amount: toSavingAmount(nameless[1]) };
  }
  const named = splitNamedSaving(afterPrefix);
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

function formatSavingReply({ name, amount, saved, target }, lang = 'th') {
  const percent = goalPercent(saved, target);
  const lines = [
    t(lang, 'goals.saved', { name, amount: formatAmount(lang, amount) }),
    // ไทยมีหน่วยบาทครั้งเดียวท้ายบรรทัด จึงส่งตัวเลขเปล่าแล้วให้ข้อความในชุดแปลใส่หน่วยเอง
    t(lang, 'goals.progress', { saved: formatNumber(saved), target: formatNumber(target), percent }),
  ];
  if (percent >= 100) {
    lines.push(t(lang, 'goals.reached'));
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

function formatGoalNotFoundReply(name, goals, lang = 'th') {
  const open = openGoalNames(goals);
  return [
    t(lang, 'goals.notFound', { name: shortenName(name) }),
    t(lang, 'goals.openList', { names: open.join(', ') }),
    t(lang, 'goals.example', { goal: open[0] }),
  ].join('\n');
}

function formatGoalNameMissingReply(goals, lang = 'th') {
  const open = openGoalNames(goals);
  return [t(lang, 'goals.nameMissing', { goal: open[0] }), t(lang, 'goals.openList', { names: open.join(', ') })].join('\n');
}

module.exports = {
  parseSavingCommand,
  hasOpenGoal,
  findOpenGoal,
  formatSavingReply,
  formatGoalNotFoundReply,
  formatGoalNameMissingReply,
  goalPercent,
  savingAmountReply,
  goalGoneReply,
  SAVING_AMOUNT_REPLY,
  GOAL_GONE_REPLY,
};

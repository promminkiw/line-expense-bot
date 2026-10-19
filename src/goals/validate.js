const { isValidAmount } = require('../api/validate');
const { isValidCalendarDate } = require('../utils/date');

// ตรงกับ check char_length ของตาราง savings_goals ซึ่งนับเป็นตัวอักษร
const MAX_GOAL_NAME_LENGTH = 30;

function fail(error) {
  return { ok: false, error };
}

function isObject(body) {
  return Boolean(body) && typeof body === 'object';
}

// ชื่อเป้าไปอยู่ในข้อความตอบของแชต ตัวควบคุมทำให้ข้อความเพี้ยน
function hasControlCharacter(name) {
  return [...name].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127);
}

function checkName(value) {
  if (typeof value !== 'string') return fail('Invalid name');
  const name = value.trim();
  const length = Array.from(name).length;
  if (length < 1 || length > MAX_GOAL_NAME_LENGTH || hasControlCharacter(name)) return fail('Invalid name');
  return { ok: true, value: name };
}

function checkTargetDate(value) {
  return value === null || isValidCalendarDate(value);
}

function validateGoalCreate(body) {
  if (!isObject(body)) return fail('Invalid body');
  const name = checkName(body.name);
  if (!name.ok) return name;
  if (!isValidAmount(body.targetAmount)) return fail('Invalid amount');
  const targetDate = body.targetDate === undefined ? null : body.targetDate;
  if (!checkTargetDate(targetDate)) return fail('Invalid date');
  return { ok: true, value: { name: name.value, targetAmount: body.targetAmount, targetDate } };
}

function validateGoalUpdate(body) {
  if (!isObject(body)) return fail('Invalid body');
  const value = {};
  if (body.name !== undefined) {
    const name = checkName(body.name);
    if (!name.ok) return name;
    value.name = name.value;
  }
  if (body.targetAmount !== undefined) {
    if (!isValidAmount(body.targetAmount)) return fail('Invalid amount');
    value.targetAmount = body.targetAmount;
  }
  if (body.targetDate !== undefined) {
    if (!checkTargetDate(body.targetDate)) return fail('Invalid date');
    value.targetDate = body.targetDate;
  }
  if (body.closed !== undefined) {
    if (typeof body.closed !== 'boolean') return fail('Invalid closed');
    value.closed = body.closed;
  }
  if (Object.keys(value).length === 0) return fail('Invalid body');
  return { ok: true, value };
}

function validateContribution(body) {
  if (!isObject(body)) return fail('Invalid body');
  if (!isValidAmount(body.amount)) return fail('Invalid amount');
  if (!isValidCalendarDate(body.occurredOn)) return fail('Invalid date');
  return { ok: true, value: { amount: body.amount, occurredOn: body.occurredOn } };
}

module.exports = { validateGoalCreate, validateGoalUpdate, validateContribution, MAX_GOAL_NAME_LENGTH };

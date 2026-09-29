const { DEFAULT_CATEGORIES, normalizeCategory } = require('./categories');
const { toBangkokDateString } = require('../utils/date');

const DEFAULT_CLARIFY_QUESTION = 'ช่วยบอกรายการและจำนวนเงินอีกครั้งได้ไหม เช่น "กินข้าว 60"';
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const ALL_CATEGORIES = [...new Set([...DEFAULT_CATEGORIES.expense, ...DEFAULT_CATEGORIES.income])];

// SDK บังคับ additionalProperties เป็น false ทุก object จึงประกาศไว้ตั้งแต่ต้น
const PARSE_SCHEMA = {
  type: 'object',
  properties: {
    needs_clarification: { type: 'boolean' },
    question: { type: 'string' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['expense', 'income'] },
          category: { type: 'string', enum: ALL_CATEGORIES },
          amount: { type: 'number' },
          date: { type: 'string' },
          note: { type: 'string' },
        },
        required: ['type', 'category', 'amount', 'date', 'note'],
        additionalProperties: false,
      },
    },
  },
  required: ['needs_clarification', 'question', 'items'],
  additionalProperties: false,
};

class ParseError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ParseError';
  }
}

function buildSystemPrompt(today) {
  return [
    'You extract income and expense entries from a Thai user message for a personal finance bot.',
    `Today is ${today} (Asia/Bangkok).`,
    '',
    'Rules:',
    '- One message may contain several entries, e.g. "กินข้าว 60 กาแฟ 45" is two expense entries. Return one item per entry.',
    '- amount is the number of Thai baht as a positive number. Never add amounts together.',
    '- date is YYYY-MM-DD. Resolve relative words such as "เมื่อวาน" or "เมื่อวานซืน" from today. Use today when no date is given.',
    '- note is a short Thai description taken from the message, e.g. "กินข้าว".',
    `- Expense categories: ${DEFAULT_CATEGORIES.expense.join(', ')}`,
    `- Income categories: ${DEFAULT_CATEGORIES.income.join(', ')}`,
    '- Pick the category from the list that matches the item type. Use "อื่นๆ" when nothing fits.',
    '- If any entry has no amount, or you cannot tell what it is, set needs_clarification to true, items to [], and write one short Thai question in question.',
    '- Otherwise set needs_clarification to false and question to "".',
  ].join('\n');
}

function isValidCalendarDate(value) {
  if (!ISO_DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasValidShape(data) {
  return (
    isPlainObject(data) &&
    typeof data.needs_clarification === 'boolean' &&
    Array.isArray(data.items) &&
    data.items.every((entry) => isPlainObject(entry) && ['expense', 'income'].includes(entry.type))
  );
}

function normalizeItem(item, today) {
  return {
    type: item.type,
    category: normalizeCategory(item.type, item.category),
    amount: item.amount,
    date: isValidCalendarDate(item.date) ? item.date : today,
    note: item.note,
  };
}

function toParseResult(data, today) {
  if (data.needs_clarification === true) {
    return { status: 'clarify', question: data.question || DEFAULT_CLARIFY_QUESTION };
  }

  const hasInvalidAmount = data.items.some(
    (item) => !Number.isFinite(item.amount) || item.amount <= 0
  );
  if (data.items.length === 0 || hasInvalidAmount) {
    return { status: 'clarify', question: DEFAULT_CLARIFY_QUESTION };
  }

  return { status: 'ok', items: data.items.map((item) => normalizeItem(item, today)) };
}

function createMessageParser({ client, model, now = () => new Date() }) {
  return async function parseMessage(text) {
    const today = toBangkokDateString(now());
    const response = await client.messages.create({
      model,
      max_tokens: 1024,
      system: buildSystemPrompt(today),
      messages: [{ role: 'user', content: text }],
      output_config: { format: { type: 'json_schema', schema: PARSE_SCHEMA } },
    });

    if (response.stop_reason === 'max_tokens') {
      throw new ParseError('Claude response was truncated');
    }
    if (response.stop_reason === 'refusal') {
      throw new ParseError('Claude refused to answer');
    }
    const textBlock = response.content.find((block) => block.type === 'text');
    if (!textBlock) {
      throw new ParseError('Claude response has no text block');
    }

    let data;
    try {
      data = JSON.parse(textBlock.text);
    } catch {
      throw new ParseError('Claude response is not valid JSON');
    }
    if (!hasValidShape(data)) {
      throw new ParseError('Claude response does not match the expected shape');
    }
    return toParseResult(data, today);
  };
}

module.exports = { createMessageParser, ParseError, PARSE_SCHEMA, DEFAULT_CLARIFY_QUESTION };

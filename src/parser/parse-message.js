const { DEFAULT_CATEGORIES, normalizeCategory } = require('./categories');
const { toBangkokDateString, isValidCalendarDate } = require('../utils/date');

const DEFAULT_CLARIFY_QUESTION = 'ช่วยบอกรายการและจำนวนเงินอีกครั้งได้ไหม เช่น "กินข้าว 60"';
const AMOUNT_TOO_LARGE_QUESTION = 'จำนวนเงินเกินเพดานที่กำหนด (ไม่เกิน 10,000,000 บาทต่อรายการ)';
// reply token ของ LINE หมดอายุเร็ว จึงต้องจำกัดเวลารอ Claude ให้ทันตอบข้อความ fallback
const REQUEST_TIMEOUT_MS = 20000;
const MAX_RETRIES = 1;
// SDK รอตาม retry-after ของ server ได้ไม่จำกัด จึงต้องมีเส้นตายรวมที่ตัดได้แน่นอน
const OVERALL_TIMEOUT_MS = 30000;

// กันตัวเลขที่ Claude อ่านผิดจนใหญ่ผิดปกติ ค่าเดียวกับ check constraint ใน supabase/schema.sql
const MAX_AMOUNT = 10000000;

const ALL_CATEGORIES = [...new Set([...DEFAULT_CATEGORIES.expense, ...DEFAULT_CATEGORIES.income])];

// messages.create ไม่แปลง schema ให้ จึงต้องใส่ additionalProperties: false เองทุก object
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
    '- Never ask about the date in question. A missing date always means today.',
    '- Earlier turns are context only. Return entries from the latest user message; use earlier turns only to complete an entry the assistant asked about.',
    '- Otherwise set needs_clarification to false and question to "".',
  ].join('\n');
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

  if (data.items.some((item) => Number.isFinite(item.amount) && item.amount > MAX_AMOUNT)) {
    return { status: 'clarify', question: AMOUNT_TOO_LARGE_QUESTION };
  }

  const hasInvalidAmount = data.items.some(
    (item) =>
      !Number.isFinite(item.amount) ||
      item.amount <= 0 ||
      // คอลัมน์ numeric(12,2) ปัดเป็นสตางค์ ค่าที่ปัดแล้วเป็น 0 จะชน check amount > 0
      Math.round(item.amount * 100) === 0
  );
  if (data.items.length === 0 || hasInvalidAmount) {
    return { status: 'clarify', question: DEFAULT_CLARIFY_QUESTION };
  }

  return { status: 'ok', items: data.items.map((item) => normalizeItem(item, today)) };
}

function createMessageParser({ client, model, now = () => new Date() }) {
  return async function parseMessage(text, history = []) {
    const today = toBangkokDateString(now());
    const messages = [
      ...history.map((turn) => ({ role: turn.role, content: turn.text })),
      { role: 'user', content: text },
    ];
    const response = await client.messages.create(
      {
        model,
        max_tokens: 1024,
        system: buildSystemPrompt(today),
        messages,
        output_config: { format: { type: 'json_schema', schema: PARSE_SCHEMA } },
      },
      {
        timeout: REQUEST_TIMEOUT_MS,
        maxRetries: MAX_RETRIES,
        signal: AbortSignal.timeout(OVERALL_TIMEOUT_MS),
      }
    );

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

module.exports = {
  createMessageParser,
  ParseError,
  PARSE_SCHEMA,
  DEFAULT_CLARIFY_QUESTION,
  AMOUNT_TOO_LARGE_QUESTION,
  MAX_AMOUNT,
  REQUEST_TIMEOUT_MS,
  MAX_RETRIES,
  OVERALL_TIMEOUT_MS,
  ALL_CATEGORIES,
  isPlainObject,
  toParseResult,
};

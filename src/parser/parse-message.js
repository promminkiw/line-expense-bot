const { TEXT_CATEGORIES, normalizeCategory } = require('./categories');
const { toBangkokDateString, isValidCalendarDate } = require('../utils/date');
const { withLowEffort } = require('../utils/claude-effort');

const DEFAULT_CLARIFY_QUESTION = 'ช่วยบอกรายการและจำนวนเงินอีกครั้งได้ไหม เช่น "กินข้าว 60"';
const AMOUNT_TOO_LARGE_QUESTION = 'จำนวนเงินเกินเพดานที่กำหนด (ไม่เกิน 10,000,000 บาทต่อรายการ)';
// reply token ของ LINE หมดอายุเร็ว จึงต้องจำกัดเวลารอ Claude ให้ทันตอบข้อความ fallback
const REQUEST_TIMEOUT_MS = 20000;
const MAX_RETRIES = 1;
// SDK รอตาม retry-after ของ server ได้ไม่จำกัด จึงต้องมีเส้นตายรวมที่ตัดได้แน่นอน
const OVERALL_TIMEOUT_MS = 30000;

// กันตัวเลขที่ Claude อ่านผิดจนใหญ่ผิดปกติ ค่าเดียวกับ check constraint ใน supabase/schema.sql
const MAX_AMOUNT = 10000000;

// messages.create ไม่แปลง schema ให้ จึงต้องใส่ additionalProperties: false เองทุก object
function buildParseSchema(categories, wallets = []) {
  const names = [...new Set([...categories.expense, ...categories.income])];
  const properties = {
    type: { type: 'string', enum: ['expense', 'income'] },
    category: { type: 'string', enum: names },
    amount: { type: 'number' },
    date: { type: 'string' },
    note: { type: 'string' },
  };
  const required = ['type', 'category', 'amount', 'date', 'note'];
  // ใส่ field กระเป๋าเฉพาะผู้ใช้หลายกระเป๋า schema ของผู้ใช้กระเป๋าเดียวจึงเหมือนเดิม
  if (wallets.length > 0) {
    properties.wallet = { type: 'string', enum: [...new Set(wallets), ''] };
    required.push('wallet');
  }
  return {
    type: 'object',
    properties: {
      needs_clarification: { type: 'boolean' },
      question: { type: 'string' },
      items: {
        type: 'array',
        items: { type: 'object', properties, required, additionalProperties: false },
      },
    },
    required: ['needs_clarification', 'question', 'items'],
    additionalProperties: false,
  };
}

const PARSE_SCHEMA = buildParseSchema(TEXT_CATEGORIES);
const ALL_CATEGORIES = PARSE_SCHEMA.properties.items.items.properties.category.enum;

class ParseError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ParseError';
  }
}

function buildSystemPrompt(today, categories, wallets = []) {
  const walletRules =
    wallets.length > 0
      ? [
          `- Wallets: ${wallets.join(', ')}`,
          '- wallet is the wallet from the list that the user paid with or received money into, only when the message names it, e.g. "รูดบัตร" or "บัตรเครดิต". Otherwise "".',
          '- Wallet words never change the category. Pick the category from what was bought or received, e.g. "กาแฟ 60 รูดบัตรเครดิต" is อาหาร.',
        ]
      : [];
  return [
    'You extract income and expense entries from a Thai user message for a personal finance bot.',
    `Today is ${today} (Asia/Bangkok).`,
    '',
    'Rules:',
    '- One message may contain several entries, e.g. "กินข้าว 60 กาแฟ 45" is two expense entries. Return one item per entry.',
    '- amount is the number of Thai baht as a positive number. Never add amounts together.',
    '- date is YYYY-MM-DD. Resolve relative words such as "เมื่อวาน" or "เมื่อวานซืน" from today. Use today when no date is given.',
    '- note is a short Thai description taken from the message, e.g. "กินข้าว".',
    `- Expense categories: ${categories.expense.join(', ')}`,
    `- Income categories: ${categories.income.join(', ')}`,
    '- Pick the category from the list that matches the item type. Use "อื่นๆ" when nothing fits.',
    ...walletRules,
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

function normalizeItem(item, today, categories, wallets) {
  const normalized = {
    type: item.type,
    category: normalizeCategory(item.type, item.category, categories),
    amount: item.amount,
    date: isValidCalendarDate(item.date) ? item.date : today,
    note: item.note,
  };
  // ชื่อที่ไม่อยู่ในรายการหรือว่าง คือกระเป๋าตั้งต้น
  if (wallets.length > 0) normalized.wallet = wallets.includes(item.wallet) ? item.wallet : '';
  return normalized;
}

function toParseResult(data, today, categories, wallets = []) {
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

  return { status: 'ok', items: data.items.map((item) => normalizeItem(item, today, categories, wallets)) };
}

function createMessageParser({ client, model, now = () => new Date() }) {
  return async function parseMessage(text, history = [], categories = TEXT_CATEGORIES, wallets = []) {
    const today = toBangkokDateString(now());
    // ใช้ schema ที่สร้างไว้แล้วเมื่อเป็นหมวดเริ่มต้นและไม่มีกระเป๋า ไม่ต้องสร้างใหม่ทุกข้อความ
    const schema =
      categories === TEXT_CATEGORIES && wallets.length === 0 ? PARSE_SCHEMA : buildParseSchema(categories, wallets);
    const messages = [
      ...history.map((turn) => ({ role: turn.role, content: turn.text })),
      { role: 'user', content: text },
    ];
    const response = await client.messages.create(
      {
        model,
        // เผื่อที่ให้การคิดของ Haiku 5.5 ซึ่งนับรวมใน max_tokens
        max_tokens: 2048,
        system: buildSystemPrompt(today, categories, wallets),
        messages,
        output_config: withLowEffort(model, { format: { type: 'json_schema', schema } }),
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
    return toParseResult(data, today, categories, wallets);
  };
}

module.exports = {
  createMessageParser,
  ParseError,
  PARSE_SCHEMA,
  buildParseSchema,
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

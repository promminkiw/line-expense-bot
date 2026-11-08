const { TEXT_CATEGORIES, normalizeCategory } = require('./categories');
const { toBangkokDateString, isValidCalendarDate } = require('../utils/date');
const { withLowEffort } = require('../utils/claude-effort');
const { PERSONA_PROMPT } = require('../persona');
const { evaluateAmountExpression } = require('./amount-expression');

const DEFAULT_CLARIFY_QUESTION = 'บอกเฮียอีกครั้งได้ไหมว่าจดรายการอะไร จำนวนเท่าไร เช่น "กินข้าว 60"';
const AMOUNT_TOO_LARGE_QUESTION = 'จำนวนเงินเกินเพดานที่เฮียจดได้ (ไม่เกิน 10,000,000 บาทต่อรายการ)';
// reply token ของ LINE หมดอายุเร็ว จึงต้องจำกัดเวลารอ Claude ให้ทันตอบข้อความ fallback
const REQUEST_TIMEOUT_MS = 20000;
const MAX_RETRIES = 1;
// SDK รอตาม retry-after ของ server ได้ไม่จำกัด จึงต้องมีเส้นตายรวมที่ตัดได้แน่นอน
const OVERALL_TIMEOUT_MS = 30000;

// กันตัวเลขที่ Claude อ่านผิดจนใหญ่ผิดปกติ ค่าเดียวกับ check constraint ใน supabase/schema.sql
const MAX_AMOUNT = 10000000;

const INTENTS = ['record', 'question', 'summary', 'help', 'saving', 'greeting', 'unsupported'];
const SUMMARY_PERIODS = ['today', 'week', 'month', 'other'];
const UNSUPPORTED_KINDS = ['delete', 'edit', 'budget', 'web', 'other'];

// messages.create ไม่แปลง schema ให้ จึงต้องใส่ additionalProperties: false เองทุก object
function buildParseSchema(categories, wallets = []) {
  const names = [...new Set([...categories.expense, ...categories.income])];
  const properties = {
    type: { type: 'string', enum: ['expense', 'income'] },
    category: { type: 'string', enum: names },
    amount: { type: 'number' },
    amount_expression: { type: 'string' },
    date: { type: 'string' },
    note: { type: 'string' },
  };
  const required = ['type', 'category', 'amount', 'amount_expression', 'date', 'note'];
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
      intent: { type: 'string', enum: INTENTS },
      summary_period: { type: 'string', enum: [...SUMMARY_PERIODS, ''] },
      goal_name: { type: 'string' },
      saving_amount: { type: 'number' },
      unsupported_kind: { type: 'string', enum: [...UNSUPPORTED_KINDS, ''] },
    },
    required: [
      'needs_clarification',
      'question',
      'items',
      'intent',
      'summary_period',
      'goal_name',
      'saving_amount',
      'unsupported_kind',
    ],
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
    '- amount is the number of Thai baht as a positive number.',
    '- When one entry\'s amount is written as arithmetic, put it in amount_expression using only digits, ".", "+", "-", "*", "/", "(", ")" and sqrt(...), and set amount to 0. Examples: "รูท25*x10" is "sqrt(25)*10", "ชานม 2 แก้ว แก้วละ 35" is one entry with "2*35", "ค่าไฟ 1200/3" is "1200/3". Never compute it yourself. Otherwise amount_expression is "".',
    '- Several items each with its own amount are separate entries, e.g. "กินข้าว 40+น้ำ 10+ขนม 20" is three entries. Never add amounts of different items together.',
    '- When one item is followed by several amounts joined with "+" and no item names between them, e.g. "กินข้าว 40+10+20", set needs_clarification to true and ask whether to record one total or separate entries.',
    '- date is YYYY-MM-DD. Resolve relative words such as "เมื่อวาน" or "เมื่อวานซืน" from today. Use today when no date is given.',
    '- note is a short Thai description taken from the message, e.g. "กินข้าว".',
    `- Expense categories: ${categories.expense.join(', ')}`,
    `- Income categories: ${categories.income.join(', ')}`,
    '- Pick the category from the list that matches the item type. Use "อื่นๆ" when nothing fits.',
    ...walletRules,
    '- If any entry has no amount, or you cannot tell what it is, set needs_clarification to true, items to [], and write one short Thai question in question.',
    `- ${PERSONA_PROMPT}`,
    '- Never ask about the date in question. A missing date always means today.',
    '- Earlier turns are context only. Return entries from the latest user message; use earlier turns only to complete an entry the assistant asked about.',
    '- intent says what the user wants: "record" to record entries; "question" to ask the total of past entries, e.g. "ยอดเดือนนี้", "เดือนนี้ใช้เงินไปเยอะไหม"; "summary" to ask for a summary or report, e.g. "สรุปหน่อย", "ดูสรุป", "สรุปเดือนที่แล้ว", "รายงาน"; "help" to ask how to use the bot, e.g. "ใช้ยังไง", "ช่วยด้วย", "help"; "saving" to put money into a saving goal, e.g. "เก็บเงินเข้าเป้า เที่ยวญี่ปุ่น 500"; "greeting" for greetings, thanks or small talk, e.g. "สวัสดี", "ขอบคุณ", "555"; "unsupported" for any other request the bot cannot do in chat.',
    '- A message that names an item and an amount is "record" even when it has a question word, e.g. "ข้าวมันไก่ 50 แพงเท่าไหร่". A message that names only an item or only an amount, e.g. "ข้าว" or "60", is "record" and needs clarification.',
    '- When the latest message answers a question the assistant asked, intent is "record".',
    '- "ออมสิน" is a bank name; "ออมสิน 1000" or paying at ออมสิน is "record", not "saving". "ออมสิน 1000" is a complete expense entry and needs no clarification.',
    '- summary_period is "today", "week" or "month" when the summary asks for today, this week or this month; "other" for any other period, e.g. last month or this year; "" when no period is given or intent is not "summary".',
    '- goal_name and saving_amount are the goal name and the amount for intent "saving". Otherwise "" and 0.',
    '- saving_amount is only a plain number written by the user, e.g. "500" or "1,500". When the saving amount is written as arithmetic, e.g. "500*2" or "รูท25*x10", set saving_amount to 0.',
    '- unsupported_kind for intent "unsupported": "delete" to delete an entry, "edit" to change an entry, "budget" to ask about budgets, "web" to open the web page, "other" for anything else. Otherwise "".',
    '- When intent is not "record", set needs_clarification to false, question to "" and items to [].',
    '- When intent is "record" and no entry needs clarification, set needs_clarification to false and question to "".',
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

// ไม่ใช้ isValidAmount ของ api/validate เพราะ validate require ไฟล์นี้อยู่แล้ว จะเกิด circular import
function isSavingAmount(amount) {
  return (
    typeof amount === 'number' &&
    Number.isFinite(amount) &&
    amount > 0 &&
    amount <= MAX_AMOUNT &&
    Math.abs(amount * 100 - Math.round(amount * 100)) < 1e-6
  );
}

// intent ที่ไม่รู้จักหรือไม่มีถือเป็นการบันทึกรายการ เพื่อไม่ให้ข้อความหายไปเงียบๆ
function toIntentResult(data) {
  switch (data.intent) {
    case 'question':
    case 'help':
    case 'greeting':
      return { status: 'intent', intent: data.intent };
    case 'summary':
      return {
        status: 'intent',
        intent: 'summary',
        period: SUMMARY_PERIODS.includes(data.summary_period) ? data.summary_period : 'menu',
      };
    case 'saving':
      return {
        status: 'intent',
        intent: 'saving',
        name: typeof data.goal_name === 'string' ? data.goal_name.trim() : '',
        amount: isSavingAmount(data.saving_amount) ? data.saving_amount : null,
      };
    case 'unsupported':
      return {
        status: 'intent',
        intent: 'unsupported',
        kind: UNSUPPORTED_KINDS.includes(data.unsupported_kind) ? data.unsupported_kind : 'other',
      };
    default:
      return null;
  }
}

// ยอดจากนิพจน์ที่คำนวณไม่ได้กลายเป็น NaN ให้ toParseResult ถามกลับเหมือนยอดที่ไม่ถูกต้อง
function resolveAmountExpressions(data) {
  return {
    ...data,
    items: data.items.map((item) => {
      const expression = typeof item.amount_expression === 'string' ? item.amount_expression.trim() : '';
      if (!expression) return item;
      return { ...item, amount: evaluateAmountExpression(expression) ?? Number.NaN };
    }),
  };
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
    const intentResult = toIntentResult(data);
    if (intentResult) {
      return intentResult;
    }
    return toParseResult(resolveAmountExpressions(data), today, categories, wallets);
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
  INTENTS,
  toIntentResult,
  resolveAmountExpressions,
};

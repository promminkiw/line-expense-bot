const {
  ParseError,
  REQUEST_TIMEOUT_MS,
  MAX_RETRIES,
  OVERALL_TIMEOUT_MS,
  isPlainObject,
} = require('../parser/parse-message');
const { toBangkokDateString, isValidCalendarDate } = require('../utils/date');
const { withLowEffort } = require('../utils/claude-effort');
const { displayCategoryName, categoryNameFromDisplay } = require('../parser/categories');
const { displayWalletName, walletNameFromDisplay } = require('../wallets/wallets');

// ไม่ตัดข้อความที่มีตัวเลข เพราะคำถามมักมีวันที่ เช่น "1-15 ต.ค. ใช้ไปเท่าไหร่" ให้ Claude ตัดสินด้วย is_question
// รูปอังกฤษอย่าง "total 500 groceries" อาจผ่านมาได้ แต่ Claude ตอบ is_question false แล้วข้อความไปบันทึกตามปกติ เสียแค่หนึ่ง call
const QUESTION_PATTERN = /เท่าไหร่|เท่าไร|กี่บาท|ไปเท่า|รวมเท่า|\bhow much\b|\btotal\b/i;
const QUESTION_TYPES = ['expense', 'income', 'both'];
const MAX_KEYWORD_LENGTH = 50;
// ช่วงยาวกว่าหนึ่งปีน่าจะเป็นวันที่ที่ Claude อ่านผิด และทำให้ SQL อ่านแถวมากเกินไป
const MAX_RANGE_DAYS = 366;
const DAY_MS = 24 * 60 * 60 * 1000;

function looksLikeQuestion(text) {
  return QUESTION_PATTERN.test(text);
}

// messages.create ไม่แปลง schema ให้ จึงต้องใส่ additionalProperties: false เอง
function buildQuestionSchema(categoryNames, walletNames = []) {
  const properties = {
    is_question: { type: 'boolean' },
    type: { type: 'string', enum: QUESTION_TYPES },
    category: { type: 'string', enum: [...new Set(categoryNames), ''] },
    keyword: { type: 'string' },
    from: { type: 'string' },
    to: { type: 'string' },
  };
  const required = ['is_question', 'type', 'category', 'keyword', 'from', 'to'];
  // ผู้ใช้กระเป๋าเดียวไม่ต้องกรองกระเป๋า schema และ prompt จึงเหมือนเดิม
  if (walletNames.length > 0) {
    properties.wallet = { type: 'string', enum: [...new Set(walletNames), ''] };
    required.push('wallet');
  }
  return { type: 'object', properties, required, additionalProperties: false };
}

// ส่วนของ prompt ที่ต่างตามภาษา ค่า th ต้องคงเดิมทุกตัวอักษร
const PROMPT_COPY = {
  th: {
    intro:
      'You read a Thai message sent to a personal finance bot and decide whether the user asks how much they spent or earned.',
    languageRule: null,
    walletExample: '"บัตรเครดิต"',
    question: '"เดือนนี้กินกาแฟไปเท่าไหร่"',
    record: '"กาแฟ 45"',
    budget: '"งบเหลือเท่าไหร่"',
    keyword: '"กาแฟ"',
    periods:
      '- from and to are YYYY-MM-DD. "วันนี้" is today. "สัปดาห์นี้" is Monday of this week to today. "เดือนนี้" is the 1st of this month to today. "เดือนที่แล้ว" is the whole previous month. When no period is given, use the 1st of this month to today.',
  },
  en: {
    intro:
      'You read a message sent to a personal finance bot and decide whether the user asks how much they spent or earned.',
    languageRule: 'The message may be in Thai or English.',
    walletExample: '"credit card"',
    question: '"how much did I spend on coffee this month" or "เดือนนี้กินกาแฟไปเท่าไหร่"',
    record: '"coffee 45"',
    budget: '"how much budget is left"',
    keyword: '"coffee", written as the user wrote it',
    periods:
      '- from and to are YYYY-MM-DD. "today" or "วันนี้" is today. "this week" or "สัปดาห์นี้" is Monday of this week to today. "this month" or "เดือนนี้" is the 1st of this month to today. "last month" or "เดือนที่แล้ว" is the whole previous month. When no period is given, use the 1st of this month to today.',
  },
};

// รายชื่อหมวดของคำถามไม่มีประเภท อื่นๆ มีทั้งสองฝั่งแต่แปลเหมือนกัน จึงลองรายจ่ายก่อนแล้วค่อยรายรับ
function displayQuestionCategory(lang, name) {
  const expense = displayCategoryName(lang, 'expense', name);
  return expense === name ? displayCategoryName(lang, 'income', name) : expense;
}

function questionCategoryFromDisplay(lang, shown, categoryNames) {
  const owned = categoryNames.flatMap((name) => [
    { type: 'expense', name },
    { type: 'income', name },
  ]);
  const expense = categoryNameFromDisplay(lang, 'expense', shown, owned);
  return categoryNames.includes(expense) ? expense : categoryNameFromDisplay(lang, 'income', shown, owned);
}

function displayNames(lang, categoryNames, walletNames) {
  if (lang !== 'en') return { categories: categoryNames, wallets: walletNames };
  return {
    categories: categoryNames.map((name) => displayQuestionCategory(lang, name)),
    wallets: walletNames.map((name) => displayWalletName(lang, name)),
  };
}

function buildSystemPrompt(today, categoryNames, walletNames = [], lang = 'th') {
  const copy = lang === 'en' ? PROMPT_COPY.en : PROMPT_COPY.th;
  const walletRules =
    walletNames.length > 0
      ? [
          `- Wallets: ${[...new Set(walletNames)].join(', ')}`,
          `- wallet is a name from the wallet list only when the user names that wallet, e.g. ${copy.walletExample}. Otherwise "". When is_question is false, set wallet to "".`,
        ]
      : [];
  return [
    copy.intro,
    ...(copy.languageRule ? [copy.languageRule] : []),
    `Today is ${today} (Asia/Bangkok). Weeks start on Monday.`,
    '',
    'Rules:',
    `- is_question is true only when the user asks for the total of past entries, e.g. ${copy.question}. A message that records a new entry, e.g. ${copy.record}, is not a question.`,
    `- Questions about budgets, e.g. ${copy.budget}, are not totals questions. Set is_question to false.`,
    '- type is expense for spending, income for earnings, both when the user asks about both.',
    `- Categories: ${[...new Set(categoryNames)].join(', ')}`,
    '- category is a name from the list only when the user names that category itself. Otherwise "".',
    `- keyword is one specific item word to search in entry notes, e.g. ${copy.keyword}. Prefer keyword over category when the user names an item. Use "" when the user names no item.`,
    copy.periods,
    '- When is_question is false, set type to "both" and category, keyword, from and to to "".',
    ...walletRules,
  ].join('\n');
}

function monthSoFar(today) {
  return { from: `${today.slice(0, 8)}01`, to: today };
}

function normalizeRange(from, to, today) {
  if (!isValidCalendarDate(from) || !isValidCalendarDate(to) || from > to) {
    return monthSoFar(today);
  }
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS + 1;
  return days > MAX_RANGE_DAYS ? monthSoFar(today) : { from, to };
}

function toQuestion(data, today, categoryNames, walletNames, lang) {
  if (data.is_question !== true) {
    return { isQuestion: false };
  }
  // Claude ตอบเป็นชื่อแสดง ต้องแปลงกลับเป็นชื่อใน DB ก่อนใช้กรองใน queryTotals
  const category =
    lang === 'en' && typeof data.category === 'string' ? questionCategoryFromDisplay(lang, data.category, categoryNames) : data.category;
  const wallet = lang === 'en' && typeof data.wallet === 'string' ? walletNameFromDisplay(lang, data.wallet, walletNames) : data.wallet;
  const keyword = typeof data.keyword === 'string' ? data.keyword.trim().slice(0, MAX_KEYWORD_LENGTH) : '';
  return {
    isQuestion: true,
    type: QUESTION_TYPES.includes(data.type) ? data.type : 'both',
    category: categoryNames.includes(category) ? category : '',
    keyword,
    ...normalizeRange(data.from, data.to, today),
    // ว่างคือไม่กรองกระเป๋า
    wallet: walletNames.includes(wallet) ? wallet : '',
  };
}

function createQuestionParser({ client, model, now = () => new Date() }) {
  return async function parseQuestion(text, categoryNames, walletNames = [], lang = 'th') {
    const today = toBangkokDateString(now());
    const shown = displayNames(lang, categoryNames, walletNames);
    const response = await client.messages.create(
      {
        model,
        // เผื่อที่ให้การคิดของ Haiku 5.5 ซึ่งนับรวมใน max_tokens
        max_tokens: 1024,
        system: buildSystemPrompt(today, shown.categories, shown.wallets, lang),
        messages: [{ role: 'user', content: text }],
        output_config: withLowEffort(model, {
          format: { type: 'json_schema', schema: buildQuestionSchema(shown.categories, shown.wallets) },
        }),
      },
      {
        timeout: REQUEST_TIMEOUT_MS,
        maxRetries: MAX_RETRIES,
        signal: AbortSignal.timeout(OVERALL_TIMEOUT_MS),
      }
    );

    if (response.stop_reason === 'max_tokens') {
      throw new ParseError('Claude question response was truncated');
    }
    if (response.stop_reason === 'refusal') {
      throw new ParseError('Claude refused to read the question');
    }
    const textBlock = response.content.find((block) => block.type === 'text');
    if (!textBlock) {
      throw new ParseError('Claude question response has no text block');
    }
    let data;
    try {
      data = JSON.parse(textBlock.text);
    } catch {
      throw new ParseError('Claude question response is not valid JSON');
    }
    if (!isPlainObject(data) || typeof data.is_question !== 'boolean') {
      throw new ParseError('Claude question response does not match the expected shape');
    }
    return toQuestion(data, today, categoryNames, walletNames, lang);
  };
}

module.exports = {
  looksLikeQuestion,
  createQuestionParser,
  buildQuestionSchema,
  MAX_KEYWORD_LENGTH,
  MAX_RANGE_DAYS,
};

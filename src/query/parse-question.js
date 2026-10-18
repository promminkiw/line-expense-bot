const {
  ParseError,
  REQUEST_TIMEOUT_MS,
  MAX_RETRIES,
  OVERALL_TIMEOUT_MS,
  isPlainObject,
} = require('../parser/parse-message');
const { toBangkokDateString, isValidCalendarDate } = require('../utils/date');
const { withLowEffort } = require('../utils/claude-effort');

// ไม่ตัดข้อความที่มีตัวเลข เพราะคำถามมักมีวันที่ เช่น "1-15 ต.ค. ใช้ไปเท่าไหร่" ให้ Claude ตัดสินด้วย is_question
const QUESTION_PATTERN = /เท่าไหร่|เท่าไร|กี่บาท|ไปเท่า|รวมเท่า/;
const QUESTION_TYPES = ['expense', 'income', 'both'];
const MAX_KEYWORD_LENGTH = 50;
// ช่วงยาวกว่าหนึ่งปีน่าจะเป็นวันที่ที่ Claude อ่านผิด และทำให้ SQL อ่านแถวมากเกินไป
const MAX_RANGE_DAYS = 366;
const DAY_MS = 24 * 60 * 60 * 1000;

function looksLikeQuestion(text) {
  return QUESTION_PATTERN.test(text);
}

// messages.create ไม่แปลง schema ให้ จึงต้องใส่ additionalProperties: false เอง
function buildQuestionSchema(categoryNames) {
  return {
    type: 'object',
    properties: {
      is_question: { type: 'boolean' },
      type: { type: 'string', enum: QUESTION_TYPES },
      category: { type: 'string', enum: [...new Set(categoryNames), ''] },
      keyword: { type: 'string' },
      from: { type: 'string' },
      to: { type: 'string' },
    },
    required: ['is_question', 'type', 'category', 'keyword', 'from', 'to'],
    additionalProperties: false,
  };
}

function buildSystemPrompt(today, categoryNames) {
  return [
    'You read a Thai message sent to a personal finance bot and decide whether the user asks how much they spent or earned.',
    `Today is ${today} (Asia/Bangkok). Weeks start on Monday.`,
    '',
    'Rules:',
    '- is_question is true only when the user asks for the total of past entries, e.g. "เดือนนี้กินกาแฟไปเท่าไหร่". A message that records a new entry, e.g. "กาแฟ 45", is not a question.',
    '- type is expense for spending, income for earnings, both when the user asks about both.',
    `- Categories: ${[...new Set(categoryNames)].join(', ')}`,
    '- category is a name from the list only when the user names that category itself. Otherwise "".',
    '- keyword is one specific item word to search in entry notes, e.g. "กาแฟ". Prefer keyword over category when the user names an item. Use "" when the user names no item.',
    '- from and to are YYYY-MM-DD. "วันนี้" is today. "สัปดาห์นี้" is Monday of this week to today. "เดือนนี้" is the 1st of this month to today. "เดือนที่แล้ว" is the whole previous month. When no period is given, use the 1st of this month to today.',
    '- When is_question is false, set type to "both" and category, keyword, from and to to "".',
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

function toQuestion(data, today, categoryNames) {
  if (data.is_question !== true) {
    return { isQuestion: false };
  }
  const keyword = typeof data.keyword === 'string' ? data.keyword.trim().slice(0, MAX_KEYWORD_LENGTH) : '';
  return {
    isQuestion: true,
    type: QUESTION_TYPES.includes(data.type) ? data.type : 'both',
    category: categoryNames.includes(data.category) ? data.category : '',
    keyword,
    ...normalizeRange(data.from, data.to, today),
  };
}

function createQuestionParser({ client, model, now = () => new Date() }) {
  return async function parseQuestion(text, categoryNames) {
    const today = toBangkokDateString(now());
    const response = await client.messages.create(
      {
        model,
        // เผื่อที่ให้การคิดของ Haiku 5.5 ซึ่งนับรวมใน max_tokens
        max_tokens: 1024,
        system: buildSystemPrompt(today, categoryNames),
        messages: [{ role: 'user', content: text }],
        output_config: withLowEffort(model, { format: { type: 'json_schema', schema: buildQuestionSchema(categoryNames) } }),
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
    return toQuestion(data, today, categoryNames);
  };
}

module.exports = {
  looksLikeQuestion,
  createQuestionParser,
  buildQuestionSchema,
  MAX_KEYWORD_LENGTH,
  MAX_RANGE_DAYS,
};

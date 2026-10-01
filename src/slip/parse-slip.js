const { DEFAULT_CATEGORIES } = require('../parser/categories');
const { toParseResult, ParseError } = require('../parser/parse-message');
const { toBangkokDateString, isValidCalendarDate } = require('../utils/date');

// reply token ของ LINE หมดอายุเร็ว ค่าเวลาเดียวกับ parse-message.js
const REQUEST_TIMEOUT_MS = 20000;
const MAX_RETRIES = 1;
const OVERALL_TIMEOUT_MS = 30000;
// โน้ตมีชื่อผู้รับ จำกัดความยาวกันข้อความยาวผิดปกติจากรูป
const MAX_NOTE_LENGTH = 100;

const ALL_CATEGORIES = [...new Set([...DEFAULT_CATEGORIES.expense, ...DEFAULT_CATEGORIES.income])];

// messages.create ไม่แปลง schema ให้ จึงต้องใส่ additionalProperties: false เอง
const SLIP_SCHEMA = {
  type: 'object',
  properties: {
    is_slip: { type: 'boolean' },
    type: { type: 'string', enum: ['expense', 'income'] },
    category: { type: 'string', enum: ALL_CATEGORIES },
    amount: { type: 'number' },
    date: { type: 'string' },
    note: { type: 'string' },
  },
  required: ['is_slip', 'type', 'category', 'amount', 'date', 'note'],
  additionalProperties: false,
};

function buildSystemPrompt(today) {
  return [
    'You read a picture sent by a Thai user to a personal finance bot and extract one transaction from it.',
    `Today is ${today} (Asia/Bangkok).`,
    '',
    'Rules:',
    '- Set is_slip to true only when the picture is a Thai bank transfer slip, payment confirmation or receipt that shows a paid or received amount. Otherwise set is_slip to false, amount to 0 and fill the other fields with any valid value.',
    '- amount is the transferred or paid amount in Thai baht as a positive number. Do not use the fee or the account balance.',
    '- date is the transaction date as YYYY-MM-DD in the Gregorian calendar. Thai slips use Buddhist era years, so subtract 543 (for example 2569 is 2026). If the date is not visible or unclear, use an empty string.',
    '- type is "expense" when the user paid money out, which is the usual case for a slip. Use "income" only when the slip clearly shows the user received money.',
    '- note is a short Thai description: "โอนให้ <recipient name>" or the shop name. Never include account numbers or reference numbers.',
    `- Expense categories: ${DEFAULT_CATEGORIES.expense.join(', ')}`,
    `- Income categories: ${DEFAULT_CATEGORIES.income.join(', ')}`,
    '- Pick the category from the list that matches the type and the recipient or shop. Use "อื่นๆ" when you are not sure.',
  ].join('\n');
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasValidShape(data) {
  return isPlainObject(data) && typeof data.is_slip === 'boolean' && ['expense', 'income'].includes(data.type);
}

// Claude อาจตอบปี พ.ศ. หลุดมา ปีที่เกินปีหน้าถือเป็น พ.ศ. จึงลบ 543 แล้วปีที่ไม่อยู่ในช่วงใช้งานได้คืนค่าว่างให้ใช้วันนี้แทน
function fixBuddhistYear(date, today) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) {
    return date;
  }
  const currentYear = Number(today.slice(0, 4));
  const rawYear = Number(match[1]);
  const year = rawYear > currentYear + 1 ? rawYear - 543 : rawYear;
  if (year < currentYear - 1 || year > currentYear + 1) {
    return '';
  }
  return `${String(year).padStart(4, '0')}-${match[2]}-${match[3]}`;
}

// ตัดอักขระควบคุมออกกัน jsonb ปฏิเสธและกันขึ้นบรรทัดปลอม แล้วตัดตาม code point กัน surrogate ขาดครึ่ง
function sanitizeNote(note) {
  if (typeof note !== 'string') {
    return '';
  }
  const cleaned = note.replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  return Array.from(cleaned).slice(0, MAX_NOTE_LENGTH).join('');
}

function createSlipParser({ client, model, now = () => new Date() }) {
  return async function parseSlip({ data: imageData, mediaType }) {
    const today = toBangkokDateString(now());
    const response = await client.messages.create(
      {
        model,
        max_tokens: 512,
        system: buildSystemPrompt(today),
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageData } },
              { type: 'text', text: 'อ่านสลิปนี้' },
            ],
          },
        ],
        output_config: { format: { type: 'json_schema', schema: SLIP_SCHEMA } },
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
    if (!data.is_slip) {
      return { status: 'unreadable' };
    }

    const date = fixBuddhistYear(data.date, today);
    const note = sanitizeNote(data.note);
    // ใช้กติกาตรวจยอดและหมวดชุดเดียวกับข้อความตัวอักษร ถ้าไม่ผ่านถือว่าอ่านยอดไม่ได้
    const result = toParseResult(
      {
        needs_clarification: false,
        items: [{ type: data.type, category: data.category, amount: data.amount, date, note }],
      },
      today
    );
    if (result.status !== 'ok') {
      return { status: 'unreadable' };
    }
    return { status: 'ok', item: result.items[0], dateAssumed: !isValidCalendarDate(date) };
  };
}

module.exports = { createSlipParser, SLIP_SCHEMA };

const { DEFAULT_CATEGORIES } = require('../parser/categories');
const { toParseResult, ParseError } = require('../parser/parse-message');
const { toBangkokDateString, isValidCalendarDate } = require('../utils/date');

// reply token ของ LINE หมดอายุเร็ว ค่าเวลาเดียวกับ parse-message.js
const REQUEST_TIMEOUT_MS = 20000;
const MAX_RETRIES = 1;
const OVERALL_TIMEOUT_MS = 30000;
// โน้ตมีชื่อผู้รับ จำกัดความยาวกันข้อความยาวผิดปกติจากรูป
const MAX_NOTE_LENGTH = 100;
// โน้ตของแต่ละสินค้าสั้นกว่าโน้ตหมายเหตุ เพื่อให้ข้อความตอบ 20 รายการไม่เกินขีดจำกัดของ LINE
const MAX_ITEM_NOTE_LENGTH = 50;
// เพดานสินค้าต่อใบ จำกัดความยาวข้อความตอบและจำนวนแถวที่บันทึกต่อใบเสร็จ
const MAX_SLIP_ITEMS = 20;
const MAX_REJECTED_AMOUNTS = 20;

const ALL_CATEGORIES = [...new Set([...DEFAULT_CATEGORIES.expense, ...DEFAULT_CATEGORIES.income])];

// messages.create ไม่แปลง schema ให้ จึงต้องใส่ additionalProperties: false เอง
const SLIP_SCHEMA = {
  type: 'object',
  properties: {
    is_slip: { type: 'boolean' },
    date: { type: 'string' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['expense', 'income'] },
          category: { type: 'string', enum: ALL_CATEGORIES },
          amount: { type: 'number' },
          note: { type: 'string' },
        },
        required: ['type', 'category', 'amount', 'note'],
        additionalProperties: false,
      },
    },
    slip_total: { type: 'number' },
    extras_note: { type: 'string' },
  },
  required: ['is_slip', 'date', 'items', 'slip_total', 'extras_note'],
  additionalProperties: false,
};

function buildSystemPrompt(today) {
  return [
    'You read a picture sent by a Thai user to a personal finance bot and extract the transactions from it.',
    `Today is ${today} (Asia/Bangkok).`,
    '',
    'Rules:',
    '- Set is_slip to true only when the picture is a Thai bank transfer slip, payment confirmation or receipt that shows a paid or received amount. Otherwise set is_slip to false, items to [], slip_total to 0, and the other fields to any valid value.',
    '- A bank transfer slip or a payment confirmation has one amount: return exactly one item.',
    '- A shop receipt lists products or services: return one item per product or service line, in the order printed. Never add amounts together and never merge lines.',
    `- If a receipt has more than ${MAX_SLIP_ITEMS} product lines, return only the first ${MAX_SLIP_ITEMS + 1} items and stop.`,
    '- amount of an item is the price printed on that line in Thai baht as a positive number. If a line has a quantity, use the line total, not the unit price. Do not use fees or the account balance.',
    '- For a bank transfer slip or a payment confirmation with one amount, set extras_note to an empty string and slip_total to 0.',
    '- Do not return discount, VAT, service charge, delivery fee, rounding, change or total lines as items. Instead describe them in extras_note as a short Thai text, for example "ส่วนลด 10 บาท, VAT 7%", or an empty string when there are none.',
    '- Never return as items: lines that are discounts, promotions, coupons or points redemptions, any line whose printed price is negative or marked with a minus, and free items with a price of 0. Describe them briefly in extras_note instead, for example "ส่วนลดโปรโมชั่น 10 บาท, ของแถม 1 รายการ".',
    '- slip_total is the final net amount printed on the slip in Thai baht as a positive number, or 0 when it is not visible.',
    '- date is the transaction date as YYYY-MM-DD in the Gregorian calendar, one date for the whole slip. Thai slips use Buddhist era years, so subtract 543 (for example 2569 is 2026). If the date is not visible or unclear, use an empty string.',
    '- type is "expense" when the user paid money out, which is the usual case. Use "income" only when the slip clearly shows the user received money.',
    '- note is a short Thai description: for a receipt the product name as printed; for a transfer "โอนให้ <recipient name>" or the shop name. Never include account numbers or reference numbers.',
    `- Expense categories: ${DEFAULT_CATEGORIES.expense.join(', ')}`,
    `- Income categories: ${DEFAULT_CATEGORIES.income.join(', ')}`,
    '- Pick the category for each item separately from the list that matches the type and the product or recipient. Use "อื่นๆ" when you are not sure.',
  ].join('\n');
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasValidShape(data) {
  return (
    isPlainObject(data) &&
    typeof data.is_slip === 'boolean' &&
    Array.isArray(data.items) &&
    data.items.every((item) => isPlainObject(item) && ['expense', 'income'].includes(item.type))
  );
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
function sanitizeNote(note, max = MAX_NOTE_LENGTH) {
  if (typeof note !== 'string') {
    return '';
  }
  // toWellFormed แทน surrogate เดี่ยวที่โมเดลส่งมาเอง เพราะ jsonb ปฏิเสธและบันทึกสลิปไม่ได้
  const cleaned = note.toWellFormed().replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  return Array.from(cleaned).slice(0, max).join('');
}

// เก็บเฉพาะเหตุผลและตัวเลขไว้ให้ log ไม่ใส่รูปหรือชื่อสินค้า
function unreadable(reason, itemCount, rejectedAmounts) {
  return { status: 'unreadable', reason, itemCount, rejectedAmounts: rejectedAmounts.slice(0, MAX_REJECTED_AMOUNTS) };
}

function createSlipParser({ client, model, now = () => new Date() }) {
  return async function parseSlip({ data: imageData, mediaType }) {
    const today = toBangkokDateString(now());
    const response = await client.messages.create(
      {
        model,
        max_tokens: 2048,
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
      return unreadable('not_slip', 0, []);
    }
    if (data.items.length === 0) {
      return unreadable('no_items', 0, []);
    }

    const date = fixBuddhistYear(data.date, today);
    const truncated = data.items.length > MAX_SLIP_ITEMS;
    const keptItems = [];
    const rejectedAmounts = [];
    for (const item of data.items.slice(0, MAX_SLIP_ITEMS)) {
      // ตรวจทีละรายการด้วยกติกาชุดเดียวกับข้อความตัวอักษร รายการที่ไม่ผ่านถูกข้ามแทนที่จะทิ้งทั้งใบ
      const result = toParseResult(
        {
          needs_clarification: false,
          items: [
            {
              type: item.type,
              category: item.category,
              amount: item.amount,
              date,
              note: sanitizeNote(item.note, MAX_ITEM_NOTE_LENGTH),
            },
          ],
        },
        today
      );
      if (result.status === 'ok') {
        keptItems.push(result.items[0]);
      } else {
        rejectedAmounts.push(Number.isFinite(item.amount) ? item.amount : null);
      }
    }
    if (keptItems.length === 0) {
      return unreadable('no_valid_items', data.items.length, rejectedAmounts);
    }
    return {
      status: 'ok',
      items: keptItems,
      dateAssumed: !isValidCalendarDate(date),
      extrasNote: sanitizeNote(data.extras_note),
      slipTotal: Number.isFinite(data.slip_total) && data.slip_total > 0 ? data.slip_total : 0,
      truncatedTo: truncated ? MAX_SLIP_ITEMS : 0,
      skippedCount: rejectedAmounts.length,
    };
  };
}

module.exports = { createSlipParser, SLIP_SCHEMA, MAX_SLIP_ITEMS };

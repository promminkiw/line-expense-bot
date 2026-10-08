const { SLIP_CATEGORY, FALLBACK_CATEGORY } = require('../parser/categories');
const {
  toParseResult,
  ParseError,
  REQUEST_TIMEOUT_MS,
  MAX_RETRIES,
  OVERALL_TIMEOUT_MS,
  isPlainObject,
} = require('../parser/parse-message');
const { toBangkokDateString, isValidCalendarDate } = require('../utils/date');

// โน้ตมีชื่อร้านหรือชื่อผู้รับ จำกัดความยาวกันข้อความยาวผิดปกติจากรูป
const MAX_NOTE_LENGTH = 100;

const REJECTION_KINDS = ['none', 'not_a_financial_document', 'unreadable_image', 'partial_or_cropped', 'other'];
const DIRECTIONS = ['paid', 'received'];

// messages.create ไม่แปลง schema ให้ จึงต้องใส่ additionalProperties: false เอง
const SLIP_SCHEMA = {
  type: 'object',
  properties: {
    is_slip: { type: 'boolean' },
    rejection_kind: { type: 'string', enum: REJECTION_KINDS },
    direction: { type: 'string', enum: DIRECTIONS },
    amount: { type: 'number' },
    date: { type: 'string' },
    note: { type: 'string' },
  },
  required: ['is_slip', 'rejection_kind', 'direction', 'amount', 'date', 'note'],
  additionalProperties: false,
};

function buildSystemPrompt(today) {
  return [
    'You read a picture sent by a Thai user to a personal finance bot and extract how much money the user paid or received.',
    `Today is ${today} (Asia/Bangkok).`,
    '',
    'Rules:',
    '- Set is_slip to true when the picture shows a purchase or a payment with at least one price or amount of money, for example a shop receipt from any store (including convenience stores), a tax invoice, a bank transfer slip, a payment confirmation, an e-receipt or an app order summary screenshot, also when the image is a sample, a screenshot, partly cropped, or a photo of paper. Set is_slip to false only when the picture clearly has no purchase or payment amounts (a landscape, a person, a food photo, a document without prices). When is_slip is false, set amount to 0, date and note to empty strings, and the other fields to any valid value.',
    '- Set rejection_kind to "none" when is_slip is true. Otherwise choose the closest kind: "not_a_financial_document", "unreadable_image" (blurry, dark, too small, glare), "partial_or_cropped", or "other".',
    '- Return one amount for the whole picture. Do not list the products or services.',
    '- amount is the final total the user actually paid, in Thai baht as a positive number: for a receipt the grand total after discounts, VAT and service charge (for example "รวมทั้งสิ้น", "ยอดสุทธิ", "Total"), not the subtotal, not the cash handed over and not the change; for a bank transfer slip or a payment confirmation the transferred or paid amount, without fees and never the account balance. Use 0 when no total is visible.',
    '- direction is "paid" when the user paid money out, which is the usual case. Use "received" only when the slip clearly shows the user received the money.',
    '- date is the transaction date as YYYY-MM-DD in the Gregorian calendar. Thai slips use Buddhist era years, so subtract 543 (for example 2569 is 2026). If the date is not visible or unclear, use an empty string.',
    '- note is a short Thai description: for a receipt the shop name; for a transfer you paid "โอนให้ <recipient name>"; for money you received "รับโอนจาก <sender name>". Never include account numbers or reference numbers.',
  ].join('\n');
}

function hasValidShape(data) {
  // ทิศทางสำคัญเฉพาะรูปที่เป็นสลิป รูปที่ถูกปฏิเสธให้ค่าอะไรมาก็ได้
  return isPlainObject(data) && typeof data.is_slip === 'boolean' && (!data.is_slip || DIRECTIONS.includes(data.direction));
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
  // eslint-disable-next-line no-control-regex -- ตั้งใจจับอักขระควบคุมเพื่อตัดทิ้ง
  const cleaned = note.toWellFormed().replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  return Array.from(cleaned).slice(0, max).join('');
}

// เก็บเฉพาะเหตุผลและตัวเลขไว้ให้ log ไม่ใส่รูปหรือชื่อสินค้า
function unreadable(reason, itemCount, rejectedAmounts) {
  return { status: 'unreadable', reason, itemCount, rejectedAmounts };
}

// none ใช้กับใบที่ผ่านเท่านั้น ถ้าโผล่ตอนปฏิเสธถือเป็น other เพื่อให้ log ใช้เป็นตัวนับได้เสมอ
function toRejectionKind(value) {
  return REJECTION_KINDS.includes(value) && value !== 'none' ? value : 'other';
}

function createSlipParser({ client, model, now = () => new Date(), preprocessImage = async (image) => image }) {
  return async function parseSlip(image) {
    const today = toBangkokDateString(now());
    const { data: imageData, mediaType } = await preprocessImage(image);
    const response = await client.messages.create(
      {
        model,
        max_tokens: 1024,
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

    // JSON ถูกตัดกลางทาง ตอบแบบอ่านไม่ได้แทนข้อความระบบมีปัญหา
    if (response.stop_reason === 'max_tokens') {
      return { ...unreadable('too_long', 0, []), rejectionKind: 'other' };
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
      return { ...unreadable('not_slip', 0, []), rejectionKind: toRejectionKind(data.rejection_kind) };
    }
    const date = fixBuddhistYear(data.date, today);
    const paid = data.direction === 'paid';
    // ใช้กติกาเดียวกับข้อความตัวอักษรตรวจยอดและวันที่ ส่วนหมวดบอทกำหนดเอง
    const result = toParseResult(
      {
        needs_clarification: false,
        items: [
          {
            type: paid ? 'expense' : 'income',
            category: FALLBACK_CATEGORY,
            amount: data.amount,
            date,
            note: sanitizeNote(data.note),
          },
        ],
      },
      today
    );
    if (result.status !== 'ok') {
      return unreadable('invalid_amount', 1, [Number.isFinite(data.amount) ? data.amount : null]);
    }
    const [item] = result.items;
    return {
      status: 'ok',
      items: [{ ...item, category: paid ? SLIP_CATEGORY : FALLBACK_CATEGORY }],
      dateAssumed: !isValidCalendarDate(date),
    };
  };
}

module.exports = { createSlipParser, SLIP_SCHEMA };

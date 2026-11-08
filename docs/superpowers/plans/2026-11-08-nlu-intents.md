# NLU Intents and Amount Expressions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ให้บอทเข้าใจข้อความกำกวมภาษาไทย (สรุป/ช่วยเหลือ/ทักทาย/ออม/คำสั่งที่ยังไม่รองรับ/คำถามยอด) และคำนวณนิพจน์ยอดเงิน (เช่น `รูท25*x10`, `2 แก้ว แก้วละ 35`) ด้วยโค้ด ไม่ใช่ให้ Claude คิดเลขเอง

**Architecture:** parser บันทึกรายการ (`src/parser/parse-message.js`) ได้ field `intent` และ `amount_expression` เพิ่มใน call เดิม (ยังเรียก Claude 1 ครั้งต่อข้อความ) ถ้า intent ไม่ใช่ `record` parser คืน `{ status: 'intent', ... }` แล้ว `src/chat/text.js` ส่งต่อไปทางที่ถูก (เมนูสรุป, ช่วยเหลือ, ออม, ข้อความแนะนำ) นิพจน์ยอดเงินคำนวณด้วย recursive-descent evaluator ใหม่ใน `src/parser/amount-expression.js` (ไม่ใช้ `eval`) มีชุด eval (`scripts/nlu-eval-cases.json`) ที่รันกับ Claude จริงด้วยมือ

**Tech Stack:** Node.js CommonJS, vitest, Anthropic SDK (`messages.create` + `output_config.format` json_schema), Claude Haiku 5.5

**ที่มา (ผลทดลองจริง 2026-11-08):** `กินข้าว รูท25*x10` บันทึก 250 (ควร 50), `เก็บเงินเข้าเป้า เที่ยวญี่ปุ่น 500` บันทึกเป็นรายจ่าย, `สรุปหน่อย` `ดูสรุป` `ใช้ยังไง` `สวัสดี` `ลบรายการล่าสุด` ถามกลับว่า "จดรายการอะไร", `งบเหลือเท่าไหร่` ตอบเป็นยอดรายรับรายจ่าย

**การตัดสินของผู้ใช้ (2026-11-08):**
- intent อยู่ใน call เดิม; คำสั่งตรงตัวเดิม (ปุ่มเมนู, `ออม <ชื่อ> <ยอด>`, `สรุป...`) ยังไม่เรียก Claude เหมือนเดิม
- `กินข้าว 40+10+20` (ชื่อเดียว หลายยอด) = ถามกลับ; `กินข้าว 40+น้ำ 10+ขนม 20` = 3 รายการ
- สรุปช่วงที่ไม่มี (เดือนที่แล้ว, ปีนี้) = เมนูสรุปเดิม + บอกดูในหน้าเว็บ
- ลบ/แก้/งบ ผ่านแชต = บอกทางที่ทำได้จริง (ยังไม่ทำคำสั่งจริง)
- ออมภาษาพูด = ออมเข้าเป้าจริงผ่านทางออมเดิม

## Global Constraints

- คอมเมนต์ในโค้ดบรรทัดเดียว ภาษาไทย อธิบาย "ทำไม" ศัพท์เทคนิคคงเป็นอังกฤษ; ชื่อตัวแปร/function/log เป็นอังกฤษ; ห้าม emoji ในโค้ด คอมเมนต์ log commit
- ห้ามใช้ `eval`/`Function` คำนวณนิพจน์
- `src/parser/parse-message.js` ห้าม require `src/api/validate.js` (validate require parse-message อยู่แล้ว จะเกิด circular import)
- `toParseResult` ใช้ร่วมกับ `src/slip/parse-slip.js` ห้ามเปลี่ยน signature หรือพฤติกรรมของมัน
- ยอดเงิน: มากกว่า 0, ไม่เกิน `MAX_AMOUNT` (10,000,000), ปัดเป็นสตางค์ (2 ตำแหน่ง)
- รัน `npm test -- --testTimeout=30000` และ `npm run lint` ก่อน commit ทุก task (timeout 5 วินาทีตกแบบสุ่มตามภาระเครื่อง)
- ทำงานบน branch `feat/nlu-intents` (สร้างจาก `main`)
- commit message ลงท้ายด้วย:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01Da9wFP75ycMuWVUBnhNAtk
  ```

---

### Task 1: Amount expression evaluator

**Depends on:** none

**Files:**
- Create: `src/parser/amount-expression.js`
- Test: `src/parser/amount-expression.test.js`

**Interfaces:**
- Produces: `evaluateAmountExpression(text: string): number | null` — คืนยอดปัด 2 ตำแหน่ง หรือ `null` เมื่ออ่านไม่ได้, หารด้วย 0, sqrt ติดลบ, ผล <= 0, ยาวเกิน 100 ตัวอักษร; `MAX_EXPRESSION_LENGTH = 100`

- [ ] **Step 1: Write the failing test**

```js
// src/parser/amount-expression.test.js
import { describe, it, expect } from 'vitest';
import { evaluateAmountExpression, MAX_EXPRESSION_LENGTH } from './amount-expression.js';

describe('evaluateAmountExpression', () => {
  it.each([
    ['60', 60],
    ['2*35', 70],
    ['40+10+20', 70],
    ['1200/3', 400],
    ['sqrt(25)*10', 50],
    ['(10+5)*2', 30],
    ['100-20', 80],
    ['1,500*2', 3000],
    ['2.5*3', 7.5],
    ['10/3', 3.33],
    ['sqrt(2)*10', 14.14],
  ])('computes %s as %s', (text, expected) => {
    expect(evaluateAmountExpression(text)).toBe(expected);
  });

  // Claude อาจส่งรูปที่ผู้ใช้พิมพ์มาตรงๆ จึงรับสัญลักษณ์ที่คนไทยใช้บ่อยด้วย
  it.each([
    ['2×35', 70],
    ['2x35', 70],
    ['70÷2', 35],
    ['√25*10', 50],
    ['รูท25*x10', 50],
    ['2 * 35', 70],
  ])('accepts the written form %s', (text, expected) => {
    expect(evaluateAmountExpression(text)).toBe(expected);
  });

  it.each([
    [''],
    ['abc'],
    ['2+'],
    ['(2+3'],
    ['2)'],
    ['5/0'],
    ['sqrt(-4)'],
    ['10-20'],
    ['0*5'],
    ['process.exit()'],
    ['2;3'],
    // ตัวเลขที่คั่นด้วยช่องว่างคือหลายยอด ห้ามต่อกันเป็นยอดเดียว
    ['40 100'],
    ['40, 100'],
    ['1 0 0'],
    ['2**3'],
  ])('returns null for %s', (text) => {
    expect(evaluateAmountExpression(text)).toBeNull();
  });

  it('returns null for a non-string', () => {
    expect(evaluateAmountExpression(undefined)).toBeNull();
    expect(evaluateAmountExpression(60)).toBeNull();
  });

  it('returns null for an expression longer than the limit', () => {
    expect(evaluateAmountExpression('1+'.repeat(MAX_EXPRESSION_LENGTH) + '1')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/parser/amount-expression.test.js`
Expected: FAIL (cannot find module `./amount-expression.js`)

- [ ] **Step 3: Write minimal implementation**

```js
// src/parser/amount-expression.js
// คำนวณนิพจน์ยอดเงินเองแทน Claude เพราะ LLM คิดเลขพลาดได้ และห้ามใช้ eval ซึ่งรันโค้ดอะไรก็ได้
const MAX_EXPRESSION_LENGTH = 100;
const TOKEN_PATTERN = /\d+(?:\.\d+)?|sqrt|[+\-*/()]/y;

function normalize(text) {
  return (
    text
      .replace(/\s+/g, '')
      // คอมมาเป็นตัวคั่นหลักพันเท่านั้น
      .replace(/(\d),(?=\d{3}(?!\d))/g, '$1')
      // ผู้ใช้พิมพ์ "*x" ซ้อนกันได้ ยุบก่อนแปลง x เพื่อไม่ให้ "**" ที่พิมพ์เองผ่าน
      .replace(/\*[xX×]/g, '*')
      .replace(/[×xX]/g, '*')
      .replace(/÷/g, '/')
      .replace(/√|รูท/g, 'sqrt')
  );
}

function tokenize(text) {
  const tokens = [];
  TOKEN_PATTERN.lastIndex = 0;
  while (TOKEN_PATTERN.lastIndex < text.length) {
    const match = TOKEN_PATTERN.exec(text);
    if (!match) return null;
    tokens.push(match[0]);
  }
  return tokens;
}

function evaluateTokens(tokens) {
  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];

  function expression() {
    let value = term();
    while (peek() === '+' || peek() === '-') {
      const op = next();
      const right = term();
      value = op === '+' ? value + right : value - right;
    }
    return value;
  }

  function term() {
    let value = factor();
    while (peek() === '*' || peek() === '/') {
      const op = next();
      const right = factor();
      value = op === '*' ? value * right : value / right;
    }
    return value;
  }

  function factor() {
    const token = next();
    if (token === '(') {
      const value = expression();
      if (next() !== ')') throw new SyntaxError('Missing closing parenthesis');
      return value;
    }
    if (token === 'sqrt') return Math.sqrt(factor());
    if (token !== undefined && /^\d/.test(token)) return Number(token);
    throw new SyntaxError('Unexpected token');
  }

  const value = expression();
  if (pos !== tokens.length) throw new SyntaxError('Unexpected trailing token');
  return value;
}

function evaluateAmountExpression(text) {
  if (typeof text !== 'string' || text.length === 0 || text.length > MAX_EXPRESSION_LENGTH) {
    return null;
  }
  // normalize ลบช่องว่าง ถ้าไม่ดักก่อน "40 100" จะกลายเป็น 40100
  if (/\d[\s,]*\s\d/.test(text)) {
    return null;
  }
  const tokens = tokenize(normalize(text));
  if (!tokens || tokens.length === 0) return null;
  let value;
  try {
    value = evaluateTokens(tokens);
  } catch {
    return null;
  }
  // หารด้วย 0 ได้ Infinity และ sqrt ติดลบได้ NaN
  if (!Number.isFinite(value)) return null;
  const rounded = Math.round(value * 100) / 100;
  return rounded > 0 ? rounded : null;
}

module.exports = { evaluateAmountExpression, MAX_EXPRESSION_LENGTH };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/parser/amount-expression.test.js`
Expected: PASS ทุกข้อ

- [ ] **Step 5: Lint and commit**

```bash
npm run lint
git add src/parser/amount-expression.js src/parser/amount-expression.test.js
git commit -m "feat(parser): evaluate amount expressions in code"
```
(ต่อท้าย message ด้วยบรรทัด attribution ใน Global Constraints)

---

### Task 2: Intent and amount_expression in the message parser

**Depends on:** Task 1

**Files:**
- Modify: `src/parser/parse-message.js` (`buildParseSchema`, `buildSystemPrompt`, `createMessageParser`, exports)
- Test: `src/parser/parse-message.test.js`

**Interfaces:**
- Consumes: `evaluateAmountExpression(text)` จาก `./amount-expression`
- Produces: `parseMessage(text, history, categories, wallets)` คืนค่าได้ 3 แบบ:
  - `{ status: 'ok', items }` (เดิม)
  - `{ status: 'clarify', question }` (เดิม)
  - `{ status: 'intent', intent: 'question' | 'help' | 'greeting' }`
  - `{ status: 'intent', intent: 'summary', period: 'today' | 'week' | 'month' | 'other' | 'menu' }` (`'menu'` = ไม่ได้บอกช่วง)
  - `{ status: 'intent', intent: 'saving', name: string, amount: number | null }` (`null` = ยอดไม่ผ่านเกณฑ์)
  - `{ status: 'intent', intent: 'unsupported', kind: 'delete' | 'edit' | 'budget' | 'web' | 'other' }`
- export ใหม่: `INTENTS`, `toIntentResult(data)`, `resolveAmountExpressions(data)`
- intent ที่ไม่รู้จักหรือไม่มี (`undefined`) ถือเป็น `record` ทำให้ mock เดิมในเทสต์อื่นยังใช้ได้

- [ ] **Step 1: Write the failing tests**

ต่อท้าย `src/parser/parse-message.test.js` (ใช้ `fakeClient`, `item`, `okPayload`, `NOW` ที่มีอยู่แล้วในไฟล์) และเพิ่ม `INTENTS` ใน import ด้านบนของไฟล์:

```js
describe('parseMessage intents', () => {
  function intentPayload(fields) {
    return {
      needs_clarification: false,
      question: '',
      items: [],
      summary_period: '',
      goal_name: '',
      saving_amount: 0,
      unsupported_kind: '',
      ...fields,
    };
  }

  async function parseWith(payload, text = 'ข้อความ') {
    return createMessageParser({ client: fakeClient(payload), model: 'm', now: NOW })(text);
  }

  it('offers every intent in the schema and requires the intent fields', () => {
    expect(PARSE_SCHEMA.properties.intent.enum).toEqual(INTENTS);
    expect(INTENTS).toEqual(['record', 'question', 'summary', 'help', 'saving', 'greeting', 'unsupported']);
    expect(PARSE_SCHEMA.required).toEqual([
      'needs_clarification',
      'question',
      'items',
      'intent',
      'summary_period',
      'goal_name',
      'saving_amount',
      'unsupported_kind',
    ]);
    expect(PARSE_SCHEMA.properties.items.items.required).toContain('amount_expression');
  });

  it('describes the intents in the system prompt', async () => {
    const client = fakeClient(okPayload([item()]));
    await createMessageParser({ client, model: 'm', now: NOW })('สรุปหน่อย');

    const { system } = client.messages.create.mock.calls[0][0];
    expect(system).toContain('intent');
    expect(system).toContain('สรุปหน่อย');
    expect(system).toContain('เก็บเงินเข้าเป้า เที่ยวญี่ปุ่น 500');
    expect(system).toContain('amount_expression');
    expect(system).toContain('กินข้าว 40+10+20');
    expect(system).toContain('"ออมสิน 1000" or paying at ออมสิน is "record", not "saving"');
    expect(system).not.toContain('Never add amounts together.');
  });

  it.each(['question', 'help', 'greeting'])('returns the %s intent', async (intent) => {
    expect(await parseWith(intentPayload({ intent }))).toEqual({ status: 'intent', intent });
  });

  it.each([
    ['today', 'today'],
    ['week', 'week'],
    ['month', 'month'],
    ['other', 'other'],
    ['', 'menu'],
    ['year', 'menu'],
  ])('maps summary period %j to %j', async (summaryPeriod, period) => {
    expect(await parseWith(intentPayload({ intent: 'summary', summary_period: summaryPeriod }))).toEqual({
      status: 'intent',
      intent: 'summary',
      period,
    });
  });

  it('returns the goal name and amount for a saving', async () => {
    const payload = intentPayload({ intent: 'saving', goal_name: ' เที่ยวญี่ปุ่น ', saving_amount: 500 });
    expect(await parseWith(payload)).toEqual({ status: 'intent', intent: 'saving', name: 'เที่ยวญี่ปุ่น', amount: 500 });
  });

  it.each([0, -5, MAX_AMOUNT + 1, 10.555, Number.NaN])('returns a null saving amount for %s', async (amount) => {
    const payload = intentPayload({ intent: 'saving', goal_name: 'เที่ยวญี่ปุ่น', saving_amount: amount });
    expect((await parseWith(payload)).amount).toBeNull();
  });

  it.each([
    ['delete', 'delete'],
    ['edit', 'edit'],
    ['budget', 'budget'],
    ['web', 'web'],
    ['other', 'other'],
    ['', 'other'],
  ])('maps unsupported kind %j to %j', async (unsupportedKind, kind) => {
    expect(await parseWith(intentPayload({ intent: 'unsupported', unsupported_kind: unsupportedKind }))).toEqual({
      status: 'intent',
      intent: 'unsupported',
      kind,
    });
  });

  // mock เดิมและคำตอบที่ไม่มี intent ต้องบันทึกรายการเหมือนเดิม
  it.each([undefined, 'record', 'dance'])('records entries when intent is %j', async (intent) => {
    const result = await parseWith({ ...okPayload([item()]), intent });
    expect(result.status).toBe('ok');
  });
});

describe('parseMessage amount expressions', () => {
  async function parseItems(items) {
    return createMessageParser({ client: fakeClient(okPayload(items)), model: 'm', now: NOW })('ข้อความ');
  }

  it('computes the amount from the expression instead of trusting Claude', async () => {
    const result = await parseItems([item({ amount: 250, amount_expression: 'sqrt(25)*10' })]);
    expect(result).toEqual({ status: 'ok', items: [{ ...item(), amount: 50 }] });
  });

  it('computes quantity times unit price', async () => {
    const result = await parseItems([item({ note: 'ชานม', amount: 0, amount_expression: '2*35' })]);
    expect(result.items[0].amount).toBe(70);
  });

  it('keeps the amount when the expression is empty', async () => {
    const result = await parseItems([item({ amount: 60, amount_expression: '' })]);
    expect(result.items[0].amount).toBe(60);
  });

  it('asks back when the expression cannot be computed', async () => {
    const result = await parseItems([item({ amount: 0, amount_expression: '5/0' })]);
    expect(result).toEqual({ status: 'clarify', question: DEFAULT_CLARIFY_QUESTION });
  });

  it('applies the amount limit to a computed amount', async () => {
    const result = await parseItems([item({ amount: 0, amount_expression: '5000000*3' })]);
    expect(result).toEqual({ status: 'clarify', question: AMOUNT_TOO_LARGE_QUESTION });
  });

  it('does not put amount_expression on saved items', async () => {
    const result = await parseItems([item({ amount_expression: '30*2' })]);
    expect(result.items[0]).not.toHaveProperty('amount_expression');
  });
});
```

แก้เทสต์เดิมที่ล็อกรูป schema ของ item (`src/parser/parse-message.test.js` ราวบรรทัด 415):

```js
    expect(itemSchema.required).toEqual(['type', 'category', 'amount', 'amount_expression', 'date', 'note', 'wallet']);
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/parser/parse-message.test.js`
Expected: FAIL (`INTENTS` undefined, schema ไม่มี `intent`, ยอด 250 ไม่ถูกคำนวณใหม่)

- [ ] **Step 3: Implement**

ใน `src/parser/parse-message.js`:

1. เพิ่ม require ด้านบน:

```js
const { evaluateAmountExpression } = require('./amount-expression');
```

2. เพิ่มค่าคงที่ใต้ `MAX_AMOUNT`:

```js
const INTENTS = ['record', 'question', 'summary', 'help', 'saving', 'greeting', 'unsupported'];
const SUMMARY_PERIODS = ['today', 'week', 'month', 'other'];
const UNSUPPORTED_KINDS = ['delete', 'edit', 'budget', 'web', 'other'];
```

3. ใน `buildParseSchema` เพิ่ม `amount_expression` ต่อจาก `amount` ทั้งใน `properties` และ `required` และเพิ่ม field ระดับบนสุด:

```js
  const properties = {
    type: { type: 'string', enum: ['expense', 'income'] },
    category: { type: 'string', enum: names },
    amount: { type: 'number' },
    amount_expression: { type: 'string' },
    date: { type: 'string' },
    note: { type: 'string' },
  };
  const required = ['type', 'category', 'amount', 'amount_expression', 'date', 'note'];
```

```js
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
```

หมายเหตุ: `INTENTS` ต้องประกาศก่อน `const PARSE_SCHEMA = buildParseSchema(...)` (ย้ายค่าคงที่ขึ้นไปไว้เหนือ `buildParseSchema`)

4. ใน `buildSystemPrompt` แทนบรรทัด `'- amount is the number of Thai baht as a positive number. Never add amounts together.',` ด้วย:

```js
    '- amount is the number of Thai baht as a positive number.',
    '- When one entry\'s amount is written as arithmetic, put it in amount_expression using only digits, ".", "+", "-", "*", "/", "(", ")" and sqrt(...), and set amount to 0. Examples: "รูท25*x10" is "sqrt(25)*10", "ชานม 2 แก้ว แก้วละ 35" is one entry with "2*35", "ค่าไฟ 1200/3" is "1200/3". Never compute it yourself. Otherwise amount_expression is "".',
    '- Several items each with its own amount are separate entries, e.g. "กินข้าว 40+น้ำ 10+ขนม 20" is three entries. Never add amounts of different items together.',
    '- When one item is followed by several amounts joined with "+" and no item names between them, e.g. "กินข้าว 40+10+20", set needs_clarification to true and ask whether to record one total or separate entries.',
```

และเพิ่มก่อนบรรทัดสุดท้าย (`'- Otherwise set needs_clarification to false and question to "".'`):

```js
    '- intent says what the user wants: "record" to record entries; "question" to ask the total of past entries, e.g. "ยอดเดือนนี้", "เดือนนี้ใช้เงินไปเยอะไหม"; "summary" to ask for a summary or report, e.g. "สรุปหน่อย", "ดูสรุป", "สรุปเดือนที่แล้ว", "รายงาน"; "help" to ask how to use the bot, e.g. "ใช้ยังไง", "ช่วยด้วย", "help"; "saving" to put money into a saving goal, e.g. "เก็บเงินเข้าเป้า เที่ยวญี่ปุ่น 500"; "greeting" for greetings, thanks or small talk, e.g. "สวัสดี", "ขอบคุณ", "555"; "unsupported" for any other request the bot cannot do in chat.',
    '- A message that names an item and an amount is "record" even when it has a question word, e.g. "ข้าวมันไก่ 50 แพงเท่าไหร่". A message that names only an item or only an amount, e.g. "ข้าว" or "60", is "record" and needs clarification.',
    '- When the latest message answers a question the assistant asked, intent is "record".',
    '- "ออมสิน" is a bank name; "ออมสิน 1000" or paying at ออมสิน is "record", not "saving".',
    '- summary_period is "today", "week" or "month" when the summary asks for today, this week or this month; "other" for any other period, e.g. last month or this year; "" when no period is given or intent is not "summary".',
    '- goal_name and saving_amount are the goal name and the amount for intent "saving". Otherwise "" and 0.',
    '- unsupported_kind for intent "unsupported": "delete" to delete an entry, "edit" to change an entry, "budget" to ask about budgets, "web" to open the web page, "other" for anything else. Otherwise "".',
    '- When intent is not "record", set needs_clarification to false, question to "" and items to [].',
```

5. เพิ่ม function ใต้ `toParseResult`:

```js
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
```

6. ใน `createMessageParser` แทน `return toParseResult(data, today, categories, wallets);` ด้วย:

```js
    const intentResult = toIntentResult(data);
    if (intentResult) {
      return intentResult;
    }
    return toParseResult(resolveAmountExpressions(data), today, categories, wallets);
```

7. เพิ่ม `INTENTS`, `toIntentResult`, `resolveAmountExpressions` ใน `module.exports`

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/parser/parse-message.test.js src/slip/parse-slip.test.js`
Expected: PASS ทั้งหมด (slip ต้องผ่านเพราะ `toParseResult` ไม่เปลี่ยน)

- [ ] **Step 5: Full test, lint, commit**

```bash
npm test -- --testTimeout=30000
npm run lint
git add src/parser/parse-message.js src/parser/parse-message.test.js
git commit -m "feat(parser): read intent and amount expressions from Claude"
```

---

### Task 3: Budget questions are not totals questions

**Depends on:** none

**Files:**
- Modify: `src/query/parse-question.js` (`buildSystemPrompt`)
- Test: `src/query/parse-question.test.js`

**Interfaces:**
- Produces: prompt ของ `parseQuestion` บอกว่าคำถามเรื่องงบ (`งบเหลือเท่าไหร่`) ให้ `is_question: false` แล้ว `text.js` จะส่งต่อให้ `parseMessage` ซึ่งตอบเป็น intent `unsupported` kind `budget` (Task 4)

- [ ] **Step 1: Write the failing test**

ดูชื่อ helper ใน `src/query/parse-question.test.js` ก่อน (มี fake client แบบเดียวกับ parse-message) แล้วเพิ่ม:

```js
  it('tells Claude that budget questions are not totals questions', async () => {
    const client = fakeClient({ is_question: false, type: 'both', category: '', keyword: '', from: '', to: '' });
    await createQuestionParser({ client, model: 'm', now: NOW })('งบเหลือเท่าไหร่', ['อาหาร']);

    const { system } = client.messages.create.mock.calls[0][0];
    expect(system).toContain('Questions about budgets, e.g. "งบเหลือเท่าไหร่", are not totals questions. Set is_question to false.');
  });
```

ถ้าในไฟล์ helper ชื่อไม่ใช่ `fakeClient`/`NOW` ให้ใช้ชื่อที่มีอยู่ (อย่าสร้าง helper ซ้ำ)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/query/parse-question.test.js`
Expected: FAIL (system ไม่มีประโยคนี้)

- [ ] **Step 3: Implement**

ใน `buildSystemPrompt` ของ `src/query/parse-question.js` เพิ่มต่อจากบรรทัด `'- is_question is true only when ...'`:

```js
    '- Questions about budgets, e.g. "งบเหลือเท่าไหร่", are not totals questions. Set is_question to false.',
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/query/parse-question.test.js`
Expected: PASS

- [ ] **Step 5: Lint and commit**

```bash
npm run lint
git add src/query/parse-question.js src/query/parse-question.test.js
git commit -m "fix(query): leave budget questions to the intent router"
```

---

### Task 4: Route intents in the chat handler

**Depends on:** Task 2, Task 3

**Files:**
- Modify: `src/chat/text.js`
- Modify: `src/chat/replies.js`
- Modify: `src/chat/urls.js` (export `buildTabUrl`)
- Modify: `src/chat/bot.js` (require จาก `./replies` และ `module.exports`)
- Modify: `SPEC.md` (ข้อ 1, 2, 10, 13)
- Test: `src/chat/bot.test.js`, `src/chat/urls.test.js`

**Interfaces:**
- Consumes: ผลแบบ `{ status: 'intent', ... }` จาก Task 2; `getHelpReply`, `getFixedReply` จาก `src/menu/fixed-replies.js`; `handleSaving`, `handleSummary`, `answerQuestion` ใน `text.js`
- Produces (replies.js export ใหม่): `GREETING_REPLY`, `NO_OPEN_GOAL_REPLY`, `SUMMARY_OTHER_PERIOD_HINT`, `UNSUPPORTED_REPLIES` (object key `delete|edit|budget|other`), `withLink(text, url)`; `src/chat/bot.js` ต้อง require และ re-export `GREETING_REPLY, NO_OPEN_GOAL_REPLY, SUMMARY_OTHER_PERIOD_HINT, UNSUPPORTED_REPLIES` เหมือนที่ทำกับ `SUMMARY_MENU_REPLY`
- Produces (urls.js): `buildTabUrl(tab: string): string | undefined` อยู่ใน object ที่ `createUrlBuilders` คืน

ข้อความตอบ (ตรงตัว):
- `GREETING_REPLY` = `'เฮียพร้อมจดให้ พิมพ์รายการได้เลย เช่น "กินข้าว 60" หรือพิมพ์ ช่วยเหลือ เพื่อดูวิธีใช้'`
- `NO_OPEN_GOAL_REPLY` = `'ยังไม่มีเป้าออมที่เปิดอยู่ สร้างเป้าได้ในหน้าเว็บ แท็บ ออม'`
- `SUMMARY_OTHER_PERIOD_HINT` = `'ในแชตเฮียสรุปได้แค่ วันนี้ สัปดาห์นี้ เดือนนี้ ช่วงอื่นดูได้ในหน้าเว็บ แท็บ สรุป'`
- `UNSUPPORTED_REPLIES.delete` = `'ลบรายการได้จากปุ่ม ลบรายการนี้ บนการ์ดที่เฮียส่งให้ หรือในหน้าเว็บ แท็บ รายการ'`
- `UNSUPPORTED_REPLIES.edit` = `'แก้รายการได้โดยแตะรายการบนการ์ดที่เฮียส่งให้ หรือในหน้าเว็บ แท็บ รายการ'`
- `UNSUPPORTED_REPLIES.budget` = `'ดูงบคงเหลือได้ในหน้าเว็บ แท็บ งบ'`
- `UNSUPPORTED_REPLIES.other` = `'เรื่องนี้เฮียยังทำในแชตไม่ได้ พิมพ์ ช่วยเหลือ เพื่อดูสิ่งที่เฮียทำได้'`
- `withLink(text, url)` = `url ? \`${text}\n${url}\` : text`

การส่งต่อ (ใน `handleText` หลัง `parseMessage`):
| intent | ตอบ |
|---|---|
| question | `answerQuestion(text)`; ถ้าข้อความนี้ผ่าน `parseQuestion` ไปแล้ว (regex ตรงและไม่มี history) หรือ `answerQuestion` คืน `null` ตอบ `DEFAULT_CLARIFY_QUESTION` |
| summary period today/week/month | `handleSummary(period)` (การ์ดสรุป) |
| summary period menu | `handleSummary('menu')` (เมนูเลือกช่วง) |
| summary period other | text `SUMMARY_MENU_REPLY + '\n' + withLink(SUMMARY_OTHER_PERIOD_HINT, buildSummaryUrl())` + quickReply ปุ่มช่วงเดิม |
| help | `getHelpReply('ช่วยเหลือ')` |
| saving | `handleSaving({ name, amount })`; คืน `null` (ไม่มีเป้าเปิด) ตอบ `NO_OPEN_GOAL_REPLY` |
| greeting | `GREETING_REPLY` |
| unsupported web | `getFixedReply('เปิดเว็บ', { liffUrl })` |
| unsupported delete/edit | `withLink(UNSUPPORTED_REPLIES[kind], buildTabUrl('list'))` |
| unsupported budget | `withLink(UNSUPPORTED_REPLIES.budget, buildTabUrl('budgets'))` |
| unsupported other | `UNSUPPORTED_REPLIES.other` |

ทุก intent: ถ้ามี history หรือ `loadFailed` ให้ `forgetConversation(userId)` ก่อนตอบ (ผู้ใช้เปลี่ยนเรื่องแล้ว) และไม่บันทึกรายการ

- [ ] **Step 1: Write the failing tests**

ใน `src/chat/urls.test.js` เพิ่ม (ใช้รูปแบบเดียวกับเทสต์ `buildGoalsUrl` ในไฟล์):

```js
  it('builds a tab link', () => {
    const { buildTabUrl } = createUrlBuilders({ liffUrl: 'https://liff.line.me/liff-1' });
    expect(buildTabUrl('budgets')).toBe('https://liff.line.me/liff-1?tab=budgets');
  });

  it('builds no tab link without a LIFF URL', () => {
    expect(createUrlBuilders({ liffUrl: undefined }).buildTabUrl('list')).toBeUndefined();
  });
```

ใน `src/chat/bot.test.js` เพิ่ม import `GREETING_REPLY, NO_OPEN_GOAL_REPLY, SUMMARY_OTHER_PERIOD_HINT, UNSUPPORTED_REPLIES` จาก `./bot.js` และ `DEFAULT_CLARIFY_QUESTION` จาก `../parser/parse-message.js` แล้วต่อท้ายไฟล์:

```js
describe('bot intents', () => {
  const LIFF_URL = 'https://liff.line.me/liff-1';

  function setupIntent(result, overrides = {}) {
    return setup({ parseMessage: vi.fn().mockResolvedValue({ status: 'intent', ...result }), ...overrides });
  }

  it('shows the summary menu for a loose summary request', async () => {
    const { deps, bot } = setupIntent({ intent: 'summary', period: 'menu' });

    await bot.handleEvent(textEvent('สรุปหน่อย'));

    expect(deps.replyText).toHaveBeenCalledWith('r1', SUMMARY_MENU_REPLY, SUMMARY_QUICK_REPLY);
    expect(deps.repository.insertTransactions).not.toHaveBeenCalled();
  });

  it('replies the summary card for a named period', async () => {
    const { deps, bot } = setupIntent({ intent: 'summary', period: 'week' });

    await bot.handleEvent(textEvent('สรุปอาทิตย์นี้'));

    expect(deps.repository.summarizeTransactions).toHaveBeenCalledWith('user-1', '2026-09-28', '2026-09-29');
    expect(deps.replyFlex.mock.calls[0][1].altText).toMatch(/^สรุปสัปดาห์นี้/);
  });

  it('shows the summary menu with a web hint for a period the chat cannot summarize', async () => {
    const { deps, bot } = setupIntent({ intent: 'summary', period: 'other' }, { liffUrl: LIFF_URL });

    await bot.handleEvent(textEvent('สรุปเดือนที่แล้ว'));

    expect(deps.replyText).toHaveBeenCalledWith(
      'r1',
      `${SUMMARY_MENU_REPLY}\n${SUMMARY_OTHER_PERIOD_HINT}\n${LIFF_URL}?tab=summary`,
      SUMMARY_QUICK_REPLY
    );
  });

  it('shows the help menu', async () => {
    const { deps, bot } = setupIntent({ intent: 'help' });

    await bot.handleEvent(textEvent('ใช้ยังไง'));

    const help = getHelpReply('ช่วยเหลือ');
    expect(deps.replyText).toHaveBeenCalledWith('r1', help.text, help.quickReply);
  });

  it('greets without saving', async () => {
    const { deps, bot } = setupIntent({ intent: 'greeting' });

    await bot.handleEvent(textEvent('สวัสดี'));

    expect(deps.replyText).toHaveBeenCalledWith('r1', GREETING_REPLY, undefined);
    expect(deps.repository.insertTransactions).not.toHaveBeenCalled();
  });

  it('adds a loose saving message to the named open goal', async () => {
    const { deps, bot } = setupIntent({ intent: 'saving', name: 'เที่ยวญี่ปุ่น', amount: 500 });

    await bot.handleEvent(textEvent('เก็บเงินเข้าเป้า เที่ยวญี่ปุ่น 500'));

    expect(deps.repository.addGoalContribution).toHaveBeenCalledWith('user-1', 'g-1', {
      amount: 500,
      occurredOn: '2026-09-29',
      lineEventId: 'ev1',
    });
    expect(deps.repository.insertTransactions).not.toHaveBeenCalled();
  });

  it('asks for the amount when a loose saving has no valid amount', async () => {
    const { deps, bot } = setupIntent({ intent: 'saving', name: 'เที่ยวญี่ปุ่น', amount: null });

    await bot.handleEvent(textEvent('ออมเข้าเที่ยวญี่ปุ่นหน่อย'));

    expect(deps.replyText).toHaveBeenCalledWith('r1', SAVING_AMOUNT_REPLY, undefined);
  });

  it('says there is no open goal for a loose saving', async () => {
    const { deps, bot } = setupIntent({ intent: 'saving', name: 'เที่ยวญี่ปุ่น', amount: 500 });
    deps.repository.listGoals.mockResolvedValue([]);

    await bot.handleEvent(textEvent('เก็บเงินเข้าเป้า เที่ยวญี่ปุ่น 500'));

    expect(deps.replyText).toHaveBeenCalledWith('r1', NO_OPEN_GOAL_REPLY, undefined);
    expect(deps.repository.addGoalContribution).not.toHaveBeenCalled();
  });

  it.each([
    ['delete', 'ลบรายการล่าสุด', `${UNSUPPORTED_REPLIES.delete}\n${LIFF_URL}?tab=list`],
    ['edit', 'แก้เป็น 80', `${UNSUPPORTED_REPLIES.edit}\n${LIFF_URL}?tab=list`],
    ['budget', 'งบเหลือเท่าไหร่', `${UNSUPPORTED_REPLIES.budget}\n${LIFF_URL}?tab=budgets`],
    ['other', 'จองตั๋วให้หน่อย', UNSUPPORTED_REPLIES.other],
    ['web', 'เว็บ', `เปิดหน้าเว็บดูและแก้ไขรายการ: ${LIFF_URL}`],
  ])('points %s requests to what the user can do', async (kind, text, reply) => {
    const { deps, bot } = setupIntent({ intent: 'unsupported', kind }, { liffUrl: LIFF_URL });

    await bot.handleEvent(textEvent(text));

    expect(deps.replyText).toHaveBeenCalledWith('r1', reply, undefined);
    expect(deps.repository.insertTransactions).not.toHaveBeenCalled();
  });

  it('leaves out the link when the LIFF URL is not set', async () => {
    const { deps, bot } = setupIntent({ intent: 'unsupported', kind: 'budget' });

    await bot.handleEvent(textEvent('งบเหลือเท่าไหร่'));

    expect(deps.replyText).toHaveBeenCalledWith('r1', UNSUPPORTED_REPLIES.budget, undefined);
  });

  it('answers a totals question that has no question word', async () => {
    const question = { isQuestion: true, type: 'expense', category: '', keyword: '', from: '2026-09-01', to: '2026-09-29' };
    const { deps, bot } = setupIntent({ intent: 'question' });
    deps.parseQuestion.mockResolvedValue(question);

    await bot.handleEvent(textEvent('ยอดเดือนนี้'));

    expect(deps.parseQuestion).toHaveBeenCalledTimes(1);
    expect(deps.repository.queryTotals).toHaveBeenCalledWith('user-1', question);
    expect(deps.replyFlex).toHaveBeenCalled();
  });

  it('does not ask the question parser twice', async () => {
    const { deps, bot } = setupIntent({ intent: 'question' });

    await bot.handleEvent(textEvent('อะไรเท่าไหร่'));

    expect(deps.parseQuestion).toHaveBeenCalledTimes(1);
    expect(deps.replyText).toHaveBeenCalledWith('r1', DEFAULT_CLARIFY_QUESTION, undefined);
  });

  it('forgets a pending clarification when the user changes the subject', async () => {
    const { deps, bot } = setupIntent({ intent: 'greeting' });
    deps.repository.getPendingClarification.mockResolvedValue({
      messages: [
        { role: 'user', text: 'ข้าว' },
        { role: 'assistant', text: 'ข้าวราคาเท่าไหร่' },
      ],
      updatedAt: new Date(NOW_MS).toISOString(),
    });

    await bot.handleEvent(textEvent('ขอบคุณ'));

    expect(deps.repository.clearPendingClarification).toHaveBeenCalled();
    expect(deps.replyText).toHaveBeenCalledWith('r1', GREETING_REPLY, undefined);
  });
});
```

หมายเหตุสำหรับผู้ทำ: ก่อนเขียน ให้เปิด `src/chat/bot.test.js` ดูว่า `replyText` ถูกเรียกด้วย quickReply argument ตัวที่สามเป็น `undefined` จริงเมื่อไม่มี quickReply (ดูเทสต์ `'replies with the clarification question without saving'` ที่บรรทัดราว 189 ซึ่งใช้ `undefined`) และดูว่า `clearPendingClarification` คือ repository method ที่ `forgetConversation` เรียก (`src/chat/support.js`) ถ้าชื่อต่าง ให้ใช้ชื่อจริง และดู altText ของการ์ดสรุปสัปดาห์จากเทสต์ `'uses Monday to today for this week ...'`

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/chat/bot.test.js src/chat/urls.test.js`
Expected: FAIL (`GREETING_REPLY` undefined, `buildTabUrl` ไม่ถูก export, intent ถูกส่งไป `toTransactionRows`)

- [ ] **Step 3: Implement**

`src/chat/urls.js`: เปลี่ยน return เป็น

```js
  return { buildEditUrls, buildEditUrl, buildTabUrl, buildGoalsUrl, buildSummaryUrl, buildTotalsListUrl };
```

`src/chat/replies.js`: เพิ่มค่าคงที่ใต้ `SUMMARY_MENU_REPLY`

```js
const SUMMARY_OTHER_PERIOD_HINT = 'ในแชตเฮียสรุปได้แค่ วันนี้ สัปดาห์นี้ เดือนนี้ ช่วงอื่นดูได้ในหน้าเว็บ แท็บ สรุป';
const GREETING_REPLY = 'เฮียพร้อมจดให้ พิมพ์รายการได้เลย เช่น "กินข้าว 60" หรือพิมพ์ ช่วยเหลือ เพื่อดูวิธีใช้';
const NO_OPEN_GOAL_REPLY = 'ยังไม่มีเป้าออมที่เปิดอยู่ สร้างเป้าได้ในหน้าเว็บ แท็บ ออม';
// คำสั่งที่ยังไม่มีในแชต ตอบทางที่ทำได้จริง ไม่ทำเหมือนหารายการไม่เจอ
const UNSUPPORTED_REPLIES = {
  delete: 'ลบรายการได้จากปุ่ม ลบรายการนี้ บนการ์ดที่เฮียส่งให้ หรือในหน้าเว็บ แท็บ รายการ',
  edit: 'แก้รายการได้โดยแตะรายการบนการ์ดที่เฮียส่งให้ หรือในหน้าเว็บ แท็บ รายการ',
  budget: 'ดูงบคงเหลือได้ในหน้าเว็บ แท็บ งบ',
  other: 'เรื่องนี้เฮียยังทำในแชตไม่ได้ พิมพ์ ช่วยเหลือ เพื่อดูสิ่งที่เฮียทำได้',
};

function withLink(text, url) {
  return url ? `${text}\n${url}` : text;
}
```

และเพิ่ม `SUMMARY_OTHER_PERIOD_HINT, GREETING_REPLY, NO_OPEN_GOAL_REPLY, UNSUPPORTED_REPLIES, withLink` ใน `module.exports` ของ replies.js

`src/chat/bot.js`: เพิ่ม `GREETING_REPLY, NO_OPEN_GOAL_REPLY, SUMMARY_OTHER_PERIOD_HINT, UNSUPPORTED_REPLIES` ทั้งใน require จาก `./replies` และใน `module.exports` (ตามรูปแบบเดียวกับ `SUMMARY_MENU_REPLY`)

`src/chat/text.js`:

1. import เพิ่ม: `getFixedReply` มีแล้ว; เพิ่ม `DEFAULT_CLARIFY_QUESTION` จาก `../parser/parse-message`; เพิ่ม `SUMMARY_OTHER_PERIOD_HINT, GREETING_REPLY, NO_OPEN_GOAL_REPLY, UNSUPPORTED_REPLIES, withLink` ใน require ของ `./replies`; destructure `buildTabUrl` จาก `urls`

2. เพิ่ม function ใน `createTextHandlers` (ใต้ `handleSaving`):

```js
  function unsupportedReply(kind) {
    if (kind === 'web') {
      return getFixedReply('เปิดเว็บ', { liffUrl });
    }
    if (kind === 'budget') {
      return withLink(UNSUPPORTED_REPLIES.budget, buildTabUrl('budgets'));
    }
    if (kind === 'delete' || kind === 'edit') {
      return withLink(UNSUPPORTED_REPLIES[kind], buildTabUrl('list'));
    }
    return UNSUPPORTED_REPLIES.other;
  }

  async function handleIntent(result, text, userId, webhookEventId, askedQuestion) {
    switch (result.intent) {
      case 'question': {
        // parseQuestion ตอบไปแล้วว่าไม่ใช่คำถาม ไม่ถามซ้ำให้เสีย call
        if (askedQuestion) {
          return { text: DEFAULT_CLARIFY_QUESTION };
        }
        return (await answerQuestion(text, userId)) ?? { text: DEFAULT_CLARIFY_QUESTION };
      }
      case 'summary':
        if (result.period === 'other') {
          return {
            text: `${SUMMARY_MENU_REPLY}\n${withLink(SUMMARY_OTHER_PERIOD_HINT, buildSummaryUrl())}`,
            quickReply: buildSummaryQuickReply(),
          };
        }
        return handleSummary(result.period, userId);
      case 'help':
        return getHelpReply('ช่วยเหลือ');
      case 'saving':
        return (
          (await handleSaving({ name: result.name, amount: result.amount }, userId, webhookEventId)) ?? {
            text: NO_OPEN_GOAL_REPLY,
          }
        );
      case 'greeting':
        return { text: GREETING_REPLY };
      default:
        return { text: unsupportedReply(result.kind) };
    }
  }
```

หมายเหตุ: ใน `handleSummary` ค่า `'menu'` ตอบเมนูอยู่แล้ว และ `'today' | 'week' | 'month'` คือค่าเดียวกับที่ `parseSummaryCommand` คืน จึงส่งตรงได้

3. ใน `handleText` แทนบล็อกคำถามเดิม:

```js
    // ระหว่างที่บอทถามกลับ ข้อความถัดไปคือคำตอบของรายการเดิม จึงไม่ตีความเป็นคำถามยอด
    const askedQuestion = history.length === 0 && looksLikeQuestion(event.message.text);
    if (askedQuestion) {
      const answer = await answerQuestion(event.message.text, userId);
      if (answer) {
        return answer;
      }
    }
```

และต่อจาก `const result = await parseMessage(...)`:

```js
    if (result.status === 'intent') {
      // ผู้ใช้เปลี่ยนเรื่องแล้ว บริบทที่ถามกลับค้างไว้ต้องไม่ปนข้อความถัดไป
      if (history.length > 0 || loadFailed) {
        await forgetConversation(userId);
      }
      return handleIntent(result, event.message.text, userId, event.webhookEventId, askedQuestion);
    }
```

`SPEC.md`:
- ข้อ 1 เพิ่ม bullet: `- Claude บอก intent ใน call เดียวกัน: record, question (ถามยอดที่ไม่มีคำว่า เท่าไหร่), summary (เมนูหรือการ์ดตามช่วง ช่วงอื่นบอกดูในเว็บ), help (เมนูช่วยเหลือ), saving (ออมเข้าเป้าผ่านทางออมเดิม ไม่มีเป้าเปิดบอกสร้างในเว็บ), greeting (ตอบแนะนำ), unsupported (ลบ/แก้/งบ/เว็บ ตอบทางที่ทำได้จริงพร้อมลิงก์แท็บ) intent ที่ไม่ใช่ record ล้างบริบทถามกลับ`
- ข้อ 1 เพิ่ม bullet: `- ยอดที่เขียนเป็นนิพจน์ (\`รูท25*x10\`, \`2 แก้ว แก้วละ 35\`, \`1200/3\`) Claude ส่ง \`amount_expression\` แล้ว server คำนวณเอง (\`src/parser/amount-expression.js\` ไม่ใช้ eval ปัดสตางค์ คำนวณไม่ได้ถามกลับ) ชื่อเดียวหลายยอด (\`กินข้าว 40+10+20\`) ถามกลับ หลายชื่อแยกรายการ`
- ข้อ 2 ต่อท้าย bullet เดิม: ` พิมพ์แบบอื่น (สรุปหน่อย, ดูสรุป, สรุปเดือนที่แล้ว) ไปทาง intent summary`
- ข้อ 10 เพิ่ม bullet: `- คำถามเรื่องงบ (งบเหลือเท่าไหร่) ไม่ใช่คำถามยอด ไปทาง intent unsupported budget; ข้อความไม่มีคำถามแต่ Claude บอก intent question ถาม \`parseQuestion\` ครั้งเดียว`
- ข้อ 13 ต่อท้าย bullet `แชต ออม ...`: ` ภาษาพูด (เก็บเงินเข้าเป้า X 500) ไปทาง intent saving นับ rate limit ไม่มีเป้าเปิดตอบให้สร้างเป้าในเว็บ (prompt บอกว่า ออมสิน เป็นชื่อธนาคาร จึงยังเป็นรายการตามเดิม)`

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/chat/bot.test.js src/chat/urls.test.js`
Expected: PASS

- [ ] **Step 5: Full test, lint, commit**

```bash
npm test -- --testTimeout=30000
npm run lint
git add src/chat/text.js src/chat/replies.js src/chat/urls.js src/chat/bot.js src/chat/bot.test.js src/chat/urls.test.js SPEC.md
git commit -m "feat(chat): route summary, help, saving and other intents"
```

---

### Task 5: NLU eval set and runner

**Depends on:** Task 2, Task 3

**Files:**
- Create: `scripts/nlu-eval-check.js`
- Create: `scripts/nlu-eval-cases.json`
- Create: `scripts/nlu-eval.js`
- Modify: `package.json` (`scripts`)
- Test: `scripts/nlu-eval-check.test.js`

**Interfaces:**
- Consumes: `createMessageParser`, `createQuestionParser`, `TEXT_CATEGORIES`
- Produces: `checkCase(expected, actual): string[]` (รายการจุดที่ไม่ตรง ว่าง = ผ่าน); `npm run nlu-eval` รันกับ Claude จริง (เสียค่า API ไม่รันใน CI ไม่มีเทสต์ที่เรียก Claude)

กติกา `checkCase`: เทียบเฉพาะ key ที่อยู่ใน `expected`; key `items` เทียบจำนวนแล้วเทียบแต่ละ item แบบ subset; key อื่นเทียบ `===`

- [ ] **Step 1: Write the failing test**

```js
// scripts/nlu-eval-check.test.js
import { describe, it, expect } from 'vitest';
import { checkCase } from './nlu-eval-check.js';

describe('checkCase', () => {
  it('passes when every expected key matches', () => {
    expect(checkCase({ status: 'intent', intent: 'help' }, { status: 'intent', intent: 'help' })).toEqual([]);
  });

  it('ignores keys that are not expected', () => {
    expect(checkCase({ status: 'clarify' }, { status: 'clarify', question: 'กี่บาท' })).toEqual([]);
  });

  it('reports a different value', () => {
    expect(checkCase({ status: 'ok' }, { status: 'clarify', question: 'x' })).toEqual(['status: expected "ok", got "clarify"']);
  });

  it('compares items by count and by the expected fields', () => {
    const actual = { status: 'ok', items: [{ type: 'expense', amount: 50, note: 'ข้าว' }] };
    expect(checkCase({ status: 'ok', items: [{ amount: 50 }] }, actual)).toEqual([]);
    expect(checkCase({ status: 'ok', items: [{ amount: 70 }] }, actual)).toEqual(['items[0].amount: expected 70, got 50']);
    expect(checkCase({ status: 'ok', items: [{ amount: 50 }, { amount: 10 }] }, actual)).toEqual([
      'items: expected 2 items, got 1',
    ]);
  });

  it('reports missing items', () => {
    expect(checkCase({ items: [{ amount: 50 }] }, { status: 'clarify' })).toEqual(['items: expected 1 items, got 0']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run scripts/nlu-eval-check.test.js`
Expected: FAIL (cannot find module)

- [ ] **Step 3: Implement**

```js
// scripts/nlu-eval-check.js
function describeValue(value) {
  return JSON.stringify(value);
}

function checkCase(expected, actual) {
  const problems = [];
  for (const [key, want] of Object.entries(expected)) {
    if (key !== 'items') {
      if (actual[key] !== want) problems.push(`${key}: expected ${describeValue(want)}, got ${describeValue(actual[key])}`);
      continue;
    }
    const got = Array.isArray(actual.items) ? actual.items : [];
    if (got.length !== want.length) {
      problems.push(`items: expected ${want.length} items, got ${got.length}`);
      continue;
    }
    want.forEach((wantItem, index) => {
      for (const [field, value] of Object.entries(wantItem)) {
        if (got[index][field] !== value) {
          problems.push(`items[${index}].${field}: expected ${describeValue(value)}, got ${describeValue(got[index][field])}`);
        }
      }
    });
  }
  return problems;
}

module.exports = { checkCase };
```

```json
[
  { "text": "กินข้าว 60", "expect": { "status": "ok", "items": [{ "type": "expense", "category": "อาหาร", "amount": 60 }] } },
  { "text": "กินข้าว รูท25*x10", "expect": { "status": "ok", "items": [{ "amount": 50 }] } },
  { "text": "ข้าว 50 กาแฟ 45", "expect": { "status": "ok", "items": [{ "amount": 50 }, { "amount": 45 }] } },
  { "text": "วันนี้ซื้อข้าวไป 60 บาท", "expect": { "status": "ok", "items": [{ "amount": 60 }] } },
  { "text": "เมื่อกี้เติมน้ำมันไป 100", "expect": { "status": "ok", "items": [{ "category": "เดินทาง", "amount": 100 }] } },
  { "text": "ชานม 2 แก้ว แก้วละ 35", "expect": { "status": "ok", "items": [{ "amount": 70 }] } },
  { "text": "กินข้าว 40+น้ำ 10+ขนม 20", "expect": { "status": "ok", "items": [{ "amount": 40 }, { "amount": 10 }, { "amount": 20 }] } },
  { "text": "กินข้าว 40+10+20", "expect": { "status": "clarify" } },
  { "text": "ค่าไฟ 1200/3", "expect": { "status": "ok", "items": [{ "amount": 400 }] } },
  { "text": "กาแฟ 1.5k", "expect": { "status": "ok", "items": [{ "amount": 1500 }] } },
  { "text": "ข้าวมันไก่ ห้าสิบ", "expect": { "status": "ok", "items": [{ "amount": 50 }] } },
  { "text": "เงินเดือนเข้า 25000", "expect": { "status": "ok", "items": [{ "type": "income", "amount": 25000 }] } },
  { "text": "ข้าวมันไก่ 50 แพงเท่าไหร่", "expect": { "status": "ok", "items": [{ "amount": 50 }] } },
  { "text": "ข้าว", "expect": { "status": "clarify" } },
  { "text": "60", "expect": { "status": "clarify" } },
  { "text": "สรุปหน่อย", "expect": { "status": "intent", "intent": "summary", "period": "menu" } },
  { "text": "ขอสรุป", "expect": { "status": "intent", "intent": "summary", "period": "menu" } },
  { "text": "ดูสรุป", "expect": { "status": "intent", "intent": "summary", "period": "menu" } },
  { "text": "สรุปอาทิตย์นี้", "expect": { "status": "intent", "intent": "summary", "period": "week" } },
  { "text": "สรุปเดือนที่แล้ว", "expect": { "status": "intent", "intent": "summary", "period": "other" } },
  { "text": "สรุปปีนี้", "expect": { "status": "intent", "intent": "summary", "period": "other" } },
  { "text": "รายงาน", "expect": { "status": "intent", "intent": "summary" } },
  { "text": "ยอดเดือนนี้", "expect": { "status": "intent", "intent": "question" } },
  { "text": "เดือนนี้ใช้เงินไปเยอะไหม", "expect": { "status": "intent", "intent": "question" } },
  { "text": "ช่วยด้วย", "expect": { "status": "intent", "intent": "help" } },
  { "text": "ใช้ยังไง", "expect": { "status": "intent", "intent": "help" } },
  { "text": "help", "expect": { "status": "intent", "intent": "help" } },
  { "text": "สวัสดี", "expect": { "status": "intent", "intent": "greeting" } },
  { "text": "ขอบคุณ", "expect": { "status": "intent", "intent": "greeting" } },
  { "text": "555", "expect": { "status": "intent", "intent": "greeting" } },
  { "text": "ออมสิน 1000", "expect": { "status": "ok", "items": [{ "amount": 1000 }] } },
  { "text": "เก็บเงินเข้าเป้า เที่ยวญี่ปุ่น 500", "expect": { "status": "intent", "intent": "saving", "name": "เที่ยวญี่ปุ่น", "amount": 500 } },
  { "text": "ลบรายการล่าสุด", "expect": { "status": "intent", "intent": "unsupported", "kind": "delete" } },
  { "text": "แก้เป็น 80", "expect": { "status": "intent", "intent": "unsupported", "kind": "edit" } },
  { "text": "งบเหลือเท่าไหร่", "expect": { "status": "intent", "intent": "unsupported", "kind": "budget" } },
  { "text": "เว็บ", "expect": { "status": "intent", "intent": "unsupported", "kind": "web" } },
  { "text": "งบเหลือเท่าไหร่", "parser": "question", "expect": { "isQuestion": false } },
  { "text": "เดือนนี้ใช้ไปเท่าไหร่", "parser": "question", "expect": { "isQuestion": true, "type": "expense" } },
  { "text": "ใช้ค่ากาแฟไปกี่บาทแล้ว", "parser": "question", "expect": { "isQuestion": true, "keyword": "กาแฟ" } }
]
```

```js
// scripts/nlu-eval.js
// รันชุดข้อความกับ Claude จริงเพื่อวัดว่าแก้ prompt แล้วดีขึ้นหรือพัง เสียค่า API จึงไม่อยู่ใน npm test
require('dotenv').config({ quiet: true });
const path = require('node:path');
const fs = require('node:fs');
const Anthropic = require('@anthropic-ai/sdk');
const { loadConfig } = require('../src/config');
const { createMessageParser } = require('../src/parser/parse-message');
const { createQuestionParser } = require('../src/query/parse-question');
const { TEXT_CATEGORIES } = require('../src/parser/categories');
const { checkCase } = require('./nlu-eval-check');

const CONCURRENCY = 4;

async function main() {
  const cases = JSON.parse(fs.readFileSync(path.join(__dirname, 'nlu-eval-cases.json'), 'utf8'));
  const config = loadConfig(process.env);
  const client = new Anthropic({ apiKey: config.anthropicApiKey });
  const parseMessage = createMessageParser({ client, model: config.claudeModel });
  const parseQuestion = createQuestionParser({ client, model: config.claudeModel });
  const categoryNames = [...new Set([...TEXT_CATEGORIES.expense, ...TEXT_CATEGORIES.income])];

  async function runCase(testCase) {
    try {
      const actual =
        testCase.parser === 'question' ? await parseQuestion(testCase.text, categoryNames) : await parseMessage(testCase.text);
      return { testCase, actual, problems: checkCase(testCase.expect, actual) };
    } catch (err) {
      return { testCase, actual: null, problems: [`error: ${err.message}`] };
    }
  }

  // ยิงพร้อมกันทีละไม่กี่ข้อ กัน 429 ที่จะดูเหมือน prompt พัง
  const results = [];
  for (let start = 0; start < cases.length; start += CONCURRENCY) {
    results.push(...(await Promise.all(cases.slice(start, start + CONCURRENCY).map(runCase))));
  }

  let failed = 0;
  for (const { testCase, actual, problems } of results) {
    const label = testCase.parser === 'question' ? `[question] ${testCase.text}` : testCase.text;
    if (problems.length === 0) {
      console.log(`PASS ${label}`);
      continue;
    }
    failed += 1;
    console.log(`FAIL ${label}\n  ${problems.join('\n  ')}\n  got ${JSON.stringify(actual)}`);
  }
  console.log(`\n${results.length - failed}/${results.length} passed (model ${config.claudeModel})`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error('nlu-eval failed', err);
  process.exitCode = 1;
});
```

`package.json` ใน `scripts` เพิ่มต่อจาก `"try-parse"`:

```json
    "try-parse": "node scripts/try-parse.js",
    "nlu-eval": "node scripts/nlu-eval.js"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run scripts/nlu-eval-check.test.js`
Expected: PASS

- [ ] **Step 5: Full test, lint, commit**

```bash
npm test -- --testTimeout=30000
npm run lint
git add scripts/nlu-eval-check.js scripts/nlu-eval-check.test.js scripts/nlu-eval-cases.json scripts/nlu-eval.js package.json
git commit -m "test(nlu): add an eval set run against the real model"
```

---

### Task 6: Run the eval against Claude and tune the prompt

**Depends on:** Task 4, Task 5

**Files:**
- Modify (เฉพาะถ้าจำเป็น): `src/parser/parse-message.js` (`buildSystemPrompt` เท่านั้น), `src/query/parse-question.js` (`buildSystemPrompt` เท่านั้น)
- Test: `src/parser/parse-message.test.js` (ถ้าแก้ประโยคที่เทสต์ล็อกไว้)

**Interfaces:**
- Consumes: `npm run nlu-eval`

งานนี้ต้องใช้ `.env` ที่มี `ANTHROPIC_API_KEY` (มีอยู่แล้ว อ่านอย่างเดียว ห้ามแก้) เสียค่า API ราว 39 call ต่อรอบ

- [ ] **Step 1: Run the eval**

Run: `npm run nlu-eval`
Expected: บรรทัดสุดท้าย `N/39 passed (model claude-haiku-5-5)`

- [ ] **Step 2: ถ้ามีข้อ FAIL** แก้เฉพาะประโยคใน `buildSystemPrompt` ที่เกี่ยวกับข้อนั้น (เช่นเพิ่มตัวอย่าง) แล้วรัน `npm run nlu-eval` ซ้ำ ไม่เกิน 3 รอบ ห้ามแก้ `expect` ใน cases ให้ผ่านเอง ถ้าแก้ 3 รอบแล้วยังไม่ผ่าน ให้หยุดและรายงานข้อที่ตกพร้อมผลที่ได้ (ผู้ใช้ตัดสินว่าจะยอมรับหรือเปลี่ยน expect)

- [ ] **Step 3: รันซ้ำอีก 1 รอบ** เพื่อดูความคงที่ (ผลของ model ไม่คงที่ 100%) จดผลทั้ง 2 รอบไว้ในรายงาน

- [ ] **Step 4: Full test, lint, commit (ถ้าแก้ prompt)**

```bash
npm test -- --testTimeout=30000
npm run lint
git add src/parser/parse-message.js src/parser/parse-message.test.js src/query/parse-question.js src/query/parse-question.test.js
git commit -m "fix(parser): tune intent prompt from eval results"
```

---

### Task 7: Update work memory

**Depends on:** Task 6

**Files:**
- Modify: `work-memory/STATE.md`

- [ ] **Step 1:** ใน `work-memory/STATE.md` แทนรายการ Next `NLU intents + นิพจน์ยอด (2026-11-08)` ด้วยรายการ Done (ไม่เกิน 2 บรรทัด ใส่ commit range, ผล `npm test`, ผล `nlu-eval` 2 รอบ) และตัด Done ให้เหลือ 5 รายการล่าสุด (รายการเก่าสุดย้ายไป work-memory/archive/ ตามกติกาหัวไฟล์)
- [ ] **Step 2:** เพิ่มข้อใหม่ในหัวข้อ "รอผู้ใช้ทำ": `หลัง merge และ deploy NLU intents: ส่งใน LINE จริง สรุปหน่อย (เมนูสรุป), กินข้าว รูท25*x10 (50 บาท), ออมสิน 1000 (บันทึกรายจ่าย), เก็บเงินเข้าเป้า เที่ยวญี่ปุ่น 500 (ออมเข้าเป้า), ใช้ยังไง (เมนูช่วยเหลือ), งบเหลือเท่าไหร่ (ลิงก์แท็บงบ)`
- [ ] **Step 3:** ถ้า Task 6 มีข้อที่ยังตก ใส่ใน Next ว่ารอผู้ใช้ตัดสิน พร้อมข้อความและผลที่ได้
- [ ] **Step 4: Commit**

```bash
git add work-memory/STATE.md
git commit -m "docs(work-memory): record the NLU intents work"
```

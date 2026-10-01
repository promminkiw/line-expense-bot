# Slip with Several Items (Step 8b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ต่อยอดขั้นที่ 8: ใบเสร็จที่มีสินค้าหลายอย่างให้บอทแสดงเป็นรายการแยกในข้อความสรุปเดียว (ชื่อสินค้า หมวด ราคาของแต่ละอย่าง ไม่รวมยอด) กดบันทึกปุ่มเดียวแล้วบันทึกทุกรายการเป็นแถวละอย่าง; สลิปโอนเงินที่มียอดเดียวทำงานเหมือนเดิม

**Architecture:** `parseSlip` เปลี่ยนจากคืน `item` เดียวเป็น `items` (อาร์เรย์ อย่างน้อย 1 รายการ) วันที่ใช้ร่วมกันทั้งใบ บรรทัดที่ไม่ใช่สินค้า (ส่วนลด VAT ค่าบริการ ค่าส่ง) Claude ใส่ใน `extras_note` เพื่อแสดงเป็นหมายเหตุ ไม่บันทึก แถวพักใน `pending_slips` เก็บ `items` ทั้งอาร์เรย์ (migration 007 เปลี่ยนชื่อคอลัมน์ `item` เป็น `items`) ตอนกดบันทึกใช้ `toTransactionRows` และ `formatSavedReply` เดิมที่รับอาร์เรย์อยู่แล้ว รายการทั้งหมดผูก `line_event_id` เดียวกัน ปุ่มยกเลิกรายการเดิมจึงลบทั้งใบได้ และการเตือนงบเดิมนับทุกหมวดที่ใบนี้แตะ

**Tech Stack:** Node.js 22 (CommonJS), @anthropic-ai/sdk 0.129.0, @supabase/supabase-js 2.117.2, Vitest 5.0.2

## Global Constraints

- ผู้ใช้ใช้ Windows; server เป็น CommonJS; ไฟล์เทสต์ใช้ `import`; ห้าม `vi.mock` กับ module ที่ถูก `require`; เทสต์วางคู่กับไฟล์
- ไม่เพิ่ม dependency ใหม่ใน `package.json`
- คอมเมนต์ในโค้ดสั้น บรรทัดเดียว ภาษาไทย อธิบาย "ทำไม"; ชื่อตัวแปร/function/log เป็นภาษาอังกฤษ; ห้าม emoji ในโค้ด คอมเมนต์ log ข้อความตอบ และ commit message
- ห้าม agent อ่านหรือแก้ `.env`; ห้าม agent start/restart/kill server; ห้าม agent รัน SQL กับ Supabase จริง; ห้ามเรียก Claude API จริงในเทสต์
- ห้าม `git add -f` และห้าม commit ไฟล์ใต้ `.superpowers/`
- รูปสลิปห้ามถูกเก็บลงดิสก์ DB หรือ log; log ห้ามมี base64 ของรูป
- ผู้ใช้ตัดสินแล้ว (2026-10-01): ข้อความสรุปแสดงสินค้าแต่ละอย่างพร้อมราคาของมันและ **ไม่แสดงยอดรวมที่ระบบคำนวณเอง**; กดบันทึกปุ่มเดียวบันทึกทุกรายการเป็นแถวละอย่าง; นับเฉพาะสินค้า/บริการที่ซื้อ บรรทัดอื่น (ส่วนลด VAT ค่าบริการ ค่าส่ง) แสดงเป็นหมายเหตุและไม่บันทึก; Claude เดาหมวดทีละสินค้า ไม่แน่ใจใช้ `อื่นๆ`
- ราคาของแต่ละรายการคือยอดของบรรทัดนั้นตามที่พิมพ์บนใบเสร็จ (ถ้าซื้อหลายชิ้นคือยอดรวมของบรรทัด ไม่ใช่ราคาต่อชิ้น); วันที่ใช้ร่วมกันทั้งใบ
- ทุกรายการผ่านกติกาเดิมของ `toParseResult`: ยอดมากกว่า 0 ไม่เกิน `MAX_AMOUNT` ปัดสตางค์แล้วไม่เป็น 0; **รายการที่ไม่ผ่านถูกข้ามเฉพาะรายการนั้น** และข้อความสรุปบอกจำนวนที่ข้าม; ทั้งใบเป็น `unreadable` เฉพาะเมื่อไม่เหลือรายการที่ผ่านเลย (ตามข้อจำกัดที่ยอมรับด้านล่าง)
- รับสินค้าได้ไม่เกิน `MAX_SLIP_ITEMS = 20` รายการต่อใบ เกินให้เก็บ 20 รายการแรกและบอกผู้ใช้ในข้อความสรุป
- ปีและวันที่ใช้กติกาเดิมของขั้นที่ 8 (แปลง พ.ศ. ลบ 543, ปีนอก [ปีนี้-1, ปีนี้+1] ใช้วันนี้และ `dateAssumed = true`, ทำความสะอาด note ด้วย `sanitizeNote` ตัดที่ 100 code point สำหรับ extras_note และ 50 code point สำหรับ note ของแต่ละสินค้า)
- ข้อความตอบคงที่ของขั้นที่ 8 (`SLIP_UNREADABLE_REPLY`, `SLIP_TOO_LARGE_REPLY`, `SLIP_UNSUPPORTED_REPLY`, `SLIP_EXPIRED_REPLY`, `SLIP_CANCELLED_REPLY`) และรูปแบบปุ่ม postback ไม่เปลี่ยน
- สลิปโอนเงินที่มีรายการเดียวต้องได้ข้อความสรุปเหมือนเดิมทุกตัวอักษร (`อ่านสลิปได้ดังนี้` ...) เมื่อไม่มีหมายเหตุ
- ขั้นสุดท้ายของแผน: อัปเดต `work-memory/STATE.md` (controller ทำ)
- commit message ลงท้ายด้วย `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`

## รูปแบบข้อความสรุป (คงที่ ห้ามเปลี่ยนถ้อยคำ)

หนึ่งรายการ ไม่มีหมายเหตุ (เหมือนเดิม):
```
อ่านสลิปได้ดังนี้
- รายจ่าย | อาหาร | 120 บาท | 28/09 | โอนให้ ร้านข้าวแกง
กดบันทึกเพื่อยืนยัน (หมดเวลาใน 10 นาที)
```

หลายรายการ มีหมายเหตุ:
```
อ่านสลิปได้ 3 รายการ
- รายจ่าย | อาหาร | 35 บาท | 28/09 | นมสด
- รายจ่าย | อาหาร | 20 บาท | 28/09 | ขนมปัง
- รายจ่าย | สุขภาพ | 59 บาท | 28/09 | ยาสีฟัน
หมายเหตุ: ส่วนลด 10 บาท, VAT 7% (ไม่ได้บันทึก)
ยอดสุทธิบนสลิป 104 บาท
ข้าม 1 รายการที่อ่านราคาไม่ได้
มีสินค้ามากกว่า 20 รายการ บันทึกเฉพาะ 20 รายการแรก
อ่านวันที่ไม่ได้ จึงใช้วันนี้
กดบันทึกเพื่อยืนยัน (หมดเวลาใน 10 นาที)
```
ลำดับบรรทัดคงที่: หัว, รายการ, `หมายเหตุ`, `ยอดสุทธิบนสลิป` (เฉพาะเมื่อมีหมายเหตุและอ่านยอดสุทธิได้ มากกว่า 0), `ข้าม N รายการที่อ่านราคาไม่ได้` (เฉพาะเมื่อมีรายการถูกข้าม), บรรทัดเกิน 20 (เฉพาะเมื่อถูกตัด), `อ่านวันที่ไม่ได้` (เฉพาะเมื่อเดาวันที่), บรรทัดยืนยัน หัวเมื่อมีมากกว่า 1 รายการคือ `อ่านสลิปได้ N รายการ` เมื่อมี 1 รายการคือ `อ่านสลิปได้ดังนี้`

## ข้อจำกัดที่ยอมรับ

- รายการที่ราคาไม่ผ่านกติกา (เช่น Claude ใส่ส่วนลดเป็นสินค้าราคาติดลบ หรือของแถมราคา 0) ถูกข้ามเฉพาะรายการนั้น ข้อความสรุปบอกว่าข้ามกี่รายการ และผู้ใช้เห็นทุกแถวที่เก็บไว้ก่อนกดบันทึก; ทั้งใบอ่านไม่ได้เฉพาะเมื่อไม่เหลือรายการที่ผ่านเลย
- หมายเหตุ: ข้อนี้เปลี่ยนจากแผนเดิม (เดิมรายการใดไม่ผ่านทำให้ทั้งใบอ่านไม่ได้) เมื่อ 2026-10-01 ตามที่ผู้ใช้ขอ หลังใบเสร็จจริงที่มีบรรทัดส่วนลดล้มทั้งใบ
- ผลรวมของรายการอาจไม่เท่ายอดสุทธิบนใบเสร็จเมื่อมีส่วนลด/ค่าส่ง (บอกผู้ใช้ผ่านหมายเหตุและบรรทัดยอดสุทธิ)
- ผู้ใช้เลือกบันทึกบางรายการไม่ได้ในแชต (บันทึกทั้งใบแล้วลบรายการที่ไม่ต้องการในหน้าเว็บ หรือกดยกเลิกรายการเพื่อลบทั้งใบ)
- ถ้า `insertTransactions` พังหลัง claim แถวพักหาย ต้องส่งสลิปใหม่ (เหมือนขั้นที่ 8; แถวทั้งใบถูก insert ในคำสั่งเดียว จึงไม่มีบันทึกครึ่งใบ)
- สินค้าเกินรายการที่ 20 ถูกตัดทิ้งก่อนตรวจกติกาและบอกผู้ใช้ ใบเสร็จที่ยาวมากถูก prompt สั่งให้ตอบแค่ 21 รายการแรก จึงไม่ล้มเพราะเกินขีดจำกัด token
- โน้ตของแต่ละสินค้าถูกตัดที่ 50 code point และข้อความตอบถูกจำกัดแข็งที่ 5000 หน่วย UTF-16 โดย `src/line-reply.js`

## File Structure

| ไฟล์ | หน้าที่ | Task |
|---|---|---|
| `supabase/007_pending_slips_items.sql`, `supabase/schema.sql` (header), `SPEC.md`, `src/db/repository.js`, `src/db/repository.test.js` | เปลี่ยน `item` เป็น `items` (อาร์เรย์) ใน `pending_slips` และ repository | 1 |
| `src/parser/format-reply.js`, `src/parser/format-reply.test.js` | `formatSlipConfirmReply` รับอาร์เรย์ + หมายเหตุ | 2 |
| `src/slip/parse-slip.js`, `src/slip/parse-slip.test.js` | Claude อ่านใบเสร็จหลายรายการ | 3 |
| `src/bot.js`, `src/bot.test.js` | ใช้ `items` ตอนรับรูปและตอนกดบันทึก | 4 |
| (manual) | รัน 007 และลองในแอป LINE | 5 |

ลำดับ: Task 1, 2, 3 แยกกันได้ (ไฟล์ไม่ทับกัน) แล้ว Task 4 -> 5 ต่อกัน ไม่มีการแก้ `index.js` (deps เดิมพอ)

---

### Task 1: pending_slips เก็บ items และ repository

**Depends on:** none

**Files:**
- Create: `supabase/007_pending_slips_items.sql`
- Modify: `supabase/schema.sql:1` (บรรทัด header), `SPEC.md` (บรรทัด `pending_slips`), `src/db/repository.js` (`savePendingSlip`, `claimPendingSlip`)
- Test: `src/db/repository.test.js`

**Interfaces:**
- Produces (Task 4 ใช้):
  - `repository.savePendingSlip(userId: string, webhookEventId: string, items: object[]): Promise<string>` คืน id ของแถว
  - `repository.claimPendingSlip(userId: string, slipId: string, sinceIso: string): Promise<{ webhookEventId: string, items: object[] } | null>`
  - `deleteExpiredPendingSlips` ไม่เปลี่ยน

- [ ] **Step 1: เขียนเทสต์ที่ล้มเหลว** ใน `src/db/repository.test.js` แก้ค่าคงที่และเทสต์ `savePendingSlip` / `claimPendingSlip` ที่มีอยู่ (ประมาณบรรทัด 800-845) ให้เป็นดังนี้ (ส่วน error-path และ `deleteExpiredPendingSlips` ไม่เปลี่ยน):

```js
const SLIP_ITEMS = [
  { type: 'expense', category: 'อาหาร', amount: 120, date: '2026-09-28', note: 'โอนให้ ร้านข้าวแกง' },
  { type: 'expense', category: 'สุขภาพ', amount: 59, date: '2026-09-28', note: 'ยาสีฟัน' },
];
```

`savePendingSlip` เทสต์แรก:

```js
  it('inserts the items array for this user and event and returns the new id', async () => {
    const { supabase, calls } = fakeSupabase({ data: { id: 'slip-1' }, error: null });

    const id = await createRepository(supabase).savePendingSlip('user-1', 'ev-img', SLIP_ITEMS);

    expect(id).toBe('slip-1');
    expect(calls).toEqual([
      ['from', 'pending_slips'],
      ['insert', { user_id: 'user-1', line_event_id: 'ev-img', items: SLIP_ITEMS }],
      ['select', 'id'],
      ['single'],
    ]);
  });
```

`claimPendingSlip` เทสต์แรก:

```js
  it('deletes and returns only this user unexpired row in one statement', async () => {
    const { supabase, calls } = fakeSupabase({
      data: { line_event_id: 'ev-img', items: SLIP_ITEMS },
      error: null,
    });

    const slip = await createRepository(supabase).claimPendingSlip('user-1', 'slip-1', '2026-09-29T04:50:00.000Z');

    expect(slip).toEqual({ webhookEventId: 'ev-img', items: SLIP_ITEMS });
    expect(calls).toEqual([
      ['from', 'pending_slips'],
      ['delete'],
      ['eq', 'id', 'slip-1'],
      ['eq', 'user_id', 'user-1'],
      ['gte', 'created_at', '2026-09-29T04:50:00.000Z'],
      ['select', 'line_event_id, items'],
      ['maybeSingle'],
    ]);
  });
```

และแก้ทุกเทสต์อื่นในสอง describe นี้ที่เคยส่ง `SLIP_ITEM` ให้ส่ง `SLIP_ITEMS` แทน (ลบค่าคงที่ `SLIP_ITEM` เดิม)

- [ ] **Step 2: รันเทสต์ให้เห็นว่าล้มเหลว**

Run: `npx vitest run src/db/repository.test.js`
Expected: FAIL เทสต์ `savePendingSlip` / `claimPendingSlip` (คอลัมน์ยังชื่อ `item`)

- [ ] **Step 3: เขียน SQL** สร้าง `supabase/007_pending_slips_items.sql`:

```sql
-- รันใน Supabase SQL Editor ต่อจาก 006_pending_slips.sql เพื่อให้แถวพักสลิปเก็บหลายรายการ

alter table public.pending_slips rename column item to items;

-- แถวเดิมเป็นออบเจ็กต์เดียว ห่อเป็นอาร์เรย์ก่อนบังคับชนิด
update public.pending_slips
set items = jsonb_build_array(items)
where jsonb_typeof(items) = 'object';

alter table public.pending_slips
  add constraint pending_slips_items_is_array check (jsonb_typeof(items) = 'array');
```

แก้ header ของ `supabase/schema.sql` บรรทัดแรก เปลี่ยนท้ายประโยคเป็น `... 005_budgets.sql, 006_pending_slips.sql และ 007_pending_slips_items.sql ต่อตามลำดับ`

ใน `SPEC.md` แก้บรรทัด `pending_slips` เป็น:

```
\- pending\_slips: id, user\_id, line\_event\_id, items (jsonb อาร์เรย์ของรายการจากสลิป), created\_at (พักรายการรอผู้ใช้กดยืนยัน หมดเวลา 10 นาที)
```

และใน `SPEC.md` ข้อ 6 (บรรทัดที่ขึ้นต้น `6\. อ่านสลิป`) ต่อท้ายประโยคเดิมด้วย `ใบเสร็จที่มีสินค้าหลายอย่างแสดงเป็นรายการแยกราคาของแต่ละอย่างในข้อความเดียว (ไม่รวมยอด) กดยืนยันครั้งเดียวบันทึกทุกรายการ` ห้ามแก้บรรทัดอื่นของข้อ 6

- [ ] **Step 4: เขียน repository** ใน `src/db/repository.js` แก้สอง function:

```js
  async function savePendingSlip(userId, webhookEventId, items) {
    const { data, error } = await supabase
      .from('pending_slips')
      .insert({ user_id: userId, line_event_id: webhookEventId, items })
      .select('id')
      .single();
    throwIfError('savePendingSlip', error);
    return data.id;
  }
```

และใน `claimPendingSlip` เปลี่ยน `.select('line_event_id, item')` เป็น `.select('line_event_id, items')` และบรรทัด return เป็น:

```js
    return data ? { webhookEventId: data.line_event_id, items: data.items } : null;
```

- [ ] **Step 5: รันเทสต์ให้ผ่าน**

Run: `npx vitest run src/db/repository.test.js`
Expected: PASS ทุกเทสต์

- [ ] **Step 6: Commit**

```bash
git add supabase/007_pending_slips_items.sql supabase/schema.sql SPEC.md src/db/repository.js src/db/repository.test.js
git commit -m "feat: keep several items per pending slip"
```

---

### Task 2: ข้อความสรุปหลายรายการ

**Depends on:** none

**Files:**
- Modify: `src/parser/format-reply.js`
- Test: `src/parser/format-reply.test.js`

**Interfaces:**
- Produces (Task 4 ใช้): `formatSlipConfirmReply(items: object[], { dateAssumed = false, extrasNote = '', slipTotal = 0, truncatedTo = 0 } = {}): string` ตามรูปแบบในหัวข้อ "รูปแบบข้อความสรุป"; `formatSavedReply(items)` เดิมไม่เปลี่ยน

- [ ] **Step 1: เขียนเทสต์ที่ล้มเหลว** ใน `src/parser/format-reply.test.js` แทนที่ `describe('formatSlipConfirmReply', ...)` เดิมทั้งก้อนด้วย:

```js
describe('formatSlipConfirmReply', () => {
  const ITEM = { type: 'expense', category: 'อาหาร', amount: 120, date: '2026-09-28', note: 'โอนให้ ร้านข้าวแกง' };
  const MILK = { type: 'expense', category: 'อาหาร', amount: 35, date: '2026-09-28', note: 'นมสด' };
  const TOOTHPASTE = { type: 'expense', category: 'สุขภาพ', amount: 59, date: '2026-09-28', note: 'ยาสีฟัน' };
  const CONFIRM = 'กดบันทึกเพื่อยืนยัน (หมดเวลาใน 10 นาที)';

  it('shows a single item exactly as before', () => {
    expect(formatSlipConfirmReply([ITEM])).toBe(
      `อ่านสลิปได้ดังนี้\n- รายจ่าย | อาหาร | 120 บาท | 28/09 | โอนให้ ร้านข้าวแกง\n${CONFIRM}`
    );
  });

  it('tells the user when the date was not readable and today is used', () => {
    expect(formatSlipConfirmReply([ITEM], { dateAssumed: true })).toBe(
      `อ่านสลิปได้ดังนี้\n- รายจ่าย | อาหาร | 120 บาท | 28/09 | โอนให้ ร้านข้าวแกง\nอ่านวันที่ไม่ได้ จึงใช้วันนี้\n${CONFIRM}`
    );
  });

  it('lists every item with its own price and the count in the header, without a total', () => {
    expect(formatSlipConfirmReply([MILK, TOOTHPASTE])).toBe(
      `อ่านสลิปได้ 2 รายการ\n- รายจ่าย | อาหาร | 35 บาท | 28/09 | นมสด\n- รายจ่าย | สุขภาพ | 59 บาท | 28/09 | ยาสีฟัน\n${CONFIRM}`
    );
  });

  it('shows the extras note and the slip net total when there are extras', () => {
    expect(
      formatSlipConfirmReply([MILK, TOOTHPASTE], { extrasNote: 'ส่วนลด 10 บาท, VAT 7%', slipTotal: 84 })
    ).toBe(
      'อ่านสลิปได้ 2 รายการ\n- รายจ่าย | อาหาร | 35 บาท | 28/09 | นมสด\n- รายจ่าย | สุขภาพ | 59 บาท | 28/09 | ยาสีฟัน\n' +
        `หมายเหตุ: ส่วนลด 10 บาท, VAT 7% (ไม่ได้บันทึก)\nยอดสุทธิบนสลิป 84 บาท\n${CONFIRM}`
    );
  });

  it('shows the extras note without a net total when the total was not readable', () => {
    const text = formatSlipConfirmReply([MILK], { extrasNote: 'ค่าส่ง 20 บาท', slipTotal: 0 });

    expect(text).toContain('หมายเหตุ: ค่าส่ง 20 บาท (ไม่ได้บันทึก)');
    expect(text).not.toContain('ยอดสุทธิบนสลิป');
  });

  it('does not show the net total when there is no extras note', () => {
    expect(formatSlipConfirmReply([MILK, TOOTHPASTE], { slipTotal: 94 })).not.toContain('ยอดสุทธิบนสลิป');
  });

  it('says when the receipt was cut to the first items', () => {
    const text = formatSlipConfirmReply([MILK, TOOTHPASTE], { truncatedTo: 20 });

    expect(text).toContain('มีสินค้ามากกว่า 20 รายการ บันทึกเฉพาะ 20 รายการแรก');
  });

  it('keeps the fixed line order: extras, total, cut, date, confirm', () => {
    const lines = formatSlipConfirmReply([MILK, TOOTHPASTE], {
      extrasNote: 'VAT 7%',
      slipTotal: 100,
      truncatedTo: 20,
      dateAssumed: true,
    }).split('\n');

    expect(lines.slice(3)).toEqual([
      'หมายเหตุ: VAT 7% (ไม่ได้บันทึก)',
      'ยอดสุทธิบนสลิป 100 บาท',
      'มีสินค้ามากกว่า 20 รายการ บันทึกเฉพาะ 20 รายการแรก',
      'อ่านวันที่ไม่ได้ จึงใช้วันนี้',
      CONFIRM,
    ]);
  });
});
```

- [ ] **Step 2: รันเทสต์ให้เห็นว่าล้มเหลว**

Run: `npx vitest run src/parser/format-reply.test.js`
Expected: FAIL เทสต์ใน `formatSlipConfirmReply` (ฟังก์ชันยังรับ item เดียว)

- [ ] **Step 3: เขียนโค้ด** แทนที่ `formatSlipConfirmReply` ใน `src/parser/format-reply.js`:

```js
function formatSlipConfirmReply(items, { dateAssumed = false, extrasNote = '', slipTotal = 0, truncatedTo = 0 } = {}) {
  const header = items.length > 1 ? `อ่านสลิปได้ ${items.length} รายการ` : 'อ่านสลิปได้ดังนี้';
  const lines = [header, ...items.map(formatItem)];
  if (extrasNote) {
    lines.push(`หมายเหตุ: ${extrasNote} (ไม่ได้บันทึก)`);
    // ยอดสุทธิจากสลิปเองไม่ใช่ยอดที่ระบบรวม แสดงเฉพาะตอนมีหมายเหตุเพื่อให้เห็นว่าผลรวมอาจไม่ตรง
    if (slipTotal > 0) {
      lines.push(`ยอดสุทธิบนสลิป ${formatAmount(slipTotal)} บาท`);
    }
  }
  if (truncatedTo > 0) {
    lines.push(`มีสินค้ามากกว่า ${truncatedTo} รายการ บันทึกเฉพาะ ${truncatedTo} รายการแรก`);
  }
  if (dateAssumed) {
    lines.push('อ่านวันที่ไม่ได้ จึงใช้วันนี้');
  }
  lines.push('กดบันทึกเพื่อยืนยัน (หมดเวลาใน 10 นาที)');
  return lines.join('\n');
}
```

- [ ] **Step 4: รันเทสต์ให้ผ่าน**

Run: `npx vitest run src/parser/format-reply.test.js`
Expected: PASS (รวมเทสต์ `formatSavedReply` เดิม)

- [ ] **Step 5: Commit**

```bash
git add src/parser/format-reply.js src/parser/format-reply.test.js
git commit -m "feat: format a slip confirmation with several items"
```

---

### Task 3: Claude อ่านใบเสร็จหลายรายการ

**Depends on:** none

**Files:**
- Modify: `src/slip/parse-slip.js`
- Test: `src/slip/parse-slip.test.js`

**Interfaces:**
- Consumes: `toParseResult(data, today)`, `ParseError` จาก `src/parser/parse-message.js`
- Produces (Task 4 ใช้): `createSlipParser({ client, model, now }): (image: { data: string, mediaType: string }) => Promise<{ status: 'ok', items: { type, category, amount, date, note }[], dateAssumed: boolean, extrasNote: string, slipTotal: number, truncatedTo: number } | { status: 'unreadable' }>` โดย `truncatedTo` เป็น 0 เมื่อไม่ถูกตัด หรือ `20` (`MAX_SLIP_ITEMS`) เมื่อเกิน; โยน `ParseError` เมื่อ Claude ตอบผิดรูป/ถูกตัด/ปฏิเสธ; `SLIP_SCHEMA`, `MAX_SLIP_ITEMS`

- [ ] **Step 1: เขียนเทสต์ที่ล้มเหลว** ใน `src/slip/parse-slip.test.js`:

1. แก้ import บรรทัดแรกของโมดูลเป็น `import { createSlipParser, SLIP_SCHEMA, MAX_SLIP_ITEMS } from './parse-slip.js';`
2. แทนที่ฟังก์ชัน `slipJson` ด้วยตัวนี้ (รับค่าแบบแบนเหมือนเดิมเพื่อให้เทสต์เก่าที่ส่ง `{ amount }`, `{ note }`, `{ type, category }`, `{ date }`, `{ is_slip: false }` ใช้ต่อได้ และสร้างรูปแบบใหม่):

```js
function slipJson({ is_slip = true, date = '2026-09-28', slip_total = 0, extras_note = '', items, ...flat } = {}) {
  return {
    is_slip,
    date,
    slip_total,
    extras_note,
    items: items || [
      { type: 'expense', category: 'อาหาร', amount: 120, note: 'โอนให้ ร้านข้าวแกง', ...flat },
    ],
  };
}
```

3. ในเทสต์เดิมทุกข้อ: เปลี่ยน `result.item` เป็น `result.items[0]` และ `toMatchObject({ ..., item: {...} })` เป็น `items: [expect.objectContaining({...})]` (ผลลัพธ์ที่อ่านจาก `item.note` / `item.date` / `item.category` ใช้ `items[0].` นำหน้าแทน) และเทสต์แรก ('returns the normalized item read from the slip') เปลี่ยน expected เป็น:

```js
    expect(await parseSlip(IMAGE)).toEqual({
      status: 'ok',
      items: [{ type: 'expense', category: 'อาหาร', amount: 120, date: '2026-09-28', note: 'โอนให้ ร้านข้าวแกง' }],
      dateAssumed: false,
      extrasNote: '',
      slipTotal: 0,
      truncatedTo: 0,
    });
```

4. เพิ่ม describe ใหม่ท้ายไฟล์:

```js
describe('createSlipParser with several items', () => {
  const MILK = { type: 'expense', category: 'อาหาร', amount: 35, note: 'นมสด' };
  const TOOTHPASTE = { type: 'expense', category: 'สุขภาพ', amount: 59, note: 'ยาสีฟัน' };

  it('returns one item per product line with the shared date and its own category', async () => {
    const result = await setup(slipJson({ items: [MILK, TOOTHPASTE] })).parseSlip(IMAGE);

    expect(result).toEqual({
      status: 'ok',
      items: [
        { type: 'expense', category: 'อาหาร', amount: 35, date: '2026-09-28', note: 'นมสด' },
        { type: 'expense', category: 'สุขภาพ', amount: 59, date: '2026-09-28', note: 'ยาสีฟัน' },
      ],
      dateAssumed: false,
      extrasNote: '',
      slipTotal: 0,
      truncatedTo: 0,
    });
  });

  it('returns the extras note and the slip net total, sanitized', async () => {
    const result = await setup(
      slipJson({ items: [MILK, TOOTHPASTE], extras_note: 'ส่วนลด 10 บาท,\nVAT 7%', slip_total: 84 })
    ).parseSlip(IMAGE);

    expect(result.extrasNote).toBe('ส่วนลด 10 บาท, VAT 7%');
    expect(result.slipTotal).toBe(84);
  });

  it('treats an unreadable slip total as zero', async () => {
    for (const slip_total of [0, -5, null, 'x']) {
      const result = await setup(slipJson({ items: [MILK], slip_total })).parseSlip(IMAGE);

      expect(result.slipTotal).toBe(0);
    }
  });

  it('keeps the first items and reports the cut when there are too many', async () => {
    const items = Array.from({ length: MAX_SLIP_ITEMS + 5 }, (_, index) => ({ ...MILK, note: `สินค้า ${index + 1}` }));
    const result = await setup(slipJson({ items })).parseSlip(IMAGE);

    expect(result.items).toHaveLength(MAX_SLIP_ITEMS);
    expect(result.items[0].note).toBe('สินค้า 1');
    expect(result.truncatedTo).toBe(MAX_SLIP_ITEMS);
  });

  it('does not report a cut for exactly the maximum', async () => {
    const items = Array.from({ length: MAX_SLIP_ITEMS }, () => MILK);
    const result = await setup(slipJson({ items })).parseSlip(IMAGE);

    expect(result.truncatedTo).toBe(0);
  });

  it('is unreadable when there are no items', async () => {
    expect(await setup(slipJson({ items: [] })).parseSlip(IMAGE)).toEqual({ status: 'unreadable' });
  });

  it('is unreadable when any item has an invalid amount', async () => {
    for (const amount of [0, -10, 0.004, MAX_AMOUNT + 1, null]) {
      const result = await setup(slipJson({ items: [MILK, { ...TOOTHPASTE, amount }] })).parseSlip(IMAGE);

      expect(result).toEqual({ status: 'unreadable' });
    }
  });

  it('falls back to the other category per item and sanitizes each note', async () => {
    const result = await setup(
      slipJson({ items: [{ ...MILK, category: 'ไม่มีหมวดนี้', note: 'นม\u0000สด' }, TOOTHPASTE] })
    ).parseSlip(IMAGE);

    expect(result.items[0]).toMatchObject({ category: 'อื่นๆ', note: 'นม สด' });
  });

  it('throws ParseError when items is not an array or an item has an unknown type', async () => {
    await expect(setup({ ...slipJson(), items: 'x' }).parseSlip(IMAGE)).rejects.toBeInstanceOf(ParseError);
    await expect(
      setup(slipJson({ items: [MILK, { ...TOOTHPASTE, type: 'transfer' }] })).parseSlip(IMAGE)
    ).rejects.toBeInstanceOf(ParseError);
  });

  it('asks Claude for one item per product line and for extras and the net total separately', async () => {
    const { create, parseSlip } = setup(slipJson({ items: [MILK] }));

    await parseSlip(IMAGE);

    const system = create.mock.calls[0][0].system;
    expect(system).toContain('one item per product');
    expect(system).toContain('extras_note');
    expect(system).toContain('slip_total');
    expect(create.mock.calls[0][0].max_tokens).toBeGreaterThanOrEqual(2048);
  });
});
```

(ถ้าไฟล์เทสต์เดิมยังไม่ import `MAX_AMOUNT` ให้ใช้ค่าจาก `createRequire(import.meta.url)('../parser/parse-message.js')` ที่มีอยู่แล้วในไฟล์ ซึ่งมี `ParseError` และ `MAX_AMOUNT`)

- [ ] **Step 2: รันเทสต์ให้เห็นว่าล้มเหลว**

Run: `npx vitest run src/slip/parse-slip.test.js`
Expected: FAIL หลายเทสต์ (`MAX_SLIP_ITEMS` ยังไม่ export, ผลลัพธ์ยังเป็น `item`)

- [ ] **Step 3: เขียนโค้ดใน `src/slip/parse-slip.js`**

1. เพิ่มค่าคงที่ใต้ `MAX_NOTE_LENGTH`:

```js
// เพดานสินค้าต่อใบ กันใบเสร็จยาวผิดปกติทำให้ข้อความตอบยาวเกินและค่า token บาน
const MAX_SLIP_ITEMS = 20;
```

2. แทนที่ `SLIP_SCHEMA`:

```js
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
```

3. แทนที่ `buildSystemPrompt`:

```js
function buildSystemPrompt(today) {
  return [
    'You read a picture sent by a Thai user to a personal finance bot and extract the transactions from it.',
    `Today is ${today} (Asia/Bangkok).`,
    '',
    'Rules:',
    '- Set is_slip to true only when the picture is a Thai bank transfer slip, payment confirmation or receipt that shows a paid or received amount. Otherwise set is_slip to false, items to [], slip_total to 0, and the other fields to any valid value.',
    '- A bank transfer slip or a payment confirmation has one amount: return exactly one item.',
    '- A shop receipt lists products or services: return one item per product or service line, in the order printed. Never add amounts together and never merge lines.',
    '- amount of an item is the price printed on that line in Thai baht as a positive number. If a line has a quantity, use the line total, not the unit price. Do not use fees or the account balance.',
    '- Do not return discount, VAT, service charge, delivery fee, rounding, change, payment method or total lines as items. Instead describe them in extras_note as a short Thai text, for example "ส่วนลด 10 บาท, VAT 7%", or an empty string when there are none.',
    '- slip_total is the final net amount printed on the slip in Thai baht as a positive number, or 0 when it is not visible.',
    '- date is the transaction date as YYYY-MM-DD in the Gregorian calendar, one date for the whole slip. Thai slips use Buddhist era years, so subtract 543 (for example 2569 is 2026). If the date is not visible or unclear, use an empty string.',
    '- type is "expense" when the user paid money out, which is the usual case. Use "income" only when the slip clearly shows the user received money.',
    '- note is a short Thai description: for a receipt the product name as printed; for a transfer "โอนให้ <recipient name>" or the shop name. Never include account numbers or reference numbers.',
    `- Expense categories: ${DEFAULT_CATEGORIES.expense.join(', ')}`,
    `- Income categories: ${DEFAULT_CATEGORIES.income.join(', ')}`,
    '- Pick the category for each item separately from the list that matches the type and the product or recipient. Use "อื่นๆ" when you are not sure.',
  ].join('\n');
}
```

4. แทนที่ `hasValidShape`:

```js
function hasValidShape(data) {
  return (
    isPlainObject(data) &&
    typeof data.is_slip === 'boolean' &&
    Array.isArray(data.items) &&
    data.items.every((item) => isPlainObject(item) && ['expense', 'income'].includes(item.type))
  );
}
```

5. ใน `createSlipParser` เปลี่ยน `max_tokens: 512` เป็น `max_tokens: 2048` (ใบเสร็จหลายรายการยาวกว่า) และแทนที่ส่วนท้ายตั้งแต่ `if (!data.is_slip)` ถึง `return { status: 'ok', ... }` ด้วย:

```js
    if (!data.is_slip || data.items.length === 0) {
      return { status: 'unreadable' };
    }

    const date = fixBuddhistYear(data.date, today);
    const truncated = data.items.length > MAX_SLIP_ITEMS;
    const items = data.items.slice(0, MAX_SLIP_ITEMS).map((item) => ({
      type: item.type,
      category: item.category,
      amount: item.amount,
      date,
      note: sanitizeNote(item.note),
    }));
    // ใช้กติกาตรวจยอดและหมวดชุดเดียวกับข้อความตัวอักษร รายการใดไม่ผ่านถือว่าทั้งใบอ่านยอดไม่ได้
    const result = toParseResult({ needs_clarification: false, items }, today);
    if (result.status !== 'ok') {
      return { status: 'unreadable' };
    }
    return {
      status: 'ok',
      items: result.items,
      dateAssumed: !isValidCalendarDate(date),
      extrasNote: sanitizeNote(data.extras_note),
      slipTotal: Number.isFinite(data.slip_total) && data.slip_total > 0 ? data.slip_total : 0,
      truncatedTo: truncated ? MAX_SLIP_ITEMS : 0,
    };
```

6. ท้ายไฟล์เปลี่ยน export เป็น `module.exports = { createSlipParser, SLIP_SCHEMA, MAX_SLIP_ITEMS };`

- [ ] **Step 4: รันเทสต์ให้ผ่าน**

Run: `npx vitest run src/slip/parse-slip.test.js src/parser/parse-message.test.js`
Expected: PASS ทั้งสองไฟล์

- [ ] **Step 5: Commit**

```bash
git add src/slip/parse-slip.js src/slip/parse-slip.test.js
git commit -m "feat: read every product line of a receipt as its own item"
```

---

### Task 4: บอทใช้ items

**Depends on:** Task 1, Task 2, Task 3

**Files:**
- Modify: `src/bot.js`
- Test: `src/bot.test.js`

**Interfaces:**
- Consumes: `repository.savePendingSlip(userId, eventId, items)` และ `claimPendingSlip -> { webhookEventId, items }` (Task 1); `formatSlipConfirmReply(items, { dateAssumed, extrasNote, slipTotal, truncatedTo })` (Task 2); `parseSlip -> { status, items, dateAssumed, extrasNote, slipTotal, truncatedTo }` (Task 3)

- [ ] **Step 1: เขียนเทสต์ที่ล้มเหลว** ใน `src/bot.test.js`:

1. เพิ่มใต้ `SLIP_ITEM` (บรรทัด 23):

```js
const SLIP_EXTRA_ITEM = { type: 'expense', category: 'สุขภาพ', amount: 59, date: '2026-09-28', note: 'ยาสีฟัน' };

function slipResult(overrides = {}) {
  return { status: 'ok', items: [SLIP_ITEM], dateAssumed: false, extrasNote: '', slipTotal: 0, truncatedTo: 0, ...overrides };
}
```

2. แก้ mock ใน `setup()`:
- บรรทัด 78: `parseSlip: vi.fn().mockResolvedValue(slipResult()),`
- บรรทัด 92: `claimPendingSlip: vi.fn().mockResolvedValue({ webhookEventId: 'ev-img', items: [SLIP_ITEM] }),`
3. แก้เทสต์เดิม:
- บรรทัด 721: `expect(deps.repository.savePendingSlip).toHaveBeenCalledWith('user-1', 'ev-img', [SLIP_ITEM]);`
- บรรทัด 727: `const parseSlip = vi.fn().mockResolvedValue(slipResult({ dateAssumed: true }));`
- บรรทัด 986 (`mockImplementation` ของ claimPendingSlip): ส่งคืน `{ webhookEventId: 'ev-img', items: [SLIP_ITEM] }`
4. เพิ่ม describe ใหม่ท้ายไฟล์ (ใช้ `NOW_MS`, `SLIP_ID`, `imageEvent`, `postbackEvent`, `setup` ที่มีอยู่; หมวดสุขภาพต้องมีใน `loadCategoryIds` ของ `setup()` จึงสร้างใน mock ของเทสต์เอง):

```js
describe('bot slip with several items', () => {
  const SAVE = `action=slip_save&slip=${SLIP_ID}`;
  const CATEGORY_IDS = new Map([
    ['expense:อาหาร', 'cat-food'],
    ['expense:สุขภาพ', 'cat-health'],
    ['expense:อื่นๆ', 'cat-other'],
  ]);

  it('keeps every item pending and shows them one by one with the extras note', async () => {
    const parseSlip = vi.fn().mockResolvedValue(
      slipResult({
        items: [SLIP_ITEM, SLIP_EXTRA_ITEM],
        extrasNote: 'ส่วนลด 10 บาท',
        slipTotal: 169,
      })
    );
    const { deps, bot } = setup({ parseSlip });

    await bot.handleEvent(imageEvent());

    expect(deps.repository.savePendingSlip).toHaveBeenCalledWith('user-1', 'ev-img', [SLIP_ITEM, SLIP_EXTRA_ITEM]);
    expect(deps.repository.insertTransactions).not.toHaveBeenCalled();
    expect(deps.replyText.mock.calls[0][1]).toBe(
      'อ่านสลิปได้ 2 รายการ\n' +
        '- รายจ่าย | อาหาร | 120 บาท | 28/09 | โอนให้ ร้านข้าวแกง\n' +
        '- รายจ่าย | สุขภาพ | 59 บาท | 28/09 | ยาสีฟัน\n' +
        'หมายเหตุ: ส่วนลด 10 บาท (ไม่ได้บันทึก)\n' +
        'ยอดสุทธิบนสลิป 169 บาท\n' +
        'กดบันทึกเพื่อยืนยัน (หมดเวลาใน 10 นาที)'
    );
  });

  it('saves all items as separate rows in one insert tied to the image event, then offers undo', async () => {
    const { deps, bot } = setup();
    deps.users.loadCategoryIds.mockResolvedValue(CATEGORY_IDS);
    deps.repository.claimPendingSlip.mockResolvedValue({
      webhookEventId: 'ev-img',
      items: [SLIP_ITEM, SLIP_EXTRA_ITEM],
    });

    await bot.handleEvent(postbackEvent(SAVE));

    expect(deps.repository.insertTransactions).toHaveBeenCalledTimes(1);
    expect(deps.repository.insertTransactions).toHaveBeenCalledWith([
      {
        user_id: 'user-1',
        type: 'expense',
        category_id: 'cat-food',
        amount: 120,
        note: 'โอนให้ ร้านข้าวแกง',
        occurred_on: '2026-09-28',
        source: 'slip',
        line_event_id: 'ev-img',
      },
      {
        user_id: 'user-1',
        type: 'expense',
        category_id: 'cat-health',
        amount: 59,
        note: 'ยาสีฟัน',
        occurred_on: '2026-09-28',
        source: 'slip',
        line_event_id: 'ev-img',
      },
    ]);
    expect(deps.replyText.mock.calls[0][1]).toBe(
      'บันทึกแล้ว\n- รายจ่าย | อาหาร | 120 บาท | 28/09 | โอนให้ ร้านข้าวแกง\n- รายจ่าย | สุขภาพ | 59 บาท | 28/09 | ยาสีฟัน'
    );
    expect(deps.replyText.mock.calls[0][2][0].action.data).toBe('action=undo&event=ev-img');
  });

  it('checks the budget of every category the receipt touched', async () => {
    const { deps, bot } = setup();
    deps.users.loadCategoryIds.mockResolvedValue(CATEGORY_IDS);
    deps.repository.claimPendingSlip.mockResolvedValue({
      webhookEventId: 'ev-img',
      items: [SLIP_ITEM, SLIP_EXTRA_ITEM],
    });
    deps.repository.getBudgetStatus.mockResolvedValue([
      { categoryId: 'cat-food', category: 'อาหาร', budget: 150, spent: 135 },
      { categoryId: 'cat-health', category: 'สุขภาพ', budget: 100, spent: 100 },
    ]);

    await bot.handleEvent(postbackEvent(SAVE));

    const text = deps.replyText.mock.calls[0][1];
    expect(text).toContain('ใกล้เต็มงบ อาหาร เดือน 09/2026: ใช้ไป 135 จาก 150 บาท (90%)');
    expect(text).toContain('เกินงบ สุขภาพ เดือน 09/2026: ใช้ไป 100 จาก 100 บาท (100%)');
  });

  it('tells the user when the receipt was cut to the first items', async () => {
    const parseSlip = vi.fn().mockResolvedValue(slipResult({ truncatedTo: 20 }));
    const { deps, bot } = setup({ parseSlip });

    await bot.handleEvent(imageEvent());

    expect(deps.replyText.mock.calls[0][1]).toContain('มีสินค้ามากกว่า 20 รายการ บันทึกเฉพาะ 20 รายการแรก');
  });
});
```

- [ ] **Step 2: รันเทสต์ให้เห็นว่าล้มเหลว**

Run: `npx vitest run src/bot.test.js`
Expected: FAIL เทสต์ slip ทั้งหมดที่ใช้ `items` (โค้ดยังอ่าน `slip.item`)

- [ ] **Step 3: เขียนโค้ดใน `src/bot.js`**

1. ใน `handleImage` เปลี่ยนสองบรรทัดท้าย (หลัง `clearExpiredSlips`) เป็น:

```js
    const slipId = await repository.savePendingSlip(userId, event.webhookEventId, slip.items);
    return {
      text: formatSlipConfirmReply(slip.items, {
        dateAssumed: slip.dateAssumed,
        extrasNote: slip.extrasNote,
        slipTotal: slip.slipTotal,
        truncatedTo: slip.truncatedTo,
      }),
      quickReply: buildSlipQuickReply(slipId),
    };
```

2. ใน `handleSlipSave` เปลี่ยน `items: [slip.item],` เป็น `items: slip.items,` และ `formatSavedReply([slip.item])` เป็น `formatSavedReply(slip.items)`
3. แก้ import บรรทัดที่ 2 ให้มีช่องว่าง: `const { formatSavedReply, formatSlipConfirmReply } = require('./parser/format-reply');` (ข้อเล็กที่ค้างจากขั้นที่ 8)

- [ ] **Step 4: รันเทสต์ให้ผ่าน**

Run: `npx vitest run src/bot.test.js`
Expected: PASS ทั้งไฟล์ แล้วรัน `npx vitest run` ทั้งโปรเจกต์ ต้องผ่านทุกไฟล์ และ `node --check index.js` ไม่มี error

- [ ] **Step 5: Commit**

```bash
git add src/bot.js src/bot.test.js
git commit -m "feat: save every item of a receipt from one confirm button"
```

---

### Task 5: รัน 007 และ manual check ในแอป LINE (ผู้ใช้ทำเอง)

**Depends on:** Task 4

**Files:** ไม่มี (controller อัปเดต `work-memory/STATE.md` หลังผู้ใช้ตรวจเสร็จ)

เหตุผลที่ต้อง manual: การอ่านใบเสร็จจริงด้วย Claude และ migration กับ Supabase จริงทดสอบด้วย unit test ไม่ได้

- [ ] **Step 1: หยุดบอท** กด Ctrl+C ในเทอร์มินัลที่รัน `npm start` และตรวจว่า checkout branch ที่มีโค้ดนี้อยู่
- [ ] **Step 2: รัน SQL ครั้งเดียว** Supabase > SQL Editor > วาง `supabase/007_pending_slips_items.sql` ทั้งไฟล์ > Run ควรเห็น `Success. No rows returned` ไฟล์นี้รันซ้ำไม่ได้ (การ rename ล้มเหลวในครั้งที่สอง) ห้ามรันอีก
- [ ] **Step 3: ตรวจคอลัมน์** รัน `select column_name from information_schema.columns where table_name = 'pending_slips' order by ordinal_position;` ต้องมี `items` และไม่มี `item`
- [ ] **Step 4: เริ่มบอท** รัน `npm start` เห็น `Server listening on port 3000`
- [ ] **Step 5: สลิปโอนเงินเดิมยังทำงาน** ส่งสลิปโอน 1 ใบ ต้องได้ข้อความแบบเดิม (`อ่านสลิปได้ดังนี้` รายการเดียว) กดบันทึกแล้วได้ 1 แถว `source = slip` แล้วกดยกเลิกรายการเพื่อลบ
- [ ] **Step 6: ใบเสร็จหลายสินค้า** ส่งรูปใบเสร็จที่มีสินค้า 2-3 อย่าง ต้องได้ `อ่านสลิปได้ N รายการ` แต่ละบรรทัดมีชื่อสินค้า หมวด ราคาของมันเอง (ไม่มียอดรวมที่ระบบรวมให้) ตรวจว่าราคาแต่ละบรรทัดตรงกับใบเสร็จ
- [ ] **Step 7: ใบเสร็จยาวเกิน 20 รายการ (ไม่บังคับ)** ถ้ามีใบเสร็จที่มีสินค้ามากกว่า 20 รายการ ให้ส่งรูป ต้องได้ข้อความ `มีสินค้ามากกว่า 20 รายการ บันทึกเฉพาะ 20 รายการแรก` และเมื่อกดบันทึกได้ 20 แถว
- [ ] **Step 8: หมายเหตุ** ถ้าใบเสร็จมีส่วนลด VAT ค่าบริการหรือค่าส่ง ต้องมีบรรทัด `หมายเหตุ: ... (ไม่ได้บันทึก)` และ `ยอดสุทธิบนสลิป X บาท` ตรงกับยอดสุทธิบนใบเสร็จ และบรรทัดเหล่านั้นไม่ปรากฏเป็นรายการสินค้า
- [ ] **Step 9: กดบันทึกทั้งใบ** กด `บันทึก` ต้องได้ `บันทึกแล้ว` ตามด้วยทุกรายการ; Table Editor ของ `transactions` เพิ่มทีละแถวเท่าจำนวนสินค้า ทุกแถว `source = slip` และ `line_event_id` เดียวกัน วันที่ตรงกัน; `pending_slips` ว่าง
- [ ] **Step 10: ยกเลิกทั้งใบ** กดปุ่ม `ยกเลิก` หลังบันทึก ต้องได้ `ยกเลิกรายการแล้ว` และทุกแถวของใบนั้นหายพร้อมกัน
- [ ] **Step 11: ส่งผลให้ controller** แจ้งผลแต่ละ step (ผ่าน/ไม่ผ่านพร้อมข้อความที่เห็น) แล้ว controller จดลง STATE.md และ merge เข้า main

---

## Self-Review

**Spec coverage:** แสดงรายการแยกยอดในข้อความเดียว ไม่รวมยอด = Task 2 (`formatSlipConfirmReply`, ไม่มีบรรทัดยอดรวมของระบบ) และ Task 3 (`items`); บันทึกทุกรายการปุ่มเดียวแถวละอย่าง = Task 4 (`handleSlipSave`) บนฐาน Task 1 (`items` ใน `pending_slips`); บรรทัดส่วนลด/VAT/ค่าส่งเป็นหมายเหตุไม่บันทึก = Task 3 (`extras_note`, prompt) และ Task 2 (บรรทัดหมายเหตุ); หมวดรายสินค้า = Task 3 (หมวดต่อรายการใน schema); สลิปโอนยอดเดียวไม่เปลี่ยน = Task 2 เทสต์ 'shows a single item exactly as before'

**Placeholder scan:** ไม่มี TBD/TODO; ทุก step มีโค้ดหรือคำสั่งครบ

**Type consistency:** `items` (อาร์เรย์ของ `{type, category, amount, date, note}`) ตรงกันใน Task 1 (`savePendingSlip`/`claimPendingSlip`), Task 3 (`parseSlip` คืน), Task 4 (บอทส่งต่อและ `toTransactionRows`); ตัวเลือก `{ dateAssumed, extrasNote, slipTotal, truncatedTo }` ชื่อเดียวกันใน Task 2 (รับ), Task 3 (คืน), Task 4 (ส่งต่อ); `MAX_SLIP_ITEMS = 20` ตรงกับข้อความ `มีสินค้ามากกว่า 20 รายการ`

**Browser check:** ไม่มี task ที่เปลี่ยนหน้าเว็บ การตรวจจริงอยู่ที่ Task 5

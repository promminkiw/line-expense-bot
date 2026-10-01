# Slip Reading (Step 8) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ทำขั้นที่ 8 ของ `SPEC.md`: ผู้ใช้ส่งรูปสลิปในแชต บอทให้ Claude vision อ่านยอด/วันที่/ผู้รับ ตอบสรุปพร้อมปุ่ม บันทึก/ยกเลิก แล้วบันทึกเป็นรายการ (`source = 'slip'`) ก็ต่อเมื่อผู้ใช้กดยืนยัน

**Architecture:** รูปไม่ถูกเก็บ: บอทโหลดรูปจาก LINE (`MessagingApiBlobClient.getMessageContent`) ส่งให้ Claude เป็น base64 แล้วทิ้ง เก็บเฉพาะรายการที่อ่านได้ลงตาราง `pending_slips` (หนึ่งแถวต่อสลิป มี id เป็น UUID) ปุ่มบันทึก/ยกเลิกเป็น postback ที่พก `slip=<id>` กดแล้วบอท "claim" แถว (DELETE ... RETURNING คำสั่งเดียว กันกดซ้ำ) ถ้าได้แถวจึงบันทึก (บันทึก) หรือแค่ทิ้ง (ยกเลิก) การบันทึกใช้ `toTransactionRows` เดิม ผูก `line_event_id` กับ event ของรูป จึงใช้ปุ่มยกเลิกรายการ (undo) และการเตือนงบเดิมได้เลย

**Tech Stack:** Node.js 22 (CommonJS), Express 5.2.1, @line/bot-sdk 11.2.0, @anthropic-ai/sdk 0.129.0 (โมเดลจาก `config.claudeModel` ค่าเริ่มต้น `claude-haiku-4-5` รองรับรูป), @supabase/supabase-js 2.117.2, Vitest 5.0.2

## Global Constraints

- ผู้ใช้ใช้ Windows; server เป็น CommonJS; ไฟล์เทสต์ใช้ `import`; ห้าม `vi.mock` กับ module ที่ถูก `require`; เทสต์วางคู่กับไฟล์ (`foo.js` -> `foo.test.js`)
- ไม่เพิ่ม dependency ใหม่ใน `package.json`
- คอมเมนต์ในโค้ดสั้น บรรทัดเดียว ภาษาไทย อธิบาย "ทำไม"; ชื่อตัวแปร/function/log เป็นภาษาอังกฤษ; ห้าม emoji ในโค้ด คอมเมนต์ log ข้อความตอบ และ commit message
- ห้าม agent อ่านหรือแก้ `.env`; ห้าม agent start/restart/kill server; ห้าม agent รัน SQL กับ Supabase จริง; ห้ามเรียก Claude API จริงในเทสต์
- ห้าม `git add -f` และห้าม commit ไฟล์ใต้ `.superpowers/`
- รูปสลิปห้ามถูกเก็บลงดิสก์ DB หรือ log: ใช้ใน memory แล้วทิ้ง; log ห้ามมี base64 ของรูป
- ผู้ใช้ตัดสินแล้ว (2026-10-01): บอทตอบสรุป + ปุ่ม `บันทึก` / `ยกเลิก` ก่อนบันทึกจริง; ไม่เห็นยอด = ตอบให้ส่งใหม่หรือพิมพ์เอง; ไม่เห็นวันที่ = ใช้วันนี้ (และบอกในข้อความสรุป); Claude เดาประเภทและหมวดจากผู้รับ/โน้ตจาก 10 หมวดเดิม ไม่แน่ใจใช้ `อื่นๆ`; กันกดยืนยันซ้ำอย่างเดียว (ไม่ตรวจสลิปซ้ำ ส่งรูปเดิมมาใหม่ถือเป็นสลิปใหม่)
- ยอดเงินที่อ่านได้ผ่านกติกาเดิมของ `toParseResult`: มากกว่า 0, ไม่เกิน `MAX_AMOUNT` (10,000,000), ปัดสตางค์แล้วไม่เป็น 0; ไม่ผ่าน = ตอบว่าอ่านไม่ได้
- ปีในสลิปไทยเป็น พ.ศ. ต้องแปลงเป็น ค.ศ. (ลบ 543) ก่อนส่งเป็น `YYYY-MM-DD` สั่ง Claude ผ่าน prompt และมี guard ในโค้ดด้วย (ผู้ใช้ตัดสิน 2026-10-01): ถ้าปีที่ได้มากกว่าปีปัจจุบัน + 1 ให้ลบ 543 เอง; วันที่ที่ยังไม่ใช่วันจริงใช้วันนี้ (เขตเวลา Asia/Bangkok) และ `dateAssumed = true`
- รูปต้องไม่เกิน 5 MB (เพดานของ Claude) และเป็น JPEG, PNG, GIF หรือ WebP (ตรวจจาก magic bytes ไม่เชื่อ header)
- ข้อความจากรูปนับ rate limit (`allowRequest`) เพราะเรียก Claude vision; ลำดับเหมือนข้อความตัวอักษร: `ensureUser` -> `claimEvent` (ซ้ำ = ไม่ตอบ) -> `allowRequest` -> ทำงาน
- ปุ่ม postback ของสลิปพก `slip=<UUID>` เท่านั้น; id ที่ไม่ใช่ UUID ไม่ถูกส่งไป DB และไม่ตอบอะไร; ทุก query กรอง `user_id` ของผู้กด
- หมดเวลายืนยัน 10 นาทีนับจาก `created_at` ของแถว (`SLIP_TTL_MS`)
- ขั้นสุดท้ายของแผน: อัปเดต `work-memory/STATE.md` (controller ทำ)
- commit message ลงท้ายด้วย `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`

## ข้อความตอบ (คงที่ ห้ามเปลี่ยนถ้อยคำ)

| ค่าคงที่ | ข้อความ |
|---|---|
| `SLIP_UNREADABLE_REPLY` | `อ่านยอดจากรูปนี้ไม่ได้ ลองส่งรูปสลิปที่ชัดขึ้น หรือพิมพ์เองก็ได้ เช่น "กินข้าว 60"` |
| `SLIP_TOO_LARGE_REPLY` | `รูปใหญ่เกินไป (ไม่เกิน 5 MB) ลองส่งใหม่หรือย่อรูปก่อน` |
| `SLIP_UNSUPPORTED_REPLY` | `ไฟล์นี้ไม่ใช่รูปที่อ่านได้ (รองรับ JPEG, PNG, GIF, WebP)` |
| `SLIP_EXPIRED_REPLY` | `รายการนี้ถูกบันทึกหรือยกเลิกไปแล้ว หรือหมดเวลายืนยัน (10 นาที) ส่งสลิปใหม่ได้เลย` |
| `SLIP_CANCELLED_REPLY` | `ยกเลิกสลิปแล้ว ไม่ได้บันทึกรายการ` |
| ข้อความสรุปสลิป | `อ่านสลิปได้ดังนี้` + บรรทัดรายการแบบเดิม + (ถ้าเดาวันที่) `อ่านวันที่ไม่ได้ จึงใช้วันนี้` + `กดบันทึกเพื่อยืนยัน (หมดเวลาใน 10 นาที)` |

## ข้อจำกัดที่ยอมรับ

- ถ้า `insertTransactions` พังหลัง claim แถวแล้ว แถวรอยืนยันหายไป ผู้ใช้ได้ข้อความระบบมีปัญหาและต้องส่งสลิปใหม่ (ไม่ทำ transaction ข้ามสองคำสั่ง)
- การโหลดรูปจาก LINE ไม่มี timeout ของตัวเอง (SDK ไม่มี option) ถ้า LINE ช้ามาก event นั้นค้างจน reply token หมดอายุ
- สลิปซ้ำใบเดิมที่ส่งมาใหม่จะถูกบันทึกซ้ำได้ ผู้ใช้ลบเองในหน้าเว็บ (ตัดสินแล้ว)

## File Structure

| ไฟล์ | หน้าที่ | Task |
|---|---|---|
| `supabase/006_pending_slips.sql`, `supabase/schema.sql` (header), `SPEC.md`, `src/db/repository.js`, `src/db/repository.test.js` | ตารางพักสลิป + `savePendingSlip`, `claimPendingSlip`, `deleteExpiredPendingSlips` | 1 |
| `src/db/transaction-rows.js`, `src/db/transaction-rows.test.js`, `src/parser/format-reply.js`, `src/parser/format-reply.test.js` | `source` ที่เลือกได้, ข้อความสรุปสลิป | 2 |
| `src/slip/download-image.js`, `src/slip/download-image.test.js` | โหลดรูปจาก LINE, จำกัดขนาด, ตรวจชนิดไฟล์ | 3 |
| `src/slip/parse-slip.js`, `src/slip/parse-slip.test.js`, `src/parser/parse-message.js` (export เพิ่ม) | Claude vision อ่านสลิป | 4 |
| `src/bot.js`, `src/bot.test.js` | รับรูป -> ตอบสรุป + ปุ่ม | 5 |
| `src/bot.js`, `src/bot.test.js` | postback บันทึก/ยกเลิกสลิป | 6 |
| `index.js` | ต่อสายใช้งานจริง | 7 |
| (manual) | รัน 006 และลองในแอป LINE | 8 |

ลำดับ: Task 1-4 แยกกันได้ (ไม่แตะไฟล์เดียวกัน) แล้ว Task 5 -> 6 -> 7 -> 8 ต่อกัน (Task 5 และ 6 แก้ `src/bot.js` และ `src/bot.test.js` ไฟล์เดียวกันจึงห้ามทำขนาน)

---

### Task 1: ตาราง pending_slips และ repository

**Depends on:** none

**Files:**
- Create: `supabase/006_pending_slips.sql`
- Modify: `supabase/schema.sql:1` (บรรทัด header), `SPEC.md` (รายการตารางใต้หัวข้อข้อมูล), `src/db/repository.js` (เพิ่ม 3 function ใต้ `clearPendingClarification` และใส่ใน object ที่ return)
- Test: `src/db/repository.test.js`

**Interfaces:**
- Consumes: `throwIfError(name, error)` และ `DatabaseError` ที่มีอยู่ใน `repository.js`
- Produces (Task 5, 6 ใช้):
  - `repository.savePendingSlip(userId: string, webhookEventId: string, item: object): Promise<string>` คืน id (UUID) ของแถว
  - `repository.claimPendingSlip(userId: string, slipId: string, sinceIso: string): Promise<{ webhookEventId: string, item: object } | null>` ลบแถวที่เป็นของ `userId`, id ตรง และ `created_at >= sinceIso` แล้วคืนแถวนั้น ไม่มี = `null`
  - `repository.deleteExpiredPendingSlips(userId: string, beforeIso: string): Promise<void>` ลบแถวของผู้ใช้ที่ `created_at <= beforeIso`

- [ ] **Step 1: เขียนเทสต์ที่ล้มเหลว**

เพิ่มต่อท้าย `src/db/repository.test.js`:

```js
const SLIP_ITEM = { type: 'expense', category: 'อาหาร', amount: 120, date: '2026-09-28', note: 'โอนให้ ร้านข้าวแกง' };

describe('repository.savePendingSlip', () => {
  it('inserts the item for this user and event and returns the new id', async () => {
    const { supabase, calls } = fakeSupabase({ data: { id: 'slip-1' }, error: null });

    const id = await createRepository(supabase).savePendingSlip('user-1', 'ev-img', SLIP_ITEM);

    expect(id).toBe('slip-1');
    expect(calls).toEqual([
      ['from', 'pending_slips'],
      ['insert', { user_id: 'user-1', line_event_id: 'ev-img', item: SLIP_ITEM }],
      ['select', 'id'],
      ['single'],
    ]);
  });

  it('throws DatabaseError when Supabase returns an error', async () => {
    const { supabase } = fakeSupabase({ data: null, error: { message: 'boom' } });

    const promise = createRepository(supabase).savePendingSlip('user-1', 'ev-img', SLIP_ITEM);

    await expect(promise).rejects.toBeInstanceOf(DatabaseError);
    await expect(promise).rejects.toThrow('Database savePendingSlip failed: boom');
  });
});

describe('repository.claimPendingSlip', () => {
  it('deletes and returns only this user unexpired row in one statement', async () => {
    const { supabase, calls } = fakeSupabase({
      data: { line_event_id: 'ev-img', item: SLIP_ITEM },
      error: null,
    });

    const slip = await createRepository(supabase).claimPendingSlip('user-1', 'slip-1', '2026-09-29T04:50:00.000Z');

    expect(slip).toEqual({ webhookEventId: 'ev-img', item: SLIP_ITEM });
    expect(calls).toEqual([
      ['from', 'pending_slips'],
      ['delete'],
      ['eq', 'id', 'slip-1'],
      ['eq', 'user_id', 'user-1'],
      ['gte', 'created_at', '2026-09-29T04:50:00.000Z'],
      ['select', 'line_event_id, item'],
      ['maybeSingle'],
    ]);
  });

  it('returns null when the row is gone, expired or belongs to someone else', async () => {
    const { supabase } = fakeSupabase({ data: null, error: null });

    expect(await createRepository(supabase).claimPendingSlip('user-1', 'slip-1', '2026-09-29T04:50:00.000Z')).toBeNull();
  });

  it('throws DatabaseError when Supabase returns an error', async () => {
    const { supabase } = fakeSupabase({ data: null, error: { message: 'boom' } });

    const promise = createRepository(supabase).claimPendingSlip('user-1', 'slip-1', '2026-09-29T04:50:00.000Z');

    await expect(promise).rejects.toBeInstanceOf(DatabaseError);
    await expect(promise).rejects.toThrow('Database claimPendingSlip failed: boom');
  });
});

describe('repository.deleteExpiredPendingSlips', () => {
  it('deletes only this user rows created at or before the cutoff', async () => {
    const { supabase, calls } = fakeSupabase({ data: null, error: null });

    await createRepository(supabase).deleteExpiredPendingSlips('user-1', '2026-09-29T04:50:00.000Z');

    expect(calls).toEqual([
      ['from', 'pending_slips'],
      ['delete'],
      ['eq', 'user_id', 'user-1'],
      ['lte', 'created_at', '2026-09-29T04:50:00.000Z'],
    ]);
  });

  it('throws DatabaseError when Supabase returns an error', async () => {
    const { supabase } = fakeSupabase({ data: null, error: { message: 'boom' } });

    const promise = createRepository(supabase).deleteExpiredPendingSlips('user-1', '2026-09-29T04:50:00.000Z');

    await expect(promise).rejects.toBeInstanceOf(DatabaseError);
    await expect(promise).rejects.toThrow('Database deleteExpiredPendingSlips failed: boom');
  });
});
```

- [ ] **Step 2: รันเทสต์ให้เห็นว่าล้มเหลว**

Run: `npx vitest run src/db/repository.test.js`
Expected: FAIL 7 เทสต์ใหม่ด้วย `savePendingSlip is not a function` (หรือ claimPendingSlip / deleteExpiredPendingSlips)

- [ ] **Step 3: เขียน SQL**

สร้าง `supabase/006_pending_slips.sql`:

```sql
-- รันใน Supabase SQL Editor ต่อจาก 005_budgets.sql เพื่อพักรายการที่อ่านจากสลิปไว้รอผู้ใช้กดยืนยัน

create table public.pending_slips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  -- event ของรูป ใช้เป็น line_event_id ของรายการที่บันทึก เพื่อให้ปุ่มยกเลิกรายการเดิมใช้ได้
  line_event_id text not null references public.line_events (webhook_event_id) on delete cascade,
  item jsonb not null,
  created_at timestamptz not null default now()
);

-- ให้ลบ user แล้ว cascade และลบของหมดอายุของผู้ใช้ได้เร็ว
create index pending_slips_user_id_idx on public.pending_slips (user_id);

-- ไม่สร้าง policy เหมือนตารางอื่น: anon key เข้าถึงไม่ได้ ส่วน server ใช้ service role
alter table public.pending_slips enable row level security;
```

แก้บรรทัดแรกของ `supabase/schema.sql` ให้ต่อท้ายรายการว่า `... 004_export_links.sql, 005_budgets.sql และ 006_pending_slips.sql ต่อตามลำดับ` (เปลี่ยน "และ 005_budgets.sql" เป็น "005_budgets.sql และ 006_pending_slips.sql")

ใน `SPEC.md` เพิ่มบรรทัดใต้ `budgets` (เว้นบรรทัดว่างเหมือนบรรทัดอื่น):

```
\- pending\_slips: id, user\_id, line\_event\_id, item (jsonb), created\_at (พักรายการจากสลิปรอผู้ใช้กดยืนยัน หมดเวลา 10 นาที)
```

- [ ] **Step 4: เขียน repository**

ใน `src/db/repository.js` เพิ่มต่อจาก `clearPendingClarification`:

```js
  async function savePendingSlip(userId, webhookEventId, item) {
    const { data, error } = await supabase
      .from('pending_slips')
      .insert({ user_id: userId, line_event_id: webhookEventId, item })
      .select('id')
      .single();
    throwIfError('savePendingSlip', error);
    return data.id;
  }

  // delete พร้อมคืนแถวในคำสั่งเดียว กันกดบันทึกซ้ำสองครั้งพร้อมกัน
  async function claimPendingSlip(userId, slipId, sinceIso) {
    const { data, error } = await supabase
      .from('pending_slips')
      .delete()
      .eq('id', slipId)
      .eq('user_id', userId)
      .gte('created_at', sinceIso)
      .select('line_event_id, item')
      .maybeSingle();
    throwIfError('claimPendingSlip', error);
    return data ? { webhookEventId: data.line_event_id, item: data.item } : null;
  }

  async function deleteExpiredPendingSlips(userId, beforeIso) {
    const { error } = await supabase
      .from('pending_slips')
      .delete()
      .eq('user_id', userId)
      .lte('created_at', beforeIso);
    throwIfError('deleteExpiredPendingSlips', error);
  }
```

และเพิ่ม `savePendingSlip, claimPendingSlip, deleteExpiredPendingSlips,` ใน object ที่ `return` ท้ายไฟล์ ต่อจาก `clearPendingClarification,`

- [ ] **Step 5: รันเทสต์ให้ผ่าน**

Run: `npx vitest run src/db/repository.test.js`
Expected: PASS ทุกเทสต์

- [ ] **Step 6: Commit**

```bash
git add supabase/006_pending_slips.sql supabase/schema.sql SPEC.md src/db/repository.js src/db/repository.test.js
git commit -m "feat: add pending_slips table and repository methods"
```

---

### Task 2: source ที่เลือกได้ และข้อความสรุปสลิป

**Depends on:** none

**Files:**
- Modify: `src/db/transaction-rows.js`, `src/parser/format-reply.js`
- Test: `src/db/transaction-rows.test.js`, `src/parser/format-reply.test.js`

**Interfaces:**
- Produces (Task 5, 6 ใช้):
  - `toTransactionRows({ items, categoryIds, userId, webhookEventId, source = 'text' })` ใส่ `source` ลงทุกแถว
  - `formatSlipConfirmReply(item, { dateAssumed = false } = {}): string`
  - `formatSavedReply(items)` เดิมไม่เปลี่ยน

- [ ] **Step 1: เขียนเทสต์ที่ล้มเหลว**

เพิ่มใน `describe('toTransactionRows', ...)` ของ `src/db/transaction-rows.test.js`:

```js
  it('uses the given source for every row and defaults to text', () => {
    const base = { items: [item()], categoryIds: CATEGORY_IDS, userId: 'user-1', webhookEventId: 'ev1' };

    expect(toTransactionRows({ ...base, source: 'slip' })[0].source).toBe('slip');
    expect(toTransactionRows(base)[0].source).toBe('text');
  });
```

ใน `src/parser/format-reply.test.js` แก้ import บรรทัดแรกให้รวม `formatSlipConfirmReply` (เช่น `import { formatSavedReply, formatSlipConfirmReply } from './format-reply.js';` ถ้าเดิมมี `formatAmount` ก็คงไว้) แล้วเพิ่มต่อท้ายไฟล์:

```js
describe('formatSlipConfirmReply', () => {
  const ITEM = { type: 'expense', category: 'อาหาร', amount: 120, date: '2026-09-28', note: 'โอนให้ ร้านข้าวแกง' };

  it('shows the item and asks the user to confirm', () => {
    expect(formatSlipConfirmReply(ITEM)).toBe(
      'อ่านสลิปได้ดังนี้\n- รายจ่าย | อาหาร | 120 บาท | 28/09 | โอนให้ ร้านข้าวแกง\nกดบันทึกเพื่อยืนยัน (หมดเวลาใน 10 นาที)'
    );
  });

  it('tells the user when the date was not readable and today is used', () => {
    expect(formatSlipConfirmReply(ITEM, { dateAssumed: true })).toBe(
      'อ่านสลิปได้ดังนี้\n- รายจ่าย | อาหาร | 120 บาท | 28/09 | โอนให้ ร้านข้าวแกง\nอ่านวันที่ไม่ได้ จึงใช้วันนี้\nกดบันทึกเพื่อยืนยัน (หมดเวลาใน 10 นาที)'
    );
  });
});
```

- [ ] **Step 2: รันเทสต์ให้เห็นว่าล้มเหลว**

Run: `npx vitest run src/db/transaction-rows.test.js src/parser/format-reply.test.js`
Expected: FAIL เทสต์ใหม่ (`source` เป็น `'text'` เสมอ, `formatSlipConfirmReply is not a function`)

- [ ] **Step 3: เขียนโค้ด**

`src/db/transaction-rows.js`: เปลี่ยนลายเซ็นและแถว

```js
function toTransactionRows({ items, categoryIds, userId, webhookEventId, source = 'text' }) {
  return items.map((item) => ({
    user_id: userId,
    type: item.type,
    category_id: findCategoryId(categoryIds, item),
    amount: item.amount,
    note: item.note,
    occurred_on: item.date,
    source,
    line_event_id: webhookEventId,
  }));
}
```

`src/parser/format-reply.js`: เพิ่มก่อน `module.exports` และ export

```js
function formatSlipConfirmReply(item, { dateAssumed = false } = {}) {
  const lines = ['อ่านสลิปได้ดังนี้', formatItem(item)];
  if (dateAssumed) {
    lines.push('อ่านวันที่ไม่ได้ จึงใช้วันนี้');
  }
  lines.push('กดบันทึกเพื่อยืนยัน (หมดเวลาใน 10 นาที)');
  return lines.join('\n');
}

module.exports = { formatSavedReply, formatSlipConfirmReply, formatAmount };
```

- [ ] **Step 4: รันเทสต์ให้ผ่าน**

Run: `npx vitest run src/db/transaction-rows.test.js src/parser/format-reply.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/db/transaction-rows.js src/db/transaction-rows.test.js src/parser/format-reply.js src/parser/format-reply.test.js
git commit -m "feat: let transaction rows carry a source and format the slip confirmation"
```

---

### Task 3: โหลดรูปจาก LINE

**Depends on:** none

**Files:**
- Create: `src/slip/download-image.js`
- Test: `src/slip/download-image.test.js`

**Interfaces:**
- Produces (Task 5, 7 ใช้):
  - `createImageDownloader({ blobClient }): (messageId: string) => Promise<{ status: 'ok', mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp', data: string /* base64 */ } | { status: 'too_large' } | { status: 'unsupported' }>`
  - `MAX_IMAGE_BYTES` (5 * 1024 * 1024)
  - `blobClient.getMessageContent(messageId)` คือ method ของ `messagingApi.MessagingApiBlobClient` คืน `Readable`

- [ ] **Step 1: เขียนเทสต์ที่ล้มเหลว**

สร้าง `src/slip/download-image.test.js`:

```js
import { describe, it, expect, vi } from 'vitest';
import { Readable } from 'node:stream';
import { createImageDownloader, MAX_IMAGE_BYTES } from './download-image.js';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const GIF = Buffer.from('GIF89a-rest', 'latin1');
const WEBP = Buffer.concat([Buffer.from('RIFF', 'latin1'), Buffer.from([1, 2, 3, 4]), Buffer.from('WEBPVP8 ', 'latin1')]);

function setup(chunks) {
  const blobClient = { getMessageContent: vi.fn().mockResolvedValue(Readable.from(chunks)) };
  return { blobClient, downloadImage: createImageDownloader({ blobClient }) };
}

describe('createImageDownloader', () => {
  it('downloads the message content and returns it as base64 with the detected type', async () => {
    const { blobClient, downloadImage } = setup([JPEG.subarray(0, 3), JPEG.subarray(3)]);

    const result = await downloadImage('m1');

    expect(blobClient.getMessageContent).toHaveBeenCalledWith('m1');
    expect(result).toEqual({ status: 'ok', mediaType: 'image/jpeg', data: JPEG.toString('base64') });
  });

  it('detects png, gif and webp from the first bytes', async () => {
    const types = [];
    for (const bytes of [PNG, GIF, WEBP]) {
      types.push((await setup([bytes]).downloadImage('m1')).mediaType);
    }

    expect(types).toEqual(['image/png', 'image/gif', 'image/webp']);
  });

  it('rejects a file that is not a supported image whatever its name says', async () => {
    const { downloadImage } = setup([Buffer.from('%PDF-1.4 not an image')]);

    expect(await downloadImage('m1')).toEqual({ status: 'unsupported' });
  });

  it('stops with too_large once the content passes the limit', async () => {
    const big = Buffer.concat([JPEG, Buffer.alloc(MAX_IMAGE_BYTES)]);
    const { downloadImage } = setup([big.subarray(0, 1000), big.subarray(1000)]);

    expect(await downloadImage('m1')).toEqual({ status: 'too_large' });
  });

  it('accepts content of exactly the limit', async () => {
    const exact = Buffer.concat([JPEG, Buffer.alloc(MAX_IMAGE_BYTES - JPEG.length)]);
    const { downloadImage } = setup([exact]);

    expect((await downloadImage('m1')).status).toBe('ok');
  });

  it('lets a download error propagate so the bot can log and apologise', async () => {
    const blobClient = { getMessageContent: vi.fn().mockRejectedValue(new Error('LINE down')) };

    await expect(createImageDownloader({ blobClient })('m1')).rejects.toThrow('LINE down');
  });
});
```

- [ ] **Step 2: รันเทสต์ให้เห็นว่าล้มเหลว**

Run: `npx vitest run src/slip/download-image.test.js`
Expected: FAIL `Failed to resolve import "./download-image.js"`

- [ ] **Step 3: เขียนโค้ด**

สร้าง `src/slip/download-image.js`:

```js
// เพดานรูปของ Claude API ต่อรูป
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// ตรวจจาก magic bytes เพราะ Claude ปฏิเสธรูปที่ media type ไม่ตรงเนื้อไฟล์
function detectMediaType(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return 'image/png';
  }
  if (buffer.length >= 6 && ['GIF87a', 'GIF89a'].includes(buffer.subarray(0, 6).toString('latin1'))) {
    return 'image/gif';
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('latin1') === 'RIFF' &&
    buffer.subarray(8, 12).toString('latin1') === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

function createImageDownloader({ blobClient }) {
  return async function downloadImage(messageId) {
    const stream = await blobClient.getMessageContent(messageId);
    const chunks = [];
    let size = 0;
    for await (const chunk of stream) {
      size += chunk.length;
      // หยุดอ่านทันทีที่เกินเพดาน ไม่เก็บรูปใหญ่ทั้งใบไว้ใน memory
      if (size > MAX_IMAGE_BYTES) {
        return { status: 'too_large' };
      }
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);
    const mediaType = detectMediaType(buffer);
    if (!mediaType) {
      return { status: 'unsupported' };
    }
    return { status: 'ok', mediaType, data: buffer.toString('base64') };
  };
}

module.exports = { createImageDownloader, MAX_IMAGE_BYTES };
```

- [ ] **Step 4: รันเทสต์ให้ผ่าน**

Run: `npx vitest run src/slip/download-image.test.js`
Expected: PASS 6 เทสต์

- [ ] **Step 5: Commit**

```bash
git add src/slip/download-image.js src/slip/download-image.test.js
git commit -m "feat: download slip images from LINE with a size and type check"
```

---

### Task 4: Claude vision อ่านสลิป

**Depends on:** none

**Files:**
- Create: `src/slip/parse-slip.js`
- Modify: `src/parser/parse-message.js` (เพิ่ม `toParseResult` ใน `module.exports` เท่านั้น)
- Test: `src/slip/parse-slip.test.js`

**Interfaces:**
- Consumes: `toParseResult(data, today)`, `ParseError`, `MAX_AMOUNT` จาก `src/parser/parse-message.js`; `DEFAULT_CATEGORIES` จาก `src/parser/categories.js`; `toBangkokDateString`, `isValidCalendarDate` จาก `src/utils/date.js`
- Produces (Task 5, 7 ใช้):
  - `createSlipParser({ client, model, now = () => new Date() }): (image: { data: string, mediaType: string }) => Promise<{ status: 'ok', item: { type, category, amount, date, note }, dateAssumed: boolean } | { status: 'unreadable' }>`
  - โยน `ParseError` เมื่อ Claude ตอบผิดรูป/ถูกตัด/ปฏิเสธ (บอทจับเป็น system error)
  - `SLIP_SCHEMA`

- [ ] **Step 1: เขียนเทสต์ที่ล้มเหลว**

สร้าง `src/slip/parse-slip.test.js`:

```js
import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';
import { createSlipParser, SLIP_SCHEMA } from './parse-slip.js';

// ต้องใช้ instance เดียวกับที่ parse-slip require ไม่งั้น instanceof ParseError ไม่ตรงกัน
const { ParseError, MAX_AMOUNT } = createRequire(import.meta.url)('../parser/parse-message.js');

const IMAGE = { data: 'QUJD', mediaType: 'image/jpeg' };
const NOW = new Date('2026-09-29T05:00:00Z');

function slipJson(overrides = {}) {
  return {
    is_slip: true,
    type: 'expense',
    category: 'อาหาร',
    amount: 120,
    date: '2026-09-28',
    note: 'โอนให้ ร้านข้าวแกง',
    ...overrides,
  };
}

function setup(data, responseOverrides = {}) {
  const create = vi.fn().mockResolvedValue({
    stop_reason: 'end_turn',
    content: [{ type: 'text', text: typeof data === 'string' ? data : JSON.stringify(data) }],
    ...responseOverrides,
  });
  const parseSlip = createSlipParser({ client: { messages: { create } }, model: 'test-model', now: () => NOW });
  return { create, parseSlip };
}

describe('createSlipParser', () => {
  it('returns the normalized item read from the slip', async () => {
    const { parseSlip } = setup(slipJson());

    expect(await parseSlip(IMAGE)).toEqual({
      status: 'ok',
      item: { type: 'expense', category: 'อาหาร', amount: 120, date: '2026-09-28', note: 'โอนให้ ร้านข้าวแกง' },
      dateAssumed: false,
    });
  });

  it('sends the image as a base64 block with the model, schema and today in the prompt', async () => {
    const { create, parseSlip } = setup(slipJson());

    await parseSlip(IMAGE);

    const [request, options] = create.mock.calls[0];
    expect(request.model).toBe('test-model');
    expect(request.system).toContain('2026-09-29');
    expect(request.messages).toEqual([
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'QUJD' } },
          { type: 'text', text: 'อ่านสลิปนี้' },
        ],
      },
    ]);
    expect(request.output_config).toEqual({ format: { type: 'json_schema', schema: SLIP_SCHEMA } });
    expect(options).toEqual(expect.objectContaining({ timeout: 20000, maxRetries: 1, signal: expect.anything() }));
  });

  it('tells Claude to convert Buddhist era years and to leave the date empty when not visible', async () => {
    const { create, parseSlip } = setup(slipJson());

    await parseSlip(IMAGE);

    expect(create.mock.calls[0][0].system).toContain('543');
    expect(create.mock.calls[0][0].system).toContain('empty string');
  });

  it('uses today and says so when the date is empty or not a real date', async () => {
    for (const date of ['', '2026-02-31', 'เมื่อวาน']) {
      const result = await setup(slipJson({ date })).parseSlip(IMAGE);

      expect(result).toMatchObject({ status: 'ok', item: { date: '2026-09-29' }, dateAssumed: true });
    }
  });

  it('subtracts 543 when Claude leaves a Buddhist era year in the date', async () => {
    const result = await setup(slipJson({ date: '2569-09-28' })).parseSlip(IMAGE);

    expect(result).toMatchObject({ status: 'ok', item: { date: '2026-09-28' }, dateAssumed: false });
  });

  it('leaves a year up to next year alone and falls back to today when the fixed date is not real', async () => {
    const nextYear = await setup(slipJson({ date: '2027-01-05' })).parseSlip(IMAGE);
    const badBuddhist = await setup(slipJson({ date: '2569-02-31' })).parseSlip(IMAGE);

    expect(nextYear).toMatchObject({ item: { date: '2027-01-05' }, dateAssumed: false });
    expect(badBuddhist).toMatchObject({ item: { date: '2026-09-29' }, dateAssumed: true });
  });

  it('is unreadable when the image is not a slip', async () => {
    const { parseSlip } = setup(slipJson({ is_slip: false, amount: 0 }));

    expect(await parseSlip(IMAGE)).toEqual({ status: 'unreadable' });
  });

  it('is unreadable when the amount is missing, not positive, rounds to zero or is too large', async () => {
    for (const amount of [0, -5, 0.004, MAX_AMOUNT + 1, null]) {
      expect(await setup(slipJson({ amount })).parseSlip(IMAGE)).toEqual({ status: 'unreadable' });
    }
  });

  it('falls back to the other category when Claude returns one that does not match the type', async () => {
    const result = await setup(slipJson({ type: 'income', category: 'อาหาร' })).parseSlip(IMAGE);

    expect(result.item).toMatchObject({ type: 'income', category: 'อื่นๆ' });
  });

  it('keeps the note short', async () => {
    const result = await setup(slipJson({ note: 'ก'.repeat(300) })).parseSlip(IMAGE);

    expect(result.item.note).toHaveLength(100);
  });

  it('throws ParseError when the response is cut off or refused', async () => {
    for (const stop_reason of ['max_tokens', 'refusal']) {
      await expect(setup(slipJson(), { stop_reason }).parseSlip(IMAGE)).rejects.toBeInstanceOf(ParseError);
    }
  });

  it('throws ParseError for a response with no text, bad JSON or the wrong shape', async () => {
    await expect(setup(slipJson(), { content: [] }).parseSlip(IMAGE)).rejects.toBeInstanceOf(ParseError);
    await expect(setup('not json').parseSlip(IMAGE)).rejects.toBeInstanceOf(ParseError);
    await expect(setup({ is_slip: 'yes' }).parseSlip(IMAGE)).rejects.toBeInstanceOf(ParseError);
    await expect(setup(slipJson({ type: 'transfer' })).parseSlip(IMAGE)).rejects.toBeInstanceOf(ParseError);
  });
});
```

- [ ] **Step 2: รันเทสต์ให้เห็นว่าล้มเหลว**

Run: `npx vitest run src/slip/parse-slip.test.js`
Expected: FAIL `Failed to resolve import "./parse-slip.js"`

- [ ] **Step 3: export `toParseResult`**

ใน `src/parser/parse-message.js` เปลี่ยน `module.exports` ท้ายไฟล์ให้มี `toParseResult`:

```js
module.exports = {
  createMessageParser,
  ParseError,
  PARSE_SCHEMA,
  DEFAULT_CLARIFY_QUESTION,
  AMOUNT_TOO_LARGE_QUESTION,
  MAX_AMOUNT,
  toParseResult,
};
```

- [ ] **Step 4: เขียน parser**

สร้าง `src/slip/parse-slip.js`:

```js
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

// Claude อาจตอบปี พ.ศ. หลุดมา ปีที่เกินปีหน้าไปมากถือเป็น พ.ศ. จึงลบ 543
function fixBuddhistYear(date, today) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match || Number(match[1]) <= Number(today.slice(0, 4)) + 1) {
    return date;
  }
  return `${Number(match[1]) - 543}-${match[2]}-${match[3]}`;
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
    const note = typeof data.note === 'string' ? data.note.slice(0, MAX_NOTE_LENGTH) : '';
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
```

- [ ] **Step 5: รันเทสต์ให้ผ่าน**

Run: `npx vitest run src/slip/parse-slip.test.js src/parser/parse-message.test.js`
Expected: PASS ทั้งสองไฟล์ (parse-message เดิมต้องไม่พัง)

- [ ] **Step 6: Commit**

```bash
git add src/slip/parse-slip.js src/slip/parse-slip.test.js src/parser/parse-message.js
git commit -m "feat: read a slip with Claude vision into one transaction item"
```

---

### Task 5: บอทรับรูปแล้วตอบสรุป + ปุ่ม

**Depends on:** Task 1, Task 2, Task 3, Task 4

**Files:**
- Modify: `src/bot.js`
- Test: `src/bot.test.js`

**Interfaces:**
- Consumes: `repository.savePendingSlip`, `repository.deleteExpiredPendingSlips` (Task 1); `formatSlipConfirmReply` (Task 2); `downloadImage(messageId)` (Task 3); `parseSlip({ data, mediaType })` (Task 4)
- Produces (Task 6, 7 ใช้):
  - `createBot` รับ deps เพิ่ม `downloadImage`, `parseSlip`
  - ค่าคงที่ใน `src/bot.js` และ export: `SLIP_UNREADABLE_REPLY`, `SLIP_TOO_LARGE_REPLY`, `SLIP_UNSUPPORTED_REPLY`, `SLIP_EXPIRED_REPLY`, `SLIP_CANCELLED_REPLY` (ข้อความตามตารางด้านบน)
  - ภายใน: `SLIP_SAVE_ACTION = 'slip_save'`, `SLIP_CANCEL_ACTION = 'slip_cancel'`, `SLIP_TTL_MS = 10 * 60 * 1000`, `buildSlipQuickReply(slipId)` คืน postback 2 ปุ่ม `data = action=slip_save&slip=<id>` (label/displayText `บันทึก`) และ `action=slip_cancel&slip=<id>` (label/displayText `ยกเลิก`)

- [ ] **Step 1: เขียนเทสต์ที่ล้มเหลว**

ใน `src/bot.test.js`:

1. แก้ import จาก `./bot.js` เพิ่ม `SLIP_UNREADABLE_REPLY, SLIP_TOO_LARGE_REPLY, SLIP_UNSUPPORTED_REPLY,` (Task 6 จะเพิ่มอีก 2 ตัว)
2. เพิ่มใต้ `FOOD_ITEM`:

```js
const SLIP_ID = '7b1c9d5e-3f2a-4c8b-9a6d-1e2f3a4b5c6d';
const SLIP_ITEM = { type: 'expense', category: 'อาหาร', amount: 120, date: '2026-09-28', note: 'โอนให้ ร้านข้าวแกง' };

const SLIP_QUICK_REPLY = [
  {
    type: 'action',
    action: { type: 'postback', label: 'บันทึก', data: `action=slip_save&slip=${SLIP_ID}`, displayText: 'บันทึก' },
  },
  {
    type: 'action',
    action: { type: 'postback', label: 'ยกเลิก', data: `action=slip_cancel&slip=${SLIP_ID}`, displayText: 'ยกเลิก' },
  },
];
```

3. เพิ่มใต้ `followEvent()`:

```js
function imageEvent({ eventId = 'ev-img', replyToken = 'r-img', messageId = 'm1', source = { type: 'user', userId: 'U1' } } = {}) {
  return { type: 'message', webhookEventId: eventId, replyToken, source, message: { type: 'image', id: messageId } };
}
```

4. ใน `setup()` เพิ่มใน `deps` (ก่อน `repository`): 

```js
    downloadImage: vi.fn().mockResolvedValue({ status: 'ok', mediaType: 'image/jpeg', data: 'QUJD' }),
    parseSlip: vi.fn().mockResolvedValue({ status: 'ok', item: SLIP_ITEM, dateAssumed: false }),
```

และเพิ่มใน `repository` (ต่อจาก `getBudgetStatus`):

```js
      savePendingSlip: vi.fn().mockResolvedValue(SLIP_ID),
      deleteExpiredPendingSlips: vi.fn().mockResolvedValue(),
      claimPendingSlip: vi.fn().mockResolvedValue({ webhookEventId: 'ev-img', item: SLIP_ITEM }),
```

5. เพิ่ม describe ใหม่ท้ายไฟล์:

```js
describe('bot slip image', () => {
  const SLIP_CONFIRM_TEXT =
    'อ่านสลิปได้ดังนี้\n- รายจ่าย | อาหาร | 120 บาท | 28/09 | โอนให้ ร้านข้าวแกง\nกดบันทึกเพื่อยืนยัน (หมดเวลาใน 10 นาที)';

  it('reads the slip, keeps the item pending and asks for confirmation without saving', async () => {
    const { deps, bot } = setup();

    await bot.handleEvent(imageEvent());

    expect(deps.users.ensureUser).toHaveBeenCalledWith('U1');
    expect(deps.repository.claimEvent).toHaveBeenCalledWith('ev-img', 'user-1');
    expect(deps.downloadImage).toHaveBeenCalledWith('m1');
    expect(deps.parseSlip).toHaveBeenCalledWith({ data: 'QUJD', mediaType: 'image/jpeg' });
    expect(deps.repository.savePendingSlip).toHaveBeenCalledWith('user-1', 'ev-img', SLIP_ITEM);
    expect(deps.repository.insertTransactions).not.toHaveBeenCalled();
    expect(deps.replyText).toHaveBeenCalledWith('r-img', SLIP_CONFIRM_TEXT, SLIP_QUICK_REPLY);
  });

  it('says so when the date was not readable', async () => {
    const parseSlip = vi.fn().mockResolvedValue({ status: 'ok', item: SLIP_ITEM, dateAssumed: true });
    const { deps, bot } = setup({ parseSlip });

    await bot.handleEvent(imageEvent());

    expect(deps.replyText.mock.calls[0][1]).toContain('อ่านวันที่ไม่ได้ จึงใช้วันนี้');
  });

  it('clears this user expired pending slips before keeping a new one', async () => {
    const { deps, bot } = setup();

    await bot.handleEvent(imageEvent());

    expect(deps.repository.deleteExpiredPendingSlips).toHaveBeenCalledWith(
      'user-1',
      new Date(NOW_MS - 10 * 60 * 1000).toISOString()
    );
  });

  it('still asks for confirmation when clearing expired slips fails', async () => {
    const { deps, bot } = setup();
    const error = new Error('boom');
    deps.repository.deleteExpiredPendingSlips.mockRejectedValue(error);

    await bot.handleEvent(imageEvent());

    expect(deps.logger.error).toHaveBeenCalledWith('Failed to delete expired pending slips', { userId: 'user-1' }, error);
    expect(deps.replyText).toHaveBeenCalledWith('r-img', SLIP_CONFIRM_TEXT, SLIP_QUICK_REPLY);
  });

  it('asks the user to resend when the amount cannot be read', async () => {
    const parseSlip = vi.fn().mockResolvedValue({ status: 'unreadable' });
    const { deps, bot } = setup({ parseSlip });

    await bot.handleEvent(imageEvent());

    expect(deps.repository.savePendingSlip).not.toHaveBeenCalled();
    expect(deps.replyText).toHaveBeenCalledWith('r-img', SLIP_UNREADABLE_REPLY, undefined);
  });

  it('explains when the image is too large or not a supported image, without calling Claude', async () => {
    for (const [status, reply] of [
      ['too_large', SLIP_TOO_LARGE_REPLY],
      ['unsupported', SLIP_UNSUPPORTED_REPLY],
    ]) {
      const downloadImage = vi.fn().mockResolvedValue({ status });
      const { deps, bot } = setup({ downloadImage });

      await bot.handleEvent(imageEvent());

      expect(deps.parseSlip).not.toHaveBeenCalled();
      expect(deps.replyText).toHaveBeenCalledWith('r-img', reply, undefined);
    }
  });

  it('does nothing for a redelivered image event', async () => {
    const { deps, bot } = setup();
    deps.repository.claimEvent.mockResolvedValue(false);

    await bot.handleEvent(imageEvent());

    expect(deps.downloadImage).not.toHaveBeenCalled();
    expect(deps.replyText).not.toHaveBeenCalled();
  });

  it('counts the image against the rate limit and stops before downloading', async () => {
    const { deps, bot } = setup({ allowRequest: vi.fn().mockReturnValue(false) });

    await bot.handleEvent(imageEvent());

    expect(deps.allowRequest).toHaveBeenCalledWith('U1');
    expect(deps.downloadImage).not.toHaveBeenCalled();
    expect(deps.replyText).toHaveBeenCalledWith('r-img', RATE_LIMITED_REPLY, undefined);
  });

  it('answers with the system error and logs when the download or Claude fails', async () => {
    const error = new Error('LINE down');
    const { deps, bot } = setup({ downloadImage: vi.fn().mockRejectedValue(error) });

    await bot.handleEvent(imageEvent());

    expect(deps.logger.error).toHaveBeenCalledWith(
      'Failed to process event',
      { lineUserId: 'U1', eventType: 'message' },
      error
    );
    expect(deps.replyText).toHaveBeenCalledWith('r-img', SYSTEM_ERROR_REPLY, undefined);
  });

  it('ignores an image sent in a group', async () => {
    const { deps, bot } = setup();

    await bot.handleEvent(imageEvent({ source: { type: 'group', groupId: 'G1', userId: 'U1' } }));

    expect(deps.downloadImage).not.toHaveBeenCalled();
    expect(deps.replyText).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: รันเทสต์ให้เห็นว่าล้มเหลว**

Run: `npx vitest run src/bot.test.js`
Expected: FAIL เทสต์ใน `bot slip image` (รูปถูกมองข้ามจึงไม่มี reply) เทสต์เดิมยังผ่าน

- [ ] **Step 3: เขียนโค้ดใน `src/bot.js`**

1. เพิ่ม import: `const { formatSavedReply, formatSlipConfirmReply } = require('./parser/format-reply');` (แทนบรรทัดเดิมที่ import แค่ `formatSavedReply`)
2. เพิ่มค่าคงที่ใต้ `NO_ENTRIES_COMMENT`:

```js
const SLIP_UNREADABLE_REPLY = 'อ่านยอดจากรูปนี้ไม่ได้ ลองส่งรูปสลิปที่ชัดขึ้น หรือพิมพ์เองก็ได้ เช่น "กินข้าว 60"';
const SLIP_TOO_LARGE_REPLY = 'รูปใหญ่เกินไป (ไม่เกิน 5 MB) ลองส่งใหม่หรือย่อรูปก่อน';
const SLIP_UNSUPPORTED_REPLY = 'ไฟล์นี้ไม่ใช่รูปที่อ่านได้ (รองรับ JPEG, PNG, GIF, WebP)';
const SLIP_EXPIRED_REPLY = 'รายการนี้ถูกบันทึกหรือยกเลิกไปแล้ว หรือหมดเวลายืนยัน (10 นาที) ส่งสลิปใหม่ได้เลย';
const SLIP_CANCELLED_REPLY = 'ยกเลิกสลิปแล้ว ไม่ได้บันทึกรายการ';
const SLIP_SAVE_ACTION = 'slip_save';
const SLIP_CANCEL_ACTION = 'slip_cancel';
// เกินเวลานี้ปุ่มบันทึกของสลิปใช้ไม่ได้ กันกดสลิปเก่าค้างแชตโดยไม่ตั้งใจ
const SLIP_TTL_MS = 10 * 60 * 1000;
```

3. เพิ่ม helper ใต้ `isTextMessage`:

```js
function isImageMessage(event) {
  return event.type === 'message' && event.message && event.message.type === 'image';
}
```

4. เพิ่มใต้ `buildUndoQuickReply`:

```js
function buildSlipQuickReply(slipId) {
  const button = (label, action) => ({
    type: 'action',
    action: {
      type: 'postback',
      label,
      data: new URLSearchParams({ action, slip: slipId }).toString(),
      displayText: label,
    },
  });
  return [button('บันทึก', SLIP_SAVE_ACTION), button('ยกเลิก', SLIP_CANCEL_ACTION)];
}
```

5. เพิ่มพารามิเตอร์ `downloadImage, parseSlip,` ใน destructuring ของ `createBot` (ต่อจาก `commentSummary,`)
6. เพิ่ม function ใน `createBot` ต่อจาก `handleText`:

```js
  // ล้างของหมดอายุเป็นแค่การดูแลตาราง ถ้าพังยังอ่านสลิปต่อได้
  async function clearExpiredSlips(userId) {
    try {
      await repository.deleteExpiredPendingSlips(userId, new Date(now() - SLIP_TTL_MS).toISOString());
    } catch (err) {
      logger.error('Failed to delete expired pending slips', { userId }, err);
    }
  }

  async function handleImage(event, lineUserId) {
    const userId = await users.ensureUser(lineUserId);
    // LINE ส่ง event เดิมซ้ำได้ จึงจอง event ก่อนเรียก Claude เพื่อไม่ให้ตอบและเสียค่าอ่านซ้ำ
    const claimed = await repository.claimEvent(event.webhookEventId, userId);
    if (!claimed) {
      return null;
    }
    if (!allowRequest(lineUserId)) {
      return { text: RATE_LIMITED_REPLY };
    }
    const image = await downloadImage(event.message.id);
    if (image.status === 'too_large') {
      return { text: SLIP_TOO_LARGE_REPLY };
    }
    if (image.status === 'unsupported') {
      return { text: SLIP_UNSUPPORTED_REPLY };
    }
    const slip = await parseSlip({ data: image.data, mediaType: image.mediaType });
    if (slip.status !== 'ok') {
      return { text: SLIP_UNREADABLE_REPLY };
    }
    await clearExpiredSlips(userId);
    const slipId = await repository.savePendingSlip(userId, event.webhookEventId, slip.item);
    return {
      text: formatSlipConfirmReply(slip.item, { dateAssumed: slip.dateAssumed }),
      quickReply: buildSlipQuickReply(slipId),
    };
  }
```

7. ใน `buildReply` เพิ่มต่อจากเงื่อนไข `isTextMessage`:

```js
    if (isImageMessage(event)) {
      return handleImage(event, lineUserId);
    }
```

8. เพิ่มค่าคงที่ใหม่ใน `module.exports`: `SLIP_UNREADABLE_REPLY, SLIP_TOO_LARGE_REPLY, SLIP_UNSUPPORTED_REPLY, SLIP_EXPIRED_REPLY, SLIP_CANCELLED_REPLY,`

- [ ] **Step 4: รันเทสต์ให้ผ่าน**

Run: `npx vitest run src/bot.test.js`
Expected: PASS ทั้งไฟล์ (เทสต์เดิมต้องไม่พัง)

- [ ] **Step 5: Commit**

```bash
git add src/bot.js src/bot.test.js
git commit -m "feat: reply to a slip image with a summary and confirm buttons"
```

---

### Task 6: ปุ่มบันทึก/ยกเลิกสลิป

**Depends on:** Task 5

**Files:**
- Modify: `src/bot.js`
- Test: `src/bot.test.js`

**Interfaces:**
- Consumes: `repository.claimPendingSlip(userId, slipId, sinceIso)` (Task 1); `toTransactionRows({..., source})` (Task 2); `SLIP_*` ค่าคงที่, `SLIP_SAVE_ACTION`, `SLIP_CANCEL_ACTION`, `SLIP_TTL_MS` (Task 5)
- Produces: postback `slip_save` บันทึกรายการ `source = 'slip'` ตอบ `formatSavedReply` + คำเตือนงบ + ปุ่มยกเลิก (undo) ของ `slip.webhookEventId`; postback `slip_cancel` ทิ้งแถว ตอบ `SLIP_CANCELLED_REPLY`; แถวหาย/หมดเวลา/ไม่ใช่ของผู้กด ตอบ `SLIP_EXPIRED_REPLY`; id ที่ไม่ใช่ UUID ไม่ตอบ (null)

- [ ] **Step 1: เขียนเทสต์ที่ล้มเหลว**

ใน `src/bot.test.js` แก้ import จาก `./bot.js` เพิ่ม `SLIP_EXPIRED_REPLY, SLIP_CANCELLED_REPLY,` แล้วเพิ่ม describe ท้ายไฟล์:

```js
describe('bot slip confirmation', () => {
  const SINCE = new Date(NOW_MS - 10 * 60 * 1000).toISOString();
  const SAVE = `action=slip_save&slip=${SLIP_ID}`;
  const CANCEL = `action=slip_cancel&slip=${SLIP_ID}`;

  it('claims the pending slip, saves it as a slip transaction and offers undo', async () => {
    const { deps, bot } = setup();

    await bot.handleEvent(postbackEvent(SAVE));

    expect(deps.repository.claimPendingSlip).toHaveBeenCalledWith('user-1', SLIP_ID, SINCE);
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
    ]);
    expect(deps.replyText).toHaveBeenCalledWith(
      'r2',
      'บันทึกแล้ว\n- รายจ่าย | อาหาร | 120 บาท | 28/09 | โอนให้ ร้านข้าวแกง',
      [
        {
          type: 'action',
          action: { type: 'postback', label: 'ยกเลิก', data: 'action=undo&event=ev-img', displayText: 'ยกเลิก' },
        },
      ]
    );
  });

  it('appends the budget alert after saving a slip', async () => {
    const { deps, bot } = setup();
    deps.repository.getBudgetStatus.mockResolvedValue([
      { categoryId: 'cat-food', category: 'อาหาร', budget: 150, spent: 135 },
    ]);

    await bot.handleEvent(postbackEvent(SAVE));

    expect(deps.repository.getBudgetStatus).toHaveBeenCalledWith('user-1', '2026-09');
    expect(deps.replyText.mock.calls[0][1]).toBe(
      'บันทึกแล้ว\n- รายจ่าย | อาหาร | 120 บาท | 28/09 | โอนให้ ร้านข้าวแกง\n\nใกล้เต็มงบ อาหาร เดือน 09/2026: ใช้ไป 135 จาก 150 บาท (90%)'
    );
  });

  it('does not save twice: a second tap finds nothing to claim', async () => {
    const { deps, bot } = setup();
    deps.repository.claimPendingSlip.mockResolvedValue(null);

    await bot.handleEvent(postbackEvent(SAVE));

    expect(deps.repository.insertTransactions).not.toHaveBeenCalled();
    expect(deps.replyText).toHaveBeenCalledWith('r2', SLIP_EXPIRED_REPLY, undefined);
  });

  it('ignores a slip id that is not a UUID without touching the database', async () => {
    const { deps, bot } = setup();

    await bot.handleEvent(postbackEvent('action=slip_save&slip=not-a-uuid'));
    await bot.handleEvent(postbackEvent('action=slip_save'));

    expect(deps.repository.claimPendingSlip).not.toHaveBeenCalled();
    expect(deps.replyText).not.toHaveBeenCalled();
  });

  it('answers the system error when saving fails after the claim', async () => {
    const { deps, bot } = setup();
    const error = new Error('insert failed');
    deps.repository.insertTransactions.mockRejectedValue(error);

    await bot.handleEvent(postbackEvent(SAVE));

    expect(deps.logger.error).toHaveBeenCalledWith(
      'Failed to process event',
      { lineUserId: 'U1', eventType: 'postback' },
      error
    );
    expect(deps.replyText).toHaveBeenCalledWith('r2', SYSTEM_ERROR_REPLY, undefined);
  });

  it('cancels by discarding the pending slip without saving', async () => {
    const { deps, bot } = setup();

    await bot.handleEvent(postbackEvent(CANCEL));

    expect(deps.repository.claimPendingSlip).toHaveBeenCalledWith('user-1', SLIP_ID, SINCE);
    expect(deps.repository.insertTransactions).not.toHaveBeenCalled();
    expect(deps.replyText).toHaveBeenCalledWith('r2', SLIP_CANCELLED_REPLY, undefined);
  });

  it('tells the user when the slip to cancel is already gone', async () => {
    const { deps, bot } = setup();
    deps.repository.claimPendingSlip.mockResolvedValue(null);

    await bot.handleEvent(postbackEvent(CANCEL));

    expect(deps.replyText).toHaveBeenCalledWith('r2', SLIP_EXPIRED_REPLY, undefined);
  });

  it('keeps the undo postback working', async () => {
    const { deps, bot } = setup();

    await bot.handleEvent(postbackEvent('action=undo&event=ev-img'));

    expect(deps.repository.deleteTransactionsByEvent).toHaveBeenCalledWith('user-1', 'ev-img');
    expect(deps.replyText).toHaveBeenCalledWith('r2', UNDO_DONE_REPLY, undefined);
  });
});
```

- [ ] **Step 2: รันเทสต์ให้เห็นว่าล้มเหลว**

Run: `npx vitest run src/bot.test.js`
Expected: FAIL เทสต์ใน `bot slip confirmation` (ปุ่ม slip ถูกมองข้ามเพราะ `handleUndo` คืน null) เทสต์เดิมยังผ่าน

- [ ] **Step 3: เขียนโค้ดใน `src/bot.js`**

1. เพิ่มค่าคงที่ใต้ `SLIP_TTL_MS`:

```js
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
```

2. เปลี่ยน `handleUndo` ให้รับ `params` (ตัด parse ออกไปไว้ที่ตัวแยกทาง) และเพิ่ม handler ใหม่ แทนที่ function `handleUndo` เดิมทั้งก้อน:

```js
  async function handleUndo(params, lineUserId) {
    const webhookEventId = params.get('event');
    if (!webhookEventId) {
      return null;
    }
    const userId = await users.ensureUser(lineUserId);
    const deleted = await repository.deleteTransactionsByEvent(userId, webhookEventId);
    return { text: deleted > 0 ? UNDO_DONE_REPLY : UNDO_NOT_FOUND_REPLY };
  }

  // ลบแถวพร้อมคืนค่าในคำสั่งเดียว ใครกดก่อนได้แถว คนกดซ้ำได้ null
  async function claimSlip(params, userId) {
    return repository.claimPendingSlip(userId, params.get('slip'), new Date(now() - SLIP_TTL_MS).toISOString());
  }

  async function handleSlipSave(params, lineUserId) {
    const userId = await users.ensureUser(lineUserId);
    const slip = await claimSlip(params, userId);
    if (!slip) {
      return { text: SLIP_EXPIRED_REPLY };
    }
    const categoryIds = await users.loadCategoryIds(userId);
    const rows = toTransactionRows({
      items: [slip.item],
      categoryIds,
      userId,
      webhookEventId: slip.webhookEventId,
      source: 'slip',
    });
    await repository.insertTransactions(rows);
    const saved = formatSavedReply([slip.item]);
    const alerts = await checkBudgets(userId, rows);
    return {
      text: alerts ? `${saved}\n\n${alerts}` : saved,
      quickReply: buildUndoQuickReply(slip.webhookEventId),
    };
  }

  async function handleSlipCancel(params, lineUserId) {
    const userId = await users.ensureUser(lineUserId);
    const slip = await claimSlip(params, userId);
    return { text: slip ? SLIP_CANCELLED_REPLY : SLIP_EXPIRED_REPLY };
  }

  async function handlePostback(event, lineUserId) {
    const params = new URLSearchParams(event.postback.data);
    const action = params.get('action');
    if (action === UNDO_ACTION) {
      return handleUndo(params, lineUserId);
    }
    if (action === SLIP_SAVE_ACTION || action === SLIP_CANCEL_ACTION) {
      // id ที่ไม่ใช่ UUID ทำให้ Postgres error จึงไม่ส่งไปถึง DB
      if (!UUID_PATTERN.test(params.get('slip') || '')) {
        return null;
      }
      return action === SLIP_SAVE_ACTION ? handleSlipSave(params, lineUserId) : handleSlipCancel(params, lineUserId);
    }
    return null;
  }
```

3. ใน `buildReply` เปลี่ยน `return handleUndo(event, lineUserId);` เป็น `return handlePostback(event, lineUserId);`

- [ ] **Step 4: รันเทสต์ให้ผ่าน**

Run: `npx vitest run src/bot.test.js`
Expected: PASS ทั้งไฟล์ รวมเทสต์ undo เดิมที่ต้องผ่านโดยไม่แก้ (ปุ่มยกเลิกรายการที่ action ไม่ใช่ undo และไม่มี event ยังได้ null)

- [ ] **Step 5: Commit**

```bash
git add src/bot.js src/bot.test.js
git commit -m "feat: save or cancel a pending slip from its confirm buttons"
```

---

### Task 7: ต่อสายใน index.js

**Depends on:** Task 5, Task 6

**Files:**
- Modify: `index.js`

**Interfaces:**
- Consumes: `createImageDownloader` (Task 3), `createSlipParser` (Task 4), deps ใหม่ของ `createBot` (Task 5)

- [ ] **Step 1: แก้ `index.js`**

เพิ่ม require ต่อจากบรรทัด `createSummaryCommenter`:

```js
const { createImageDownloader } = require('./src/slip/download-image');
const { createSlipParser } = require('./src/slip/parse-slip');
```

เพิ่มต่อจากบล็อก `const lineClient = ...`:

```js
// รูปที่ผู้ใช้ส่งดึงผ่าน api-data.line.me ซึ่งเป็น client แยกจาก MessagingApiClient
const lineBlobClient = new messagingApi.MessagingApiBlobClient({
  channelAccessToken: config.lineChannelAccessToken,
});
```

เพิ่มต่อจากบรรทัด `const commentSummary = ...`:

```js
const downloadImage = createImageDownloader({ blobClient: lineBlobClient });
const parseSlip = createSlipParser({ client: anthropic, model: config.claudeModel });
```

และเพิ่ม `downloadImage,` กับ `parseSlip,` ใน object ที่ส่งให้ `createBot` (ต่อจาก `commentSummary,`)

- [ ] **Step 2: ตรวจ**

Run: `node --check index.js` Expected: ไม่มี output
Run: `npm test` Expected: ทุกไฟล์ผ่าน (ตัวเลขรวมใหม่ = 374 + เทสต์ใหม่ของ Task 1-6)
Run: `node -e "const {messagingApi}=require('@line/bot-sdk'); console.log(typeof messagingApi.MessagingApiBlobClient)"` Expected: `function`

- [ ] **Step 3: Commit**

```bash
git add index.js
git commit -m "feat: wire the slip downloader and parser into the bot"
```

---

### Task 8: รัน 006 และ manual check ในแอป LINE (ผู้ใช้ทำเอง)

**Depends on:** Task 7

**Files:** ไม่มี (controller อัปเดต `work-memory/STATE.md` หลังผู้ใช้ตรวจเสร็จ)

เหตุผลที่ต้อง manual: การอ่านรูปจริงด้วย Claude, การโหลดรูปจาก LINE และ postback จริงทดสอบด้วย unit test ไม่ได้ (เทสต์ใช้ fake ทั้งหมด) และสิทธิ์/RLS ของตารางใหม่ต้องดูกับ Supabase จริง

- [ ] **Step 1: รัน SQL** เปิด Supabase > SQL Editor > วางไฟล์ `supabase/006_pending_slips.sql` ทั้งไฟล์ > Run ควรเห็น `Success. No rows returned`
- [ ] **Step 2: ตรวจ RLS** รัน `select relrowsecurity from pg_class where relname = 'pending_slips';` ต้องได้ `true`
- [ ] **Step 3: ตรวจ anon เข้าไม่ได้** เรียก `GET <SUPABASE_URL>/rest/v1/pending_slips` ด้วย publishable key ต้องได้ `[]` (ไม่ใช่ข้อมูล)
- [ ] **Step 4: restart** หยุด `npm start` เดิม (Ctrl+C) แล้วรัน `npm start` ใหม่ ควรเห็น `Server listening on port 3000`
- [ ] **Step 5: ส่งสลิปจริง** ส่งรูปสลิปโอนเงิน 1 ใบในแชตบอท ควรได้ข้อความ `อ่านสลิปได้ดังนี้` พร้อมยอด วันที่ (วันที่เป็น ค.ศ. ตรงกับสลิป ไม่ใช่ปี พ.ศ.) โน้ต `โอนให้ ...` และปุ่ม `บันทึก` `ยกเลิก` และตาราง `transactions` ยังไม่มีแถวใหม่
- [ ] **Step 6: กดบันทึก** ควรได้ `บันทึกแล้ว` พร้อมปุ่ม `ยกเลิก`; Table Editor ของ `transactions` ต้องมี 1 แถวใหม่ `source = slip` และ `line_event_id` ไม่ว่าง; ตาราง `pending_slips` ว่าง
- [ ] **Step 7: กดปุ่มยกเลิกรายการ** (ปุ่ม `ยกเลิก` หลังบันทึก) ควรได้ `ยกเลิกรายการแล้ว` และแถวนั้นหายจาก `transactions`
- [ ] **Step 8: กดซ้ำ** ส่งสลิปใหม่ กดบันทึก แล้วเลื่อนขึ้นไปกดปุ่ม `บันทึก` ของข้อความสรุปเดิมอีกครั้ง ควรได้ `รายการนี้ถูกบันทึกหรือยกเลิกไปแล้ว ...` และ `transactions` มีแค่ 1 แถวของสลิปนั้น
- [ ] **Step 9: ยกเลิกสลิป** ส่งสลิปใหม่ กด `ยกเลิก` ควรได้ `ยกเลิกสลิปแล้ว ไม่ได้บันทึกรายการ` ไม่มีแถวใหม่ใน `transactions` และ `pending_slips` ว่าง
- [ ] **Step 10: ส่งรูปที่ไม่ใช่สลิป** (เช่นรูปวิว) ควรได้ `อ่านยอดจากรูปนี้ไม่ได้ ...` ไม่มีแถวใหม่
- [ ] **Step 11: เตือนงบ** (ถ้ามีงบหมวดนั้นตั้งไว้ และยอดหลังบันทึกถึง 80%) บันทึกสลิปแล้วข้อความต้องมีบรรทัด `ใกล้เต็มงบ` หรือ `เกินงบ` ต่อท้าย
- [ ] **Step 12 (เลือกทำ): หมดเวลา** ส่งสลิป รอเกิน 10 นาที แล้วกด `บันทึก` ควรได้ข้อความหมดเวลา และยังไม่มีแถวใหม่
- [ ] **Step 13: ส่งผลให้ controller** แจ้งผลแต่ละ step (ผ่าน/ไม่ผ่านพร้อมข้อความที่เห็น) เพื่อบันทึกใน STATE.md แล้วค่อย merge เข้า main

---

## Self-Review

**Spec coverage (SPEC.md ข้อ 6):** ผู้ใช้ส่งรูป = Task 5 (`handleImage`); Claude vision อ่านยอด/วันที่/ผู้รับ = Task 4 (`amount`, `date`, `note` = `โอนให้ <ผู้รับ>`); ให้ผู้ใช้ยืนยันก่อนบันทึก = Task 5 (พักใน `pending_slips` + ปุ่ม) และ Task 6 (บันทึกเมื่อกดเท่านั้น); `source = 'slip'` ใน data model = Task 2 + Task 6; โมเดลเล็ก = ใช้ `config.claudeModel` เดิม (Haiku) ทุกการตัดสินใจของผู้ใช้ (ปุ่ม, ไม่เห็นยอด/วันที่, เดาหมวด, กันกดซ้ำ) อยู่ในหัวข้อ Global Constraints และมี task รองรับ ช่องว่างเดียวที่ตั้งใจ: ตรวจสลิปซ้ำ (ผู้ใช้เลือกไม่ทำ)

**Placeholder scan:** ไม่มี TBD/TODO; ทุก step มีโค้ดหรือคำสั่งครบ

**Type consistency:** `savePendingSlip(userId, webhookEventId, item) -> id`, `claimPendingSlip(userId, slipId, sinceIso) -> { webhookEventId, item } | null`, `deleteExpiredPendingSlips(userId, beforeIso)` ตรงกันใน Task 1, 5, 6; `downloadImage -> { status, mediaType, data }` และ `parseSlip({ data, mediaType }) -> { status, item, dateAssumed }` ตรงกันใน Task 3, 4, 5; ชื่อค่าคงที่ข้อความตอบตรงกับตารางด้านบนและ export จาก `bot.js` ใน Task 5 (5 ตัว) ที่ Task 6 import ใช้; ปุ่ม `slip_save`/`slip_cancel` ตรงกันใน Task 5 (สร้าง) และ Task 6 (รับ)

**Browser check:** ไม่มี task ที่เปลี่ยนหน้าเว็บ (ขั้นนี้อยู่ในแชต LINE ทั้งหมด) จึงไม่มี Browser check; การตรวจจริงอยู่ที่ Task 8

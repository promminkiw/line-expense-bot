# Budget Redesign Phase 3: Bulk Edit and Nested Back Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** เพิ่มหน้า "แก้งบหลายหมวด" (ปรับทีละ 500 หลายหมวดแล้วบันทึกทีเดียว) พร้อมผลบันทึกที่บอกหมวดสำเร็จ/ไม่สำเร็จและลองซ้ำเฉพาะที่พลาด และทำให้ปุ่มย้อนกลับ (ทั้งปุ่มในหน้าและปุ่มของเครื่อง) จากหน้านี้กลับไปหน้า "ดูทั้งหมด" ไม่ใช่ออกไปแท็บงบ

**Architecture:** ตรรกะ draft (สร้างแถว ขยับ สรุปยอด บันทึกทีละหมวด รวมผล) อยู่ใน `budget-bulk.mjs` ซึ่งไม่รู้จัก DOM และรับฟังก์ชัน `setBudget` เข้ามา การวาดอยู่ใน `budget-bulk-panel.mjs` `app.mjs` ต่อสายและเพิ่มแนวคิด `parent` ให้ออบเจ็กต์หน้าย่อย เพื่อให้หน้าลูกย้อนกลับไปหน้าแม่ได้โดยใช้ history entry ชุดเดียว ไม่แตะ `src/` (บันทึกด้วย `PUT /api/budgets/:categoryId` เดิมทีละหมวด ตามที่ผู้ใช้เลือก)

**Tech Stack:** vanilla ES modules, `<dialog>`, vitest + jsdom

**Prerequisites:** เฟส 1 และ 2 ถูก merge แล้ว และ sprite ใน `index.html` มี `icon-check` (เฟส 1 Task 4 เพิ่ม) กับ `icon-close` (`budgets-format.mjs`, `budget-edit.mjs` มี `stepBudget`/`BUDGET_STEP`, `budgets-all-panel.mjs`, `BUDGETS_ALL_PAGE` ใน `app.mjs`, `enterSubPage`/`leaveSubPage`/`backFromSubPage`/popstate listener จากงานปุ่มย้อนกลับ)

**Design reference:** artifact https://claude.ai/artifact/PYNrUiDyTF7jWns14bDosx บอร์ด 14-15 (ลิงก์ส่วนตัวของผู้ใช้)

## Global Constraints

- ข้อความ UI เป็นภาษาไทย ชื่อตัวแปร/ฟังก์ชัน/log เป็นภาษาอังกฤษ ห้ามใช้ emoji ในโค้ด คอมเมนต์ log และ commit message
- คอมเมนต์ในโค้ดเป็นภาษาไทย บรรทัดเดียว อธิบาย "ทำไม" เท่านั้น
- เขียนเทสต์ก่อนโค้ดเสมอ (รันให้เห็นว่าล้มก่อนแก้) แล้วรัน `npm test` และ `npx eslint .` ให้ผ่านก่อนรายงานว่าเสร็จ
- ห้ามแก้ `src/` ห้ามเริ่ม/รีสตาร์ท/ปิด dev server หรือ API
- ห้าม `git commit` หรือ `git push` จนกว่าผู้ใช้สั่ง ขั้นตอน Commit คือ "ถามผู้ใช้ก่อน"
- ข้อความจากผู้ใช้ (ชื่อหมวด) ใส่ด้วย `textContent` เท่านั้น
- ขยับงบทีละ 500 ด้วย `stepBudget` (เฟส 2) ห้ามคิดสูตรใหม่ งบต้องอยู่ในช่วง 0.01 ถึง 10,000,000
- บันทึกทีละหมวดแบบเรียงลำดับ (ไม่ยิงขนาน) เพื่อให้ผลล้มเหลวระบุหมวดได้ชัดและไม่ชนกัน
- ปุ่มและพื้นที่แตะสูงอย่างน้อย 44px
- ระหว่างบันทึกต้องกันการกดซ้ำและกัน Esc ปิด dialog ผลลัพธ์
- งบมีผลตั้งแต่เดือนที่เปิดหน้า ต้องใช้เดือนที่จับไว้ตอนเปิดหน้า ไม่อ่านค่าจากช่องเดือนตอนบันทึก

## Design Decisions (ช่องว่างที่ดีไซน์ไม่ได้ระบุ แผนนี้ตัดสินให้แล้ว)

1. หน้านี้ไม่มีช่องพิมพ์ ปรับได้ด้วย − / + ทีละ 500 เท่านั้น (อยากได้ตัวเลขเฉพาะให้ใช้แผ่นแก้งบทีละหมวดจากเฟส 2) และเลิกตั้งงบไม่ได้จากหน้านี้ (ปุ่ม − หยุดที่ค่าต่ำสุดที่ยังมากกว่า 0)
2. แถวที่ยังไม่ตั้งงบเริ่มที่ "ไม่ตั้งงบ" (ปุ่ม − ปิด) กด + ครั้งแรกได้ 500 บรรทัดสถานะแสดง `ยังไม่ตั้งงบ → N%` และป้ายใต้ตัวเลขเป็น "ใหม่"
3. ลำดับแถว: ต้องดูแล → ปกติ → ไม่มีงบ (ทุกหมวดอยู่ในหน้าเดียว) ถ้าเปิดจากแท็บ ไม่มีงบ ให้ไม่มีงบขึ้นก่อน
4. ปุ่ม "ยกเลิก" และปุ่มย้อนกลับทิ้งการแก้ที่ยังไม่บันทึกโดยไม่ถาม (การถามยืนยันไม่อยู่ในดีไซน์ ถ้าผู้ใช้ต้องการให้เพิ่มทีหลัง)
5. บันทึกสำเร็จทั้งหมด: กลับหน้า ดูทั้งหมด และแสดงข้อความสถานะ `บันทึกงบแล้ว N หมวด` (role=status) บนหน้านั้น ข้อความหายเมื่อเปิดหน้านั้นใหม่
6. บันทึกสำเร็จบางส่วน: เปิด dialog ผลลัพธ์ (บอร์ด 15) หมวดที่สำเร็จถูกถือเป็น "บันทึกแล้ว" (ไม่แสดงว่าแก้ค้าง) หมวดที่พลาดยังเป็นแถวที่แก้ค้างอยู่ ปุ่ม "ลองบันทึกหมวดที่ไม่สำเร็จ" ส่งเฉพาะหมวดที่พลาด
7. หน้าแม่/ลูก: ออบเจ็กต์หน้ามี `parent` ได้ ปุ่มย้อนกลับในหน้าและปุ่มของเครื่องจากหน้าลูกเปิดหน้าแม่ และใช้ history entry เดียวกันตลอดทั้งชุดหน้าย่อย

## File Structure

| ไฟล์ | หน้าที่ |
|---|---|
| `public/liff/budget-bulk.mjs` (สร้าง) | draft: สร้างแถว ขยับ สรุป บันทึกเรียงลำดับ รวมผล |
| `public/liff/budget-bulk.test.mjs` (สร้าง) | เทสต์ของโมดูลข้างบน |
| `public/liff/budget-bulk-panel.mjs` (สร้าง) | วาดหน้า แถวขยับ แถบสรุป dialog ผลลัพธ์ |
| `public/liff/budgets-all-panel.mjs` (แก้) | ปุ่มเข้าหน้านี้ + ข้อความสถานะหลังบันทึก |
| `public/liff/index.html` (แก้) | `#panel-budget-bulk`, `#budget-bulk-result`, ปุ่ม/สถานะใน `#panel-budget-all` |
| `public/liff/style.css` (แก้) | CSS หน้าและ dialog |
| `public/liff/app.mjs` (แก้) | ต่อสาย + `parent` ของหน้าย่อย |
| `public/liff/app.dom.test.mjs`, `public/liff/style.test.mjs` (แก้) | เทสต์ |
| `SPEC.md`, `work-memory/STATE.md` (แก้) | เอกสาร |

---

### Task 1: โมดูล draft `budget-bulk.mjs`

**Depends on:** none

**Files:**
- Create: `public/liff/budget-bulk.mjs`
- Test: `public/liff/budget-bulk.test.mjs`

**Interfaces:**
- Consumes: `groupBudgetRows, levelOfPercent, formatNumber` (`budgets-format.mjs`), `stepBudget` (`budget-edit.mjs`)
- Produces:
  - `Entry = { categoryId, category, spent, original: number|null, next: number|null }`
  - `createDraft(budgets, { first = 'risk' }): Entry[]`
  - `isDirty(entry): boolean`
  - `stepDraft(draft, categoryId, direction: 1|-1): Entry[]` (ไม่แก้ของเดิม)
  - `entryView(entry): { dirty, oldPercent, newPercent, oldLevel, newLevel, valueText, wasText }`
  - `draftSummary(draft): { dirtyCount, delta, newTotal }`
  - `saveDraft(draft, { month, setBudget, only = null }): Promise<Result[]>` โดย `Result = { categoryId, category, from, to, ok, status? }`
  - `applyResults(draft, results): Entry[]`

- [ ] **Step 1: เขียนเทสต์ที่ล้ม**

```js
import { describe, expect, it, vi } from 'vitest';
import { applyResults, createDraft, draftSummary, entryView, isDirty, saveDraft, stepDraft } from './budget-bulk.mjs';

const BUDGETS = [
  { categoryId: 'food', category: 'อาหาร', budget: 6000, spent: 4200 },
  { categoryId: 'shop', category: 'ช้อปปิ้ง', budget: 3000, spent: 3450 },
  { categoryId: 'trip', category: 'เดินทาง', budget: 2000, spent: 1900 },
  { categoryId: 'fun', category: 'บันเทิง', budget: null, spent: 620 },
  { categoryId: 'other', category: 'อื่นๆ', budget: null, spent: 150 },
];

describe('createDraft', () => {
  it('orders risk, calm, then unset', () => {
    expect(createDraft(BUDGETS).map((entry) => entry.categoryId)).toEqual(['shop', 'trip', 'food', 'fun', 'other']);
  });

  it('can put the unset categories first', () => {
    expect(createDraft(BUDGETS, { first: 'unset' }).map((entry) => entry.categoryId)).toEqual(['fun', 'other', 'shop', 'trip', 'food']);
  });

  it('starts clean with next equal to original', () => {
    const draft = createDraft(BUDGETS);

    expect(draft.every((entry) => !isDirty(entry))).toBe(true);
    expect(draft[3]).toEqual({ categoryId: 'fun', category: 'บันเทิง', spent: 620, original: null, next: null });
  });
});

describe('stepDraft', () => {
  it('adds 500 to one entry without touching the others or the input', () => {
    const draft = createDraft(BUDGETS);
    const next = stepDraft(draft, 'shop', 1);

    expect(next.find((entry) => entry.categoryId === 'shop').next).toBe(3500);
    expect(next.find((entry) => entry.categoryId === 'trip').next).toBe(2000);
    expect(draft.find((entry) => entry.categoryId === 'shop').next).toBe(3000);
  });

  it('starts an unset category at 500', () => {
    const next = stepDraft(createDraft(BUDGETS), 'fun', 1);

    expect(next.find((entry) => entry.categoryId === 'fun').next).toBe(500);
  });

  it('is clean again after stepping back to the original', () => {
    let draft = stepDraft(createDraft(BUDGETS), 'shop', 1);
    draft = stepDraft(draft, 'shop', -1);

    expect(draft.every((entry) => !isDirty(entry))).toBe(true);
  });

  it('does not remove a budget by stepping down', () => {
    const next = stepDraft(createDraft(BUDGETS), 'fun', -1);

    expect(next.find((entry) => entry.categoryId === 'fun').next).toBeNull();
  });
});

describe('entryView', () => {
  it('shows the old and new percent and the was label for a changed entry', () => {
    const entry = stepDraft(createDraft(BUDGETS), 'shop', 1).find((item) => item.categoryId === 'shop');

    expect(entryView(entry)).toEqual({
      dirty: true,
      oldPercent: 115,
      newPercent: 98,
      oldLevel: 'over',
      newLevel: 'warn',
      valueText: '3,500',
      wasText: 'เดิม 3,000',
    });
  });

  it('describes an untouched unset entry', () => {
    const entry = createDraft(BUDGETS).find((item) => item.categoryId === 'fun');

    expect(entryView(entry)).toEqual({
      dirty: false,
      oldPercent: null,
      newPercent: null,
      oldLevel: null,
      newLevel: null,
      valueText: 'ไม่ตั้งงบ',
      wasText: '',
    });
  });

  it('labels a freshly set budget as new', () => {
    const entry = stepDraft(createDraft(BUDGETS), 'fun', 1).find((item) => item.categoryId === 'fun');

    expect(entryView(entry)).toMatchObject({ dirty: true, oldPercent: null, newPercent: 124, newLevel: 'over', valueText: '500', wasText: 'ใหม่' });
  });
});

describe('draftSummary', () => {
  it('is empty for a clean draft', () => {
    expect(draftSummary(createDraft(BUDGETS))).toEqual({ dirtyCount: 0, delta: 0, newTotal: 11000 });
  });

  it('adds the changes of edited and new budgets', () => {
    let draft = stepDraft(createDraft(BUDGETS), 'shop', 1);
    draft = stepDraft(draft, 'fun', 1);

    expect(draftSummary(draft)).toEqual({ dirtyCount: 2, delta: 1000, newTotal: 12000 });
  });

  it('goes negative when budgets are lowered', () => {
    const draft = stepDraft(createDraft(BUDGETS), 'food', -1);

    expect(draftSummary(draft)).toMatchObject({ dirtyCount: 1, delta: -500, newTotal: 10500 });
  });
});

describe('saveDraft', () => {
  const edited = () => stepDraft(stepDraft(createDraft(BUDGETS), 'shop', 1), 'fun', 1);

  it('saves only the changed entries, one after another, with the month', async () => {
    const order = [];
    const setBudget = vi.fn(async (categoryId) => {
      order.push(`start:${categoryId}`);
      await Promise.resolve();
      order.push(`end:${categoryId}`);
    });

    const results = await saveDraft(edited(), { month: '2026-10', setBudget });

    expect(setBudget.mock.calls).toEqual([
      ['shop', { month: '2026-10', amount: 3500 }],
      ['fun', { month: '2026-10', amount: 500 }],
    ]);
    expect(order).toEqual(['start:shop', 'end:shop', 'start:fun', 'end:fun']);
    expect(results.map((result) => [result.categoryId, result.ok])).toEqual([['shop', true], ['fun', true]]);
  });

  it('keeps going after a failure and records the status', async () => {
    const setBudget = vi.fn(async (categoryId) => {
      if (categoryId === 'shop') throw Object.assign(new Error('x'), { status: 500 });
    });

    const results = await saveDraft(edited(), { month: '2026-10', setBudget });

    expect(results).toEqual([
      { categoryId: 'shop', category: 'ช้อปปิ้ง', from: 3000, to: 3500, ok: false, status: 500 },
      { categoryId: 'fun', category: 'บันเทิง', from: null, to: 500, ok: true },
    ]);
  });

  it('can retry just some categories', async () => {
    const setBudget = vi.fn(async () => {});

    await saveDraft(edited(), { month: '2026-10', setBudget, only: ['fun'] });

    expect(setBudget.mock.calls.map((call) => call[0])).toEqual(['fun']);
  });
});

describe('applyResults', () => {
  it('treats saved entries as the new original and leaves failed ones dirty', () => {
    const draft = stepDraft(stepDraft(createDraft(BUDGETS), 'shop', 1), 'fun', 1);
    const next = applyResults(draft, [
      { categoryId: 'shop', ok: false },
      { categoryId: 'fun', ok: true },
    ]);

    expect(isDirty(next.find((entry) => entry.categoryId === 'shop'))).toBe(true);
    expect(isDirty(next.find((entry) => entry.categoryId === 'fun'))).toBe(false);
    expect(next.find((entry) => entry.categoryId === 'fun').original).toBe(500);
  });
});
```

- [ ] **Step 2: รันให้ล้ม**

Run: `npx vitest run public/liff/budget-bulk.test.mjs`
Expected: FAIL (ไม่พบโมดูล)

- [ ] **Step 3: เขียนโค้ดขั้นต่ำ**

```js
import { formatNumber, groupBudgetRows, levelOfPercent } from './budgets-format.mjs';
import { stepBudget } from './budget-edit.mjs';

const toSatang = (value) => Math.round(value * 100);
const percentOf = (budget, spent) => Math.floor((toSatang(spent) * 100) / toSatang(budget));

export function createDraft(budgets, { first = 'risk' } = {}) {
  const groups = groupBudgetRows(budgets);
  const ordered = first === 'unset'
    ? [...groups.unset, ...groups.risk, ...groups.calm]
    : [...groups.risk, ...groups.calm, ...groups.unset];
  return ordered.map((row) => ({ categoryId: row.categoryId, category: row.category, spent: row.spent, original: row.budget, next: row.budget }));
}

export function isDirty(entry) {
  return entry.next !== entry.original;
}

export function stepDraft(draft, categoryId, direction) {
  return draft.map((entry) => (entry.categoryId === categoryId ? { ...entry, next: stepBudget(entry.next, direction) } : entry));
}

export function entryView(entry) {
  const oldPercent = entry.original === null ? null : percentOf(entry.original, entry.spent);
  const newPercent = entry.next === null ? null : percentOf(entry.next, entry.spent);
  const dirty = isDirty(entry);
  let wasText = '';
  if (dirty) wasText = entry.original === null ? 'ใหม่' : `เดิม ${formatNumber(entry.original)}`;
  return {
    dirty,
    oldPercent,
    newPercent,
    oldLevel: oldPercent === null ? null : levelOfPercent(oldPercent),
    newLevel: newPercent === null ? null : levelOfPercent(newPercent),
    valueText: entry.next === null ? 'ไม่ตั้งงบ' : formatNumber(entry.next),
    wasText,
  };
}

export function draftSummary(draft) {
  const sum = (key) => draft.reduce((total, entry) => total + (entry[key] === null ? 0 : toSatang(entry[key])), 0);
  const originalTotal = sum('original');
  const nextTotal = sum('next');
  return { dirtyCount: draft.filter(isDirty).length, delta: (nextTotal - originalTotal) / 100, newTotal: nextTotal / 100 };
}

// บันทึกทีละหมวดแบบเรียงลำดับ เพื่อให้หมวดที่พลาดระบุได้ชัดและไม่ชนกัน
export async function saveDraft(draft, { month, setBudget, only = null }) {
  const results = [];
  for (const entry of draft) {
    if (!isDirty(entry) || (only && !only.includes(entry.categoryId))) continue;
    const base = { categoryId: entry.categoryId, category: entry.category, from: entry.original, to: entry.next };
    try {
      await setBudget(entry.categoryId, { month, amount: entry.next });
      results.push({ ...base, ok: true });
    } catch (err) {
      results.push({ ...base, ok: false, status: err?.status });
    }
  }
  return results;
}

export function applyResults(draft, results) {
  const saved = new Set(results.filter((result) => result.ok).map((result) => result.categoryId));
  return draft.map((entry) => (saved.has(entry.categoryId) ? { ...entry, original: entry.next } : entry));
}
```

(`eslint.config.js` ใช้แค่ `js.configs.recommended` ซึ่งไม่มีกฎ `no-await-in-loop` จึงไม่ต้องมี `eslint-disable`)

- [ ] **Step 4: รันให้ผ่าน** `npx vitest run public/liff/budget-bulk.test.mjs` Expected: PASS ทุกเทสต์
- [ ] **Step 5: Lint** `npx eslint public/liff/budget-bulk.mjs public/liff/budget-bulk.test.mjs` Expected: ไม่มี error
- [ ] **Step 6: Commit (ถามผู้ใช้ก่อน)** `feat: add the draft logic for editing many budgets at once`

---

### Task 2: หน้า "แก้งบหลายหมวด" และ dialog ผลลัพธ์

**Depends on:** Task 1

**Files:**
- Create: `public/liff/budget-bulk-panel.mjs`
- Modify: `public/liff/budgets-all-panel.mjs`
- Modify: `public/liff/index.html`
- Modify: `public/liff/style.css`
- Modify: `public/liff/style.test.mjs`
- Modify: `public/liff/app.mjs`
- Test: `public/liff/app.dom.test.mjs`

**Interfaces:**
- Consumes: ทุกอย่างจาก Task 1, `stepBudget` (เฟส 2), `formatNumber` (`budgets-format.mjs`), `createBudgetsAllPanel` จากเฟส 1 (เพิ่มสองอย่างในไฟล์เดียวกัน: `els.bulk`, `els.status`, ตัวเลือก `onBulk`, เมธอด `setStatus`)
- Produces: `createBudgetBulkPanel({ doc, els, setBudget, onSaved, onDone }): { show({ budgets, month, first }) }`
  - `setBudget(categoryId, { month, amount }): Promise` (เท่ากับ `api.setBudget`)
  - `onSaved(): Promise` เรียกเมื่อมีอย่างน้อยหนึ่งหมวดบันทึกสำเร็จ (app โหลดงบใหม่)
  - `onDone({ savedCount })` เรียกเมื่อบันทึกสำเร็จทั้งหมดแล้ว
  - `els` keys: `list, count, delta, total, cancel, save, result, resultTitle, resultSub, resultList, resultRetry, resultClose`
  - เพิ่มใน `createBudgetsAllPanel`: parameter `onBulk({ first })`, `els.bulk` (ปุ่ม), `els.status` (ข้อความ), เมธอด `setStatus(text)`

**Browser check:**
- Preconditions: ผู้ใช้เปิดแอปเองผ่าน LINE ด้วยบัญชีที่มีงบอย่างน้อย 3 หมวดและมีหมวดที่ยังไม่ตั้งงบ 1 หมวด agent ห้ามสตาร์ท service
- Base URL: ลิงก์ LIFF

| # | Action | Expected |
|---|---|---|
| 1 | แท็บ งบ > "ดูทั้งหมด" กดปุ่มเหลือง "แก้งบหลายหมวดพร้อมกัน" | หน้าย่อย "แก้งบหลายหมวด" เปิด แถวเรียงต้องดูแล > ปกติ > ไม่มีงบ ปุ่ม "บันทึกทั้งหมด" กดไม่ได้ |
| 2 | กด + ที่หมวดหนึ่ง | ตัวเลขเพิ่ม 500 แถวมีเส้นน้ำเงินด้านซ้าย ขึ้น `ก่อน% → หลัง%` และ "เดิม ..." ใต้ตัวเลข แถบล่างขึ้น "แก้ 1 หมวด · รวมงบ +500" |
| 3 | กด + ที่หมวดที่ยังไม่ตั้งงบ | ตัวเลขเป็น 500 ป้าย "ใหม่" บรรทัดสถานะ "ยังไม่ตั้งงบ → N%" |
| 4 | กด "บันทึกทั้งหมด" (เน็ตปกติ) | กลับหน้า ดูทั้งหมด พร้อมข้อความ "บันทึกงบแล้ว 2 หมวด" ตัวเลขในรายการเปลี่ยนตามงบใหม่ |
| 5 | เปิดหน้านี้ใหม่ แก้ 2 หมวด แล้วตัดเน็ตก่อนกด "บันทึกทั้งหมด" | dialog "บันทึกได้ 0 จาก 2 หมวด" แถวที่พลาดเป็นสีแดง "บันทึกไม่สำเร็จ" มีปุ่ม "ลองบันทึกหมวดที่ไม่สำเร็จ" |
| 6 | เปิดเน็ตแล้วกด "ลองบันทึกหมวดที่ไม่สำเร็จ" | dialog ปิด กลับหน้า ดูทั้งหมด พร้อมข้อความสถานะ |

- [ ] **Step 1: เขียนเทสต์ DOM ที่ล้ม**

ต่อท้าย `public/liff/app.dom.test.mjs` (ใช้ `openBudgets`, `BUDGET_SAMPLE`, `routeFetch`, `settle`, `byId` จากเฟส 1-2):

```js
describe('LIFF bulk budget edit', () => {
  async function openBulk(tab) {
    await openBudgets();
    byId('budget-all-open').click();
    await settle();
    if (tab) byId('budget-all-tabs').querySelector(`button[data-tab="${tab}"]`).click();
    byId('budget-all-bulk-open').click();
    await settle();
  }
  const row = (categoryId) => byId('budget-bulk-list').querySelector(`[data-category-id="${categoryId}"]`);
  const plus = (categoryId) => row(categoryId).querySelector('.budget-bulk-plus');
  const minus = (categoryId) => row(categoryId).querySelector('.budget-bulk-minus');

  it('has an entry button on the see-all page that changes its label on the unset tab', async () => {
    await openBudgets();
    byId('budget-all-open').click();
    await settle();

    expect(byId('budget-all-bulk-open').textContent).toBe('แก้งบหลายหมวดพร้อมกัน');

    byId('budget-all-tabs').querySelector('button[data-tab="unset"]').click();

    expect(byId('budget-all-bulk-open').textContent).toBe('ตั้งงบหลายหมวดพร้อมกัน');
  });

  it('opens as a sub page with every category and nothing to save yet', async () => {
    await openBulk();

    expect(byId('panel-budget-bulk').hidden).toBe(false);
    expect(byId('page-title').textContent).toBe('แก้งบหลายหมวด');
    expect([...byId('budget-bulk-list').children].map((item) => item.dataset.categoryId)).toEqual(['c-shop', 'c-trip', 'c-food', 'c-fun', 'c-other']);
    expect(byId('budget-bulk-save').disabled).toBe(true);
    expect(byId('budget-bulk-count').textContent).toBe('ยังไม่ได้แก้อะไร');
  });

  it('puts the unset categories first when opened from the unset tab', async () => {
    await openBulk('unset');

    expect([...byId('budget-bulk-list').children].map((item) => item.dataset.categoryId).slice(0, 2)).toEqual(['c-fun', 'c-other']);
    expect(byId('budget-bulk-list').children[0].querySelector('.budget-bulk-value').textContent).toBe('ไม่ตั้งงบ');
    expect(minus('c-fun').disabled).toBe(true);
  });

  it('adds 500 per tap and shows the percent before and after', async () => {
    await openBulk();

    plus('c-shop').click();

    const item = row('c-shop');
    expect(item.querySelector('.budget-bulk-value').textContent).toBe('3,500');
    expect(item.querySelector('.budget-bulk-was').textContent).toBe('เดิม 3,000');
    expect(item.querySelector('.budget-bulk-old').textContent).toBe('115%');
    expect(item.querySelector('.budget-bulk-new').textContent).toBe('98%');
    expect(item.classList.contains('dirty')).toBe(true);
    expect(byId('budget-bulk-count').textContent).toBe('แก้ 1 หมวด · รวมงบ');
    expect(byId('budget-bulk-delta').textContent).toBe('+500');
    expect(byId('budget-bulk-total').textContent).toBe('เป็น 11,500');
    expect(byId('budget-bulk-save').disabled).toBe(false);
  });

  it('shows a new budget for an unset category', async () => {
    await openBulk();

    plus('c-fun').click();

    const item = row('c-fun');
    expect(item.querySelector('.budget-bulk-value').textContent).toBe('500');
    expect(item.querySelector('.budget-bulk-was').textContent).toBe('ใหม่');
    expect(item.querySelector('.budget-bulk-old').textContent).toBe('ยังไม่ตั้งงบ');
    expect(item.querySelector('.budget-bulk-new').textContent).toBe('124%');
  });

  it('clears the mark when a tap is undone', async () => {
    await openBulk();
    plus('c-shop').click();

    minus('c-shop').click();

    expect(row('c-shop').classList.contains('dirty')).toBe(false);
    expect(byId('budget-bulk-save').disabled).toBe(true);
  });

  it('saves each changed category with the month and goes back to the see-all page', async () => {
    await openBulk();
    plus('c-shop').click();
    plus('c-fun').click();
    const requests = [];
    vi.stubGlobal('fetch', async (url, options = {}) => {
      requests.push({ method: options.method ?? 'GET', path: new URL(url, 'http://localhost').pathname, body: options.body });
      return { ok: true, status: 200, json: async () => (options.method ? {} : BUDGET_SAMPLE) };
    });

    byId('budget-bulk-save').click();
    await settle();

    const puts = requests.filter((request) => request.method === 'PUT');
    expect(puts.map((put) => [put.path, JSON.parse(put.body)])).toEqual([
      ['/api/budgets/c-shop', { month: '2026-10', amount: 3500 }],
      ['/api/budgets/c-fun', { month: '2026-10', amount: 500 }],
    ]);
    expect(requests.some((request) => request.method === 'GET' && request.path === '/api/budgets')).toBe(true);
    expect(byId('panel-budget-all').hidden).toBe(false);
    expect(byId('panel-budget-bulk').hidden).toBe(true);
    expect(byId('budget-all-status').textContent).toBe('บันทึกงบแล้ว 2 หมวด');
  });

  it('disables the buttons while saving', async () => {
    await openBulk();
    plus('c-shop').click();
    let release;
    vi.stubGlobal('fetch', () => new Promise((resolve) => { release = resolve; }));

    byId('budget-bulk-save').click();

    expect(byId('budget-bulk-save').disabled).toBe(true);
    expect(plus('c-shop').disabled).toBe(true);
    release({ ok: true, status: 200, json: async () => ({}) });
    await settle();
  });

  it('lists successes and failures and retries only the failed ones', async () => {
    await openBulk();
    plus('c-shop').click();
    plus('c-trip').click();
    routeFetch((method, path) => (method === 'PUT' && path === '/api/budgets/c-trip' ? { status: 500 } : method === 'PUT' ? {} : undefined));

    byId('budget-bulk-save').click();
    await settle();

    expect(byId('budget-bulk-result').hasAttribute('open')).toBe(true);
    expect(byId('budget-bulk-result-title').textContent).toBe('บันทึกได้ 1 จาก 2 หมวด');
    const items = [...byId('budget-bulk-result-list').children];
    expect(items.map((item) => item.querySelector('.budget-bulk-result-say').textContent)).toEqual(['บันทึกแล้ว', 'บันทึกไม่สำเร็จ']);
    expect(items[1].classList.contains('failed')).toBe(true);
    expect(row('c-shop').classList.contains('dirty')).toBe(false);
    expect(row('c-trip').classList.contains('dirty')).toBe(true);

    const retried = [];
    vi.stubGlobal('fetch', async (url, options = {}) => {
      if (options.method === 'PUT') retried.push(new URL(url, 'http://localhost').pathname);
      return { ok: true, status: 200, json: async () => (options.method ? {} : BUDGET_SAMPLE) };
    });
    byId('budget-bulk-result-retry').click();
    await settle();

    expect(retried).toEqual(['/api/budgets/c-trip']);
    expect(byId('budget-bulk-result').hasAttribute('open')).toBe(false);
    expect(byId('budget-all-status').textContent).toBe('บันทึกงบแล้ว 2 หมวด');
  });

  it('keeps the failed rows editable after closing the result', async () => {
    await openBulk();
    plus('c-trip').click();
    routeFetch((method) => (method === 'PUT' ? { status: 500 } : undefined));
    byId('budget-bulk-save').click();
    await settle();

    byId('budget-bulk-result-close').click();

    expect(byId('budget-bulk-result').hasAttribute('open')).toBe(false);
    expect(byId('panel-budget-bulk').hidden).toBe(false);
    expect(row('c-trip').classList.contains('dirty')).toBe(true);
    expect(byId('budget-bulk-save').disabled).toBe(false);
  });

  it('forgets an earlier failure when the user undoes it and saves something else', async () => {
    await openBulk();
    plus('c-trip').click();
    routeFetch((method) => (method === 'PUT' ? { status: 500 } : undefined));
    byId('budget-bulk-save').click();
    await settle();
    byId('budget-bulk-result-close').click();
    minus('c-trip').click();
    plus('c-shop').click();
    routeFetch((method) => (method === 'PUT' ? {} : undefined));

    byId('budget-bulk-save').click();
    await settle();

    expect(byId('budget-bulk-result').hasAttribute('open')).toBe(false);
    expect(byId('budget-all-status').textContent).toBe('บันทึกงบแล้ว 1 หมวด');
  });

  it('does not close the result on Escape while a retry is running', async () => {
    await openBulk();
    plus('c-trip').click();
    routeFetch((method) => (method === 'PUT' ? { status: 500 } : undefined));
    byId('budget-bulk-save').click();
    await settle();
    let release;
    vi.stubGlobal('fetch', () => new Promise((resolve) => { release = resolve; }));

    byId('budget-bulk-result-retry').click();
    const cancel = new Event('cancel', { cancelable: true });
    byId('budget-bulk-result').dispatchEvent(cancel);

    expect(cancel.defaultPrevented).toBe(true);
    release({ ok: true, status: 200, json: async () => ({}) });
    await settle();
  });

  it('clears the status message when the see-all page is opened again', async () => {
    await openBulk();
    plus('c-shop').click();
    routeFetch((method) => (method === 'PUT' ? {} : undefined));
    byId('budget-bulk-save').click();
    await settle();
    byId('page-back').click();
    await settle();
    byId('budget-all-open').click();
    await settle();

    expect(byId('budget-all-status').textContent).toBe('');
  });
});
```

- [ ] **Step 2: รันให้เห็นว่าล้ม**

Run: `npx vitest run public/liff/app.dom.test.mjs -t "bulk budget edit"`
Expected: FAIL (ไม่พบ `budget-all-bulk-open`)

- [ ] **Step 3: markup**

ใน `#panel-budget-all` (จากเฟส 1) เพิ่มต่อท้ายสุดของ panel (หลัง `#budget-all-empty`):

```html
      <p id="budget-all-status" class="budget-all-status" role="status" aria-live="polite"></p>
      <div class="budget-all-foot">
        <button type="button" id="budget-all-bulk-open" class="budget-cta">แก้งบหลายหมวดพร้อมกัน</button>
      </div>
```

ต่อจาก `#panel-budget-all` เพิ่มหน้าใหม่:

```html
    <div id="panel-budget-bulk" class="panel" hidden>
      <p class="budget-bulk-hint">กด − / + ปรับทีละ 500 แล้วบันทึกทีเดียว % ใหม่ขึ้นให้ดูทันที แถวที่แก้จะมีเส้นน้ำเงินด้านซ้าย</p>
      <div id="budget-bulk-list" class="budget-bulk-list"></div>
      <div class="budget-bulk-bar">
        <div class="budget-bulk-summary">
          <span id="budget-bulk-count" role="status" aria-live="polite">ยังไม่ได้แก้อะไร</span>
          <span><strong id="budget-bulk-delta"></strong> <span id="budget-bulk-total"></span></span>
        </div>
        <button type="button" id="budget-bulk-cancel" class="budget-bulk-cancel">ยกเลิก</button>
        <button type="button" id="budget-bulk-save" class="budget-cta" disabled>บันทึกทั้งหมด</button>
      </div>
    </div>
```

และต่อจาก `<dialog id="budget-remove-confirm">` (เฟส 2) เพิ่ม:

```html
  <dialog id="budget-bulk-result" class="budget-sheet" aria-labelledby="budget-bulk-result-title">
    <div class="budget-sheet-grab" aria-hidden="true"></div>
    <div class="budget-bulk-result-head">
      <img src="assets/mascot.webp" alt="" width="56" height="56">
      <div>
        <h2 id="budget-bulk-result-title"></h2>
        <p id="budget-bulk-result-sub"></p>
      </div>
    </div>
    <div id="budget-bulk-result-list" class="budget-bulk-result-list"></div>
    <button type="button" id="budget-bulk-result-retry" class="budget-cta">ลองบันทึกหมวดที่ไม่สำเร็จ</button>
    <button type="button" id="budget-bulk-result-close" class="budget-bulk-result-close">ปิด</button>
  </dialog>
```

- [ ] **Step 4: CSS**

```css
/* หน้าแก้งบหลายหมวด: ไม่มีกราฟแท่ง แถวที่แก้มีเส้นน้ำเงินด้านซ้าย */
.budget-all-status { margin: 8px 20px 0; font-size: 13px; font-weight: 700; color: var(--income-text); }
.budget-all-status:empty { display: none; }
.budget-all-foot { position: sticky; bottom: 0; padding: 12px 16px 16px; background: var(--bg); }
.budget-all-foot .budget-cta { margin-top: 0; }
.budget-bulk-hint { margin: 12px 20px 0; font-size: 13px; color: var(--muted); }
.budget-bulk-list { margin: 8px 16px 0; background: var(--surface); border-radius: 20px; box-shadow: var(--shadow-card); overflow: hidden; }
.budget-bulk-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; column-gap: 8px; min-height: 68px; box-sizing: border-box; padding: 6px 10px 6px 16px; border-bottom: 1px solid var(--border); }
.budget-bulk-row.dirty { background: var(--brand-soft); box-shadow: inset 4px 0 0 var(--primary); }
.budget-bulk-name { font-size: 15px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.budget-bulk-line { display: flex; align-items: center; gap: 6px; font-size: 14px; font-weight: 800; font-variant-numeric: tabular-nums; }
.budget-bulk-old, .budget-bulk-new { color: var(--level-text); }
.budget-bulk-old.struck { text-decoration: line-through; color: var(--muted); }
.budget-bulk-old.muted { font-weight: 600; color: var(--muted); }
.budget-bulk-stepper { display: flex; align-items: center; gap: 4px; }
.budget-bulk-stepper button { flex: none; width: 44px; height: 44px; border: 1px solid var(--outline); border-radius: 12px; background: var(--surface); color: var(--text); font: inherit; font-size: 22px; line-height: 1; cursor: pointer; }
.budget-bulk-stepper button:disabled { background: var(--disabled-bg); color: var(--muted); border-color: var(--border); }
.budget-bulk-amount { width: 62px; text-align: center; }
.budget-bulk-value { display: block; font-size: 15px; font-weight: 800; font-variant-numeric: tabular-nums; }
.budget-bulk-row.dirty .budget-bulk-value { color: var(--primary); }
.budget-bulk-was { display: block; min-height: 16px; font-size: 11px; color: var(--muted); }
.budget-bulk-bar { position: sticky; bottom: 0; display: flex; align-items: center; gap: 10px; margin-top: 10px; padding: 12px 16px 16px; background: var(--surface); border-top: 1px solid var(--border); }
.budget-bulk-summary { flex: 1; min-width: 0; display: flex; flex-direction: column; font-size: 12px; color: var(--muted); }
.budget-bulk-summary strong { font-size: 18px; font-weight: 800; color: var(--primary); font-variant-numeric: tabular-nums; }
.budget-bulk-cancel { flex: none; min-height: 52px; padding: 0 14px; border: 1.5px solid var(--outline); border-radius: var(--radius-pill); background: var(--surface); color: var(--text); font: inherit; font-size: 14px; font-weight: 700; cursor: pointer; }
.budget-bulk-bar .budget-cta { flex: none; width: auto; margin-top: 0; padding: 0 18px; font-size: 15px; }
.budget-cta:disabled { background: var(--disabled-bg); color: var(--muted); cursor: default; }
.budget-bulk-result-head { display: grid; grid-template-columns: 56px minmax(0, 1fr); column-gap: 12px; align-items: center; margin-top: 14px; }
.budget-bulk-result-head img { border-radius: 50%; box-shadow: 0 0 0 3px var(--primary); }
.budget-bulk-result-head h2 { margin: 0; font-size: 20px; font-weight: 800; line-height: 1.3; }
.budget-bulk-result-head p { margin: 0; font-size: 13px; color: var(--muted); }
.budget-bulk-result-list { margin-top: 14px; background: var(--bg); border-radius: 18px; overflow: hidden; }
.budget-bulk-result-item { display: grid; grid-template-columns: 32px minmax(0, 1fr) auto; align-items: center; column-gap: 12px; min-height: 64px; box-sizing: border-box; padding: 8px 14px; border-bottom: 1px solid var(--border); }
.budget-bulk-result-item.failed { background: var(--danger-soft); }
.budget-bulk-result-mark { display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 50%; background: var(--income); color: var(--on-primary); }
.budget-bulk-result-item.failed .budget-bulk-result-mark { background: var(--danger); }
.budget-bulk-result-mark .icon { width: 16px; height: 16px; }
.budget-bulk-result-name { display: block; font-size: 15px; font-weight: 700; }
.budget-bulk-result-say { display: block; font-size: 13px; font-weight: 700; color: var(--income-text); }
.budget-bulk-result-item.failed .budget-bulk-result-say { color: var(--danger-text); }
.budget-bulk-result-change { font-size: 14px; font-weight: 800; font-variant-numeric: tabular-nums; }
#budget-bulk-result .budget-cta { margin-top: 16px; }
.budget-bulk-result-close { display: block; width: 100%; min-height: 48px; margin-top: 6px; border: none; background: none; color: var(--primary); font: inherit; font-size: 15px; font-weight: 800; cursor: pointer; }
```

เทสต์ CSS ใน `style.test.mjs`:

```js
describe('style.css budget bulk page', () => {
  it('marks edited rows with a blue edge on the left', () => {
    expect(declarations('.budget-bulk-row.dirty')).toMatch(/inset 4px 0 0 var\(--primary\)/);
  });

  it('gives the stepper buttons a 44px target', () => {
    expect(declarations('.budget-bulk-stepper button')).toMatch(/width:\s*44px/);
    expect(declarations('.budget-bulk-stepper button')).toMatch(/height:\s*44px/);
  });

  it('keeps the save bar visible at the bottom', () => {
    expect(declarations('.budget-bulk-bar')).toMatch(/position:\s*sticky/);
  });
});
```

- [ ] **Step 5: เขียน `budget-bulk-panel.mjs`**

```js
import { createSvgIcon } from './icons.mjs';
import { applyResults, createDraft, draftSummary, entryView, saveDraft, stepDraft } from './budget-bulk.mjs';
import { formatNumber } from './budgets-format.mjs';
import { stepBudget } from './budget-edit.mjs';

function node(doc, tag, className, text) {
  const el = doc.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

export function createBudgetBulkPanel({ doc, els, setBudget, onSaved, onDone }) {
  let draft = [];
  let month = null;
  let busy = false;
  // เก็บผลล่าสุดของแต่ละหมวด เพื่อให้ dialog รวมผลของรอบแรกกับรอบลองใหม่
  let outcomes = new Map();

  function renderRow(entry) {
    const view = entryView(entry);
    const item = node(doc, 'div', view.dirty ? 'budget-bulk-row dirty' : 'budget-bulk-row');
    item.dataset.categoryId = entry.categoryId;
    const text = node(doc, 'div', 'budget-bulk-text');
    const line = node(doc, 'div', 'budget-bulk-line');
    if (view.oldPercent === null) {
      line.append(node(doc, 'span', view.dirty ? 'budget-bulk-old struck' : 'budget-bulk-old muted', 'ยังไม่ตั้งงบ'));
    } else {
      line.append(node(doc, 'span', `budget-bulk-old level-${view.oldLevel}${view.dirty ? ' struck' : ''}`, `${view.oldPercent}%`));
    }
    if (view.dirty && view.newPercent !== null) {
      line.append(node(doc, 'span', 'budget-bulk-arrow', '→'), node(doc, 'span', `budget-bulk-new level-${view.newLevel}`, `${view.newPercent}%`));
    }
    text.append(node(doc, 'div', 'budget-bulk-name', entry.category), line);

    const stepper = node(doc, 'div', 'budget-bulk-stepper');
    const minus = node(doc, 'button', 'budget-bulk-minus', '−');
    minus.type = 'button';
    minus.setAttribute('aria-label', `ลดงบ ${entry.category} 500 บาท`);
    minus.disabled = busy || stepBudget(entry.next, -1) === entry.next;
    const plus = node(doc, 'button', 'budget-bulk-plus', '+');
    plus.type = 'button';
    plus.setAttribute('aria-label', `เพิ่มงบ ${entry.category} 500 บาท`);
    plus.disabled = busy;
    const amount = node(doc, 'div', 'budget-bulk-amount');
    amount.append(node(doc, 'span', 'budget-bulk-value', view.valueText), node(doc, 'span', 'budget-bulk-was', view.wasText));
    stepper.append(minus, amount, plus);
    item.append(text, stepper);

    const change = (direction, selector) => {
      draft = stepDraft(draft, entry.categoryId, direction);
      const next = renderRow(draft.find((candidate) => candidate.categoryId === entry.categoryId));
      item.replaceWith(next);
      renderSummary();
      const target = next.querySelector(selector);
      if (!target.disabled) target.focus();
    };
    minus.addEventListener('click', () => change(-1, '.budget-bulk-minus'));
    plus.addEventListener('click', () => change(1, '.budget-bulk-plus'));
    return item;
  }

  function renderSummary() {
    const summary = draftSummary(draft);
    if (summary.dirtyCount === 0) {
      els.count.textContent = 'ยังไม่ได้แก้อะไร';
      els.delta.textContent = '';
      els.total.textContent = '';
    } else {
      els.count.textContent = `แก้ ${summary.dirtyCount} หมวด · รวมงบ`;
      els.delta.textContent = `${summary.delta >= 0 ? '+' : '-'}${formatNumber(Math.abs(summary.delta))}`;
      els.total.textContent = `เป็น ${formatNumber(summary.newTotal)}`;
    }
    els.save.disabled = busy || summary.dirtyCount === 0;
  }

  function renderList() {
    els.list.replaceChildren(...draft.map(renderRow));
    renderSummary();
  }

  function setBusy(next) {
    busy = next;
    els.cancel.disabled = next;
    els.resultRetry.disabled = next;
    els.resultClose.disabled = next;
    renderList();
  }

  function showResult() {
    const results = [...outcomes.values()];
    const okCount = results.filter((result) => result.ok).length;
    els.resultTitle.textContent = `บันทึกได้ ${okCount} จาก ${results.length} หมวด`;
    els.resultSub.textContent = okCount > 0 ? `${okCount} หมวดที่สำเร็จบันทึกแล้ว ไม่ต้องกดซ้ำ` : 'ยังไม่มีหมวดไหนบันทึกสำเร็จ';
    els.resultList.replaceChildren();
    for (const result of results) {
      const item = node(doc, 'div', result.ok ? 'budget-bulk-result-item' : 'budget-bulk-result-item failed');
      const mark = node(doc, 'span', 'budget-bulk-result-mark');
      mark.append(createSvgIcon(doc, result.ok ? 'icon-check' : 'icon-close'));
      const text = node(doc, 'span', 'budget-bulk-result-text');
      text.append(node(doc, 'span', 'budget-bulk-result-name', result.category), node(doc, 'span', 'budget-bulk-result-say', result.ok ? 'บันทึกแล้ว' : 'บันทึกไม่สำเร็จ'));
      const from = result.from === null ? 'ไม่มีงบ' : formatNumber(result.from);
      item.append(mark, text, node(doc, 'span', 'budget-bulk-result-change', `${from} → ${formatNumber(result.to)}`));
      els.resultList.append(item);
    }
    els.resultRetry.hidden = okCount === results.length;
    if (!els.result.open) els.result.showModal();
  }

  async function save(only = null) {
    if (busy) return;
    // รอบที่ผู้ใช้กดเองเริ่มนับผลใหม่ ไม่งั้นความล้มเหลวเก่าที่ผู้ใช้แก้กลับแล้วจะทำให้ dialog ค้าง
    if (only === null) outcomes = new Map();
    setBusy(true);
    const results = await saveDraft(draft, { month, setBudget, only });
    draft = applyResults(draft, results);
    for (const result of results) outcomes.set(result.categoryId, result);
    setBusy(false);
    if (results.some((result) => result.ok)) await onSaved();
    const failed = [...outcomes.values()].filter((result) => !result.ok);
    if (failed.length === 0) {
      const savedCount = outcomes.size;
      if (els.result.open) els.result.close();
      onDone({ savedCount });
      return;
    }
    showResult();
  }

  function show({ budgets, month: nextMonth, first = 'risk' }) {
    draft = createDraft(budgets, { first });
    month = nextMonth;
    outcomes = new Map();
    busy = false;
    els.cancel.disabled = false;
    renderList();
  }

  els.save.addEventListener('click', () => save());
  els.resultRetry.addEventListener('click', () => save([...outcomes.values()].filter((result) => !result.ok).map((result) => result.categoryId)));
  els.resultClose.addEventListener('click', () => els.result.close());
  // กัน Esc ปิดผลลัพธ์ระหว่างลองบันทึกใหม่ ไม่งั้นผลรอบนี้จะไม่มีที่แสดง
  els.result.addEventListener('cancel', (event) => {
    if (busy) event.preventDefault();
  });

  return { show };
}
```

หมายเหตุ: ตรวจว่ามี symbol `icon-check` ใน sprite (เฟส 1 Task 4 เพิ่มไว้แล้ว) และ `icon-close` มีอยู่เดิม

- [ ] **Step 6: แก้ `budgets-all-panel.mjs`**

1. พารามิเตอร์: `createBudgetsAllPanel({ doc, els, badgeFor, onEdit, getMonthLabel, onBulk })`
2. ใน `draw()` ต่อจากบรรทัดที่ตั้ง `els.tabEmpty.hidden = ...` เพิ่ม:
```js
    const hasAnyRows = TABS.some((tab) => groups[tab.id].length > 0);
    els.bulk.hidden = !hasAnyRows || notFound;
    els.bulk.textContent = state.tab === 'unset' ? 'ตั้งงบหลายหมวดพร้อมกัน' : 'แก้งบหลายหมวดพร้อมกัน';
```
   (ประกาศ `notFound` ก่อนบรรทัดนี้ ตามโค้ดเฟส 1 มีอยู่แล้ว)
3. ใน `show()` เพิ่ม `els.status.textContent = '';` ก่อน `draw()`
4. เพิ่มเมธอด และ listener:
```js
  els.bulk.addEventListener('click', () => onBulk({ first: state.tab === 'unset' ? 'unset' : 'risk' }));

  return { setBudgets, show, setStatus: (text) => { els.status.textContent = text; } };
```
   (แทน `return { setBudgets, show };` เดิม)

- [ ] **Step 7: ต่อสายใน `app.mjs`**

1. import: `import { createBudgetBulkPanel } from './budget-bulk-panel.mjs';`
2. `els` เพิ่ม: `budgetAllBulkOpen, budgetAllStatus, budgetBulkList, budgetBulkCount, budgetBulkDelta, budgetBulkTotal, budgetBulkCancel, budgetBulkSave, budgetBulkResult, budgetBulkResultTitle, budgetBulkResultSub, budgetBulkResultList, budgetBulkResultRetry, budgetBulkResultClose` (`document.getElementById` ตาม id)
3. ตอนสร้าง `budgetsAllPanel` (เฟส 1) เพิ่มใน `els`: `bulk: els.budgetAllBulkOpen, status: els.budgetAllStatus` และเพิ่ม option `onBulk: (options) => openBudgetsBulk(options)`
4. เก็บงบล่าสุด: ในฟังก์ชัน `renderBudgets` เพิ่มบรรทัด `latestBudgets = budgets;` และประกาศ `let latestBudgets = [];` ใกล้ `let editingBudget`/ตัวแปรสถานะอื่น
5. เพิ่ม**ต่อท้ายส่วนที่ประกาศ `BUDGETS_ALL_PAGE`** (เฟส 1, อยู่ท้ายไฟล์ ไม่ใช่ใกล้ `budgetSheet` ของเฟส 2) เพราะ Task 3 จะให้ `BUDGET_BULK_PAGE.parent` อ้าง `BUDGETS_ALL_PAGE` ถ้าวางก่อนจะเกิด TDZ:
```js
const budgetBulkPanel = createBudgetBulkPanel({
  doc: document,
  els: {
    list: els.budgetBulkList, count: els.budgetBulkCount, delta: els.budgetBulkDelta, total: els.budgetBulkTotal,
    cancel: els.budgetBulkCancel, save: els.budgetBulkSave, result: els.budgetBulkResult, resultTitle: els.budgetBulkResultTitle,
    resultSub: els.budgetBulkResultSub, resultList: els.budgetBulkResultList, resultRetry: els.budgetBulkResultRetry,
    resultClose: els.budgetBulkResultClose,
  },
  setBudget: (categoryId, body) => api.setBudget(categoryId, body),
  onSaved: () => loadBudgets(),
  onDone: ({ savedCount }) => {
    backFromSubPage();
    budgetsAllPanel.setStatus(`บันทึกงบแล้ว ${savedCount} หมวด`);
  },
});

const BUDGET_BULK_PAGE = {
  panelId: 'panel-budget-bulk',
  title: 'แก้งบหลายหมวด',
  backLabel: 'กลับไปดูงบทุกหมวด',
  ownerTab: 'budgets',
  returnFocus: els.budgetAllBulkOpen,
};

function openBudgetsBulk({ first = 'risk' } = {}) {
  budgetBulkPanel.show({ budgets: latestBudgets, month: els.month.value, first });
  enterSubPage(BUDGET_BULK_PAGE);
}

els.budgetBulkCancel.addEventListener('click', () => backFromSubPage());
```
   (`openBudgetsBulk` เป็น function declaration จึงถูกเรียกจาก `onBulk` ที่ประกาศก่อนได้)

   หมายเหตุ: ใน Task นี้ปุ่มย้อนกลับจากหน้าแก้หลายหมวดยังพาไปแท็บงบ (ออกจากชุดหน้าย่อย) Task 3 แก้ให้กลับไปหน้า ดูทั้งหมด และ `onDone` ที่เรียก `backFromSubPage()` จะกลับไปหน้า ดูทั้งหมดเมื่อ Task 3 เสร็จ ดังนั้น**เทสต์ `saves each changed category ... goes back to the see-all page` จะผ่านเมื่อ Task 3 เสร็จเท่านั้น** ให้ทำ Step 8-10 ของ Task นี้ด้วยการข้ามเทสต์นั้นไว้ก่อน (`it.skip`) แล้วเปิดคืนใน Task 3 Step 4

- [ ] **Step 8: รันเทสต์ที่ไม่เกี่ยวกับการย้อนกลับ**

Run: `npx vitest run public/liff/app.dom.test.mjs -t "bulk budget edit"`
Expected: PASS ยกเว้นเทสต์ที่ skip ไว้ตัวเดียวคือ `saves each changed category ... goes back to the see-all page` (ให้ `it.skip` ไว้ก่อน) ส่วน `lists successes and failures and retries ...` ผ่านได้ใน Task นี้เพราะตรวจแค่ข้อความสถานะ ไม่ได้ตรวจว่าหน้าไหนแสดงอยู่

- [ ] **Step 9: ตรวจรวม** `npm test` และ `npx eslint .` Expected: ผ่าน

- [ ] **Step 10: Commit (ถามผู้ใช้ก่อน)** `feat: add the bulk budget edit page and result sheet`

---

### Task 3: ปุ่มย้อนกลับซ้อนหน้าย่อย (`parent`)

**Depends on:** Task 2

**Files:**
- Modify: `public/liff/app.mjs` (`leaveSubPage`, `backFromSubPage`, popstate listener, `BUDGET_BULK_PAGE`)
- Test: `public/liff/app.dom.test.mjs`

**Interfaces:**
- Consumes: `enterSubPage`, `subPageEntryPushed`, `pushSubPageEntry`, `activeSubPage` (งานปุ่มย้อนกลับที่ push แล้ว: `commit ce1433b`)
- Produces: ออบเจ็กต์หน้าย่อยรองรับ field `parent` (ออบเจ็กต์หน้าแม่); `leaveSubPage(): boolean` คืน `true` เมื่อออกจากชุดหน้าย่อยจริง `false` เมื่อแค่ย้อนไปหน้าแม่

**Browser check:**
- Preconditions: เหมือน Task 2 และผู้ใช้ทดสอบบนมือถือจริง (ปุ่มย้อนกลับของเครื่อง/ท่าปัดย้อน) agent ทดสอบไม่ได้

| # | Action | Expected |
|---|---|---|
| 1 | แท็บ งบ > ดูทั้งหมด > แก้งบหลายหมวดพร้อมกัน แล้วกดปุ่มย้อนกลับของเครื่อง/ปัดย้อน | กลับหน้า ดูทั้งหมด (ไม่ออกจาก LIFF ไม่ไปแท็บงบ) |
| 2 | กดปุ่มย้อนกลับของเครื่องอีกครั้ง | กลับแท็บ งบ |
| 3 | กดปุ่มย้อนกลับของเครื่องอีกครั้ง | ออกจากหน้า/กลับตามพฤติกรรมปกติของ LINE (ไม่ค้าง) |
| 4 | เข้าหน้าแก้หลายหมวดอีกรอบ แล้วกดลูกศรย้อนกลับ**ในหน้า** | กลับหน้า ดูทั้งหมด แล้วกดลูกศรอีกครั้งกลับแท็บ งบ |

- [ ] **Step 1: เขียนเทสต์ที่ล้ม**

ต่อท้าย describe `LIFF bulk budget edit` (หรือสร้าง describe ใหม่ในไฟล์เดียวกัน ใช้ helper เดียวกัน) — ใน boot ของไฟล์เทสต์ `window.history.back` ถูก stub เป็น `vi.fn()` อยู่แล้ว และใช้ `new PopStateEvent('popstate', { state: null })` จำลองปุ่มของเครื่อง:

```js
describe('LIFF nested budget sub pages and the back button', () => {
  const pressDeviceBack = () => window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
  const openBulkPage = async () => {
    await openBudgets();
    byId('budget-all-open').click();
    await settle();
    byId('budget-all-bulk-open').click();
    await settle();
  };

  it('adds only one history entry for the whole chain of sub pages', async () => {
    await openBudgets();
    const push = vi.spyOn(window.history, 'pushState');

    byId('budget-all-open').click();
    await settle();
    byId('budget-all-bulk-open').click();
    await settle();

    expect(push).toHaveBeenCalledTimes(1);
    push.mockRestore();
  });

  it('goes back to the see-all page with the in-page back button without using history', async () => {
    await openBulkPage();

    byId('page-back').click();

    expect(byId('panel-budget-all').hidden).toBe(false);
    expect(byId('panel-budget-bulk').hidden).toBe(true);
    expect(byId('page-title').textContent).toBe('ดูงบทุกหมวด');
    expect(byId('page-back').getAttribute('aria-label')).toBe('กลับไปหน้างบ');
    expect(window.history.back).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(byId('budget-all-bulk-open'));
  });

  it('leaves the sub pages from the see-all page and consumes the history entry', async () => {
    await openBulkPage();
    byId('page-back').click();

    byId('page-back').click();

    expect(byId('panel-budgets').hidden).toBe(false);
    expect(byId('bottom-nav').hidden).toBe(false);
    expect(window.history.back).toHaveBeenCalledTimes(1);
  });

  it('shows the see-all page for the device back button and keeps one entry for the next press', async () => {
    await openBulkPage();
    const push = vi.spyOn(window.history, 'pushState');

    pressDeviceBack();

    expect(byId('panel-budget-all').hidden).toBe(false);
    expect(byId('panel-budget-bulk').hidden).toBe(true);
    expect(push).toHaveBeenCalledTimes(1);

    pressDeviceBack();

    expect(byId('panel-budgets').hidden).toBe(false);
    expect(byId('bottom-nav').hidden).toBe(false);
    push.mockRestore();
  });

  it('still leaves straight to the budgets tab from a sub page without a parent', async () => {
    await openBudgets();
    byId('budget-all-open').click();
    await settle();

    pressDeviceBack();

    expect(byId('panel-budgets').hidden).toBe(false);
    expect(byId('bottom-nav').hidden).toBe(false);
  });
});
```

และเปิดเทสต์ `saves each changed category ... goes back to the see-all page` ที่ `it.skip` ไว้ใน Task 2 กลับมาเป็น `it`

- [ ] **Step 2: รันให้เห็นว่าล้ม**

Run: `npx vitest run public/liff/app.dom.test.mjs -t "nested budget sub pages"`
Expected: FAIL (ย้อนจากหน้าแก้หลายหมวดแล้วออกไปแท็บงบ)

- [ ] **Step 3: แก้ `app.mjs`**

1. ในออบเจ็กต์ `BUDGET_BULK_PAGE` (Task 2) เพิ่ม `parent: BUDGETS_ALL_PAGE,` (ต้องประกาศหลัง `BUDGETS_ALL_PAGE`)
2. แก้ `leaveSubPage` ให้รองรับหน้าแม่ และคืนค่า boolean (หาฟังก์ชันด้วยชื่อ แล้วเพิ่มส่วนต้นกับ return ตามนี้ ส่วนที่เหลือคงเดิม):
```js
function leaveSubPage() {
  const page = activeSubPage;
  if (!page) return false;
  if (page.parent) {
    // หน้าลูกกลับไปหน้าแม่ ยังอยู่ในชุดหน้าย่อยเดิมจึงไม่แตะ history
    enterSubPage(page.parent);
    page.returnFocus.focus();
    return false;
  }
  activeSubPage = null;
  subPageEntryPushed = false;
  // ... (บรรทัดเดิมที่เหลือจนถึง page.returnFocus.focus();) ...
  return true;
}
```
3. แก้ `backFromSubPage`:
```js
function backFromSubPage() {
  const entryPushed = subPageEntryPushed;
  // ใช้ history entry ให้หมดเฉพาะตอนออกจากชุดหน้าย่อยจริง
  if (leaveSubPage() && entryPushed) window.history.back();
}
```
4. แก้ listener `popstate`:
```js
window.addEventListener('popstate', (event) => {
  // เทสต์โหลดโมดูลซ้ำบน window เดียวกัน ตัวฟังของรอบเก่าที่หน้าหลุดจาก DOM แล้วต้องไม่ทำอะไร
  if (!els.pageBack.isConnected || !activeSubPage || event.state?.subPage) return;
  if (activeSubPage.parent) {
    // entry ถูกใช้ไปแล้ว จึงเปิดหน้าแม่ใหม่พร้อมเพิ่ม entry ให้การกดย้อนครั้งถัดไปออกจากชุดหน้าย่อย
    const { parent } = activeSubPage;
    activeSubPage = null;
    subPageEntryPushed = false;
    enterSubPage(parent);
    return;
  }
  leaveSubPage();
});
```
5. ตรวจว่าผู้เรียก `leaveSubPage()` อื่นในไฟล์ (ถ้ามี `grep -n "leaveSubPage" public/liff/app.mjs`) ไม่พึ่งค่าที่คืนเปลี่ยนไป

- [ ] **Step 4: รันให้ผ่าน** `npx vitest run public/liff` Expected: PASS ทั้งหมด รวมเทสต์ที่เปิดคืน (`saves each changed category ...`, `lists successes and failures ...`) และเทสต์กลุ่ม `LIFF device back button on sub pages` เดิม
- [ ] **Step 5: ตรวจรวม** `npm test` และ `npx eslint .` Expected: ผ่าน
- [ ] **Step 6: Commit (ถามผู้ใช้ก่อน)** `feat: let nested budget sub pages go back to their parent`

---

### Task 4: เอกสาร และ STATE

**Depends on:** Task 3

**Files:**
- Modify: `SPEC.md`, `work-memory/STATE.md`

- [ ] **Step 1: SPEC.md** หัวข้อ 5 งบประมาณ เพิ่ม (รายการละไม่เกิน 2 บรรทัด): `แก้งบหลายหมวด: ปรับทีละ 500 ได้ทุกหมวด (รวมหมวดที่ยังไม่ตั้ง) บันทึกทีละหมวดด้วย PUT เดิม รายงานผลสำเร็จ/ไม่สำเร็จและลองซ้ำเฉพาะที่พลาด`; หัวข้อ 3 เว็บ LIFF เพิ่ม: `หน้าย่อยซ้อนกันได้ (parent) ปุ่มย้อนกลับกลับหน้าแม่ก่อนออกจากชุดหน้าย่อย`
- [ ] **Step 2: STATE.md** เพิ่มใน Done "งบเฟส 3 แก้หลายหมวด + หน้าย่อยซ้อน" พร้อมจำนวนเทสต์ ใน Next ระบุสิ่งที่ผู้ใช้ต้องลองบนมือถือ (ปุ่มย้อนกลับซ้อน, บันทึกบางส่วนล้มเหลว) และสิ่งที่ยังไม่ได้ทำโดยตั้งใจ: ไม่ถามยืนยันเมื่อออกจากหน้าแก้หลายหมวดที่ยังไม่บันทึก, ไม่รองรับเลิกตั้งงบจากหน้านี้
- [ ] **Step 3: ตรวจรวม** `npm test` และ `npx eslint .` Expected: ผ่าน (ถ้า `scripts/try-parse.test.js` ล้มเฉพาะตอนรันรวม ให้รัน `npx vitest run scripts` เดี่ยวแล้วรายงานตามจริง)
- [ ] **Step 4: Commit (ถามผู้ใช้ก่อน)** `docs: record the budget redesign phase 3`

## Self-Review (ผู้เขียนแผนตรวจแล้ว)

- Spec coverage: บอร์ด 14 (หน้าแก้หลายหมวด), 15 (ผลบันทึก) อยู่ใน Task 2, พฤติกรรมย้อนกลับซ้อน Task 3, ฟังก์ชัน draft Task 1
- ชื่อข้ามไฟล์ตรงกัน: `createDraft/stepDraft/entryView/draftSummary/saveDraft/applyResults/isDirty` (Task 1 → Task 2), `createBudgetBulkPanel({ ..., setBudget, onSaved, onDone })` ↔ ค่าที่ส่งจาก `app.mjs`, `onBulk({ first })` ↔ `openBudgetsBulk({ first })`, field `parent` ↔ `leaveSubPage`/popstate
- จุดเสี่ยง: Task 2 มีเทสต์หนึ่งตัวที่ต้อง `it.skip` ไว้จนกว่า Task 3 เสร็จ และ**ต้องส่งออก (merge/push) Task 2 กับ Task 3 พร้อมกัน** เพราะก่อน Task 3 ปุ่มย้อนกลับจากหน้าแก้หลายหมวดออกไปแท็บงบและข้อความสถานะไปอยู่ในหน้าที่ซ่อน (ระบุไว้แล้ว), การแก้ popstate/`leaveSubPage` กระทบกลุ่มเทสต์ปุ่มย้อนกลับเดิม (ระบุให้รันซ้ำ), และ dialog ผลลัพธ์ใช้ `icon-check` ที่เฟส 1 เพิ่มไว้

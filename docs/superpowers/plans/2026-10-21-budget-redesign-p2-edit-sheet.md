# Budget Redesign Phase 2: Per-Category Edit Sheet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** แทน dialog แก้งบเดิม (`#budget-editor`) ด้วยแผ่นล่างตามดีไซน์: เห็นก่อน/หลัง % ทันที ปรับทีละ 500 หรือกดปุ่มลัด ตั้งงบหมวดใหม่ได้ มีสถานะบันทึกไม่สำเร็จ และมีกล่องยืนยันก่อนเลิกตั้งงบ

**Architecture:** ตรรกะคำนวณ (แปลงตัวเลข ขยับทีละ 500 พรีวิว ปุ่มลัด) อยู่ใน `budget-edit.mjs` เทสต์ได้ไม่ต้องมี DOM ส่วนการวาดและสถานะ (busy/error/confirm) อยู่ใน `budget-sheet.mjs` ซึ่งไม่รู้จัก API มันรับ `onSubmit({ row, amount, month })` ที่คืน `{ ok: true } | { ok: false, status }` ตามแบบ panel ตัวอื่น `app.mjs` เป็นคนเรียก `api.setBudget` และโหลดงบใหม่ ไม่แตะ `src/`

**Tech Stack:** vanilla ES modules, `<dialog>` ที่มีอยู่, vitest + jsdom

**Prerequisite:** เฟส 1 (`2026-10-21-budget-redesign-p1-main-and-list.md`) ถูก merge แล้ว โมดูล `budgets-format.mjs`, `budgets-panel.mjs`, `budgets-all-panel.mjs` มีอยู่ และ `openBudgetEditor(row)` ใน `app.mjs` เป็นจุดเดียวที่ทุกหน้าเรียกเมื่อแตะหมวด

**Design reference:** artifact https://claude.ai/artifact/PYNrUiDyTF7jWns14bDosx บอร์ด 10-13 (ลิงก์ส่วนตัวของผู้ใช้)

## Global Constraints

- ข้อความ UI เป็นภาษาไทย ชื่อตัวแปร/ฟังก์ชัน/log เป็นภาษาอังกฤษ ห้ามใช้ emoji ในโค้ด คอมเมนต์ log และ commit message
- คอมเมนต์ในโค้ดเป็นภาษาไทย บรรทัดเดียว อธิบาย "ทำไม" เท่านั้น
- เขียนเทสต์ก่อนโค้ดเสมอ (รันให้เห็นว่าล้มก่อนแก้) แล้วรัน `npm test` และ `npx eslint .` ให้ผ่านก่อนรายงานว่าเสร็จ
- ห้ามแก้ `src/` ห้ามเริ่ม/รีสตาร์ท/ปิด dev server หรือ API
- ห้าม `git commit` หรือ `git push` จนกว่าผู้ใช้สั่ง ขั้นตอน Commit คือ "ถามผู้ใช้ก่อน"
- ข้อความจากผู้ใช้ (ชื่อหมวด) ใส่ด้วย `textContent` เท่านั้น
- จำนวนเงินต่องบ: ตั้งได้ 0.01 ถึง 10,000,000 บาท ทศนิยมไม่เกิน 2 ตำแหน่ง (ตรงกับ `isValidAmount` ฝั่ง server และ `describeBudgetFailure(400)`) ปุ่ม − / + ขยับทีละ 500
- งบมีผลตั้งแต่เดือนที่เลือกเป็นต้นไป ข้อความ scope ต้องบอกเดือนเสมอ
- ปุ่มและพื้นที่แตะสูงอย่างน้อย 44px (ปุ่ม − / + 52px ตามดีไซน์)
- ระหว่างรอ request ต้องกัน Esc/ปิด dialog (พฤติกรรมเดิมของ `#budget-editor` ที่ต้องคงไว้)
- ข้อความ error ต้องเรียก `revealError` (`reveal.mjs`) ให้เลื่อนเห็นเมื่อคีย์บอร์ดเปิด
- ห้ามแตะ `.dialog-close` ของ dialog อื่น

## Design Decisions (ช่องว่างที่ดีไซน์ไม่ได้ระบุ แผนนี้ตัดสินให้แล้ว)

1. ชื่อหัวแผ่น: หมวดที่มีงบ = ชื่อหมวดล้วน, หมวดที่ยังไม่ตั้ง = `ตั้งงบ <ชื่อหมวด>` (ตามบอร์ด 10-11)
2. ช่องจำนวนเงินเป็น `<input inputmode="decimal">` จริง (พิมพ์ได้ และมีปุ่ม − / + ข้างๆ) แสดงตัวเลขมีคอมมาเมื่อขยับด้วยปุ่ม/ปุ่มลัด และรับคอมมาตอนพิมพ์
3. ปุ่ม − ปิดใช้งานเมื่อลดแล้วต่ำกว่า 0.01 หรือช่องว่าง
4. ปุ่มลัดของหมวดที่มีงบ: เท่าที่ใช้จริง / เพิ่ม 10% / เพิ่ม 20% (ปัดขึ้นทีละ 50) ของหมวดที่ยังไม่ตั้ง: เท่าที่ใช้จริง / ปัดขึ้นเป็นหลักร้อย / ปัดขึ้นเป็นหลักพัน ตัดค่าซ้ำและค่าที่เท่างบเดิมออก ถ้ายอดใช้เป็น 0 หมวดที่ยังไม่ตั้งงบจะไม่มีปุ่มลัดเลย ส่วนหมวดที่มีงบยังมีปุ่มเพิ่ม 10% / 20% (ตัดเฉพาะปุ่ม "เท่าที่ใช้จริง")
5. บันทึกไม่สำเร็จ: ค่าในช่องคงเดิม ขอบช่องเป็นสีแดง ปุ่มบันทึกเปลี่ยนข้อความเป็น "ลองบันทึกอีกครั้ง" ข้อความรายละเอียด: ถ้าเป็นข้อผิดพลาดทั่วไป บอกว่าตัวเลขยังอยู่ในช่อง ถ้าเป็น 400/401/404 ใช้ข้อความจาก `describeBudgetFailure` เดิม
6. กรอกค่าว่างหรือไม่ถูกต้องแล้วกดบันทึก: แสดง error แบบเดียวกัน (หัว "จำนวนเงินไม่ถูกต้อง") โดยไม่เรียก API
7. เลิกตั้งงบ: ต้องผ่านกล่องยืนยันเสมอ ถ้าเลิกไม่สำเร็จ ข้อผิดพลาดแสดงในแผ่นแก้งบ (กล่องยืนยันปิดก่อนส่ง request)
8. ข้อความเฉพาะของแผ่นตั้งงบใหม่: `มีผลตั้งแต่เดือน <เดือน> เป็นต้นไป · เฮียจะเตือนเมื่อใช้ถึง 80%`

## File Structure

| ไฟล์ | หน้าที่ |
|---|---|
| `public/liff/budget-edit.mjs` (สร้าง) | แปลง/ตรวจจำนวนเงิน ขยับทีละ 500 พรีวิวก่อน-หลัง ปุ่มลัด |
| `public/liff/budget-edit.test.mjs` (สร้าง) | เทสต์ของโมดูลข้างบน |
| `public/liff/budget-sheet.mjs` (สร้าง) | วาดและควบคุมแผ่นล่าง + กล่องยืนยัน |
| `public/liff/index.html` (แก้) | แทน `<dialog id="budget-editor">` และเพิ่ม `<dialog id="budget-remove-confirm">` |
| `public/liff/style.css` (แก้) | CSS แผ่นล่าง พรีวิว ปุ่ม − / + ปุ่มลัด กล่องยืนยัน |
| `public/liff/app.mjs` (แก้) | ลบโค้ด dialog เดิม ใช้ `createBudgetSheet` |
| `public/liff/app.dom.test.mjs` (แก้) | เทสต์แผ่นล่าง และแก้เทสต์เฟส 1/เก่าที่อ้างหัว `งบ <ชื่อหมวด>` และโครงปุ่มเดิม |
| `public/liff/style.test.mjs` (แก้) | เทสต์ CSS แผ่นล่าง |
| `SPEC.md`, `work-memory/STATE.md` (แก้) | เอกสาร |

---

### Task 1: โมดูลคำนวณ `budget-edit.mjs`

**Depends on:** none

**Files:**
- Create: `public/liff/budget-edit.mjs`
- Test: `public/liff/budget-edit.test.mjs`

**Interfaces:**
- Consumes: `describeDiff(row)` และ `levelOfPercent(percent)` จาก `./budgets-format.mjs`
- Produces:
  - `MIN_BUDGET = 0.01`, `MAX_BUDGET = 10000000`, `BUDGET_STEP = 500`
  - `parseBudgetAmount(text: string): number | null`
  - `stepBudget(current: number | null, direction: 1 | -1, step = BUDGET_STEP): number | null`
  - `previewBudget(row, amount: number | null): { before: Snapshot | null, after: Snapshot | null }` โดย `Snapshot = { percent, level, diffText }`
  - `quickChips(row): { label: string, value: number }[]`

- [ ] **Step 1: เขียนเทสต์ที่ล้ม**

```js
import { describe, expect, it } from 'vitest';
import { BUDGET_STEP, MAX_BUDGET, parseBudgetAmount, previewBudget, quickChips, stepBudget } from './budget-edit.mjs';

describe('parseBudgetAmount', () => {
  it('accepts plain numbers, commas and two decimals', () => {
    expect(parseBudgetAmount('3500')).toBe(3500);
    expect(parseBudgetAmount('3,500')).toBe(3500);
    expect(parseBudgetAmount(' 1,234.5 ')).toBe(1234.5);
    expect(parseBudgetAmount('0.01')).toBe(0.01);
  });

  it('rejects empty, zero, negative, text and too many decimals', () => {
    for (const bad of ['', '   ', '0', '0.00', '-5', 'abc', '12abc', '1.234', '1.', '.5']) {
      expect(parseBudgetAmount(bad), bad).toBeNull();
    }
  });

  it('rejects amounts above the limit and accepts the limit itself', () => {
    expect(parseBudgetAmount('10000000')).toBe(MAX_BUDGET);
    expect(parseBudgetAmount('10000000.01')).toBeNull();
  });
});

describe('stepBudget', () => {
  it('adds and removes 500', () => {
    expect(stepBudget(3000, 1)).toBe(3500);
    expect(stepBudget(3000, -1)).toBe(2500);
  });

  it('starts from the step when the field is empty', () => {
    expect(stepBudget(null, 1)).toBe(BUDGET_STEP);
  });

  it('does not go below the smallest budget', () => {
    expect(stepBudget(500, -1)).toBe(500);
    expect(stepBudget(300, -1)).toBe(300);
    expect(stepBudget(null, -1)).toBeNull();
  });

  it('caps at the limit', () => {
    expect(stepBudget(9999800, 1)).toBe(MAX_BUDGET);
  });

  it('keeps decimals exact', () => {
    expect(stepBudget(1000.1, 1)).toBe(1500.1);
  });
});

describe('previewBudget', () => {
  const row = { categoryId: 'a', category: 'ช้อปปิ้ง', budget: 3000, spent: 3450 };

  it('shows before and after for a changed amount', () => {
    expect(previewBudget(row, 3500)).toEqual({
      before: { percent: 115, level: 'over', diffText: 'เกิน 450' },
      after: { percent: 98, level: 'warn', diffText: 'เหลือ 50' },
    });
  });

  it('has no before for a category without a budget', () => {
    const unset = { categoryId: 'b', category: 'บันเทิง', budget: null, spent: 620 };

    expect(previewBudget(unset, 1000)).toEqual({
      before: null,
      after: { percent: 62, level: 'ok', diffText: 'เหลือ 380' },
    });
  });

  it('has no after while the amount is not valid', () => {
    expect(previewBudget(row, null).after).toBeNull();
  });
});

describe('quickChips', () => {
  it('offers spent, plus 10 percent and plus 20 percent for a category with a budget', () => {
    const chips = quickChips({ budget: 3000, spent: 3450 });

    expect(chips).toEqual([
      { label: 'เท่าที่ใช้จริง', value: 3450 },
      { label: 'เพิ่ม 10%', value: 3300 },
      { label: 'เพิ่ม 20%', value: 3600 },
    ]);
  });

  it('offers spent and rounded-up values for a category without a budget', () => {
    expect(quickChips({ budget: null, spent: 620 })).toEqual([
      { label: 'เท่าที่ใช้จริง', value: 620 },
      { label: 'ปัดขึ้น', value: 700 },
      { label: 'ปัดขึ้น', value: 1000 },
    ]);
  });

  it('drops duplicates and values equal to the current budget', () => {
    expect(quickChips({ budget: null, spent: 1000 })).toEqual([{ label: 'เท่าที่ใช้จริง', value: 1000 }]);
    expect(quickChips({ budget: 3450, spent: 3450 }).map((chip) => chip.label)).toEqual(['เพิ่ม 10%', 'เพิ่ม 20%']);
  });

  it('offers nothing when nothing has been spent', () => {
    expect(quickChips({ budget: null, spent: 0 })).toEqual([]);
  });

  it('keeps the percent chips for a category with a budget even when nothing has been spent', () => {
    expect(quickChips({ budget: 3000, spent: 0 }).map((chip) => chip.label)).toEqual(['เพิ่ม 10%', 'เพิ่ม 20%']);
  });

  it('rounds the spent amount up to a whole baht', () => {
    expect(quickChips({ budget: null, spent: 620.5 })[0].value).toBe(621);
  });
});
```

- [ ] **Step 2: รันให้ล้ม**

Run: `npx vitest run public/liff/budget-edit.test.mjs`
Expected: FAIL (ไม่พบโมดูล)

- [ ] **Step 3: เขียนโค้ดขั้นต่ำ**

```js
import { describeDiff, levelOfPercent } from './budgets-format.mjs';

export const MIN_BUDGET = 0.01;
export const MAX_BUDGET = 10000000;
export const BUDGET_STEP = 500;

const toSatang = (value) => Math.round(value * 100);

export function parseBudgetAmount(text) {
  const cleaned = String(text).replace(/[,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return value >= MIN_BUDGET && value <= MAX_BUDGET ? value : null;
}

export function stepBudget(current, direction, step = BUDGET_STEP) {
  const base = current ?? 0;
  if (direction > 0) return Math.min((toSatang(base) + toSatang(step)) / 100, MAX_BUDGET);
  const next = (toSatang(base) - toSatang(step)) / 100;
  // ลดแล้วต่ำกว่างบต่ำสุดให้คงค่าเดิม ไม่ให้ช่องกลายเป็น 0 หรือติดลบ
  return next >= MIN_BUDGET ? next : current;
}

function snapshot(budget, spent) {
  if (budget === null) return null;
  const percent = Math.floor((toSatang(spent) * 100) / toSatang(budget));
  return { percent, level: levelOfPercent(percent), diffText: describeDiff({ budget, spent }) };
}

export function previewBudget(row, amount) {
  return { before: snapshot(row.budget, row.spent), after: amount === null ? null : snapshot(amount, row.spent) };
}

const roundUp = (value, unit) => Math.ceil(value / unit) * unit;
// คิดเป็นสตางค์ก่อน กัน 3000*1.1 ได้ 3300.0000000000005 แล้วปัดขึ้นเกิน
const withPercent = (value, percent) => Math.round(value * (100 + percent)) / 100;

export function quickChips(row) {
  const candidates = row.budget === null
    ? [
      ['เท่าที่ใช้จริง', Math.ceil(row.spent)],
      ['ปัดขึ้น', roundUp(row.spent, 100)],
      ['ปัดขึ้น', roundUp(row.spent, 1000)],
    ]
    : [
      ['เท่าที่ใช้จริง', Math.ceil(row.spent)],
      ['เพิ่ม 10%', roundUp(withPercent(row.budget, 10), 50)],
      ['เพิ่ม 20%', roundUp(withPercent(row.budget, 20), 50)],
    ];
  const seen = new Set();
  return candidates
    .filter(([, value]) => value >= MIN_BUDGET && value <= MAX_BUDGET && value !== row.budget)
    .filter(([, value]) => !seen.has(value) && seen.add(value))
    .map(([label, value]) => ({ label, value }));
}
```

- [ ] **Step 4: รันให้ผ่าน** `npx vitest run public/liff/budget-edit.test.mjs` Expected: PASS ทุกเทสต์
- [ ] **Step 5: Lint** `npx eslint public/liff/budget-edit.mjs public/liff/budget-edit.test.mjs` Expected: ไม่มี error
- [ ] **Step 6: Commit (ถามผู้ใช้ก่อน)** `feat: add pure helpers for editing a budget`

---

### Task 2: แผ่นแก้งบ markup, CSS, `budget-sheet.mjs` และต่อสาย

**Depends on:** Task 1

**Files:**
- Create: `public/liff/budget-sheet.mjs`
- Modify: `public/liff/index.html` (แทนที่ `<dialog id="budget-editor" ...>` ทั้งบล็อก)
- Modify: `public/liff/style.css` (ก่อนแก้ ให้เปิดกฎ `dialog` พื้นฐานและ `.dialog-close` ที่มีอยู่เพื่อไม่ให้ซ้ำ)
- Modify: `public/liff/style.test.mjs`
- Modify: `public/liff/app.mjs`
- Test: `public/liff/app.dom.test.mjs`

**Interfaces:**
- Consumes: `parseBudgetAmount, stepBudget, previewBudget, quickChips, BUDGET_STEP` (Task 1), `barGeometry, formatNumber` (`budgets-format.mjs`), `describeBudgetFailure, formatMonthLabel` (`format.mjs`), `revealError` (`reveal.mjs`), `badgeFor(name, 'expense')` และ `api.setBudget(categoryId, { month, amount })` ใน `app.mjs`
- Produces: `createBudgetSheet({ doc, els, badgeFor, getMonth, onSubmit, onSaved }): { open(row), close() }` โดย `onSubmit({ row, amount, month }): Promise<{ ok: true } | { ok: false, status?: number }>` ทำแค่ส่ง PUT และ `amount` เป็น `null` เมื่อเลิกตั้งงบ ส่วน `onSaved({ row }): Promise` เรียก**หลัง**แผ่นปิดแล้ว (app โหลดงบใหม่และคืน focus ให้หมวดนั้น)
  - `els` keys: `dialog, form, badge, title, sub, previewBefore, previewAfter, amount, minus, plus, chips, scope, busy, error, errorTitle, errorText, remove, submit, close, confirm, confirmTitle, confirmBody, confirmCancel, confirmOk`

**Browser check:**
- Preconditions: ผู้ใช้เปิดแอปเองผ่าน LINE ด้วยบัญชีที่มีหมวดที่เกินงบอย่างน้อย 1 หมวด และมีหมวดที่ยังไม่ตั้งงบอย่างน้อย 1 หมวด agent ห้ามสตาร์ท service
- Base URL: ลิงก์ LIFF

| # | Action | Expected |
|---|---|---|
| 1 | แท็บ งบ แตะแท่งหมวดที่เกินงบ | แผ่นเลื่อนขึ้นจากล่างจอ หัวแผ่นเป็นชื่อหมวด บรรทัดรอง "ใช้ไปเดือนนี้ ... บาท · งบเดิม ..." มีกรอบเปรียบเทียบ "ตอนนี้ 115% เกิน ..." กับ "ถ้างบ ..." |
| 2 | กดปุ่ม + 1 ครั้ง | ช่องเพิ่มขึ้น 500 และ "ถ้างบ ..." เปลี่ยนตัวเลข % ทันที |
| 3 | กดปุ่มลัด "เท่าที่ใช้จริง" | ช่องเป็นยอดที่ใช้จริง % ฝั่งหลังเป็น 100% |
| 4 | กด "บันทึก" | แผ่นปิด หน้างบโหลดใหม่ แท่งของหมวดนั้นเปลี่ยนตามงบใหม่ |
| 5 | แตะหมวดที่ยังไม่ตั้งงบ (จาก "ดูทั้งหมด" > ไม่มีงบ) | หัวแผ่น "ตั้งงบ <ชื่อหมวด>" ฝั่งซ้ายของกรอบเปรียบเทียบเป็นกรอบเส้นประ "ไม่มีงบ" ไม่มีปุ่ม "ไม่ตั้งงบ" ปุ่มหลักเขียนว่า "ตั้งงบ" |
| 6 | เปิดแผ่นของหมวดที่มีงบ แล้วกด "ไม่ตั้งงบ" | กล่องยืนยัน "เลิกตั้งงบ <ชื่อหมวด> ใช่ไหม" บอกจำนวนงบและเดือน |
| 7 | กด "ไม่ลบ" | กล่องยืนยันปิด แผ่นแก้งบยังอยู่ ค่าในช่องไม่เปลี่ยน |
| 8 | ปิดเน็ตแล้วกด "บันทึก" | กรอบแดง "บันทึกงบไม่สำเร็จ" ตัวเลขยังอยู่ในช่อง ปุ่มเป็น "ลองบันทึกอีกครั้ง" และแผ่นเลื่อนให้เห็นข้อความ |

- [ ] **Step 1: เขียนเทสต์ DOM ที่ล้ม**

เพิ่มต่อท้าย `public/liff/app.dom.test.mjs` (ใช้ `openBudgets`, `BUDGET_SAMPLE`, `routeFetch`, `settle`, `byId` จากเฟส 1):

```js
describe('LIFF budget edit sheet', () => {
  const openSheetFor = async (categoryId) => {
    await openBudgets();
    byId('budget-risk-bars').querySelector(`[data-category-id="${categoryId}"]`).click();
  };

  it('opens as a sheet with the category name, usage line and before/after preview', async () => {
    await openSheetFor('c-shop');

    expect(byId('budget-editor').hasAttribute('open')).toBe(true);
    expect(byId('budget-title').textContent).toBe('ช้อปปิ้ง');
    expect(byId('budget-sheet-sub').textContent).toBe('ใช้ไปเดือนนี้ 3,450 บาท · งบเดิม 3,000');
    expect(byId('budget-amount').value).toBe('3,000');
    expect(byId('budget-preview-before').textContent).toContain('115%');
    expect(byId('budget-preview-before').textContent).toContain('เกิน 450');
    expect(byId('budget-scope').textContent).toBe('มีผลตั้งแต่เดือน 10/2026 เป็นต้นไป');
    expect(byId('budget-remove').hidden).toBe(false);
    expect(byId('budget-submit').textContent).toBe('บันทึก');
  });

  it('steps the amount by 500 and updates the after preview', async () => {
    await openSheetFor('c-shop');

    byId('budget-plus').click();

    expect(byId('budget-amount').value).toBe('3,500');
    expect(byId('budget-preview-after').textContent).toContain('98%');
    expect(byId('budget-preview-after').textContent).toContain('เหลือ 50');
    expect(byId('budget-preview-after').textContent).toContain('ถ้างบ 3,500');

    byId('budget-minus').click();
    byId('budget-minus').click();

    expect(byId('budget-amount').value).toBe('2,500');
  });

  it('updates the preview while typing and disables minus for an empty field', async () => {
    await openSheetFor('c-shop');

    byId('budget-amount').value = '';
    byId('budget-amount').dispatchEvent(new Event('input'));

    expect(byId('budget-minus').disabled).toBe(true);
    expect(byId('budget-preview-after').textContent).toContain('ใส่จำนวนเงิน');

    byId('budget-amount').value = '4000';
    byId('budget-amount').dispatchEvent(new Event('input'));

    expect(byId('budget-preview-after').textContent).toContain('86%');
  });

  it('fills the field from a quick chip', async () => {
    await openSheetFor('c-shop');
    const chips = [...byId('budget-chips').querySelectorAll('button')];

    expect(chips.map((chip) => chip.textContent.replace(/\s+/g, ' ').trim())).toEqual([
      'เท่าที่ใช้จริง 3,450', 'เพิ่ม 10% 3,300', 'เพิ่ม 20% 3,600',
    ]);

    chips[0].click();

    expect(byId('budget-amount').value).toBe('3,450');
    expect(byId('budget-preview-after').textContent).toContain('100%');
  });

  it('saves the amount, closes the sheet and reloads the budgets', async () => {
    await openSheetFor('c-shop');
    const calls = routeFetch((method, path) => (method === 'PUT' && path.startsWith('/api/budgets/') ? {} : undefined));
    byId('budget-plus').click();

    byId('budget-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();

    expect(calls).toContain('PUT /api/budgets/c-shop');
    expect(calls).toContain('GET /api/budgets');
    expect(byId('budget-editor').hasAttribute('open')).toBe(false);
  });

  it('closes the sheet before it reloads the budgets so focus can return to the column', async () => {
    await openSheetFor('c-shop');
    let openDuringReload = null;
    routeFetch((method, path) => {
      if (method === 'GET' && path === '/api/budgets') openDuringReload = byId('budget-editor').hasAttribute('open');
      return method === 'PUT' ? {} : undefined;
    });

    byId('budget-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();

    expect(openDuringReload).toBe(false);
  });

  it('does not call the API for an empty amount and says the amount is not valid', async () => {
    await openSheetFor('c-shop');
    const calls = routeFetch(() => undefined);
    byId('budget-amount').value = '';

    byId('budget-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();

    expect(calls.filter((call) => call.startsWith('PUT'))).toHaveLength(0);
    expect(byId('budget-error').hidden).toBe(false);
    expect(byId('budget-error-title').textContent).toBe('จำนวนเงินไม่ถูกต้อง');
  });

  it('keeps the amount and offers a retry when saving fails', async () => {
    await openSheetFor('c-shop');
    routeFetch((method) => (method === 'PUT' ? { status: 500 } : undefined));
    byId('budget-plus').click();

    byId('budget-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();

    expect(byId('budget-editor').hasAttribute('open')).toBe(true);
    expect(byId('budget-error').hidden).toBe(false);
    expect(byId('budget-error-title').textContent).toBe('บันทึกงบไม่สำเร็จ');
    expect(byId('budget-error-text').textContent).toBe('ตัวเลข 3,500 ยังอยู่ในช่อง ลองบันทึกอีกครั้งได้เลย');
    expect(byId('budget-amount').value).toBe('3,500');
    expect(byId('budget-amount').getAttribute('aria-invalid')).toBe('true');
    expect(byId('budget-submit').textContent).toBe('ลองบันทึกอีกครั้ง');
    expect(byId('budget-submit').disabled).toBe(false);
  });

  it('uses the server reason for 400 and 404', async () => {
    await openSheetFor('c-shop');
    routeFetch((method) => (method === 'PUT' ? { status: 404 } : undefined));

    byId('budget-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();

    expect(byId('budget-error-text').textContent).toBe('ไม่พบหมวดนี้แล้ว');
  });

  it('clears the error when the amount changes', async () => {
    await openSheetFor('c-shop');
    routeFetch((method) => (method === 'PUT' ? { status: 500 } : undefined));
    byId('budget-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();

    byId('budget-plus').click();

    expect(byId('budget-error').hidden).toBe(true);
    expect(byId('budget-amount').hasAttribute('aria-invalid')).toBe(false);
    expect(byId('budget-submit').textContent).toBe('บันทึก');
  });

  it('opens the set-budget sheet for a category without a budget', async () => {
    await openBudgets();
    byId('budget-unset-open').click();
    await settle();
    byId('budget-all-list').querySelector('.budget-all-set').click();

    expect(byId('budget-title').textContent).toBe('ตั้งงบ บันเทิง');
    expect(byId('budget-sheet-sub').textContent).toBe('ยังไม่เคยตั้งงบ · ใช้ไปเดือนนี้ 620 บาท');
    expect(byId('budget-amount').value).toBe('');
    expect(byId('budget-remove').hidden).toBe(true);
    expect(byId('budget-submit').textContent).toBe('ตั้งงบ');
    expect(byId('budget-preview-before').textContent).toContain('ไม่มีงบ');
    expect(byId('budget-scope').textContent).toBe('มีผลตั้งแต่เดือน 10/2026 เป็นต้นไป · เฮียจะเตือนเมื่อใช้ถึง 80%');
    expect([...byId('budget-chips').querySelectorAll('button')].map((chip) => chip.textContent.replace(/\s+/g, ' ').trim())).toEqual([
      'เท่าที่ใช้จริง 620', 'ปัดขึ้น 700', 'ปัดขึ้น 1,000',
    ]);
  });

  it('asks before removing a budget and keeps the sheet when the user declines', async () => {
    await openSheetFor('c-shop');

    byId('budget-remove').click();

    expect(byId('budget-remove-confirm').hasAttribute('open')).toBe(true);
    expect(byId('budget-confirm-title').textContent).toBe('เลิกตั้งงบ ช้อปปิ้ง ใช่ไหม');
    expect(byId('budget-confirm-body').textContent).toContain('3,000');
    expect(byId('budget-confirm-body').textContent).toContain('10/2026');

    byId('budget-confirm-cancel').click();

    expect(byId('budget-remove-confirm').hasAttribute('open')).toBe(false);
    expect(byId('budget-editor').hasAttribute('open')).toBe(true);
    expect(byId('budget-amount').value).toBe('3,000');
  });

  it('removes the budget after confirmation with a null amount', async () => {
    await openSheetFor('c-shop');
    const requests = [];
    vi.stubGlobal('fetch', async (url, options = {}) => {
      requests.push({ url: String(url), method: options.method ?? 'GET', body: options.body });
      return { ok: true, status: 200, json: async () => (String(url).includes('/api/budgets') && !options.method ? BUDGET_SAMPLE : {}) };
    });

    byId('budget-remove').click();
    byId('budget-confirm-ok').click();
    await settle();

    const put = requests.find((request) => request.method === 'PUT');
    expect(JSON.parse(put.body)).toEqual({ month: '2026-10', amount: null });
    expect(byId('budget-editor').hasAttribute('open')).toBe(false);
    expect(byId('budget-remove-confirm').hasAttribute('open')).toBe(false);
  });

  it('shows a failed removal inside the edit sheet', async () => {
    await openSheetFor('c-shop');
    routeFetch((method) => (method === 'PUT' ? { status: 500 } : undefined));

    byId('budget-remove').click();
    byId('budget-confirm-ok').click();
    await settle();

    expect(byId('budget-editor').hasAttribute('open')).toBe(true);
    expect(byId('budget-error').hidden).toBe(false);
    expect(byId('budget-error-title').textContent).toBe('เลิกตั้งงบไม่สำเร็จ');
    expect(byId('budget-submit').textContent).toBe('บันทึก');
  });

  it('does not close on Escape while saving', async () => {
    await openSheetFor('c-shop');
    let release;
    vi.stubGlobal('fetch', () => new Promise((resolve) => { release = resolve; }));

    byId('budget-form').dispatchEvent(new Event('submit', { cancelable: true }));
    const cancel = new Event('cancel', { cancelable: true });
    byId('budget-editor').dispatchEvent(cancel);

    expect(cancel.defaultPrevented).toBe(true);
    expect(byId('budget-submit').disabled).toBe(true);
    expect(byId('budget-busy').hidden).toBe(false);
    release({ ok: true, status: 200, json: async () => ({}) });
  });

  it('closes with the X button when not saving', async () => {
    await openSheetFor('c-shop');

    byId('budget-cancel').click();

    expect(byId('budget-editor').hasAttribute('open')).toBe(false);
  });
});
```

แก้เทสต์เดิม/เฟส 1 ที่ผูกกับ dialog เก่า:
  - ทุกที่ที่ยืนยัน `byId('budget-title').textContent` เป็น `'งบ <ชื่อหมวด>'` ของ**หมวดที่มีงบ** ให้เปลี่ยนเป็นชื่อหมวดล้วน (เช่น `'ช้อปปิ้ง'`) ส่วนหมวดที่**ยังไม่ตั้งงบ** ให้เปลี่ยนเป็น `'ตั้งงบ <ชื่อหมวด>'` (เทสต์ `opens the existing budget editor when a column is tapped` ในเฟส 1, เทสต์ใน Task 3 และ Task 4 ของเฟส 1) ค้นด้วย `grep -n "budget-title" public/liff/app.dom.test.mjs`
  - เทสต์ `moves the close button of %s to a labelled X outside the action row` (ตาราง `it.each`): **ลบแถว** `['budget-form', 'budget-cancel', 'budget-remove']` ออก (โครงปุ่มของแผ่นใหม่ถูกตรวจในกลุ่มเทสต์ใหม่แทน)
  - รายการ id ที่ต้องมีใน DOM (ใกล้ `'budgets-loading'` ... `'budgets-error'`) ไม่เกี่ยวกับแผ่น ไม่ต้องแก้
  - เทสต์ที่ใช้ `budget-amount` เป็นช่อง `type=number` (ถ้ามี): ค้น `grep -n "budget-amount" public/liff/app.dom.test.mjs` แล้วปรับให้ตรง (ช่องใหม่เป็น text)

- [ ] **Step 2: รันให้เห็นว่าล้ม**

Run: `npx vitest run public/liff/app.dom.test.mjs -t "budget edit sheet"`
Expected: FAIL (ไม่พบ `budget-sheet-sub` ฯลฯ)

- [ ] **Step 3: markup**

แทนที่บล็อก `<dialog id="budget-editor" aria-labelledby="budget-title"> ... </dialog>` ด้วย:

```html
  <dialog id="budget-editor" class="budget-sheet" aria-labelledby="budget-title">
    <form id="budget-form" novalidate>
      <div class="budget-sheet-grab" aria-hidden="true"></div>
      <div class="budget-sheet-head">
        <span id="budget-sheet-badge" class="budget-sheet-badge"></span>
        <div class="budget-sheet-heading">
          <h2 id="budget-title"></h2>
          <p id="budget-sheet-sub"></p>
        </div>
        <button type="button" id="budget-cancel" class="dialog-close" aria-label="ปิด"><svg class="icon"
            aria-hidden="true" focusable="false">
            <use href="#icon-close"></use>
          </svg></button>
      </div>
      <div class="budget-preview">
        <div id="budget-preview-before" class="budget-preview-side"></div>
        <svg class="icon budget-preview-arrow" aria-hidden="true" focusable="false">
          <use href="#icon-chevron"></use>
        </svg>
        <div id="budget-preview-after" class="budget-preview-side" aria-live="polite"></div>
      </div>
      <div class="budget-sheet-field">
        <label for="budget-amount" class="budget-sheet-label">งบต่อเดือน (บาท)</label>
        <div class="budget-stepper">
          <button type="button" id="budget-minus" aria-label="ลดงบ 500 บาท">−</button>
          <input id="budget-amount" type="text" inputmode="decimal" autocomplete="off" aria-describedby="budget-scope">
          <button type="button" id="budget-plus" aria-label="เพิ่มงบ 500 บาท">+</button>
        </div>
      </div>
      <div id="budget-chips" class="budget-chips"></div>
      <p id="budget-scope" class="confirm-detail"></p>
      <p id="budget-busy" class="confirm-detail" role="status" hidden>กำลังบันทึก...</p>
      <div id="budget-error" class="budget-sheet-error" role="alert" hidden>
        <strong id="budget-error-title"></strong>
        <span id="budget-error-text"></span>
      </div>
      <div class="budget-sheet-actions">
        <button type="button" id="budget-remove" class="budget-remove">ไม่ตั้งงบ</button>
        <button type="submit" id="budget-submit" class="budget-cta">บันทึก</button>
      </div>
    </form>
  </dialog>
  <dialog id="budget-remove-confirm" class="budget-confirm" aria-labelledby="budget-confirm-title">
    <h2 id="budget-confirm-title"></h2>
    <div id="budget-confirm-body" class="budget-confirm-body"></div>
    <div class="budget-confirm-actions">
      <button type="button" id="budget-confirm-cancel">ไม่ลบ</button>
      <button type="button" id="budget-confirm-ok" class="danger">เลิกตั้งงบ</button>
    </div>
  </dialog>
```

(ปุ่ม − ใช้ตัวอักษร U+2212 ไม่ใช่ emoji)

- [ ] **Step 4: CSS**

```css
/* แผ่นแก้งบ: dialog ที่เลื่อนจากล่างจอ */
dialog.budget-sheet { width: 100%; max-width: none; margin: auto 0 0; padding: 10px 20px 24px; border: none; border-radius: var(--radius-sheet) var(--radius-sheet) 0 0; background: var(--surface); box-shadow: 0 -8px 24px rgba(15, 23, 42, 0.25); }
dialog.budget-sheet::backdrop { background: rgba(15, 23, 42, 0.55); }
.budget-sheet-grab { width: 44px; height: 5px; margin: 0 auto; border-radius: 3px; background: var(--outline); opacity: 0.5; }
.budget-sheet-head { display: flex; align-items: center; gap: 12px; margin-top: 10px; }
.budget-sheet-badge { flex: none; display: flex; }
.budget-sheet-badge .cat-badge { width: 44px; height: 44px; }
.budget-sheet-heading { flex: 1; min-width: 0; }
.budget-sheet-heading h2 { margin: 0; font-size: 20px; font-weight: 800; line-height: 1.25; overflow-wrap: anywhere; }
.budget-sheet-heading p { margin: 0; font-size: 13px; color: var(--muted); }
.budget-preview { display: grid; grid-template-columns: minmax(0, 1fr) 28px minmax(0, 1fr); align-items: center; margin-top: 14px; padding: 14px 14px 12px; background: var(--bg); border-radius: 18px; }
.budget-preview-arrow { justify-self: center; width: 24px; height: 24px; color: var(--muted); }
.budget-preview-side { display: flex; align-items: flex-end; gap: 10px; min-width: 0; }
.budget-mini { position: relative; flex: none; width: 36px; border-radius: 9px 9px 3px 3px; overflow: hidden; --budget-h100: 80px; }
.budget-mini-none { height: 80px; box-sizing: border-box; border: 2px dashed var(--outline); border-bottom: none; background: none; }
.budget-preview-caption { display: block; font-size: 11px; color: var(--muted); }
.budget-preview-value { display: block; font-size: 24px; font-weight: 800; line-height: 1.15; color: var(--level-text); font-variant-numeric: tabular-nums; }
.budget-preview-none { display: block; font-size: 17px; font-weight: 800; line-height: 1.25; color: var(--muted); }
.budget-preview-diff { display: block; font-size: 12px; font-weight: 700; color: var(--level-text); }
.budget-sheet-label { display: block; margin-top: 14px; font-size: 14px; font-weight: 700; }
.budget-stepper { display: flex; align-items: center; gap: 8px; margin-top: 6px; }
.budget-stepper button { flex: none; width: 52px; height: 52px; border: 1px solid var(--outline); border-radius: 16px; background: var(--surface); color: var(--text); font: inherit; font-size: 26px; line-height: 1; cursor: pointer; }
.budget-stepper button:disabled { background: var(--disabled-bg); color: var(--muted); border-color: var(--border); }
.budget-stepper input { flex: 1; min-width: 0; min-height: 52px; box-sizing: border-box; padding: 0 8px; border: 2px solid var(--primary); border-radius: 16px; background: var(--surface); font: inherit; font-size: 26px; font-weight: 800; text-align: center; color: var(--text); font-variant-numeric: tabular-nums; }
.budget-stepper input[aria-invalid="true"] { border-color: var(--danger); }
.budget-chips { display: flex; gap: 8px; margin-top: 10px; }
.budget-chips button { flex: 1; min-height: 44px; padding: 4px 6px; border: 1px solid var(--border); border-radius: 14px; background: var(--surface); font: inherit; font-size: 12px; font-weight: 700; line-height: 1.3; color: var(--text); cursor: pointer; }
.budget-chips button b { display: block; font-size: 14px; font-weight: 800; color: var(--primary); }
.budget-sheet-error { display: flex; flex-direction: column; gap: 2px; margin-top: 14px; padding: 12px 14px; background: var(--danger-soft); border: 1.5px solid var(--danger); border-radius: 16px; color: var(--danger-text); }
.budget-sheet-error strong { font-size: 15px; font-weight: 800; }
.budget-sheet-error span { font-size: 13px; }
.budget-sheet-actions { display: flex; gap: 10px; margin-top: 14px; }
.budget-remove { flex: none; min-height: 52px; padding: 0 16px; border: 1.5px solid var(--danger); border-radius: var(--radius-pill); background: var(--surface); color: var(--danger); font: inherit; font-size: 14px; font-weight: 800; cursor: pointer; }
.budget-sheet-actions .budget-cta { flex: 1; margin-top: 0; font-size: 17px; }
dialog.budget-confirm { width: calc(100% - 48px); max-width: 360px; padding: 24px 20px 20px; border: none; border-radius: var(--radius-sheet); background: var(--surface); box-shadow: 0 12px 32px rgba(15, 23, 42, 0.35); }
dialog.budget-confirm::backdrop { background: rgba(15, 23, 42, 0.55); }
dialog.budget-confirm h2 { margin: 0; text-align: center; font-size: 20px; font-weight: 800; line-height: 1.35; }
.budget-confirm-body { margin-top: 10px; padding: 12px 14px; background: var(--bg); border-radius: 16px; font-size: 14px; }
.budget-confirm-body p { margin: 0; }
.budget-confirm-body p + p { margin-top: 4px; color: var(--muted); }
.budget-confirm-actions { display: flex; gap: 10px; margin-top: 18px; }
.budget-confirm-actions button { flex: 1; min-height: 52px; border: 1.5px solid var(--outline); border-radius: var(--radius-pill); background: var(--surface); color: var(--text); font: inherit; font-size: 15px; font-weight: 800; cursor: pointer; }
.budget-confirm-actions .danger { border: none; background: var(--danger); color: var(--on-danger); }
```

เพิ่มกฎเสริมต่อไปนี้ท้ายบล็อก CSS ข้างบน เหตุผล: `#budget-editor { background: var(--bg) }` เดิมใน `style.css` ชนะ `dialog.budget-sheet` เพราะ id เจาะจงกว่า ทำให้กรอบพรีวิวที่ใช้ `--bg` กลืนหาย, `dialog` เดิมมี padding ล่างที่คำนึงถึง safe-area ซึ่ง `dialog.budget-sheet` ทิ้งไป, และ `dialog input` เดิมให้ `margin-top: 4px` ทำให้ช่องไม่กึ่งกลางกับปุ่ม − / +

```css
#budget-editor.budget-sheet { background: var(--surface); padding-bottom: calc(24px + env(safe-area-inset-bottom)); }
.budget-sheet-field { margin-top: 14px; }
.budget-sheet-field .budget-sheet-label { margin-top: 0; }
.budget-stepper input { margin-top: 0; }
```

กฎเดิม `#budget-form > label` (การ์ดขาวมีเงา) ไม่กระทบแล้วเพราะ label ถูกห่อด้วย `.budget-sheet-field` ไม่ใช่ลูกตรงของฟอร์ม จึงไม่ต้องแก้กฎนั้นหรือเทสต์ใน `style.test.mjs` ที่ตรวจมัน และให้เปิดดู `.category-sheet` (bottom sheet ที่มีอยู่แล้วใน `index.html`) ก่อนเขียน CSS เพื่อใช้รูปแบบเดียวกัน

ตรวจว่า `--danger-soft`, `--danger-text`, `--level-text` ถูกเพิ่มแล้วใน Task 4 ของเฟส 1 (ถ้าเฟส 1 ยังไม่ได้ merge ให้หยุดและรายงาน) และกฎ `dialog` เดิมที่ตั้ง `margin`/`max-width` อาจชนกับ `dialog.budget-sheet` ให้ดูว่า selector ของเราเจาะจงกว่าและปรับ `max-height: 92dvh; overflow-y: auto` ตามกฎ dialog เดิม

เทสต์ CSS ใน `style.test.mjs`:

```js
describe('style.css budget sheet', () => {
  it('anchors the sheet to the bottom with rounded top corners', () => {
    const rule = declarations('dialog.budget-sheet');

    expect(rule).toMatch(/margin:\s*auto 0 0/);
    expect(rule).toMatch(/border-radius:\s*var\(--radius-sheet\) var\(--radius-sheet\) 0 0/);
  });

  it('gives the stepper buttons a 52px target', () => {
    expect(declarations('.budget-stepper button')).toMatch(/width:\s*52px/);
    expect(declarations('.budget-stepper button')).toMatch(/height:\s*52px/);
  });

  it('clips the preview mini bar into one rounded shape like the page bars', () => {
    expect(declarations('.budget-mini')).toMatch(/overflow:\s*hidden/);
  });
});
```

- [ ] **Step 5: เขียน `budget-sheet.mjs`**

```js
import { barGeometry, formatNumber } from './budgets-format.mjs';
import { BUDGET_STEP, parseBudgetAmount, previewBudget, quickChips, stepBudget } from './budget-edit.mjs';
import { describeBudgetFailure } from './format.mjs';
import { formatMonthLabel } from './format.mjs';
import { revealError } from './reveal.mjs';

const PREVIEW_H100 = 80;
const GENERIC_FAILURE_TITLE = 'บันทึกงบไม่สำเร็จ';
const INVALID_TITLE = 'จำนวนเงินไม่ถูกต้อง';
const SAVE_LABEL = 'บันทึก';
const NEW_LABEL = 'ตั้งงบ';
const RETRY_LABEL = 'ลองบันทึกอีกครั้ง';

function node(doc, tag, className, text) {
  const el = doc.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

export function createBudgetSheet({ doc, els, badgeFor, getMonth, onSubmit, onSaved }) {
  let row = null;
  let month = null;
  let busy = false;

  const idleLabel = () => (row && row.budget === null ? NEW_LABEL : SAVE_LABEL);

  function side(target, caption, data, emptyText) {
    target.replaceChildren();
    const mini = node(doc, 'span', data ? 'budget-mini' : 'budget-mini budget-mini-none');
    if (data) {
      const geometry = barGeometry({ percent: data.percent }, { h100: PREVIEW_H100 });
      mini.style.height = `${geometry.barH}px`;
      const fill = node(doc, 'span', `budget-bar-fill level-${data.level}`);
      fill.style.height = `${geometry.fillH}px`;
      const over = node(doc, 'span', 'budget-bar-over');
      over.style.height = `${geometry.overH}px`;
      mini.append(node(doc, 'span', 'budget-bar-track'), fill, over);
    }
    const text = node(doc, 'span', data ? `level-${data.level}` : '');
    text.append(node(doc, 'span', 'budget-preview-caption', caption));
    if (data) {
      text.append(node(doc, 'span', 'budget-preview-value', `${data.percent}%`), node(doc, 'span', 'budget-preview-diff', data.diffText));
    } else {
      text.append(node(doc, 'span', 'budget-preview-none', emptyText));
    }
    target.append(mini, text);
  }

  function currentAmount() {
    return parseBudgetAmount(els.amount.value);
  }

  function clearError() {
    els.error.hidden = true;
    els.amount.removeAttribute('aria-invalid');
    els.submit.textContent = idleLabel();
  }

  function sync() {
    const amount = currentAmount();
    const preview = previewBudget(row, amount);
    side(els.previewBefore, 'ตอนนี้', preview.before, 'ไม่มีงบ');
    side(els.previewAfter, amount === null ? '' : `ถ้างบ ${formatNumber(amount)}`, preview.after, 'ใส่จำนวนเงิน');
    els.minus.disabled = busy || amount === null || stepBudget(amount, -1) === amount;
    els.plus.disabled = busy;
  }

  function setBusy(next) {
    busy = next;
    els.submit.disabled = next;
    els.remove.disabled = next;
    els.close.disabled = next;
    els.amount.disabled = next;
    els.busy.hidden = !next;
    for (const chip of els.chips.querySelectorAll('button')) chip.disabled = next;
    sync();
  }

  function showError(title, text) {
    els.errorTitle.textContent = title;
    els.errorText.textContent = text;
    els.error.hidden = false;
    els.amount.setAttribute('aria-invalid', 'true');
    els.submit.textContent = RETRY_LABEL;
    revealError(els.error);
  }

  function setAmount(value) {
    els.amount.value = value === null ? '' : formatNumber(value);
    clearError();
    sync();
  }

  function renderChips() {
    els.chips.replaceChildren();
    for (const chip of quickChips(row)) {
      const button = node(doc, 'button');
      button.type = 'button';
      // เว้นวรรคหลังป้ายเพื่อให้ screen reader อ่านแยกจากตัวเลข
      button.append(doc.createTextNode(`${chip.label} `), node(doc, 'b', '', formatNumber(chip.value)));
      button.addEventListener('click', () => setAmount(chip.value));
      els.chips.append(button);
    }
  }

  async function run(amount) {
    if (busy) return;
    setBusy(true);
    clearError();
    let result;
    try {
      result = await onSubmit({ row, amount, month });
    } finally {
      setBusy(false);
    }
    if (result.ok) {
      // ปิดก่อนโหลดงบใหม่ ไม่งั้น modal ที่ยังเปิดทำให้คืน focus ให้แท่งที่ render ใหม่ไม่ได้
      els.dialog.close();
      await onSaved({ row });
      return;
    }
    if (amount === null) {
      showError('เลิกตั้งงบไม่สำเร็จ', describeBudgetFailure(result.status));
      // ปุ่มหลักยังเป็นบันทึกค่าในช่อง ไม่ใช่ลองเลิกตั้งงบซ้ำ จึงไม่เปลี่ยนเป็น "ลองบันทึกอีกครั้ง"
      els.submit.textContent = idleLabel();
      return;
    }
    const generic = ![400, 401, 404].includes(result.status);
    const text = generic
      ? `ตัวเลข ${formatNumber(amount)} ยังอยู่ในช่อง ลองบันทึกอีกครั้งได้เลย`
      : describeBudgetFailure(result.status);
    showError(GENERIC_FAILURE_TITLE, text);
  }

  function open(nextRow) {
    row = nextRow;
    month = getMonth();
    const isNew = row.budget === null;
    els.title.textContent = isNew ? `ตั้งงบ ${row.category}` : row.category;
    els.sub.textContent = isNew
      ? `ยังไม่เคยตั้งงบ · ใช้ไปเดือนนี้ ${formatNumber(row.spent)} บาท`
      : `ใช้ไปเดือนนี้ ${formatNumber(row.spent)} บาท · งบเดิม ${formatNumber(row.budget)}`;
    els.badge.replaceChildren(badgeFor(row.category, 'expense'));
    const label = formatMonthLabel(month);
    els.scope.textContent = isNew
      ? `มีผลตั้งแต่เดือน ${label} เป็นต้นไป · เฮียจะเตือนเมื่อใช้ถึง 80%`
      : `มีผลตั้งแต่เดือน ${label} เป็นต้นไป`;
    els.remove.hidden = isNew;
    els.busy.hidden = true;
    els.error.hidden = true;
    els.amount.removeAttribute('aria-invalid');
    els.amount.value = isNew ? '' : formatNumber(row.budget);
    els.submit.textContent = idleLabel();
    busy = false;
    els.submit.disabled = false;
    els.remove.disabled = false;
    els.close.disabled = false;
    els.amount.disabled = false;
    renderChips();
    sync();
    els.dialog.showModal();
  }

  els.form.addEventListener('submit', (event) => {
    event.preventDefault();
    const amount = currentAmount();
    if (amount === null) {
      showError(INVALID_TITLE, describeBudgetFailure(400));
      return;
    }
    run(amount);
  });
  els.amount.addEventListener('input', () => {
    clearError();
    sync();
  });
  els.plus.addEventListener('click', () => setAmount(stepBudget(currentAmount(), 1, BUDGET_STEP)));
  els.minus.addEventListener('click', () => setAmount(stepBudget(currentAmount(), -1, BUDGET_STEP)));
  els.close.addEventListener('click', () => els.dialog.close());
  els.remove.addEventListener('click', () => {
    els.confirmTitle.textContent = `เลิกตั้งงบ ${row.category} ใช่ไหม`;
    els.confirmBody.replaceChildren(
      node(doc, 'p', '', `งบ ${formatNumber(row.budget)} บาท จะถูกลบตั้งแต่เดือน ${formatMonthLabel(month)} เป็นต้นไป`),
      node(doc, 'p', '', 'เดือนก่อนหน้าไม่เปลี่ยน และรายการที่จดไว้ไม่หาย เฮียจะไม่เตือนหมวดนี้อีก'),
    );
    els.confirm.showModal();
  });
  els.confirmCancel.addEventListener('click', () => els.confirm.close());
  els.confirmOk.addEventListener('click', () => {
    els.confirm.close();
    run(null);
  });
  // กัน Esc ปิดแผ่นระหว่างรอ request ไม่งั้นผลลัพธ์จะไม่มีที่แสดง
  els.dialog.addEventListener('cancel', (event) => {
    if (busy) event.preventDefault();
  });
  // Esc ครั้งที่สอง browser บางตัวปิด dialog แม้ preventDefault แล้ว จึงเปิดกลับ
  els.dialog.addEventListener('close', () => {
    if (busy) els.dialog.showModal();
  });

  return { open, close: () => els.dialog.close() };
}
```

หมายเหตุ: บรรทัด `import { describeBudgetFailure } ...` และ `import { formatMonthLabel } ...` จากไฟล์เดียวกันให้รวมเป็นบรรทัดเดียว `import { describeBudgetFailure, formatMonthLabel } from './format.mjs';` (eslint `no-duplicate-imports` อาจฟ้อง)

- [ ] **Step 6: ต่อสายใน `app.mjs`**

1. ลบ: `let editingBudget`, `let budgetBusy`, ฟังก์ชัน `openBudgetEditor`, `setBudgetBusy`, `saveBudget`, และ listener ของ `els.budgetForm` (submit), `els.budgetRemove`, `els.budgetCancel`, `els.budgetEditor` (cancel, close) ทั้งหมด และ keys ใน `els` ที่ไม่ใช้แล้ว: `budgetForm, budgetTitle, budgetScope, budgetAmount, budgetBusy, budgetError, budgetRemove, budgetCancel, budgetSave` (เก็บ `budgetEditor`)
2. import: `import { createBudgetSheet } from './budget-sheet.mjs';` และเอา `describeBudgetFailure` ออกจาก import `format.mjs` ถ้าไม่มีที่อื่นใช้ใน `app.mjs` (ตรวจด้วย eslint)
3. `els` เพิ่ม keys ตาม id ใน markup: `budgetSheetBadge, budgetTitle, budgetSheetSub, budgetPreviewBefore, budgetPreviewAfter, budgetAmount, budgetMinus, budgetPlus, budgetChips, budgetScope, budgetBusy, budgetError, budgetErrorTitle, budgetErrorText, budgetRemove, budgetSubmit, budgetCancel, budgetForm, budgetRemoveConfirm, budgetConfirmTitle, budgetConfirmBody, budgetConfirmCancel, budgetConfirmOk` (ใช้ `document.getElementById` กับ id ที่ตรงกัน)
4. หลังประกาศ `badgeFor` และ `loadBudgets` (ที่ใดก็ได้ที่ `api` เข้าถึงได้ตอนเรียก) เพิ่ม:
```js
async function saveBudget({ row, amount, month }) {
  try {
    await api.setBudget(row.categoryId, { month, amount });
  } catch (err) {
    return { ok: false, status: err instanceof ApiError ? err.status : undefined };
  }
  return { ok: true };
}

const budgetSheet = createBudgetSheet({
  doc: document,
  els: {
    dialog: els.budgetEditor, form: els.budgetForm, badge: els.budgetSheetBadge, title: els.budgetTitle, sub: els.budgetSheetSub,
    previewBefore: els.budgetPreviewBefore, previewAfter: els.budgetPreviewAfter, amount: els.budgetAmount,
    minus: els.budgetMinus, plus: els.budgetPlus, chips: els.budgetChips, scope: els.budgetScope, busy: els.budgetBusy,
    error: els.budgetError, errorTitle: els.budgetErrorTitle, errorText: els.budgetErrorText, remove: els.budgetRemove,
    submit: els.budgetSubmit, close: els.budgetCancel, confirm: els.budgetRemoveConfirm, confirmTitle: els.budgetConfirmTitle,
    confirmBody: els.budgetConfirmBody, confirmCancel: els.budgetConfirmCancel, confirmOk: els.budgetConfirmOk,
  },
  badgeFor,
  getMonth: () => els.month.value,
  onSubmit: saveBudget,
  onSaved: ({ row }) => loadBudgets({ focusCategoryId: row.categoryId }),
});

function openBudgetEditor(row) {
  if (!els.month.value) return;
  budgetSheet.open(row);
}
```
   `openBudgetEditor` ยังเป็น function declaration เหมือนเดิม จึงถูกเรียกจาก `budgetsPanel` / `budgetsAllPanel` (ที่เฟส 1 ต่อไว้) ได้

- [ ] **Step 7: รันให้ผ่าน** `npx vitest run public/liff` Expected: PASS (ถ้าเทสต์ DOM เก่าอื่นล้ม ให้แก้ตามรายการใน Step 1 เท่านั้น)
- [ ] **Step 8: ตรวจรวม** `npm test` และ `npx eslint .` Expected: ผ่าน
- [ ] **Step 9: Commit (ถามผู้ใช้ก่อน)** `feat: replace the budget dialog with a bottom sheet`

---

### Task 3: เอกสาร และ STATE

**Depends on:** Task 2

**Files:**
- Modify: `SPEC.md`, `work-memory/STATE.md`

- [ ] **Step 1: SPEC.md** หัวข้อ 5 งบประมาณ เพิ่ม (รายการละไม่เกิน 2 บรรทัด): `แผ่นแก้งบจากล่างจอ: พรีวิว % ก่อน/หลัง ปรับทีละ 500 ปุ่มลัด (ใช้จริง/+10%/+20% หรือปัดขึ้น) เลิกตั้งงบต้องยืนยัน บันทึกไม่สำเร็จคงตัวเลขไว้ให้ลองใหม่`
- [ ] **Step 2: STATE.md** เพิ่มใน Done "งบเฟส 2 แผ่นแก้งบ" พร้อมจำนวนเทสต์ และใน Next ชี้ไปแผน `docs/superpowers/plans/2026-10-21-budget-redesign-p3-bulk-edit.md`
- [ ] **Step 3: ตรวจรวม** `npm test` และ `npx eslint .` Expected: ผ่าน
- [ ] **Step 4: Commit (ถามผู้ใช้ก่อน)** `docs: record the budget redesign phase 2`

## Self-Review (ผู้เขียนแผนตรวจแล้ว)

- Spec coverage: บอร์ด 10 (แก้งบ), 11 (ตั้งงบใหม่), 12 (บันทึกไม่สำเร็จ), 13 (ยืนยันเลิกตั้งงบ) ครบใน Task 2 ฟังก์ชันคำนวณครบใน Task 1
- ชื่อข้ามไฟล์ตรงกัน: `parseBudgetAmount`, `stepBudget`, `previewBudget`, `quickChips`, `BUDGET_STEP` (Task 1 → Task 2), `createBudgetSheet({ ... onSubmit })` ↔ `saveBudget({ row, amount, month })` ใน `app.mjs`
- จุดเสี่ยง: เทสต์เดิมที่อ้างหัว `งบ <ชื่อหมวด>` และโครงปุ่มเดิม (ระบุไว้ใน Step 1) และกฎ CSS `dialog` พื้นฐานที่อาจชนกับ `dialog.budget-sheet`

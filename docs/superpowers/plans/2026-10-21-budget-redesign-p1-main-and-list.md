# Budget Redesign Phase 1: Main Page, States and "ดูทั้งหมด" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** แทนที่แท็บ งบ ในเว็บ LIFF ด้วยหน้างบแบบใหม่ (แท่งเทียบเป็น % ทุกแท่งสูงเท่ากัน) พร้อมสถานะโหลด/ผิดพลาด/ยังไม่เคยตั้งงบ และหน้าย่อย "ดูทั้งหมด" ที่ค้นหา/เรียง/แยก 3 กลุ่มได้

**Architecture:** แยกตรรกะคำนวณเป็นโมดูลบริสุทธิ์ `budgets-format.mjs` (เทสต์ได้ไม่ต้องมี DOM) แล้วทำ panel 2 ตัวตามแบบ `goals-panel.mjs` คือ `budgets-panel.mjs` (หน้าหลัก) และ `budgets-all-panel.mjs` (หน้าย่อย) `app.mjs` แค่ต่อสายและยังใช้ dialog `#budget-editor` เดิมตอนแตะหมวด (เฟส 2 จะเปลี่ยนเป็นแผ่นล่าง) ไม่แตะ API, SQL, หรือ server

**Tech Stack:** vanilla ES modules (`public/liff/*.mjs`), vitest + jsdom, CSS ไฟล์เดียว `style.css`

**Design reference:** artifact https://claude.ai/artifact/PYNrUiDyTF7jWns14bDosx บอร์ด 1-9 (ลิงก์ส่วนตัวของผู้ใช้) ข้อความ/ค่าที่ต้องตรงกับดีไซน์ถูกคัดลอกลงในแผนนี้แล้ว ไม่ต้องเปิดดูก็ทำได้

## Global Constraints

- ข้อความ UI เป็นภาษาไทย ชื่อตัวแปร/ฟังก์ชัน/log เป็นภาษาอังกฤษ ห้ามใช้ emoji ในโค้ด คอมเมนต์ log และ commit message
- คอมเมนต์ในโค้ดเป็นภาษาไทย บรรทัดเดียว อธิบาย "ทำไม" เท่านั้น
- เขียนเทสต์ก่อนโค้ดเสมอ (รันให้เห็นว่าล้มก่อนแก้) แล้วรัน `npm test` และ `npx eslint .` ให้ผ่านก่อนรายงานว่าเสร็จ
- ห้ามแก้ `src/` (API, SQL, server) ในเฟสนี้ ห้ามเริ่ม/รีสตาร์ท/ปิด dev server หรือ API
- ห้าม `git commit` หรือ `git push` จนกว่าผู้ใช้สั่ง ขั้นตอน Commit ในแผนนี้คือ "ถามผู้ใช้ก่อน" ไม่ใช่ทำเอง
- ใส่ข้อความจากผู้ใช้ (ชื่อหมวด) ด้วย `textContent` เท่านั้น ห้าม `innerHTML`
- ปุ่มและพื้นที่แตะทุกอันสูงอย่างน้อย 44px สถานะต้องไม่พึ่งสีอย่างเดียว (มีตัวเลขหรือข้อความกำกับ)
- เกณฑ์สถานะ: ต่ำกว่า 80% = `ok`, 80-99% = `warn`, ตั้งแต่ 100% = `over` (ใช้ `budgetRows` ใน `format.mjs` เดิมเป็นฐาน ห้ามคิดสูตรซ้ำ)
- ห้ามลบหรือแก้ CSS เดิม `.budget-button`, `.budget-track`, `.budget-fill`, `.budget-row`, `.budget-label` เพราะแท็บออม (`goals-panel.mjs`) ใช้อยู่
- ไฟล์ในโปรเจกต์ใช้ CRLF ใช้เครื่องมือ Edit ได้ตามปกติ
- หน้างบต้องยังมีทางไป "จัดการหมวดหมู่" (ปุ่ม `#categories-open` เดิม) และคงข้อความ hint เดิม

## Design Decisions (ช่องว่างที่ดีไซน์ไม่ได้ระบุ แผนนี้ตัดสินให้แล้ว)

1. ไม่มีหมวดที่ต้องดูแลเลย: ซ่อนการ์ด "ต้องดูแล" ทั้งใบ (ไม่แสดง 0 หมวด)
2. แท็บในหน้าดูทั้งหมดที่ว่าง (แต่ยังมีคำค้นหรือมีข้อมูลในแท็บอื่น): แสดงข้อความ "ไม่มีหมวดในกลุ่มนี้" ส่วน empty state ใหญ่ (มาสคอต + ปุ่มล้างคำค้น) ใช้เฉพาะเมื่อค้นแล้วไม่เจอเลยทั้ง 3 กลุ่ม
3. เดือนในหน้าดูทั้งหมด: sub-page ซ่อนช่องเลือกเดือนอยู่แล้ว จึงแสดงเดือนในบรรทัดนับจำนวน เช่น `10/2026 · แสดง 12 จาก 12 หมวด` (ใช้ `formatMonthLabel` เดิม)
4. ปุ่ม "แก้งบหลายหมวดพร้อมกัน" ในหน้าดูทั้งหมด: ยังไม่ใส่ในเฟส 1 (เฟส 3 เพิ่ม)
5. ช่องค้นหาในหน้าหลักเมื่อมีหมวดเกิน 14: เป็นปุ่มที่เปิดหน้าดูทั้งหมดแล้วโฟกัสช่องค้นหา ไม่ใช่ช่องพิมพ์จริง
6. หน้าแท่งของหมวดที่ต้องดูแลแบ่งหน้าละ 6 แท่ง เปลี่ยนหน้าด้วยปุ่มก่อนหน้า/ถัดไป (ไม่ทำการปัด)
7. ไม่ทำแอนิเมชันแท่งโตขึ้น (เดิมใช้ `playBars`) แท่งวาดที่ความสูงสุดท้ายทันที
8. ข้อความอธิบายเดิมของหน้างบ "งบมีผลตั้งแต่เดือนที่เลือกเป็นต้นไป (ไม่กระทบเดือนก่อนหน้า)" ถูกถอดออกจากหน้า (ดีไซน์ไม่มี) ข้อมูลนี้ยังอยู่ในบรรทัด scope ของแผ่นแก้งบเฟส 2 **ผู้ใช้ควรยืนยันว่าตั้งใจให้หายจากหน้าหลัก**

## File Structure

| ไฟล์ | หน้าที่ |
|---|---|
| `public/liff/budgets-format.mjs` (สร้าง) | ฟังก์ชันบริสุทธิ์: จัดกลุ่ม สรุป ความสูงแท่ง แบ่งหน้า ค้นหา เรียง |
| `public/liff/budgets-format.test.mjs` (สร้าง) | เทสต์ของโมดูลข้างบน |
| `public/liff/budgets-panel.mjs` (สร้าง) | วาดหน้าหลักของแท็บ งบ (hero, แท่ง, ปกติ, ยังไม่ตั้งงบ, ว่าง) |
| `public/liff/budgets-all-panel.mjs` (สร้าง) | วาดหน้าย่อย ดูทั้งหมด (แท็บ ค้นหา เรียง รายการ) |
| `public/liff/index.html` (แก้) | markup ของ `#panel-budgets` และ `#panel-budget-all` |
| `public/liff/style.css` (แก้) | CSS บล็อกใหม่ท้ายส่วนงบ |
| `public/liff/style.test.mjs` (แก้) | เทสต์ CSS ที่เกี่ยวกับแท่ง |
| `public/liff/app.mjs` (แก้) | ต่อสาย panel, sub-page, skeleton, เอา `playBars`/`budgetRows` ของงบออก |
| `public/liff/app.dom.test.mjs` (แก้) | เทสต์ DOM ของหน้าใหม่ และแก้เทสต์เดิมที่อ้างโครงเก่า |
| `SPEC.md`, `README.md`, `work-memory/STATE.md` (แก้) | เอกสาร |

---

### Task 1: โมดูลคำนวณ `budgets-format.mjs`

**Depends on:** none

**Files:**
- Create: `public/liff/budgets-format.mjs`
- Test: `public/liff/budgets-format.test.mjs`

**Interfaces:**
- Consumes: `budgetRows(budgets)` จาก `./format.mjs` (คืนแถวที่มี `categoryId, category, budget, spent, level ('none'|'ok'|'warn'|'over'), percent (null เมื่อไม่ตั้งงบ), width, text`)
- Produces (ใช้ใน Task 2-4):
  - `formatNumber(value: number): string`
  - `levelOfPercent(percent: number): 'ok'|'warn'|'over'`
  - `groupBudgetRows(budgets): { risk: Row[], calm: Row[], unset: Row[] }`
  - `summarizeBudgets(budgets): { hasBudgets, totalBudget, totalSpent, left, percent, level, counts: {over, warn, ok} }`
  - `describeHero(summary): { percentText, restText, level }`
  - `describeDiff(row): string`
  - `barGeometry(row, { h100, overCapPercent }): { fillH, overH, barH, labelBottom }`
  - `pageBudgetRows(rows, page, pageSize = 6): { items, page, pageCount }`
  - `filterBudgetRows(rows, query): Row[]`
  - `sortBudgetRows(rows, mode: 'usage'|'name'): Row[]`
  - `sectionsForTab(tab: 'risk'|'calm'|'unset', rows): { title: string|null, rows: Row[] }[]`

- [ ] **Step 1: เขียนเทสต์ที่ล้ม**

สร้าง `public/liff/budgets-format.test.mjs`:

```js
import { describe, expect, it } from 'vitest';
import {
  barGeometry,
  describeDiff,
  describeHero,
  filterBudgetRows,
  formatNumber,
  groupBudgetRows,
  levelOfPercent,
  pageBudgetRows,
  sectionsForTab,
  sortBudgetRows,
  summarizeBudgets,
} from './budgets-format.mjs';

const BUDGETS = [
  { categoryId: 'food', category: 'อาหาร', budget: 6000, spent: 4200 },
  { categoryId: 'shop', category: 'ช้อปปิ้ง', budget: 3000, spent: 3450 },
  { categoryId: 'move', category: 'เดินทาง', budget: 2000, spent: 1900 },
  { categoryId: 'fun', category: 'บันเทิง', budget: null, spent: 620 },
  { categoryId: 'other', category: 'อื่นๆ', budget: null, spent: 150 },
];

describe('levelOfPercent', () => {
  it('switches exactly at 80 and 100', () => {
    expect([79, 80, 99, 100].map(levelOfPercent)).toEqual(['ok', 'warn', 'warn', 'over']);
  });
});

describe('groupBudgetRows', () => {
  it('splits into risk, calm and unset with the most used first', () => {
    const groups = groupBudgetRows(BUDGETS);

    expect(groups.risk.map((row) => row.categoryId)).toEqual(['shop', 'move']);
    expect(groups.calm.map((row) => row.categoryId)).toEqual(['food']);
    expect(groups.unset.map((row) => row.categoryId)).toEqual(['fun', 'other']);
  });

  it('breaks percent ties by spent amount', () => {
    const groups = groupBudgetRows([
      { categoryId: 'a', category: 'ก', budget: 100, spent: 100 },
      { categoryId: 'b', category: 'ข', budget: 1000, spent: 1000 },
    ]);

    expect(groups.risk.map((row) => row.categoryId)).toEqual(['b', 'a']);
  });

  it('treats a zero budget as unset', () => {
    const groups = groupBudgetRows([{ categoryId: 'a', category: 'ก', budget: 0, spent: 5 }]);

    expect(groups.unset).toHaveLength(1);
    expect(groups.risk).toHaveLength(0);
  });
});

describe('summarizeBudgets', () => {
  it('sums only the categories that have a budget', () => {
    expect(summarizeBudgets(BUDGETS)).toEqual({
      hasBudgets: true,
      totalBudget: 11000,
      totalSpent: 9550,
      left: 1450,
      percent: 86,
      level: 'warn',
      counts: { over: 1, warn: 1, ok: 1 },
    });
  });

  it('reports no budgets when every category is unset', () => {
    const summary = summarizeBudgets([BUDGETS[3], BUDGETS[4]]);

    expect(summary.hasBudgets).toBe(false);
    expect(summary.counts).toEqual({ over: 0, warn: 0, ok: 0 });
  });

  it('goes negative and over when the total is exceeded', () => {
    const summary = summarizeBudgets([{ categoryId: 'a', category: 'ก', budget: 1000, spent: 1500 }]);

    expect(summary).toMatchObject({ left: -500, percent: 150, level: 'over' });
  });
});

describe('describeHero', () => {
  it('says how much is left', () => {
    expect(describeHero(summarizeBudgets(BUDGETS))).toEqual({ percentText: '86%', restText: 'เหลือ 1,450 บาท', level: 'warn' });
  });

  it('says how much the total is exceeded by', () => {
    const summary = summarizeBudgets([{ categoryId: 'a', category: 'ก', budget: 1000, spent: 1500 }]);

    expect(describeHero(summary).restText).toBe('เกินงบรวม 500 บาท');
  });
});

describe('describeDiff', () => {
  const row = (budget, spent) => groupBudgetRows([{ categoryId: 'a', category: 'ก', budget, spent }]);

  it('describes over, exact and remaining amounts', () => {
    expect(describeDiff(row(3000, 3450).risk[0])).toBe('เกิน 450');
    expect(describeDiff(row(900, 900).risk[0])).toBe('เต็มพอดี');
    expect(describeDiff(row(2000, 1900).risk[0])).toBe('เหลือ 100');
  });

  it('does not drift on decimals', () => {
    expect(describeDiff(row(100.1, 100.05).risk[0])).toBe('เหลือ 0.05');
  });
});

describe('barGeometry', () => {
  const rowAt = (percent) => ({ percent });

  it('fills partly and adds nothing above the line below 100 percent', () => {
    expect(barGeometry(rowAt(70), { h100: 130 })).toEqual({ fillH: 91, overH: 0, barH: 130, labelBottom: 134 });
  });

  it('adds a red cap above the 100 percent line', () => {
    expect(barGeometry(rowAt(115), { h100: 130 })).toEqual({ fillH: 130, overH: 19.5, barH: 149.5, labelBottom: 153.5 });
  });

  it('caps the red part at 30 percent so the label stays on screen', () => {
    expect(barGeometry(rowAt(300), { h100: 130 }).overH).toBe(39);
  });
});

describe('pageBudgetRows', () => {
  const rows = Array.from({ length: 8 }, (_, index) => ({ categoryId: `c${index}` }));

  it('returns the first six and the page count', () => {
    const result = pageBudgetRows(rows, 0);

    expect(result.items).toHaveLength(6);
    expect(result.pageCount).toBe(2);
  });

  it('clamps an out of range page', () => {
    const result = pageBudgetRows(rows, 5);

    expect(result.page).toBe(1);
    expect(result.items).toHaveLength(2);
  });

  it('has one page for an empty list', () => {
    expect(pageBudgetRows([], 0)).toEqual({ items: [], page: 0, pageCount: 1 });
  });
});

describe('filterBudgetRows', () => {
  const rows = [{ category: 'อาหาร' }, { category: 'Gym' }];

  it('matches a trimmed query ignoring case', () => {
    expect(filterBudgetRows(rows, ' อาหาร ')).toEqual([rows[0]]);
    expect(filterBudgetRows(rows, 'GYM')).toEqual([rows[1]]);
  });

  it('returns everything for an empty query', () => {
    expect(filterBudgetRows(rows, '   ')).toEqual(rows);
  });
});

describe('sortBudgetRows', () => {
  it('sorts by usage with unset rows last', () => {
    const { risk, calm, unset } = groupBudgetRows(BUDGETS);
    const sorted = sortBudgetRows([...unset, ...calm, ...risk], 'usage');

    expect(sorted.map((row) => row.categoryId)).toEqual(['shop', 'move', 'food', 'fun', 'other']);
  });

  it('sorts by Thai name', () => {
    const sorted = sortBudgetRows([{ category: 'อาหาร' }, { category: 'กาแฟ' }], 'name');

    expect(sorted.map((row) => row.category)).toEqual(['กาแฟ', 'อาหาร']);
  });

  it('does not mutate the input', () => {
    const rows = [{ category: 'ข' }, { category: 'ก' }];
    sortBudgetRows(rows, 'name');

    expect(rows[0].category).toBe('ข');
  });
});

describe('sectionsForTab', () => {
  it('splits risk into over and warn and drops empty sections', () => {
    const { risk } = groupBudgetRows(BUDGETS);

    expect(sectionsForTab('risk', risk).map((section) => [section.title, section.rows.length])).toEqual([
      ['เต็มหรือเกินงบ', 1],
      ['ใกล้เต็ม', 1],
    ]);
    expect(sectionsForTab('risk', [risk[0]])).toHaveLength(1);
  });

  it('splits calm at 50 percent', () => {
    const rows = [{ percent: 70 }, { percent: 49 }];

    expect(sectionsForTab('calm', rows).map((section) => section.title)).toEqual(['ใช้ 50-79% ของงบ', 'ใช้ต่ำกว่า 50%']);
  });

  it('uses a single untitled section for unset', () => {
    expect(sectionsForTab('unset', [{ categoryId: 'a' }])).toEqual([{ title: null, rows: [{ categoryId: 'a' }] }]);
    expect(sectionsForTab('unset', [])).toEqual([]);
  });
});

describe('formatNumber', () => {
  it('groups thousands and keeps at most two decimals', () => {
    expect(formatNumber(10460)).toBe('10,460');
    expect(formatNumber(0.05)).toBe('0.05');
  });
});
```

- [ ] **Step 2: รันให้เห็นว่าล้ม**

Run: `npx vitest run public/liff/budgets-format.test.mjs`
Expected: FAIL (`Cannot find module './budgets-format.mjs'` หรือ import ล้ม)

- [ ] **Step 3: เขียนโค้ดขั้นต่ำ**

สร้าง `public/liff/budgets-format.mjs`:

```js
import { budgetRows } from './format.mjs';

// คิดเป็นสตางค์ทั้งหมด กันเศษทศนิยมลอยตอนบวกลบ
const toSatang = (value) => Math.round(value * 100);
const round1 = (value) => Math.round(value * 10) / 10;

export function formatNumber(value) {
  return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

export function levelOfPercent(percent) {
  if (percent >= 100) return 'over';
  return percent >= 80 ? 'warn' : 'ok';
}

// ใช้มากสุดก่อน เท่ากันดูยอดใช้
const byUsage = (a, b) => b.percent - a.percent || b.spent - a.spent;

export function groupBudgetRows(budgets) {
  const rows = budgetRows(budgets);
  const budgeted = rows.filter((row) => row.budget !== null);
  return {
    risk: budgeted.filter((row) => row.level !== 'ok').sort(byUsage),
    calm: budgeted.filter((row) => row.level === 'ok').sort(byUsage),
    unset: rows.filter((row) => row.budget === null).sort((a, b) => b.spent - a.spent),
  };
}

export function summarizeBudgets(budgets) {
  const budgeted = budgetRows(budgets).filter((row) => row.budget !== null);
  const counts = { over: 0, warn: 0, ok: 0 };
  for (const row of budgeted) counts[row.level] += 1;
  if (budgeted.length === 0) {
    return { hasBudgets: false, totalBudget: 0, totalSpent: 0, left: 0, percent: 0, level: 'ok', counts };
  }
  const budgetSatang = budgeted.reduce((sum, row) => sum + toSatang(row.budget), 0);
  const spentSatang = budgeted.reduce((sum, row) => sum + toSatang(row.spent), 0);
  const percent = Math.floor((spentSatang * 100) / budgetSatang);
  return {
    hasBudgets: true,
    totalBudget: budgetSatang / 100,
    totalSpent: spentSatang / 100,
    left: (budgetSatang - spentSatang) / 100,
    percent,
    level: levelOfPercent(percent),
    counts,
  };
}

export function describeHero(summary) {
  const restText = summary.left >= 0 ? `เหลือ ${formatNumber(summary.left)} บาท` : `เกินงบรวม ${formatNumber(-summary.left)} บาท`;
  return { percentText: `${summary.percent}%`, restText, level: summary.level };
}

export function describeDiff(row) {
  const diff = (toSatang(row.budget) - toSatang(row.spent)) / 100;
  if (diff < 0) return `เกิน ${formatNumber(-diff)}`;
  return diff === 0 ? 'เต็มพอดี' : `เหลือ ${formatNumber(diff)}`;
}

// ส่วนสีแดงเหนือเส้น 100% ตัดที่ 30% ไม่ให้ตัวเลขบนแท่งหลุดกรอบ
export function barGeometry(row, { h100, overCapPercent = 30 }) {
  const fillH = (Math.min(row.percent, 100) * h100) / 100;
  const overH = (Math.min(Math.max(row.percent - 100, 0), overCapPercent) * h100) / 100;
  return {
    fillH: round1(fillH),
    overH: round1(overH),
    barH: round1(h100 + overH),
    labelBottom: round1(h100 + overH + 4),
  };
}

export function pageBudgetRows(rows, page, pageSize = 6) {
  const pageCount = Math.max(Math.ceil(rows.length / pageSize), 1);
  const safePage = Math.min(Math.max(page, 0), pageCount - 1);
  return { items: rows.slice(safePage * pageSize, (safePage + 1) * pageSize), page: safePage, pageCount };
}

export function filterBudgetRows(rows, query) {
  const needle = query.trim().toLowerCase();
  if (!needle) return rows;
  return rows.filter((row) => row.category.toLowerCase().includes(needle));
}

export function sortBudgetRows(rows, mode) {
  const copy = [...rows];
  if (mode === 'name') return copy.sort((a, b) => a.category.localeCompare(b.category, 'th'));
  // หมวดที่ไม่ตั้งงบไม่มีเปอร์เซ็นต์ จึงไปท้ายสุด
  return copy.sort((a, b) => (b.percent ?? -1) - (a.percent ?? -1) || b.spent - a.spent);
}

export function sectionsForTab(tab, rows) {
  let sections;
  if (tab === 'risk') {
    sections = [
      { title: 'เต็มหรือเกินงบ', rows: rows.filter((row) => row.level === 'over') },
      { title: 'ใกล้เต็ม', rows: rows.filter((row) => row.level === 'warn') },
    ];
  } else if (tab === 'calm') {
    sections = [
      { title: 'ใช้ 50-79% ของงบ', rows: rows.filter((row) => row.percent >= 50) },
      { title: 'ใช้ต่ำกว่า 50%', rows: rows.filter((row) => row.percent < 50) },
    ];
  } else {
    sections = [{ title: null, rows }];
  }
  return sections.filter((section) => section.rows.length > 0);
}
```

- [ ] **Step 4: รันให้ผ่าน**

Run: `npx vitest run public/liff/budgets-format.test.mjs`
Expected: PASS ทุกเทสต์

- [ ] **Step 5: Lint**

Run: `npx eslint public/liff/budgets-format.mjs public/liff/budgets-format.test.mjs`
Expected: ไม่มี error

- [ ] **Step 6: Commit (ถามผู้ใช้ก่อน)** แนะนำข้อความ `feat: add pure helpers for the redesigned budget page`

---

### Task 2: หน้างบหลัก (markup, CSS, panel, ต่อสายใน app.mjs)

**Depends on:** Task 1

**Files:**
- Create: `public/liff/budgets-panel.mjs`
- Modify: `public/liff/index.html` (ส่วน `<div id="panel-budgets" ...>` ประมาณบรรทัด 309-331)
- Modify: `public/liff/style.css` (เพิ่มบล็อกใหม่ท้ายไฟล์)
- Modify: `public/liff/style.test.mjs`
- Modify: `public/liff/app.mjs` (import, `els`, `renderBudgets`, `showBudgetsError`, `loadBudgets`, ตัวเปลี่ยนแท็บที่เรียก `playBars(... els.budgetRows)`)
- Test: `public/liff/app.dom.test.mjs`

**Interfaces:**
- Consumes: ฟังก์ชันทั้งหมดจาก Task 1
- Produces: `createBudgetsPanel({ doc, els, onEdit, onOpenAll }): { render(budgets, { focusCategoryId }) }` โดย
  - `onEdit(row)` ถูกเรียกเมื่อแตะแท่งหรือแถวหมวด (ใน app.mjs ต่อกับ `openBudgetEditor`)
  - `onOpenAll({ tab, focusSearch })` ถูกเรียกเมื่อกดดูทั้งหมด/ตั้งงบ/ชิป/ช่องค้นหา (Task 4 ทำปลายทาง ใน Task นี้ต่อกับฟังก์ชัน placeholder ที่ยังไม่ทำอะไร เพื่อให้ Task 4 เติม)
  - `els` keys: `section, hero, heroPercent, heroRest, many, manySearch, manyChips, risk, riskTitle, riskPlot, riskBars, riskNames, riskPager, riskPageLabel, riskPrev, riskNext, riskDots, calm, calmHead, calmTitle, calmNote, calmList, calmAll, unset, unsetText, unsetOpen, empty, emptyList, emptyHint`

**Browser check:**
- Preconditions: ผู้ใช้เป็นคนเปิดแอปเอง (agent ห้ามสตาร์ท service) เปิดเว็บ LIFF ผ่าน LINE ด้วยบัญชีทดสอบที่มีงบอย่างน้อย 3 หมวดและมีหมวดที่เกินงบ 1 หมวด
- Base URL: ลิงก์ LIFF ของแอป

| # | Action | Expected |
|---|---|---|
| 1 | กดแท็บ งบ ที่แถบล่าง | เห็นแผงน้ำเงินมาสคอตพร้อมข้อความ "ใช้งบไปแล้ว" ตามด้วยเปอร์เซ็นต์ตัวใหญ่และ "เหลือ ... บาท" |
| 2 | ดูการ์ด "ต้องดูแล N หมวด" | แท่งทุกแท่งสูงเท่ากันถึงเส้นประทึบ แท่งหมวดที่เกินมีส่วนสีแดงต่อเหนือเส้นประ และหัวแท่งโค้งเป็นชิ้นเดียว ไม่มีรอยหยัก เส้นประพาดทับหัวแท่ง |
| 3 | แตะแท่งหมวดใดหมวดหนึ่ง | dialog แก้งบเดิมเปิดขึ้น หัวข้อ "งบ <ชื่อหมวด>" |
| 4 | เลื่อนลงดูท้ายหน้า | เห็นการ์ด "ปกติ", แถบ "ยังไม่ตั้งงบ" และแถว "จัดการหมวดหมู่" |

- [ ] **Step 1: เขียนเทสต์ DOM ที่ล้ม**

ใน `public/liff/app.dom.test.mjs` เพิ่ม describe ใหม่ต่อท้ายไฟล์ (ใช้ helper เดิม `boot`, `clickTab`, `byId`, `settle` ที่มีอยู่แล้วในไฟล์):

```js
const BUDGET_SAMPLE = {
  budgets: [
    { categoryId: 'c-food', category: 'อาหาร', budget: 6000, spent: 4200 },
    { categoryId: 'c-shop', category: 'ช้อปปิ้ง', budget: 3000, spent: 3450 },
    { categoryId: 'c-trip', category: 'เดินทาง', budget: 2000, spent: 1900 },
    { categoryId: 'c-fun', category: 'บันเทิง', budget: null, spent: 620 },
    { categoryId: 'c-other', category: 'อื่นๆ', budget: null, spent: 150 },
  ],
};

async function openBudgets(overrides = {}) {
  await boot({ overrides: { '/api/budgets': BUDGET_SAMPLE, ...overrides } });
  clickTab('budgets');
  await settle();
}

describe('LIFF budgets page', () => {
  it('shows the total used and what is left in the hero', async () => {
    await openBudgets();

    expect(byId('budget-hero-percent').textContent).toBe('86%');
    expect(byId('budget-hero-rest').textContent).toBe('เหลือ 1,450 บาท');
    expect(byId('budget-hero-percent').className).toContain('level-warn');
  });

  it('draws one column per risk category sorted by usage, all with the same track height', async () => {
    await openBudgets();
    const cols = [...byId('budget-risk-bars').querySelectorAll('.budget-col')];

    expect(byId('budget-risk-title').textContent).toBe('ต้องดูแล 2 หมวด');
    expect(cols.map((col) => col.dataset.categoryId)).toEqual(['c-shop', 'c-trip']);
    expect(cols[0].querySelector('.budget-col-pct').textContent).toBe('115%');
    expect(cols[0].querySelector('.budget-bar-over').style.height).toBe('19.5px');
    expect(cols[1].querySelector('.budget-bar-over').style.height).toBe('0px');
    expect(cols[0].querySelector('.budget-bar-fill').className).toContain('level-over');
    expect(cols[1].querySelector('.budget-bar-fill').className).toContain('level-warn');
    expect(cols[0].getAttribute('aria-label')).toBe('ช้อปปิ้ง 115% ของงบ เกิน 450');
  });

  it('hides the loading and error states once the budgets are drawn', async () => {
    await openBudgets();

    expect(byId('budgets').hidden).toBe(false);
    expect(byId('budgets-loading').hidden).toBe(true);
    expect(byId('budgets-skeleton').hidden).toBe(true);
    expect(byId('budgets-error').hidden).toBe(true);
    expect(byId('budget-empty').hidden).toBe(true);
  });

  it('lists the names and what is left under the columns', async () => {
    await openBudgets();
    const names = [...byId('budget-risk-names').querySelectorAll('.budget-col-name')];

    expect(names.map((name) => name.querySelector('.budget-col-name-text').textContent)).toEqual(['ช้อปปิ้ง', 'เดินทาง']);
    expect(names.map((name) => name.querySelector('.budget-col-diff').textContent)).toEqual(['เกิน 450', 'เหลือ 100']);
  });

  it('draws the 100 percent and 80 percent lines after the columns so they stay on top', async () => {
    await openBudgets();
    const children = [...byId('budget-risk-plot').children];
    const barsIndex = children.indexOf(byId('budget-risk-bars'));
    const lineIndex = children.findIndex((child) => child.classList.contains('budget-line-100'));

    expect(barsIndex).toBeGreaterThan(-1);
    expect(lineIndex).toBeGreaterThan(barsIndex);
    expect(children.some((child) => child.classList.contains('budget-line-80'))).toBe(true);
  });

  it('hides the risk card when nothing needs attention', async () => {
    await openBudgets({ '/api/budgets': { budgets: [{ categoryId: 'c-food', category: 'อาหาร', budget: 6000, spent: 600 }] } });

    expect(byId('budget-risk').hidden).toBe(true);
    expect(byId('budget-calm-list').querySelectorAll('.budget-calm-item')).toHaveLength(1);
  });

  it('shows calm categories with their percent and a link to see all of them', async () => {
    await openBudgets();
    const items = [...byId('budget-calm-list').querySelectorAll('.budget-calm-item')];

    expect(byId('budget-calm-title').textContent).toBe('ปกติ 1 หมวด');
    expect(items.map((item) => item.textContent)).toEqual(['อาหาร70%']);
    expect(byId('budget-all-open').textContent).toBe('ดูทั้งหมด 3 หมวด ›');
  });

  it('summarises the unset categories', async () => {
    await openBudgets();

    expect(byId('budget-unset').hidden).toBe(false);
    expect(byId('budget-unset-text').textContent).toBe('ยังไม่ตั้งงบ 2 หมวด: บันเทิง · อื่นๆ');
  });

  it('hides the unset strip when every category has a budget', async () => {
    await openBudgets({ '/api/budgets': { budgets: [BUDGET_SAMPLE.budgets[0]] } });

    expect(byId('budget-unset').hidden).toBe(true);
  });

  it('opens the existing budget editor when a column is tapped', async () => {
    await openBudgets();

    byId('budget-risk-bars').querySelector('.budget-col').click();

    expect(byId('budget-editor').hasAttribute('open')).toBe(true);
    expect(byId('budget-title').textContent).toBe('งบ ช้อปปิ้ง');
  });

  it('pages the risk columns six at a time', async () => {
    const risk = Array.from({ length: 8 }, (_, index) => ({ categoryId: `r${index}`, category: `หมวด${index}`, budget: 1000, spent: 1000 + index }));
    await openBudgets({ '/api/budgets': { budgets: risk } });

    expect(byId('budget-risk-bars').querySelectorAll('.budget-col')).toHaveLength(6);
    expect(byId('budget-risk-page').textContent).toBe('หน้า 1 จาก 2');
    expect(byId('budget-risk-prev').disabled).toBe(true);

    byId('budget-risk-next').click();

    expect(byId('budget-risk-bars').querySelectorAll('.budget-col')).toHaveLength(2);
    expect(byId('budget-risk-page').textContent).toBe('หน้า 2 จาก 2');
    expect(byId('budget-risk-next').disabled).toBe(true);
  });

  it('shows the search button and group chips only when there are more than 14 categories', async () => {
    const many = Array.from({ length: 15 }, (_, index) => ({ categoryId: `m${index}`, category: `หมวด${index}`, budget: 1000, spent: 100 }));
    await openBudgets({ '/api/budgets': { budgets: many } });

    expect(byId('budget-many').hidden).toBe(false);
    expect(byId('budget-many-search').textContent).toBe('ค้นหาหมวดจาก 15 หมวด');

    await openBudgets();

    expect(byId('budget-many').hidden).toBe(true);
  });

  it('keeps the link to manage categories', async () => {
    await openBudgets();

    expect(byId('categories-open').disabled).toBe(false);
  });
});
```

และแก้เทสต์เดิมที่ผูกกับโครงเก่าให้ตรงของใหม่ (ค้นด้วย `grep -n "budget-rows\|budgets-skeleton\|budgets-error\|budget-editor" public/liff/app.dom.test.mjs`):
  - เทสต์ `renders the budget rows with category badges and hides the loading state` (ประมาณบรรทัด 665): **ลบทิ้ง** (ถูกแทนด้วยกลุ่มเทสต์ข้างบน)
  - บรรทัดที่อ้าง `#budget-rows .budget-row` (ประมาณ 968): เปลี่ยนไปนับ `.budget-col, .budget-calm-item` ตามบริบทของเทสต์นั้น หรือถ้าเทสต์นั้นเช็กแค่ว่าแท็บงบโหลดซ้ำ ให้เช็ก `byId('budget-hero-percent').textContent` (ข้อมูลตั้งต้น `/api/budgets` ของไฟล์เทสต์คือ อาหาร 1000/60 กับ เดินทาง null/40 ดังนั้นหลังโหลดจะมี `.budget-calm-item` 1 อัน ไม่ใช่ 2 อัน และไม่มี `.budget-col` เลย)
  - บรรทัดที่อ้าง `byId('budget-rows').querySelector('.cat-badge use')` (ประมาณ 4480, เทสต์ไอคอนหมวด): ในหน้างบใหม่ไม่มีไอคอนหมวดบนแท่ง ให้ตัดการยืนยันเรื่องงบออก (ไอคอนในหน้าดูทั้งหมดเพิ่มใน Task 4 พร้อมเทสต์)
  - `budgets-skeleton` variants (ประมาณ 757) แก้ใน Task 3

- [ ] **Step 2: รันให้เห็นว่าล้ม**

Run: `npx vitest run public/liff/app.dom.test.mjs -t "LIFF budgets page"`
Expected: FAIL (ไม่พบ element `budget-hero-percent` ฯลฯ)

- [ ] **Step 3: markup ใน index.html**

แทนที่ทั้งบล็อก `<div id="panel-budgets" class="panel" hidden> ... </div>` (จากบรรทัด `<div id="panel-budgets"` จนถึง `</div>` ที่ปิดก่อน `<div id="panel-categories"`) ด้วย:

```html
    <div id="panel-budgets" class="panel" hidden>
      <p id="budgets-loading" class="sr-only" role="status" hidden>กำลังโหลดงบ...</p>
      <ul id="budgets-skeleton" class="skeleton-list skeleton-padded" aria-hidden="true" hidden></ul>
      <div id="budgets-error" class="budget-error-card" hidden>
        <p class="budget-error-title">ตอนนี้เฮียโหลดงบให้ไม่ได้</p>
        <p id="budgets-error-text" class="budget-error-text"></p>
        <button type="button" id="budgets-retry" class="budget-cta">ลองใหม่</button>
      </div>
      <section id="budgets" class="budgets-page" aria-label="งบประมาณรายจ่าย" hidden>
        <div id="budget-hero" class="budget-hero">
          <div class="budget-hero-bubble">
            <p class="budget-hero-lead"><b>เฮียสมัครบอกว่า</b> ใช้งบไปแล้ว</p>
            <p class="budget-hero-value"><span id="budget-hero-percent" class="budget-hero-percent"></span> <span id="budget-hero-rest" class="budget-hero-rest"></span></p>
          </div>
        </div>
        <div id="budget-many" class="budget-many" hidden>
          <button type="button" id="budget-many-search" class="budget-many-search"></button>
          <div id="budget-many-chips" class="budget-many-chips"></div>
        </div>
        <section id="budget-risk" class="budget-card" aria-labelledby="budget-risk-title" hidden>
          <div class="budget-card-head">
            <h2 id="budget-risk-title"></h2>
            <span class="budget-card-note">แตะแท่งเพื่อแก้งบ</span>
          </div>
          <div id="budget-risk-plot" class="budget-plot">
            <span class="budget-axis budget-axis-100">100%</span>
            <span class="budget-axis budget-axis-80">80%</span>
            <div id="budget-risk-bars" class="budget-bars"></div>
            <div class="budget-line budget-line-100"></div>
            <div class="budget-line budget-line-80"></div>
          </div>
          <div id="budget-risk-names" class="budget-names"></div>
          <div id="budget-risk-pager" class="budget-pager" hidden>
            <button type="button" id="budget-risk-prev" class="budget-pager-button" aria-label="หน้าก่อนหน้า">‹</button>
            <div class="budget-pager-middle">
              <span id="budget-risk-page"></span>
              <span id="budget-risk-dots" class="budget-dots" aria-hidden="true"></span>
            </div>
            <button type="button" id="budget-risk-next" class="budget-pager-button" aria-label="หน้าถัดไป">›</button>
          </div>
        </section>
        <section id="budget-calm" class="budget-card" aria-labelledby="budget-calm-title" hidden>
          <div id="budget-calm-head" class="budget-card-head">
            <h2 id="budget-calm-title"></h2>
            <span id="budget-calm-note" class="budget-card-note"></span>
          </div>
          <div id="budget-calm-list" class="budget-calm-list"></div>
          <button type="button" id="budget-all-open" class="budget-card-link"></button>
        </section>
        <div id="budget-unset" class="budget-unset" hidden>
          <span id="budget-unset-text"></span>
          <button type="button" id="budget-unset-open">ตั้งงบ</button>
        </div>
      </section>
      <section id="budget-empty" class="budget-card budget-empty" aria-labelledby="budget-empty-title" hidden>
        <h2 id="budget-empty-title">ยังไม่ได้ตั้งงบเลย</h2>
        <p id="budget-empty-hint" class="budget-card-note"></p>
        <ul id="budget-empty-list" class="budget-empty-list"></ul>
      </section>
      <div class="categories-entry">
        <button type="button" id="categories-open" class="categories-open" disabled><svg class="icon"
            aria-hidden="true" focusable="false">
            <use href="#icon-categories"></use>
          </svg>จัดการหมวดหมู่</button>
        <p class="categories-entry-hint">เพิ่ม เปลี่ยนชื่อ เลือกไอคอน ซ่อน หรือลบหมวด</p>
      </div>
    </div>
```

หมายเหตุ: ปุ่ม `‹` `›` เป็นตัวอักษร ไม่ใช่ emoji ใช้ได้ ส่วน `#budget-risk-page` ต้องไม่ชนกับ id อื่น

- [ ] **Step 4: CSS**

ท้ายไฟล์ `public/liff/style.css` เพิ่ม (ค่าสีทั้งหมดมาจาก `tokens.css` ห้ามใส่ hex ใหม่ ยกเว้นสีแท่งพื้นหลังที่มี token ใหม่ด้านล่าง):

ก่อนอื่นเพิ่ม token ใน `public/liff/tokens.css` ภายใน `:root` ต่อจาก `--trend-income`:

```css
  --bar-track: #cfdcf2;
```

แล้วเพิ่มใน `style.css`:

```css
/* หน้างบ: แท่งเทียบเป็น % ทุกแท่งสูงเท่ากัน ถึงเส้นประคือเต็มงบ */
.level-ok { --level: var(--income); }
.level-warn { --level: var(--warn); }
.level-over { --level: var(--danger); }
.budgets-page { padding-bottom: 4px; }
.budget-hero { display: grid; grid-template-columns: 64px minmax(0, 1fr); column-gap: 14px; align-items: start; margin: 12px 16px 0; padding: 16px; background: var(--primary); color: var(--on-primary); border-radius: var(--radius-card); }
.budget-hero::before { content: ""; width: 64px; height: 64px; margin-top: 4px; border-radius: 50%; background: url(assets/mascot.webp) center / cover; box-shadow: 0 0 0 3px var(--surface); }
.budget-hero-bubble { position: relative; padding: 10px 14px 12px; background: var(--surface); color: var(--text); border-radius: 20px 20px 20px 6px; }
.budget-hero-bubble::before { content: ""; position: absolute; left: -10px; top: 24px; border-style: solid; border-width: 8px 10px 8px 0; border-color: transparent var(--surface) transparent transparent; }
.budget-hero-lead { margin: 0; font-size: 13px; font-weight: 600; color: var(--muted); }
.budget-hero-lead b { color: var(--primary); font-weight: 800; }
.budget-hero-value { margin: 0; line-height: 1.25; font-variant-numeric: tabular-nums; }
.budget-hero-percent { font-size: 26px; font-weight: 800; color: var(--level); }
.budget-hero-rest { font-size: 14px; font-weight: 700; color: var(--muted); }
.budget-card { margin: 12px 16px 0; padding: 14px 10px 10px; background: var(--surface); border-radius: var(--radius-card); box-shadow: var(--shadow-card); }
.budget-card h2 { margin: 0; font-size: 17px; font-weight: 800; }
.budget-card-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; padding: 0 6px 6px; }
.budget-card-note { font-size: 12px; color: var(--muted); }
.budget-plot { position: relative; height: 190px; --budget-h100: 130px; }
.budget-bars { position: absolute; left: 34px; right: 0; top: 0; bottom: 0; display: flex; justify-content: space-around; align-items: flex-end; }
.budget-col { position: relative; flex: none; width: 44px; height: 190px; margin: 0; padding: 0; border: none; border-radius: 12px; background: none; font: inherit; color: inherit; cursor: pointer; }
.budget-col:active { background: var(--brand-soft); }
.budget-bar { position: absolute; left: 50%; bottom: 0; width: 32px; margin-left: -16px; border-radius: 9px 9px 3px 3px; overflow: hidden; }
.budget-bar-track { position: absolute; left: 0; right: 0; bottom: 0; height: var(--budget-h100); background: var(--bar-track); }
.budget-bar-fill { position: absolute; left: 0; right: 0; bottom: 0; background: var(--level); }
.budget-bar-over { position: absolute; left: 0; right: 0; bottom: var(--budget-h100); background: var(--danger); }
.budget-col-pct { position: absolute; left: 0; right: 0; text-align: center; font-size: 13px; font-weight: 800; color: var(--level); font-variant-numeric: tabular-nums; }
/* เส้นอยู่ท้าย DOM เพื่อให้วาดทับหัวแท่ง ไม่โดนแท่งบัง */
.budget-line { position: absolute; left: 34px; right: 0; pointer-events: none; }
.budget-line-100 { bottom: var(--budget-h100); border-top: 2px dashed var(--text); }
.budget-line-80 { bottom: calc(var(--budget-h100) * 0.8); border-top: 1px dashed var(--warn); }
.budget-axis { position: absolute; left: 0; width: 30px; text-align: right; font-size: 10px; font-weight: 800; }
.budget-axis-100 { bottom: calc(var(--budget-h100) - 6px); }
.budget-axis-80 { bottom: calc(var(--budget-h100) * 0.8 - 6px); color: var(--warn); font-weight: 700; }
.budget-names { display: flex; justify-content: space-around; margin: 4px 0 0 34px; }
.budget-col-name { flex: none; width: 48px; text-align: center; line-height: 1.25; }
.budget-col-name-text { min-height: 28px; font-size: 11px; font-weight: 700; overflow-wrap: anywhere; }
.budget-col-diff { font-size: 11px; font-weight: 800; color: var(--level); }
.budget-pager { display: flex; align-items: center; justify-content: space-between; margin-top: 4px; }
.budget-pager-button { width: 44px; height: 44px; border: none; border-radius: 50%; background: var(--brand-soft); color: var(--primary); font: inherit; font-size: 22px; font-weight: 800; }
.budget-pager-button:disabled { background: var(--disabled-bg); color: var(--muted); }
.budget-pager-middle { display: flex; flex-direction: column; align-items: center; gap: 4px; font-size: 12px; font-weight: 700; color: var(--muted); }
.budget-dots { display: flex; gap: 6px; }
.budget-dot { width: 8px; height: 8px; border-radius: 4px; background: var(--border); }
.budget-dot.active { width: 22px; background: var(--primary); }
.budget-calm-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 16px; padding: 0 4px; }
.budget-calm-item { display: block; min-height: 44px; padding: 4px 0 8px; border: none; background: none; font: inherit; color: inherit; text-align: left; cursor: pointer; }
.budget-calm-line { display: flex; justify-content: space-between; gap: 6px; font-size: 13px; }
.budget-calm-name { min-width: 0; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.budget-calm-pct { font-weight: 800; color: var(--income); }
.budget-calm-track { display: block; height: 6px; margin-top: 4px; border-radius: 3px; background: var(--bar-track); overflow: hidden; }
.budget-calm-fill { display: block; height: 100%; background: var(--income); }
.budget-card-link { display: block; width: 100%; min-height: 48px; border: none; border-top: 1px solid var(--border); background: none; font: inherit; font-size: 14px; font-weight: 800; color: var(--primary); cursor: pointer; }
.budget-unset { display: flex; align-items: center; gap: 10px; margin: 12px 16px 0; padding: 4px 4px 4px 16px; border: 1.5px dashed var(--outline); border-radius: 18px; font-size: 13px; color: var(--muted); }
.budget-unset > span { flex: 1; min-width: 0; }
.budget-unset > button { flex: none; min-height: 44px; padding: 0 14px; border: none; background: none; font: inherit; font-size: 14px; font-weight: 800; color: var(--primary); cursor: pointer; }
.budget-many { margin: 12px 16px 0; }
.budget-many-search { display: flex; align-items: center; width: 100%; min-height: 48px; padding: 0 16px; border: 1px solid var(--border); border-radius: var(--radius-pill); background: var(--surface); font: inherit; font-size: 15px; color: var(--muted); text-align: left; cursor: pointer; }
.budget-many-chips { display: flex; gap: 8px; margin-top: 8px; overflow: hidden; }
.budget-many-chip { flex: none; min-height: 44px; padding: 0 14px; border: 1px solid var(--border); border-radius: var(--radius-pill); background: var(--surface); font: inherit; font-size: 13px; font-weight: 700; color: var(--text); cursor: pointer; }
.budget-error-card { margin: 12px 16px 0; padding: 20px 18px; background: var(--surface); border-radius: var(--radius-card); box-shadow: var(--shadow-card); }
.budget-error-title { margin: 0; font-size: 19px; font-weight: 800; }
.budget-error-text { margin: 4px 0 0; font-size: 14px; color: var(--muted); }
.budget-cta { display: block; width: 100%; min-height: 52px; margin-top: 16px; border: none; border-radius: var(--radius-pill); background: var(--cta); color: var(--on-cta); font: inherit; font-size: 16px; font-weight: 800; cursor: pointer; }
.budget-cta:active { background: var(--cta-pressed); }
.skeleton-budget-hero { height: 112px; margin-top: 0; border-radius: 24px; }
.skeleton-budget-chart { height: 300px; margin-top: 12px; border-radius: 24px; }
.skeleton-budget-list { height: 150px; margin-top: 12px; border-radius: 24px; }
.budget-empty-list { list-style: none; margin: 8px 0 0; padding: 0; }
.budget-empty-item { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; column-gap: 12px; min-height: 68px; padding: 8px 4px; border-top: 1px solid var(--border); }
.budget-empty-name { font-size: 15px; font-weight: 700; }
.budget-empty-spent { display: block; font-size: 12px; font-weight: 400; color: var(--muted); }
.budget-empty-set { min-height: 44px; padding: 0 16px; border: 1.5px solid var(--primary); border-radius: 12px; background: var(--surface); font: inherit; font-size: 14px; font-weight: 800; color: var(--primary); cursor: pointer; }
```

(`.categories-open` เดิมเป็นปุ่มขอบหนาตรงกลาง ให้ปรับเป็นแถวการ์ดโดยแก้กฎเดิม `.categories-open` ในไฟล์ ให้ `justify-content: flex-start; background: var(--surface); border: none; border-radius: 18px; box-shadow: var(--shadow-card);` เปิดดูกฎเดิมก่อนแก้ ห้ามลบ `:active`)

- [ ] **Step 5: เทสต์ CSS**

ใน `public/liff/style.test.mjs` เพิ่ม:

```js
describe('style.css budget columns', () => {
  // แท่งเป็นชิ้นเดียว ตัดมุมที่กรอบนอก ไม่ให้ส่วนสีแดงต่อทับแล้วเกิดรอยหยัก
  it('clips the bar to one rounded shape', () => {
    const rule = declarations('.budget-bar');

    expect(rule).toMatch(/overflow:\s*hidden/);
    expect(rule).toMatch(/border-radius:\s*9px 9px 3px 3px/);
  });

  it('draws the 100 percent line over the columns without blocking taps', () => {
    expect(declarations('.budget-line')).toMatch(/pointer-events:\s*none/);
    expect(declarations('.budget-line-100')).toMatch(/dashed/);
  });

  it('keeps the track a visible solid colour', () => {
    expect(declarations('.budget-bar-track')).toMatch(/background:\s*var\(--bar-track\)/);
    expect(declarations('.budget-bar-track')).not.toMatch(/opacity/);
  });
});
```

Run: `npx vitest run public/liff/style.test.mjs` Expected: PASS (และ `tokens.test.mjs` ยังผ่าน เพราะ `--bar-track` เป็น `#rrggbb`)

- [ ] **Step 6: เขียน `budgets-panel.mjs`**

```js
import { barGeometry, describeDiff, describeHero, groupBudgetRows, pageBudgetRows, summarizeBudgets } from './budgets-format.mjs';

// ความสูงแท่งที่ 100% ของงบ ต้องเท่ากับค่าเริ่มต้นของ --budget-h100 ใน style.css
export const BUDGET_H100 = 130;
const RISK_PAGE_SIZE = 6;
const CALM_PREVIEW_LIMIT = 8;
const MANY_THRESHOLD = 14;
const EMPTY_SUGGESTION_LIMIT = 5;
const UNSET_NAME_LIMIT = 3;

function node(doc, tag, className, text) {
  const el = doc.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

function button(doc, className, text) {
  const el = node(doc, 'button', className, text);
  el.type = 'button';
  return el;
}

export function createBudgetsPanel({ doc, els, onEdit, onOpenAll }) {
  let groups = { risk: [], calm: [], unset: [] };
  let riskPage = 0;
  let focusId = null;

  function renderHero(summary) {
    const hero = describeHero(summary);
    els.heroPercent.textContent = hero.percentText;
    els.heroPercent.className = `budget-hero-percent level-${hero.level}`;
    els.heroRest.textContent = hero.restText;
  }

  function renderMany(budgetedCount) {
    const total = budgetedCount + groups.unset.length;
    els.many.hidden = total <= MANY_THRESHOLD;
    if (els.many.hidden) return;
    els.manySearch.textContent = `ค้นหาหมวดจาก ${total} หมวด`;
    els.manyChips.replaceChildren();
    const chips = [
      ['ต้องดูแล', groups.risk.length, 'risk'],
      ['ปกติ', groups.calm.length, 'calm'],
      ['ไม่มีงบ', groups.unset.length, 'unset'],
    ];
    for (const [label, count, tab] of chips) {
      const chip = button(doc, 'budget-many-chip', `${label} ${count}`);
      chip.addEventListener('click', () => onOpenAll({ tab }));
      els.manyChips.append(chip);
    }
  }

  function renderRisk() {
    const { risk } = groups;
    els.risk.hidden = risk.length === 0;
    if (risk.length === 0) return;
    els.riskTitle.textContent = `ต้องดูแล ${risk.length} หมวด`;
    const { items, page, pageCount } = pageBudgetRows(risk, riskPage, RISK_PAGE_SIZE);
    riskPage = page;
    els.riskPlot.style.setProperty('--budget-h100', `${BUDGET_H100}px`);
    els.riskBars.replaceChildren();
    els.riskNames.replaceChildren();
    for (const row of items) {
      const geometry = barGeometry(row, { h100: BUDGET_H100 });
      const col = button(doc, 'budget-col');
      col.dataset.categoryId = row.categoryId;
      col.setAttribute('aria-label', `${row.category} ${row.percent}% ของงบ ${describeDiff(row)}`);
      const bar = node(doc, 'span', 'budget-bar');
      bar.style.height = `${geometry.barH}px`;
      const fill = node(doc, 'span', `budget-bar-fill level-${row.level}`);
      fill.style.height = `${geometry.fillH}px`;
      const over = node(doc, 'span', 'budget-bar-over');
      over.style.height = `${geometry.overH}px`;
      bar.append(node(doc, 'span', 'budget-bar-track'), fill, over);
      const pct = node(doc, 'span', `budget-col-pct level-${row.level}`, `${row.percent}%`);
      pct.style.bottom = `${geometry.labelBottom}px`;
      col.append(bar, pct);
      col.addEventListener('click', () => onEdit(row));
      els.riskBars.append(col);
      const name = node(doc, 'div', 'budget-col-name');
      name.append(node(doc, 'div', 'budget-col-name-text', row.category), node(doc, 'div', `budget-col-diff level-${row.level}`, describeDiff(row)));
      els.riskNames.append(name);
      // render ใหม่ทำให้ปุ่มเดิมหาย จึงคืน focus ให้แท่งของหมวดที่เพิ่งแก้
      if (focusId === row.categoryId) col.focus();
    }
    els.riskPager.hidden = pageCount <= 1;
    els.riskPageLabel.textContent = `หน้า ${page + 1} จาก ${pageCount}`;
    els.riskPrev.disabled = page === 0;
    els.riskNext.disabled = page === pageCount - 1;
    els.riskDots.replaceChildren();
    for (let index = 0; index < pageCount; index += 1) {
      els.riskDots.append(node(doc, 'span', index === page ? 'budget-dot active' : 'budget-dot'));
    }
  }

  function renderCalm(budgetedCount) {
    const { calm } = groups;
    els.calm.hidden = budgetedCount === 0;
    els.calmHead.hidden = calm.length === 0;
    els.calmList.hidden = calm.length === 0;
    els.calmTitle.textContent = `ปกติ ${calm.length} หมวด`;
    els.calmNote.textContent = calm.length > CALM_PREVIEW_LIMIT ? `แสดง ${CALM_PREVIEW_LIMIT} หมวดที่ใช้มากสุด` : 'ใช้ไม่ถึง 80%';
    els.calmList.replaceChildren();
    for (const row of calm.slice(0, CALM_PREVIEW_LIMIT)) {
      const item = button(doc, 'budget-calm-item');
      item.dataset.categoryId = row.categoryId;
      const line = node(doc, 'span', 'budget-calm-line');
      line.append(node(doc, 'span', 'budget-calm-name', row.category), node(doc, 'span', 'budget-calm-pct', `${row.percent}%`));
      const track = node(doc, 'span', 'budget-calm-track');
      const fill = node(doc, 'span', 'budget-calm-fill');
      fill.style.width = `${Math.max(row.percent, 2)}%`;
      track.append(fill);
      item.append(line, track);
      item.addEventListener('click', () => onEdit(row));
      els.calmList.append(item);
      // คืน focus ให้แถวปกติที่เพิ่งแก้ เหมือนแท่งในส่วนต้องดูแล
      if (focusId === row.categoryId) item.focus();
    }
    els.calmAll.textContent = `ดูทั้งหมด ${budgetedCount} หมวด ›`;
  }

  function renderUnset() {
    const { unset } = groups;
    els.unset.hidden = unset.length === 0;
    if (unset.length === 0) return;
    const names = unset.slice(0, UNSET_NAME_LIMIT).map((row) => row.category).join(' · ');
    const more = unset.length > UNSET_NAME_LIMIT ? ` และอีก ${unset.length - UNSET_NAME_LIMIT} หมวด` : '';
    els.unsetText.textContent = `ยังไม่ตั้งงบ ${unset.length} หมวด: ${names}${more}`;
  }

  function renderEmpty() {
    const suggestions = groups.unset.filter((row) => row.spent > 0).slice(0, EMPTY_SUGGESTION_LIMIT);
    els.emptyHint.textContent = suggestions.length > 0
      ? 'ตั้งสักหมวด เฮียจะเตือนตอนใกล้เต็ม เริ่มจากหมวดที่ใช้บ่อยด้านล่างได้เลย'
      : 'ตั้งสักหมวด เฮียจะเตือนตอนใกล้เต็ม ลองจดรายจ่ายในแชตก่อน แล้วกลับมาตั้งงบ';
    els.emptyList.replaceChildren();
    for (const row of suggestions) {
      const item = node(doc, 'li', 'budget-empty-item');
      const name = node(doc, 'span', 'budget-empty-name', row.category);
      name.append(node(doc, 'span', 'budget-empty-spent', `ใช้ไปเดือนนี้ ${row.spent.toLocaleString('en-US', { maximumFractionDigits: 2 })} บาท`));
      const set = button(doc, 'budget-empty-set', 'ตั้งงบ');
      set.setAttribute('aria-label', `ตั้งงบ ${row.category}`);
      set.addEventListener('click', () => onEdit(row));
      item.append(name, set);
      els.emptyList.append(item);
    }
  }

  function render(budgets, { focusCategoryId = null } = {}) {
    const summary = summarizeBudgets(budgets);
    groups = groupBudgetRows(budgets);
    focusId = focusCategoryId;
    els.section.hidden = !summary.hasBudgets;
    els.empty.hidden = summary.hasBudgets;
    if (!summary.hasBudgets) {
      renderEmpty();
      return;
    }
    const budgetedCount = summary.counts.over + summary.counts.warn + summary.counts.ok;
    renderHero(summary);
    renderMany(budgetedCount);
    renderRisk();
    renderCalm(budgetedCount);
    renderUnset();
    focusId = null;
  }

  // ถ้าไม่มีหมวดที่ต้องดูแล เปิดแท็บปกติแทน ไม่งั้นผู้ใช้เจอแท็บว่าง
  const firstTab = () => (groups.risk.length > 0 ? 'risk' : 'calm');

  els.riskPrev.addEventListener('click', () => {
    riskPage -= 1;
    renderRisk();
  });
  els.riskNext.addEventListener('click', () => {
    riskPage += 1;
    renderRisk();
  });
  els.manySearch.addEventListener('click', () => onOpenAll({ tab: firstTab(), focusSearch: true }));
  els.calmAll.addEventListener('click', () => onOpenAll({ tab: firstTab() }));
  els.unsetOpen.addEventListener('click', () => onOpenAll({ tab: 'unset' }));

  return { render };
}
```

- [ ] **Step 7: ต่อสายใน `app.mjs`**

ทำตามนี้ (ค้นตำแหน่งด้วยข้อความ ไม่ใช้เลขบรรทัดเพราะจะขยับ):

1. import: เพิ่ม `import { createBudgetsPanel } from './budgets-panel.mjs';` ต่อจาก import `reveal.mjs` และลบ `budgetRows,` ออกจากรายการ import จาก `./format.mjs` (app.mjs จะไม่เรียกตรงอีก ไม่งั้น eslint ฟ้อง unused)
2. ใน `els` ลบ `budgetRows: document.getElementById('budget-rows'),` และเพิ่มต่อจาก `budgets: document.getElementById('budgets'),`:
```js
  budgetHero: document.getElementById('budget-hero'),
  budgetHeroPercent: document.getElementById('budget-hero-percent'),
  budgetHeroRest: document.getElementById('budget-hero-rest'),
  budgetMany: document.getElementById('budget-many'),
  budgetManySearch: document.getElementById('budget-many-search'),
  budgetManyChips: document.getElementById('budget-many-chips'),
  budgetRisk: document.getElementById('budget-risk'),
  budgetRiskTitle: document.getElementById('budget-risk-title'),
  budgetRiskPlot: document.getElementById('budget-risk-plot'),
  budgetRiskBars: document.getElementById('budget-risk-bars'),
  budgetRiskNames: document.getElementById('budget-risk-names'),
  budgetRiskPager: document.getElementById('budget-risk-pager'),
  budgetRiskPage: document.getElementById('budget-risk-page'),
  budgetRiskPrev: document.getElementById('budget-risk-prev'),
  budgetRiskNext: document.getElementById('budget-risk-next'),
  budgetRiskDots: document.getElementById('budget-risk-dots'),
  budgetCalm: document.getElementById('budget-calm'),
  budgetCalmHead: document.getElementById('budget-calm-head'),
  budgetCalmTitle: document.getElementById('budget-calm-title'),
  budgetCalmNote: document.getElementById('budget-calm-note'),
  budgetCalmList: document.getElementById('budget-calm-list'),
  budgetAllOpen: document.getElementById('budget-all-open'),
  budgetUnset: document.getElementById('budget-unset'),
  budgetUnsetText: document.getElementById('budget-unset-text'),
  budgetUnsetOpen: document.getElementById('budget-unset-open'),
  budgetEmpty: document.getElementById('budget-empty'),
  budgetEmptyHint: document.getElementById('budget-empty-hint'),
  budgetEmptyList: document.getElementById('budget-empty-list'),
```
3. หลังประกาศ `budgetsLoading` เพิ่ม:
```js
// เฟส 1: ปลายทางของ onOpenAll ยังเป็นฟังก์ชันว่าง Task 4 มาเติมหน้าดูทั้งหมด
let openBudgetsAll = () => {};
const budgetsPanel = createBudgetsPanel({
  doc: document,
  els: {
    section: els.budgets, hero: els.budgetHero, heroPercent: els.budgetHeroPercent, heroRest: els.budgetHeroRest,
    many: els.budgetMany, manySearch: els.budgetManySearch, manyChips: els.budgetManyChips,
    risk: els.budgetRisk, riskTitle: els.budgetRiskTitle, riskPlot: els.budgetRiskPlot, riskBars: els.budgetRiskBars,
    riskNames: els.budgetRiskNames, riskPager: els.budgetRiskPager, riskPageLabel: els.budgetRiskPage,
    riskPrev: els.budgetRiskPrev, riskNext: els.budgetRiskNext, riskDots: els.budgetRiskDots,
    calm: els.budgetCalm, calmHead: els.budgetCalmHead, calmTitle: els.budgetCalmTitle, calmNote: els.budgetCalmNote,
    calmList: els.budgetCalmList, calmAll: els.budgetAllOpen,
    unset: els.budgetUnset, unsetText: els.budgetUnsetText, unsetOpen: els.budgetUnsetOpen,
    empty: els.budgetEmpty, emptyHint: els.budgetEmptyHint, emptyList: els.budgetEmptyList,
  },
  onEdit: (row) => openBudgetEditor(row),
  onOpenAll: (options) => openBudgetsAll(options),
});
```
   (`openBudgetEditor` เป็น function declaration ด้านล่างไฟล์ จึงเรียกจาก arrow ได้เพราะ hoisting)
4. แทนที่ฟังก์ชัน `renderBudgets` ทั้งตัวด้วย:
```js
function renderBudgets(budgets, focusCategoryId = null) {
  budgetsLoading.set(false);
  els.budgetsError.hidden = true;
  budgetsPanel.render(budgets, { focusCategoryId });
}
```
5. ใน `showBudgetsError` เปลี่ยน `els.budgetRows.replaceChildren();` เป็น `els.budgets.hidden = true;` และเปลี่ยน `els.budgets.hidden = false;` (บรรทัดถัดไป) ให้ลบทิ้ง และเพิ่ม `els.budgetEmpty.hidden = true;` ในฟังก์ชันเดียวกัน กันการ์ด empty กับการ์ด error โชว์พร้อมกันเมื่อโหลดซ้ำล้ม (เพิ่มเทสต์ใน Task 3: เข้า empty แล้วโหลดซ้ำล้ม ต้องเห็นเฉพาะ `budgets-error` และ `budget-empty` ต้อง hidden)
6. ใน `loadBudgets` เอา option `animate` ออกจากพารามิเตอร์และจาก `renderBudgets(budgets, focusCategoryId, { animate })` เป็น `renderBudgets(budgets, focusCategoryId)` แล้วแก้ผู้เรียก `loadBudgets({ animate: reset })` เป็น `loadBudgets()`
7. ในส่วนที่ `loadMonth({ reset })` เตรียมสถานะโหลด (ประมาณ `els.budgetRows.replaceChildren(); els.budgetsError.hidden = true; budgetsLoading.set(true); els.budgets.hidden = false;`) เปลี่ยนเป็น `els.budgets.hidden = true; els.budgetEmpty.hidden = true; els.budgetsError.hidden = true; budgetsLoading.set(true);`
8. ในตัวเปลี่ยนแท็บ `if (id === 'budgets') playBars(window, els.budgetRows);` ให้ลบบรรทัดนี้ (ยังคง import `playBars` ไว้เพราะแท็บอื่นใช้)

- [ ] **Step 8: รันเทสต์ให้ผ่าน**

Run: `npx vitest run public/liff`
Expected: PASS ทั้งหมด ถ้ามีเทสต์เก่าอื่นที่ล้มเพราะโครงงบเปลี่ยน ให้แก้ตามหัวข้อ "แก้เทสต์เดิม" ใน Step 1 ห้ามลบเทสต์ที่ไม่เกี่ยวกับงบ

- [ ] **Step 9: ตรวจรวม**

Run: `npm test` และ `npx eslint .` Expected: ผ่านทั้งคู่ (ถ้า `try-parse` timeout ตอนรันรวม ให้รัน `npx vitest run scripts` เดี่ยว ตามที่บันทึกไว้ใน STATE)

- [ ] **Step 10: Commit (ถามผู้ใช้ก่อน)** `feat: redesign the budget tab with equal-height percent columns`

---

### Task 3: สถานะโหลด / ผิดพลาด / ยังไม่เคยตั้งงบ

**Depends on:** Task 2

**Files:**
- Modify: `public/liff/app.mjs` (`budgetsLoading`, `showBudgetsError`)
- Test: `public/liff/app.dom.test.mjs`

(markup, CSS, `renderEmpty` ถูกวางไว้แล้วใน Task 2 งานนี้เพิ่มเทสต์และ skeleton)

**Interfaces:**
- Consumes: `createLoadingIndicator` (`skeleton.mjs`), CSS `.skeleton-budget-hero/-chart/-list` จาก Task 2
- Produces: none

**Browser check:**
- Preconditions: เหมือน Task 2 และผู้ใช้เตรียมบัญชีที่ยังไม่เคยตั้งงบ (หรือลบงบทุกหมวดชั่วคราว) ส่วนสถานะผิดพลาดให้ผู้ใช้ปิดเน็ตตอนกดเข้าแท็บ งบ

| # | Action | Expected |
|---|---|---|
| 1 | เปิดแท็บ งบ ด้วยบัญชีที่ไม่มีงบ | เห็นการ์ด "ยังไม่ได้ตั้งงบเลย" พร้อมรายการหมวดที่ใช้บ่อยและปุ่ม "ตั้งงบ" ต่อแถว |
| 2 | กด "ตั้งงบ" ที่แถวแรก | dialog แก้งบเดิมเปิด หัวข้อ "งบ <ชื่อหมวด>" |
| 3 | ปิดเน็ตแล้วเปิดแท็บ งบ | เห็นการ์ด "ตอนนี้เฮียโหลดงบให้ไม่ได้" ข้อความ "โหลดงบไม่สำเร็จ" และปุ่ม "ลองใหม่" |
| 4 | เปิดเน็ตแล้วกด "ลองใหม่" | หน้าหลักโหลดขึ้นตามปกติ |

- [ ] **Step 1: เขียนเทสต์ที่ล้ม**

```js
describe('LIFF budgets page states', () => {
  it('shapes the skeleton like hero, chart and list', async () => {
    await boot();
    const variants = [...byId('budgets-skeleton').children].map((item) => item.className.replace('skeleton skeleton-', ''));

    expect(variants).toEqual(['budget-hero', 'budget-chart', 'budget-list']);
  });

  it('shows the error card with a retry button when loading fails', async () => {
    await openBudgets({ '/api/budgets': { status: 500 } });

    expect(byId('budgets-error').hidden).toBe(false);
    expect(byId('budgets-error-text').textContent).toBe('โหลดงบไม่สำเร็จ');
    expect(byId('budgets-retry').hidden).toBe(false);
    expect(byId('budgets').hidden).toBe(true);
  });

  it('hides the retry button when login is required', async () => {
    await openBudgets({ '/api/budgets': { status: 401 } });

    expect(byId('budgets-retry').hidden).toBe(true);
  });

  it('shows the empty state with the most spent categories first', async () => {
    await openBudgets({
      '/api/budgets': {
        budgets: [
          { categoryId: 'a', category: 'ก', budget: null, spent: 100 },
          { categoryId: 'b', category: 'ข', budget: null, spent: 900 },
          { categoryId: 'c', category: 'ค', budget: null, spent: 0 },
        ],
      },
    });
    const items = [...byId('budget-empty-list').querySelectorAll('.budget-empty-item')];

    expect(byId('budget-empty').hidden).toBe(false);
    expect(byId('budgets').hidden).toBe(true);
    expect(items.map((item) => item.querySelector('.budget-empty-name').firstChild.textContent)).toEqual(['ข', 'ก']);
  });

  it('shows only the error card when a reload after saving fails from the empty state', async () => {
    await openBudgets({ '/api/budgets': { budgets: [{ categoryId: 'b', category: 'ข', budget: null, spent: 900 }] } });
    byId('budget-empty-list').querySelector('.budget-empty-set').click();
    byId('budget-amount').value = '500';
    routeFetch((method, path) => (method === 'PUT' ? {} : path === '/api/budgets' ? { status: 500 } : undefined));

    byId('budget-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();

    expect(byId('budgets-error').hidden).toBe(false);
    expect(byId('budget-empty').hidden).toBe(true);
  });

  it('opens the editor from an empty state row', async () => {
    await openBudgets({ '/api/budgets': { budgets: [{ categoryId: 'b', category: 'ข', budget: null, spent: 900 }] } });

    byId('budget-empty-list').querySelector('.budget-empty-set').click();

    expect(byId('budget-title').textContent).toBe('งบ ข');
  });

  it('tells the user to log spending first when there is nothing to suggest', async () => {
    await openBudgets({ '/api/budgets': { budgets: [] } });

    expect(byId('budget-empty-list').children).toHaveLength(0);
    expect(byId('budget-empty-hint').textContent).toContain('ลองจดรายจ่ายในแชตก่อน');
  });
});
```

(เทสต์ผิดพลาดใช้รูปแบบ override `{ status: N }` ที่ `makeFetch` ในไฟล์เทสต์รองรับอยู่แล้ว)

และแก้เทสต์เดิม `shapes each skeleton like the content that replaces it`: บรรทัด `expect(variants('budgets-skeleton')).toEqual([...])` เปลี่ยนเป็น `['budget-hero', 'budget-chart', 'budget-list']` (ถ้าเทสต์นั้นกับเทสต์ใหม่ซ้ำกันให้เหลืออันเดียว)

- [ ] **Step 2: รันให้เห็นว่าล้ม**

Run: `npx vitest run public/liff/app.dom.test.mjs -t "budgets page states"`
Expected: FAIL (skeleton ยังเป็น `budget` x4)

- [ ] **Step 3: แก้ skeleton ใน `app.mjs`**

เปลี่ยนบรรทัด `const budgetsLoading = createLoadingIndicator({ ... count: 4, variant: 'budget' });` เป็น:

```js
const budgetsLoading = createLoadingIndicator({ doc: document, textEl: els.budgetsLoading, skeletonEl: els.budgetsSkeleton, variants: ['budget-hero', 'budget-chart', 'budget-list'] });
```

- [ ] **Step 4: รันให้ผ่าน** `npx vitest run public/liff` Expected: PASS

- [ ] **Step 5: เทสต์ความสูง skeleton ใน `style.test.mjs`**

ในรายการ `it.each([... 'bill-switch', 'bill-card'])` ของเทสต์ความสูง skeleton เพิ่ม `'budget-hero', 'budget-chart', 'budget-list'` Run: `npx vitest run public/liff/style.test.mjs` Expected: PASS

- [ ] **Step 6: ตรวจรวม** `npm test` และ `npx eslint .` Expected: ผ่าน

- [ ] **Step 7: Commit (ถามผู้ใช้ก่อน)** `feat: add loading, error and empty states to the budget tab`

---

### Task 4: หน้าย่อย "ดูทั้งหมด"

**Depends on:** Task 3

**Files:**
- Create: `public/liff/budgets-all-panel.mjs`
- Modify: `public/liff/index.html` (เพิ่ม `#panel-budget-all` ต่อจาก `#panel-budgets`)
- Modify: `public/liff/style.css`
- Modify: `public/liff/app.mjs`
- Test: `public/liff/app.dom.test.mjs`

**Interfaces:**
- Consumes: `groupBudgetRows, filterBudgetRows, sortBudgetRows, sectionsForTab, describeDiff, formatNumber` (Task 1), `enterSubPage(page)` และออบเจ็กต์หน้า `{ panelId, title, backLabel, ownerTab, returnFocus, render? }` ที่ `app.mjs` ใช้อยู่แล้ว, `badgeFor(name, 'expense')` ใน `app.mjs`, `formatMonthLabel` จาก `format.mjs`
- Produces: `createBudgetsAllPanel({ doc, els, badgeFor, onEdit, getMonth }): { setBudgets(budgets, { focusCategoryId }), show({ tab }) }`
  - `els` keys: `tabs` (container ของปุ่มแท็บ `button[data-tab]`), `search`, `clear`, `sort`, `count`, `list`, `empty`, `emptyTitle`, `emptyClear`, `tabEmpty`

**Browser check:**
- Preconditions: เหมือน Task 2 บัญชีมีทั้งหมวดเกินงบ ใกล้เต็ม ปกติ และไม่มีงบ
- Base URL: ลิงก์ LIFF

| # | Action | Expected |
|---|---|---|
| 1 | แท็บ งบ กด "ดูทั้งหมด N หมวด ›" | เปิดหน้าย่อย หัวข้อ "ดูงบทุกหมวด" ปุ่มย้อนกลับมุมซ้าย ไม่มีแถบเมนูล่าง แท็บ "ต้องดูแล" ถูกเลือก |
| 2 | ดูแถวหมวดที่เกินงบ | ไอคอนหมวดมีจุดสถานะมุมล่างขวา ตัวเลข % ตัวหนาสีแดงเข้ม ไม่มีแคปซูลหรือแท่ง มีข้อความ "เกิน ..." ใต้ตัวเลข |
| 3 | กดแท็บ "ปกติ" | แถวเป็นหมวดที่ใช้ต่ำกว่า 80% มีหัวคั่น "ใช้ 50-79% ของงบ" / "ใช้ต่ำกว่า 50%" |
| 4 | กดแท็บ "ไม่มีงบ" | แต่ละแถวมีปุ่ม "ตั้งงบ" |
| 5 | พิมพ์ชื่อหมวดที่ไม่มีอยู่ในช่องค้นหา | เห็นมาสคอตและข้อความ `ไม่พบหมวด "..."` พร้อมปุ่ม "ล้างคำค้น" |
| 6 | กด "ล้างคำค้น" แล้วแตะแถวหนึ่ง | รายการกลับมา และ dialog แก้งบเปิดขึ้น |
| 7 | กดปุ่มย้อนกลับ (ในหน้า และปุ่มย้อนกลับของเครื่อง) | กลับหน้างบ ไม่ออกจาก LIFF |

- [ ] **Step 1: เขียนเทสต์ที่ล้ม**

```js
describe('LIFF budgets all page', () => {
  async function openAll(tabButtonId = 'budget-all-open') {
    await openBudgets();
    byId(tabButtonId).click();
    await settle();
  }

  it('opens as a sub page with the back label for the budgets tab', async () => {
    await openAll();

    expect(byId('panel-budget-all').hidden).toBe(false);
    expect(byId('panel-budgets').hidden).toBe(true);
    expect(byId('bottom-nav').hidden).toBe(true);
    expect(byId('page-title').textContent).toBe('ดูงบทุกหมวด');
    expect(byId('page-back').getAttribute('aria-label')).toBe('กลับไปหน้างบ');
  });

  it('starts on the risk tab with section headers and percent as plain text', async () => {
    await openAll();
    const rows = [...byId('budget-all-list').querySelectorAll('.budget-all-row')];
    const heads = [...byId('budget-all-list').querySelectorAll('.budget-all-head')].map((head) => head.textContent);

    expect(heads).toEqual(['เต็มหรือเกินงบ 1 หมวด', 'ใกล้เต็ม 1 หมวด']);
    expect(rows.map((row) => row.querySelector('.budget-all-name').textContent)).toEqual(['ช้อปปิ้ง', 'เดินทาง']);
    expect(rows[0].querySelector('.budget-all-pct').textContent).toBe('115%');
    expect(rows[0].querySelector('.budget-all-diff').textContent).toBe('เกิน 450');
    expect(rows[0].querySelector('.cat-badge')).not.toBeNull();
    expect(rows[0].querySelector('.budget-all-dot').className).toContain('level-over');
    expect(byId('budget-all-list').querySelector('.budget-bar, .budget-track, .budget-fill')).toBeNull();
  });

  it('shows the counts on the tabs and switches between groups', async () => {
    await openAll();
    const tabs = [...byId('budget-all-tabs').querySelectorAll('button[data-tab]')];

    expect(tabs.map((tab) => tab.textContent)).toEqual(['ต้องดูแล 2', 'ปกติ 1', 'ไม่มีงบ 2']);
    expect(tabs[0].getAttribute('aria-pressed')).toBe('true');

    tabs[1].click();

    expect(tabs[1].getAttribute('aria-pressed')).toBe('true');
    expect([...byId('budget-all-list').querySelectorAll('.budget-all-name')].map((name) => name.textContent)).toEqual(['อาหาร']);
  });

  it('puts a set-budget button on every unset row that opens the editor', async () => {
    await openAll();
    byId('budget-all-tabs').querySelector('button[data-tab="unset"]').click();
    const buttons = byId('budget-all-list').querySelectorAll('.budget-all-set');

    expect(buttons).toHaveLength(2);

    buttons[0].click();

    expect(byId('budget-title').textContent).toBe('งบ บันเทิง');
  });

  it('filters all groups by the search text and updates the counts', async () => {
    await openAll();

    byId('budget-all-search').value = 'อาหาร';
    byId('budget-all-search').dispatchEvent(new Event('input'));

    expect([...byId('budget-all-tabs').querySelectorAll('button[data-tab]')].map((tab) => tab.textContent)).toEqual(['ต้องดูแล 0', 'ปกติ 1', 'ไม่มีงบ 0']);
    expect(byId('budget-all-tab-empty').hidden).toBe(false);
    expect(byId('budget-all-tab-empty').textContent).toBe('ไม่มีหมวดในกลุ่มนี้');
  });

  it('shows the not-found state only when no group matches and can clear the search', async () => {
    await openAll();
    byId('budget-all-search').value = 'กาแฟแก้ว';
    byId('budget-all-search').dispatchEvent(new Event('input'));

    expect(byId('budget-all-empty').hidden).toBe(false);
    expect(byId('budget-all-empty-title').textContent).toBe('ไม่พบหมวด "กาแฟแก้ว"');
    expect(byId('budget-all-list').hidden).toBe(true);

    byId('budget-all-empty-clear').click();

    expect(byId('budget-all-search').value).toBe('');
    expect(byId('budget-all-empty').hidden).toBe(true);
    expect(byId('budget-all-list').querySelectorAll('.budget-all-row').length).toBeGreaterThan(0);
  });

  it('sorts by name when asked', async () => {
    await openAll();
    byId('budget-all-tabs').querySelector('button[data-tab="unset"]').click();

    byId('budget-all-sort').value = 'name';
    byId('budget-all-sort').dispatchEvent(new Event('change'));

    expect([...byId('budget-all-list').querySelectorAll('.budget-all-name')].map((name) => name.textContent)).toEqual(['บันเทิง', 'อื่นๆ']);
  });

  it('shows the month and how many categories are listed', async () => {
    await openAll();

    expect(byId('budget-all-count').textContent).toBe('10/2026 · แสดง 2 จาก 2 หมวด');
  });

  it('opens the unset tab from the strip on the main page and focuses search from the many bar', async () => {
    await openBudgets();
    byId('budget-unset-open').click();

    expect(byId('budget-all-tabs').querySelector('button[data-tab="unset"]').getAttribute('aria-pressed')).toBe('true');
  });

  it('opens the calm tab from see-all when nothing needs attention', async () => {
    await openBudgets({ '/api/budgets': { budgets: [{ categoryId: 'c-food', category: 'อาหาร', budget: 6000, spent: 600 }] } });

    byId('budget-all-open').click();
    await settle();

    expect(byId('budget-all-tabs').querySelector('button[data-tab="calm"]').getAttribute('aria-pressed')).toBe('true');
  });

  it('goes back to the budgets tab', async () => {
    await openAll();

    byId('page-back').click();

    expect(byId('panel-budgets').hidden).toBe(false);
    expect(byId('panel-budget-all').hidden).toBe(true);
    expect(document.activeElement).toBe(byId('budget-all-open'));
  });

  it('refreshes the rows after a budget is saved from this page', async () => {
    await openAll();
    byId('budget-all-list').querySelector('.budget-all-row').click();
    byId('budget-amount').value = '9000';
    routeFetch((method) => (method === 'PUT' ? {} : undefined));

    byId('budget-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();

    expect(byId('budget-editor').hasAttribute('open')).toBe(false);
    expect(byId('panel-budget-all').hidden).toBe(false);
  });
});
```

หมายเหตุ: เดือนใน `boot` ถูกตั้งเป็น 2026-10 ด้วย `vi.setSystemTime('2026-10-15')` จึงได้ `10/2026` จาก `formatMonthLabel`

- [ ] **Step 2: รันให้เห็นว่าล้ม**

Run: `npx vitest run public/liff/app.dom.test.mjs -t "budgets all page"`
Expected: FAIL (ไม่พบ `panel-budget-all`)

- [ ] **Step 3: markup**

ใน `index.html` ต่อจาก `</div>` ที่ปิด `#panel-budgets` เพิ่ม:

```html
    <div id="panel-budget-all" class="panel" hidden>
      <div class="budget-all-search">
        <svg class="icon" aria-hidden="true" focusable="false">
          <use href="#icon-search"></use>
        </svg>
        <input id="budget-all-search" type="search" placeholder="ค้นหาหมวด" aria-label="ค้นหาหมวด" autocomplete="off">
        <button type="button" id="budget-all-clear" aria-label="ล้างคำค้น" hidden>
          <svg class="icon" aria-hidden="true" focusable="false">
            <use href="#icon-close"></use>
          </svg>
        </button>
      </div>
      <div id="budget-all-tabs" class="budget-all-tabs" role="group" aria-label="กลุ่มของหมวด">
        <button type="button" data-tab="risk" aria-pressed="true"></button>
        <button type="button" data-tab="calm" aria-pressed="false"></button>
        <button type="button" data-tab="unset" aria-pressed="false"></button>
      </div>
      <div class="budget-all-bar">
        <span id="budget-all-count" role="status" aria-live="polite"></span>
        <label class="budget-all-sort">เรียง:
          <select id="budget-all-sort" aria-label="เรียงลำดับ">
            <option value="usage">ใช้มากสุด</option>
            <option value="name">ชื่อ</option>
          </select>
        </label>
      </div>
      <p id="budget-all-tab-empty" class="budget-all-tab-empty" hidden>ไม่มีหมวดในกลุ่มนี้</p>
      <div id="budget-all-list" class="budget-all-list"></div>
      <div id="budget-all-empty" class="budget-all-empty" hidden>
        <img class="budget-all-empty-art" src="assets/mascot.webp" alt="" width="88" height="88">
        <h2 id="budget-all-empty-title"></h2>
        <p>ลองพิมพ์ให้สั้นลง หรือดูทุกกลุ่มเพื่อหาเอง</p>
        <button type="button" id="budget-all-empty-clear" class="budget-cta">ล้างคำค้น</button>
      </div>
    </div>
```

ตรวจว่ามี symbol `icon-search` ใน sprite (`grep -n 'id="icon-search"' public/liff/index.html`) ถ้าไม่มี ให้เพิ่ม `<symbol id="icon-search" viewBox="0 0 24 24"><path d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-4.3-4.3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></symbol>` ในกลุ่ม symbol เดียวกับ `icon-close` และเพิ่มเทสต์ใน `app.dom.test.mjs` ถัดจากเทสต์ `defines the close icon symbol` (ใช้ `symbolIds.has(...)`) สำหรับ `icon-search`, `icon-alert`, `icon-check` (`icons.test.mjs` ตรวจแค่ `createSvgIcon` ไม่ได้ตรวจ sprite)

- [ ] **Step 4: CSS**

```css
/* หน้าย่อย ดูทั้งหมด: ไม่มีกราฟแท่ง ตัวเลข % เป็นตัวหนาสีตามสถานะ */
.budget-all-search { display: flex; align-items: center; gap: 10px; margin: 12px 16px 0; padding: 0 6px 0 16px; min-height: 48px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-pill); }
.budget-all-search:focus-within { border: 2px solid var(--primary); padding: 0 5px 0 15px; }
.budget-all-search input { flex: 1; min-width: 0; min-height: 44px; border: none; background: none; font: inherit; font-size: 15px; color: var(--text); outline: none; }
.budget-all-search button { display: flex; align-items: center; justify-content: center; width: 44px; height: 44px; border: none; border-radius: 50%; background: none; color: var(--muted); }
.budget-all-tabs { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 4px; margin: 10px 16px 0; padding: 4px; background: var(--track); border-radius: var(--radius-pill); }
.budget-all-tabs button { min-height: 44px; padding: 0 4px; border: none; border-radius: var(--radius-pill); background: transparent; font: inherit; font-size: 13px; font-weight: 700; color: var(--brand-dark); }
.budget-all-tabs button[aria-pressed="true"] { background: var(--surface); box-shadow: 0 1px 3px rgba(15, 23, 42, 0.18); font-weight: 800; color: var(--text); }
.budget-all-bar { display: flex; align-items: center; justify-content: space-between; margin: 6px 20px 0; font-size: 12px; color: var(--muted); }
.budget-all-sort select { min-height: 44px; border: none; background: none; font: inherit; font-size: 13px; font-weight: 700; color: var(--primary); }
.budget-all-tab-empty { margin: 16px 20px 0; font-size: 14px; color: var(--muted); }
.budget-all-list { margin: 0 16px; background: var(--surface); border-radius: 20px; box-shadow: var(--shadow-card); overflow: hidden; }
.budget-all-list:empty { display: none; }
.budget-all-head { padding: 8px 14px; font-size: 12px; font-weight: 800; }
.budget-all-head.level-over { background: var(--danger-soft); color: var(--danger-text); }
.budget-all-head.level-warn { background: var(--notice-bg); color: var(--notice-text); }
.budget-all-head.level-ok { background: var(--income-soft); color: var(--income-text); }
.budget-all-row { display: grid; grid-template-columns: 44px minmax(0, 1fr) auto 14px; align-items: center; column-gap: 12px; width: 100%; min-height: 68px; box-sizing: border-box; padding: 8px 14px; border: none; border-bottom: 1px solid var(--border); background: none; font: inherit; color: inherit; text-align: left; cursor: pointer; }
.budget-all-icon { position: relative; display: flex; width: 40px; height: 40px; }
.budget-all-dot { position: absolute; right: -3px; bottom: -3px; display: flex; align-items: center; justify-content: center; width: 18px; height: 18px; border: 2px solid var(--surface); border-radius: 50%; background: var(--level); }
.budget-all-dot .icon { width: 10px; height: 10px; color: var(--on-primary); }
.budget-all-name { display: block; font-size: 15px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.budget-all-sub { display: block; font-size: 12px; color: var(--muted); font-variant-numeric: tabular-nums; }
.budget-all-figure { text-align: right; }
.budget-all-pct { display: block; font-size: 20px; font-weight: 800; line-height: 1.2; color: var(--level-text); font-variant-numeric: tabular-nums; }
.budget-all-diff { display: block; margin-top: 1px; font-size: 12px; font-weight: 700; color: var(--level-text); }
.budget-all-set { min-height: 44px; padding: 0 18px; border: 1.5px solid var(--primary); border-radius: 12px; background: var(--surface); font: inherit; font-size: 14px; font-weight: 800; color: var(--primary); }
.budget-all-empty { display: flex; flex-direction: column; align-items: center; margin: 28px 16px 0; padding: 32px 24px 28px; background: var(--surface); border-radius: 24px; box-shadow: var(--shadow-card); text-align: center; }
.budget-all-empty-art { border-radius: 50%; box-shadow: 0 0 0 3px var(--primary); }
.budget-all-empty h2 { margin: 16px 0 0; font-size: 20px; font-weight: 800; }
.budget-all-empty p { margin: 6px 0 0; font-size: 14px; color: var(--muted); }
```

และเพิ่ม token ใน `tokens.css` (ทุกค่าเป็น `#rrggbb`, ตัวอักษรบนพื้นอ่อนต้องผ่าน contrast 4.5:1):

```css
  --danger-soft: #fdecee;
  --danger-text: #b0000f;
  --income-text: #14632b;
  --warn-text: #7a3500;
```

และกำหนด `--level-text` ใน CSS: `.level-ok { --level: var(--income); --level-text: var(--income-text); }` `.level-warn { --level: var(--warn); --level-text: var(--warn-text); }` `.level-over { --level: var(--danger); --level-text: var(--danger-text); }` (แก้กฎ 3 บรรทัดที่เพิ่มใน Task 2)

**เขียนเทสต์ก่อนเพิ่ม token:** เพิ่มคู่ต่อไปนี้ท้าย `TEXT_PAIRS` ใน `public/liff/tokens.test.mjs` แล้วรัน `npx vitest run public/liff/tokens.test.mjs` ให้เห็นว่าล้ม (ยังไม่มี token) จึงเพิ่ม token ใน `tokens.css`:

```js
  ['danger-text', 'danger-soft'],
  ['danger-text', 'surface'],
  ['income-text', 'income-soft'],
  ['income-text', 'surface'],
  ['warn-text', 'notice-bg'],
  ['warn-text', 'surface'],
```

(`--bar-track` จาก Task 2 ไม่ใช่สีตัวอักษร ไม่ต้องมีคู่ `--income-soft`, `--notice-bg`, `--notice-text` มีอยู่แล้ว) ถ้าคู่ไหนไม่ถึง 4.5:1 ให้ปรับค่าสีของ token ใหม่ให้เข้มขึ้น ห้ามลดเกณฑ์

- [ ] **Step 5: เขียน `budgets-all-panel.mjs`**

```js
import { createSvgIcon } from './icons.mjs';
import { describeDiff, filterBudgetRows, formatNumber, groupBudgetRows, sectionsForTab, sortBudgetRows } from './budgets-format.mjs';

const TABS = [
  { id: 'risk', label: 'ต้องดูแล' },
  { id: 'calm', label: 'ปกติ' },
  { id: 'unset', label: 'ไม่มีงบ' },
];
const MARKS = { over: 'icon-close', warn: 'icon-alert', ok: 'icon-check' };

function node(doc, tag, className, text) {
  const el = doc.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

export function createBudgetsAllPanel({ doc, els, badgeFor, onEdit, getMonthLabel }) {
  let groups = { risk: [], calm: [], unset: [] };
  let focusId = null;
  const state = { tab: 'risk', query: '', sort: 'usage' };

  function renderRow(row, tab) {
    const item = node(doc, tab === 'unset' ? 'div' : 'button', 'budget-all-row');
    if (tab !== 'unset') item.type = 'button';
    item.dataset.categoryId = row.categoryId;
    const icon = node(doc, 'span', 'budget-all-icon');
    icon.append(badgeFor(row.category, 'expense'));
    if (tab !== 'unset') {
      const dot = node(doc, 'span', `budget-all-dot level-${row.level}`);
      dot.append(createSvgIcon(doc, MARKS[row.level]));
      icon.append(dot);
    }
    const text = node(doc, 'span', 'budget-all-text');
    text.append(node(doc, 'span', 'budget-all-name', row.category));
    text.append(node(doc, 'span', 'budget-all-sub', tab === 'unset'
      ? `ใช้ไปเดือนนี้ ${formatNumber(row.spent)} บาท`
      : `ใช้ ${formatNumber(row.spent)} จาก ${formatNumber(row.budget)}`));
    item.append(icon, text);
    if (tab === 'unset') {
      const set = node(doc, 'button', 'budget-all-set', 'ตั้งงบ');
      set.type = 'button';
      set.setAttribute('aria-label', `ตั้งงบ ${row.category}`);
      set.addEventListener('click', () => onEdit(row));
      item.append(set);
    } else {
      const figure = node(doc, 'span', `budget-all-figure level-${row.level}`);
      figure.append(node(doc, 'span', 'budget-all-pct', `${row.percent}%`), node(doc, 'span', 'budget-all-diff', describeDiff(row)));
      item.append(figure, createSvgIcon(doc, 'icon-chevron'));
      item.setAttribute('aria-label', `${row.category} ใช้ไป ${row.percent}% ของงบ ${describeDiff(row)}`);
      item.addEventListener('click', () => onEdit(row));
    }
    if (focusId === row.categoryId) (item.matches('button') ? item : item.querySelector('button')).focus();
    return item;
  }

  function draw() {
    const filtered = {};
    for (const tab of TABS) filtered[tab.id] = sortBudgetRows(filterBudgetRows(groups[tab.id], state.query), state.sort);
    for (const button of els.tabs.querySelectorAll('button[data-tab]')) {
      const tab = TABS.find((entry) => entry.id === button.dataset.tab);
      button.textContent = `${tab.label} ${filtered[tab.id].length}`;
      button.setAttribute('aria-pressed', String(button.dataset.tab === state.tab));
    }
    const total = TABS.reduce((sum, tab) => sum + filtered[tab.id].length, 0);
    const shownRows = filtered[state.tab];
    const trimmed = state.query.trim();
    els.clear.hidden = state.query === '';
    const notFound = total === 0 && trimmed !== '';
    els.empty.hidden = !notFound;
    els.emptyTitle.textContent = `ไม่พบหมวด "${trimmed}"`;
    els.list.hidden = notFound;
    els.tabEmpty.hidden = notFound || shownRows.length > 0;
    els.count.textContent = `${getMonthLabel()} · แสดง ${shownRows.length} จาก ${groups[state.tab].length} หมวด`;
    els.list.replaceChildren();
    if (notFound) return;
    for (const section of sectionsForTab(state.tab, shownRows)) {
      if (section.title) {
        const level = section.rows[0].level === 'over' ? 'over' : section.rows[0].level === 'warn' ? 'warn' : 'ok';
        els.list.append(node(doc, 'div', `budget-all-head level-${level}`, `${section.title} ${section.rows.length} หมวด`));
      }
      for (const row of section.rows) els.list.append(renderRow(row, state.tab));
    }
  }

  function setBudgets(budgets, { focusCategoryId = null } = {}) {
    groups = groupBudgetRows(budgets);
    focusId = focusCategoryId;
    draw();
    focusId = null;
  }

  function show({ tab = 'risk' } = {}) {
    state.tab = tab;
    state.query = '';
    els.search.value = '';
    draw();
  }

  els.tabs.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-tab]');
    if (!button) return;
    state.tab = button.dataset.tab;
    draw();
  });
  els.search.addEventListener('input', () => {
    state.query = els.search.value;
    draw();
  });
  const clear = () => {
    state.query = '';
    els.search.value = '';
    draw();
  };
  els.clear.addEventListener('click', clear);
  els.emptyClear.addEventListener('click', clear);
  els.sort.addEventListener('change', () => {
    state.sort = els.sort.value;
    draw();
  });

  return { setBudgets, show };
}
```

สิ่งที่ต้องตรวจก่อนเขียนโค้ดเพิ่ม: symbol `icon-alert` และ `icon-check` มีใน sprite หรือไม่ (`grep -n 'id="icon-' public/liff/index.html`) ถ้าไม่มีให้เพิ่มทั้งสอง (เส้นทางเดียวกับที่ใช้ในดีไซน์: check `M5 12.5l4.5 4.5L19 7.5`, alert `M12 7v6M12 17h.01`, stroke-width 3) พร้อมเทสต์ที่ `app.dom.test.mjs` ถัดจาก `defines the close icon symbol`

- [ ] **Step 6: ต่อสายใน `app.mjs`**

1. import: `import { createBudgetsAllPanel } from './budgets-all-panel.mjs';`
2. `els` เพิ่ม: `budgetAllTabs, budgetAllSearch, budgetAllClear, budgetAllSort, budgetAllCount, budgetAllList, budgetAllEmpty, budgetAllEmptyTitle, budgetAllEmptyClear, budgetAllTabEmpty` ด้วย `document.getElementById('budget-all-tabs')` ฯลฯ ตาม id ใน markup
3. ต่อจากการสร้าง `budgetsPanel` (Task 2) เพิ่ม:
```js
const budgetsAllPanel = createBudgetsAllPanel({
  doc: document,
  els: {
    tabs: els.budgetAllTabs, search: els.budgetAllSearch, clear: els.budgetAllClear, sort: els.budgetAllSort,
    count: els.budgetAllCount, list: els.budgetAllList, empty: els.budgetAllEmpty, emptyTitle: els.budgetAllEmptyTitle,
    emptyClear: els.budgetAllEmptyClear, tabEmpty: els.budgetAllTabEmpty,
  },
  badgeFor,
  onEdit: (row) => openBudgetEditor(row),
  getMonthLabel: () => formatMonthLabel(els.month.value),
});
```
4. ใน `renderBudgets` เพิ่มบรรทัดต่อจาก `budgetsPanel.render(...)`: `budgetsAllPanel.setBudgets(budgets, { focusCategoryId });`
5. **คง** `let openBudgetsAll = () => {};` ที่ประกาศไว้ใน Task 2 (ห้ามลบ `let` ไม่งั้น assign ข้างล่างจะเป็น ReferenceError) แล้วเพิ่มโค้ดต่อไปนี้ไว้หลัง `enterSubPage` และออบเจ็กต์หน้าอื่น (ใกล้ `const CATEGORIES_PAGE`) ซึ่งเป็นการกำหนดค่าใหม่ให้ตัวแปรเดิมเท่านั้น:
```js
const BUDGETS_ALL_PAGE = {
  panelId: 'panel-budget-all',
  title: 'ดูงบทุกหมวด',
  backLabel: 'กลับไปหน้างบ',
  ownerTab: 'budgets',
  returnFocus: els.budgetAllOpen,
};

openBudgetsAll = ({ tab = 'risk', focusSearch = false } = {}) => {
  budgetsAllPanel.show({ tab });
  enterSubPage(BUDGETS_ALL_PAGE);
  if (focusSearch) els.budgetAllSearch.focus();
};
```
   (`let openBudgetsAll` ต้องประกาศก่อนการสร้าง `budgetsPanel` เพื่อไม่ให้เกิด TDZ ใน arrow ที่เรียกทีหลัง ซึ่งเรียกตอนผู้ใช้กด จึงปลอดภัยถ้าประกาศ `let` ไว้บนสุดของกลุ่มและกำหนดค่าหลัง `enterSubPage` ถูกประกาศ)
6. ต้องไม่ให้ `loadBudgets` โหลดซ้ำจนรีเซ็ตแท็บ/คำค้น: `setBudgets` ไม่รีเซ็ต state (รีเซ็ตเฉพาะ `show`) จึงปลอดภัย

- [ ] **Step 7: รันให้ผ่าน** `npx vitest run public/liff` Expected: PASS

- [ ] **Step 8: ตรวจรวม** `npm test` และ `npx eslint .` Expected: ผ่าน

- [ ] **Step 9: Commit (ถามผู้ใช้ก่อน)** `feat: add the see-all budgets page with search, sort and groups`

---

### Task 5: เก็บกวาด เอกสาร และ STATE

**Depends on:** Task 4

**Files:**
- Modify: `public/liff/app.mjs` (ลบโค้ดที่ไม่มีใครเรียกแล้ว)
- Modify: `SPEC.md`, `README.md`, `work-memory/STATE.md`

- [ ] **Step 1: หาโค้ดตกค้าง**

Run: `npx eslint .` และ `grep -n "budgetRows\|budget-rows\|budgetsPanel\|playBars" public/liff/app.mjs`
Expected: ไม่มี unused import/variable `budgetRows` ใน `app.mjs` (ยังใช้ใน `format.mjs`/`budgets-format.mjs`) ส่วน `playBars` ต้องยังถูกใช้ที่กราฟสรุป/แนวโน้ม

- [ ] **Step 2: อัปเดตเอกสาร**

`SPEC.md` หัวข้อ 5 งบประมาณ เพิ่ม 2 บรรทัด (รายการละไม่เกิน 2 บรรทัด):
- `หน้างบ: แท่ง % เทียบงบ ทุกแท่งสูงเท่ากัน (เส้นประ = เต็มงบ ส่วนเกินเป็นสีแดงเหนือเส้น) ต้องดูแลหน้าละ 6 แท่ง ปกติ/ไม่ตั้งงบเป็นรายการ`
- `หน้าย่อย ดูทั้งหมด: 3 แท็บ (ต้องดูแล/ปกติ/ไม่มีงบ) ค้นหา เรียง ไม่มีกราฟแท่ง แตะแถวเพื่อแก้งบ`

`README.md` รายการ "งบประมาณ" ปรับให้กล่าวถึงหน้าดูทั้งหมด (คงไว้ไม่เกิน 2 บรรทัด)

`work-memory/STATE.md`: เพิ่มใน Done "งบเฟส 1 (หน้าหลัก + ดูทั้งหมด) แล้ว" พร้อมจำนวนเทสต์ และใน Next ระบุเฟสถัดไปคือแผน `docs/superpowers/plans/2026-10-21-budget-redesign-p2-edit-sheet.md`

- [ ] **Step 3: ตรวจรวมครั้งสุดท้าย**

Run: `npm test` และ `npx eslint .` Expected: ผ่าน ถ้า `scripts/try-parse.test.js` ล้มเฉพาะตอนรันรวมให้รัน `npx vitest run scripts` เดี่ยวแล้วรายงานตามจริง

- [ ] **Step 4: Commit (ถามผู้ใช้ก่อน)** `docs: record the budget redesign phase 1`

## Self-Review (ผู้เขียนแผนตรวจแล้ว)

- Spec coverage: บอร์ด 1 (Task 2), 2 (Task 2: many bar + pager + calm limit), 3-5 (Task 3), 6-9 (Task 4), "จัดการหมวดหมู่" (Task 2) ครบ ส่วนบอร์ด 10-15 อยู่ในเฟส 2-3
- ชื่อที่ใช้ข้าม Task: `groupBudgetRows`, `summarizeBudgets`, `describeHero`, `describeDiff`, `barGeometry`, `pageBudgetRows`, `filterBudgetRows`, `sortBudgetRows`, `sectionsForTab` ตรงกันใน Task 1, 2, 4 ส่วน `createBudgetsPanel` / `createBudgetsAllPanel` ตรงกับ interface
- จุดเสี่ยง: เทสต์เดิมใน `app.dom.test.mjs` ที่อ้างโครงเก่า (ระบุตำแหน่งไว้ใน Task 2 Step 1) และ symbol ไอคอนที่ต้องมีใน sprite (`icon-search`, `icon-alert`, `icon-check`)

# Flex Redesign (B + A gauges) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redraw all 6 Flex cards the bot sends with the approved design: blue brand header, yellow primary button on the right, cancel/decline on the left, and 8px bar gauges for budget, goal progress, category shares and income/expense.

**Architecture:** A new `src/utils/flex-style.js` holds the colors (copied from `public/liff/tokens.css`) and the small Flex building blocks (header, 8px bar, stacked bar, gauge row, box buttons, footer row). Each card builder keeps its signature and its altText, and only changes the bubble it returns. The summary card gains an optional link to the web summary tab.

**Tech Stack:** Node 24 CommonJS, LINE Messaging API Flex Message, vitest 5, eslint 9.

**Approved design (reference only):** https://claude.ai/artifact/Ckbz2RmkZhQ5HW4x5NpgC9

## Global Constraints

- Comments in code: Thai, one line, explain "why" only; technical terms stay English. No emoji anywhere (code, comments, logs, commits).
- Variable/function names and log messages in English. Match the surrounding CommonJS style (`require`, `module.exports`).
- TDD: change the colocated `*.test.js` first, run it to see it fail, then change the code.
- Do not change any altText, postback `data`, or `displayText`. Only the visible label of a button may change where a task says so.
- Every color in the cards comes from `COLORS` / `CHART_COLORS` in `src/utils/flex-style.js`.
- Bars are 8px high with 4px corner radius everywhere (including the stacked category bar).
- Footer order: cancel/decline/secondary buttons on the LEFT, the yellow primary button on the RIGHT.
- LINE rejects a box with width `0%` and a text with empty `text`; never produce either.
- Verify with `npm test` and `npm run lint` (vitest is capped at 3 workers in `vitest.config.mjs`; do not change it).
- Never edit `.env`. Do not push from a task; the controller pushes once at the end.

---

### Task 1: Shared Flex style helpers

**Depends on:** none

**Files:**
- Create: `src/utils/flex-style.js`
- Test: `src/utils/flex-style.test.js`

**Interfaces:**
- Produces (all exported from `src/utils/flex-style.js`):
  - `COLORS` object with keys `brand, brandDark, onBrandMuted, brandSoft, cta, onCta, secondary, white, text, muted, income, incomeSoft, incomeText, expense, warnBar, warnText, noticeBg, noticeText, track, separator`
  - `CHART_COLORS: string[6]`
  - `brandHeader(eyebrow: string, title: string, end?: string) -> box`
  - `progressBar(percent: number, color: string) -> box` (height `'8px'`)
  - `stackBar(segments: {weight: number, color: string}[]) -> box` (height `'8px'`)
  - `gaugeRow(label: string, value: string, valueColor: string) -> box`
  - `boxButton(action, { background, color }) -> box` (text = `action.label`)
  - `actionRow(primary?: action, secondaries?: action[]) -> box | undefined` (horizontal, secondaries first, primary last)
  - `softButton(action) -> box`
  - `linkButton(action) -> button`
  - `separator() -> separator`

- [ ] **Step 1: Write the failing test**

Create `src/utils/flex-style.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { COLORS, CHART_COLORS, brandHeader, progressBar, stackBar, gaugeRow, boxButton, actionRow, softButton, linkButton } = require('./flex-style.js');

const SAVE = { type: 'postback', label: 'บันทึก', data: 'action=slip_save&slip=s1', displayText: 'บันทึก' };
const CANCEL = { type: 'postback', label: 'ยกเลิก', data: 'action=slip_cancel&slip=s1', displayText: 'ยกเลิก' };

describe('flex-style colors', () => {
  it('uses the web brand and chart colors', () => {
    expect(COLORS.brand).toBe('#1157C5');
    expect(COLORS.cta).toBe('#FFDE59');
    expect(CHART_COLORS).toEqual(['#1157C5', '#C26A00', '#E5484D', '#1D7A35', '#7B4FE0', '#007F96']);
  });
});

describe('brandHeader', () => {
  it('puts the eyebrow above a bold white title on the brand color', () => {
    const header = brandHeader('เฮียบันทึกแล้ว', '-120 บาท');

    expect(header.backgroundColor).toBe(COLORS.brand);
    expect(header.contents.map((node) => node.text)).toEqual(['เฮียบันทึกแล้ว', '-120 บาท']);
    expect(header.contents[1]).toMatchObject({ weight: 'bold', size: 'xl', color: COLORS.white });
  });

  it('adds an end text on the title line when given', () => {
    const header = brandHeader('ออมเข้าเป้าแล้ว', 'เที่ยวญี่ปุ่น', '+500');
    const line = header.contents[1];

    expect(line.layout).toBe('horizontal');
    expect(line.contents.map((node) => node.text)).toEqual(['เที่ยวญี่ปุ่น', '+500']);
  });
});

describe('progressBar', () => {
  it('fills to the floored percent with the given color', () => {
    const bar = progressBar(86.7, COLORS.warnBar);

    expect(bar).toMatchObject({ height: '8px', cornerRadius: '4px', backgroundColor: COLORS.track });
    expect(bar.contents[0]).toMatchObject({ width: '86%', backgroundColor: COLORS.warnBar });
  });

  it('caps at 100% and uses a filler below 1%', () => {
    expect(progressBar(140, COLORS.expense).contents[0].width).toBe('100%');
    expect(progressBar(0.4, COLORS.brand).contents).toEqual([{ type: 'filler' }]);
  });
});

describe('stackBar', () => {
  it('draws one colored part per segment weighted by flex', () => {
    const bar = stackBar([{ weight: 36, color: CHART_COLORS[0] }, { weight: 64, color: CHART_COLORS[1] }]);

    expect(bar.height).toBe('8px');
    expect(bar.contents.map((part) => [part.flex, part.backgroundColor])).toEqual([[36, '#1157C5'], [64, '#C26A00']]);
  });
});

describe('gaugeRow', () => {
  it('puts the label left and the colored value right', () => {
    const row = gaugeRow('งบอาหาร · ใกล้เต็มงบ', '86% · เหลือ 840', COLORS.warnText);

    expect(row.contents.map((node) => node.text)).toEqual(['งบอาหาร · ใกล้เต็มงบ', '86% · เหลือ 840']);
    expect(row.contents[1]).toMatchObject({ align: 'end', color: COLORS.warnText, weight: 'bold' });
  });
});

describe('buttons', () => {
  it('makes a box button that carries the action and shows its label', () => {
    const button = boxButton(SAVE, { background: COLORS.cta, color: COLORS.onCta });

    expect(button).toMatchObject({ type: 'box', action: SAVE, backgroundColor: COLORS.cta, height: '40px' });
    expect(button.contents[0]).toMatchObject({ type: 'text', text: 'บันทึก', color: COLORS.onCta });
  });

  it('puts the secondary buttons left and the yellow primary right', () => {
    const row = actionRow(SAVE, [CANCEL]);

    expect(row.layout).toBe('horizontal');
    expect(row.contents.map((node) => node.action)).toEqual([CANCEL, SAVE]);
    expect(row.contents.map((node) => node.backgroundColor)).toEqual([COLORS.secondary, COLORS.cta]);
  });

  it('has no row without any action', () => {
    expect(actionRow(undefined, [])).toBeUndefined();
  });

  it('makes a soft blue button and a brand link button', () => {
    expect(softButton(CANCEL)).toMatchObject({ backgroundColor: COLORS.brandSoft, action: CANCEL });
    expect(softButton(CANCEL).contents[0].color).toBe(COLORS.brand);
    const uri = { type: 'uri', label: 'ดูในเว็บ', uri: 'https://liff.line.me/1' };
    expect(linkButton(uri)).toEqual({ type: 'button', style: 'link', height: 'sm', color: COLORS.brand, action: uri });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/flex-style.test.js`
Expected: FAIL with "Cannot find module './flex-style.js'"

- [ ] **Step 3: Write the implementation**

Create `src/utils/flex-style.js`:

```js
// สีชุดเดียวกับ public/liff/tokens.css ให้การ์ดในแชตกับหน้าเว็บดูเป็นแอปเดียวกัน
const COLORS = {
  brand: '#1157C5',
  brandDark: '#0B3C8F',
  onBrandMuted: '#DBE6FA',
  brandSoft: '#E6EEFC',
  cta: '#FFDE59',
  onCta: '#111111',
  secondary: '#EFEFEF',
  white: '#FFFFFF',
  text: '#111111',
  muted: '#707070',
  income: '#1D7A35',
  incomeSoft: '#E6F4EA',
  incomeText: '#14632B',
  expense: '#D70015',
  warnBar: '#F59E0B',
  warnText: '#B64400',
  noticeBg: '#FFF1B8',
  noticeText: '#5C4300',
  track: '#E5E5EA',
  separator: '#E5E5EA',
};

// ตรงกับ --chart-1 ถึง --chart-6 ให้สีหมวดเรียงตามลำดับเหมือนกราฟในหน้าเว็บ
const CHART_COLORS = ['#1157C5', '#C26A00', '#E5484D', '#1D7A35', '#7B4FE0', '#007F96'];

function brandHeader(eyebrow, title, end) {
  const titleText = { type: 'text', text: title, weight: 'bold', size: 'xl', color: COLORS.white, wrap: true };
  const titleLine = end
    ? {
        type: 'box',
        layout: 'horizontal',
        spacing: 'md',
        margin: 'xs',
        contents: [
          { ...titleText, flex: 1 },
          { type: 'text', text: end, weight: 'bold', size: 'lg', color: COLORS.white, align: 'end', gravity: 'center', flex: 0 },
        ],
      }
    : { ...titleText, margin: 'xs' };
  return {
    type: 'box',
    layout: 'vertical',
    backgroundColor: COLORS.brand,
    paddingTop: '16px',
    paddingBottom: '16px',
    paddingStart: '20px',
    paddingEnd: '20px',
    contents: [{ type: 'text', text: eyebrow, size: 'xs', color: COLORS.onBrandMuted, wrap: true }, titleLine],
  };
}

// LINE ไม่รับ box ที่กว้าง 0% จึงใช้ filler เมื่อยังไม่ถึง 1%
function progressBar(percent, color) {
  const filled = Math.min(Math.floor(percent), 100);
  return {
    type: 'box',
    layout: 'horizontal',
    margin: 'sm',
    height: '8px',
    cornerRadius: '4px',
    backgroundColor: COLORS.track,
    contents:
      filled > 0
        ? [{ type: 'box', layout: 'vertical', width: `${filled}%`, cornerRadius: '4px', backgroundColor: color, contents: [] }]
        : [{ type: 'filler' }],
  };
}

function stackBar(segments) {
  return {
    type: 'box',
    layout: 'horizontal',
    margin: 'sm',
    height: '8px',
    cornerRadius: '4px',
    spacing: '2px',
    contents: segments.map((segment) => ({
      type: 'box',
      layout: 'vertical',
      flex: segment.weight,
      backgroundColor: segment.color,
      contents: [],
    })),
  };
}

function gaugeRow(label, value, valueColor) {
  return {
    type: 'box',
    layout: 'horizontal',
    spacing: 'md',
    contents: [
      { type: 'text', text: label, size: 'xs', color: COLORS.text, flex: 1, wrap: true },
      { type: 'text', text: value, size: 'xs', weight: 'bold', color: valueColor, align: 'end', flex: 0 },
    ],
  };
}

// ปุ่ม primary ของ Flex บังคับตัวอักษรสีขาว ปุ่มเหลืองจึงต้องทำเป็น box ที่มี action
function boxButton(action, { background, color }) {
  return {
    type: 'box',
    layout: 'vertical',
    flex: 1,
    height: '40px',
    cornerRadius: '8px',
    justifyContent: 'center',
    backgroundColor: background,
    action,
    contents: [{ type: 'text', text: action.label, size: 'sm', weight: 'bold', color, align: 'center' }],
  };
}

// ปุ่มยกเลิก/ปฏิเสธอยู่ซ้าย ปุ่มหลักอยู่ขวา
function actionRow(primary, secondaries = []) {
  const contents = [
    ...secondaries.map((action) => boxButton(action, { background: COLORS.secondary, color: COLORS.text })),
    ...(primary ? [boxButton(primary, { background: COLORS.cta, color: COLORS.onCta })] : []),
  ];
  if (contents.length === 0) {
    return undefined;
  }
  return { type: 'box', layout: 'horizontal', spacing: 'sm', paddingAll: '10px', contents };
}

function softButton(action) {
  return boxButton(action, { background: COLORS.brandSoft, color: COLORS.brand });
}

function linkButton(action) {
  return { type: 'button', style: 'link', height: 'sm', color: COLORS.brand, action };
}

function separator() {
  return { type: 'separator', margin: 'lg', color: COLORS.separator };
}

module.exports = {
  COLORS,
  CHART_COLORS,
  brandHeader,
  progressBar,
  stackBar,
  gaugeRow,
  boxButton,
  actionRow,
  softButton,
  linkButton,
  separator,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/flex-style.test.js`
Expected: PASS (all tests)

- [ ] **Step 5: Lint and commit**

Run: `npx eslint src/utils/flex-style.js src/utils/flex-style.test.js` (expect no output)

```bash
git add src/utils/flex-style.js src/utils/flex-style.test.js
git commit -m "feat(flex): add shared brand colors and bar and button helpers"
```

---

### Task 2: Budget gauge text

**Depends on:** none

**Files:**
- Modify: `src/budget/alerts.js` (add `describeBudgetGauge`, export it)
- Test: `src/budget/alerts.test.js`

**Interfaces:**
- Produces: `describeBudgetGauge(alert) -> { level: 'warn'|'over', percent: number, label: string, value: string, detail: string }`
  - `label`: `งบ{category} · {ใกล้เต็มงบ|เกินงบ}`
  - `value`: `{percent}% · เหลือ {x}` or `{percent}% · เกิน {x}` (amounts via `formatAmount`, computed in satang)
  - `detail`: same text as `describeBudgetAlert(alert).detail`
- Keep `describeBudgetAlert` exported and unchanged (its tests stay).

- [ ] **Step 1: Write the failing test**

Add `describeBudgetGauge` to the import at the top of `src/budget/alerts.test.js` and append:

```js
describe('describeBudgetGauge', () => {
  it('shows the percent and what is left when near the budget', () => {
    expect(describeBudgetGauge({ level: 'warn', month: '2026-10', category: 'อาหาร', spent: 5160, budget: 6000 })).toEqual({
      level: 'warn',
      percent: 86,
      label: 'งบอาหาร · ใกล้เต็มงบ',
      value: '86% · เหลือ 840',
      detail: 'ใช้ไป 5,160 จาก 6,000 บาท (เดือน 10/2026)',
    });
  });

  it('shows how much is over when the budget is exceeded', () => {
    const gauge = describeBudgetGauge({ level: 'over', month: '2026-10', category: 'อาหาร', spent: 6450.5, budget: 6000 });

    expect(gauge.label).toBe('งบอาหาร · เกินงบ');
    expect(gauge.value).toBe('107% · เกิน 450.5');
    expect(gauge.percent).toBe(107);
  });

  it('says nothing is left at exactly the budget', () => {
    expect(describeBudgetGauge({ level: 'over', month: '2026-10', category: 'อาหาร', spent: 150, budget: 150 }).value).toBe('100% · เหลือ 0');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/budget/alerts.test.js`
Expected: FAIL with "describeBudgetGauge is not a function"

- [ ] **Step 3: Write the implementation**

In `src/budget/alerts.js`, add after `describeBudgetAlert` (reuse the existing `alertParts`, `toSatang`, `formatAmount` already used in that file; if `toSatang` is imported under another name, use that):

```js
// แถบงบในการ์ดบันทึก: ป้ายซ้าย ตัวเลขขวา คิดยอดเหลือเป็นสตางค์กันทศนิยมเพี้ยน
function describeBudgetGauge(alert) {
  const { monthText, percent, label } = alertParts(alert);
  const left = toSatang(alert.budget) - toSatang(alert.spent);
  const remainder = left >= 0 ? `เหลือ ${formatAmount(left / 100)}` : `เกิน ${formatAmount(-left / 100)}`;
  return {
    level: alert.level,
    percent,
    label: `งบ${alert.category} · ${label}`,
    value: `${percent}% · ${remainder}`,
    detail: `ใช้ไป ${formatAmount(alert.spent)} จาก ${formatAmount(alert.budget)} บาท (เดือน ${monthText})`,
  };
}
```

Add `describeBudgetGauge` to `module.exports`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/budget/alerts.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/budget/alerts.js src/budget/alerts.test.js
git commit -m "feat(budget): describe budget alerts as a gauge for the saved card"
```

---

### Task 3: Saved card and slip confirm card

**Depends on:** Task 1, Task 2

**Files:**
- Modify: `src/parser/saved-flex.js` (rewrite bubble building; keep exports `buildSavedFlex, buildSlipConfirmFlex, ALT_TEXT_MAX`)
- Test: `src/parser/saved-flex.test.js`
- Modify: `src/bot.test.js` (only assertions that read `contents.footer`/`contents.body` of these two cards)

**Interfaces:**
- Consumes: `COLORS, brandHeader, progressBar, gaugeRow, actionRow, softButton, separator` from `src/utils/flex-style.js`; `describeBudgetGauge` from `src/budget/alerts.js`.
- Produces: unchanged signatures `buildSavedFlex(items, { alerts, budgetCheckFailed, walletReadFailed, buttons, editUrls })`, `buildSlipConfirmFlex(items, { dateAssumed, buttons })`.

**Card spec (saved):**
- `header`: `brandHeader(eyebrow, total)`. eyebrow = `เฮียบันทึกแล้ว` (1 item) or `เฮียบันทึกแล้ว {n} รายการ`. total = signed sum in satang: income +, expense −, e.g. `-120 บาท`, `+25,000 บาท`, `-185 บาท`.
- `body.contents` (top level, in order): one row box per item (`layout: 'horizontal'`, keeps the `uri` action labelled `แก้ไข` when its edit link is valid, same rules as today) → hint text `แตะรายการเพื่อแก้ไขในเว็บ` only when more than 1 item AND at least one link → if alerts: `separator()` then one gauge box per alert → notice strips (budget check failed, wallets unreadable) unchanged in text.
- Row: left column title = `item.note || item.category` (bold md), sub = `[note ? category : '', shortDate(date), wallet].filter(Boolean).join(' · ')` (xs muted, wrap). Right side: when more than 1 item, the signed amount without `บาท` (e.g. `-120`) colored income/expense; when 1 item and it has a link, a bold brand-colored text `แก้ไข`; otherwise nothing.
- Gauge box: `gaugeRow(label, value, warn ? COLORS.warnText : COLORS.expense)`, `progressBar(percent, warn ? COLORS.warnBar : COLORS.expense)`, then detail text (xxs muted).
- Notice strip: `backgroundColor: COLORS.noticeBg`, text color `COLORS.noticeText`.
- `footer`: when buttons given, a horizontal box (paddingAll 10px) of `softButton`s, one per button; a button whose label is `ยกเลิก` is relabelled to `ยกเลิกรายการนี้` (1 item) or `ยกเลิกทั้งหมด` (more), keeping `data` and `displayText`.

**Card spec (slip confirm):**
- `header`: eyebrow `เฮียอ่านสลิปได้ · ยังไม่บันทึก` or `เฮียอ่านสลิปได้ {n} รายการ · ยังไม่บันทึก`; title = signed total.
- `body.contents`: one row per item (never any action; right side amount only when more than 1 item) → when `dateAssumed`, a notice strip `อ่านวันที่ไม่ได้ จึงใช้วันนี้` → hint `กดบันทึกภายใน 10 นาที` (xs muted).
- `footer`: `actionRow(first, rest)` where `first` = first button's action (relabelled `บันทึกทั้งหมด` when more than 1 item) and `rest` = the other buttons' actions. So the cancel button renders left, save right.

- [ ] **Step 1: Rewrite the tests**

Replace the whole content of `src/parser/saved-flex.test.js` with:

```js
import { describe, it, expect } from 'vitest';
import { buildSavedFlex, buildSlipConfirmFlex, ALT_TEXT_MAX } from './saved-flex.js';
import { formatSavedReply, formatSlipConfirmReply } from './format-reply.js';
import { COLORS } from '../utils/flex-style.js';

const FOOD = { type: 'expense', category: 'อาหาร', amount: 60, date: '2026-09-29', note: 'กินข้าว' };
const SALARY = { type: 'income', category: 'เงินเดือน', amount: 25000, date: '2026-09-01', note: '' };
const UNDO = [{ type: 'action', action: { type: 'postback', label: 'ยกเลิก', data: 'action=undo&event=ev1', displayText: 'ยกเลิก' } }];

// เก็บ text node ทุกอันตามลำดับ เพื่อเทสต์เนื้อหาโดยไม่ผูกกับโครง box
function collect(node, found = []) {
  if (Array.isArray(node)) {
    node.forEach((child) => collect(child, found));
  } else if (node && typeof node === 'object') {
    if (node.type === 'text') found.push(node);
    collect(node.contents, found);
  }
  return found;
}

const texts = (node) => collect(node).map((item) => item.text);
const rowsOf = (flex) => flex.contents.body.contents.filter((node) => node.type === 'box' && node.layout === 'horizontal');
const footerActions = (flex) => flex.contents.footer.contents.map((node) => node.action);

describe('buildSavedFlex', () => {
  it('keeps the plain saved text as altText', () => {
    expect(buildSavedFlex([FOOD]).altText).toBe(formatSavedReply([FOOD]));
  });

  it('puts the signed amount in the brand header', () => {
    const flex = buildSavedFlex([FOOD]);

    expect(flex.contents.header.backgroundColor).toBe(COLORS.brand);
    expect(texts(flex.contents.header)).toEqual(['เฮียบันทึกแล้ว', '-60 บาท']);
  });

  it('sums several items with their signs and counts them in the header', () => {
    expect(texts(buildSavedFlex([FOOD, SALARY]).contents.header)).toEqual(['เฮียบันทึกแล้ว 2 รายการ', '+24,940 บาท']);
  });

  it('titles a row by the note and moves the category to the sub line', () => {
    expect(texts(buildSavedFlex([{ ...FOOD, wallet: 'บัตรเครดิต' }]).contents.body)).toEqual(['กินข้าว', 'อาหาร · 29/09 · บัตรเครดิต']);
  });

  it('titles a row by the category when there is no note', () => {
    expect(texts(buildSavedFlex([SALARY]).contents.body)).toEqual(['เงินเดือน', '01/09']);
  });

  it('shows signed colored amounts on each row only when there are several items', () => {
    const amounts = collect(buildSavedFlex([FOOD, SALARY]).contents.body).filter((node) => /^[+-]\d/.test(node.text));

    expect(amounts.map((node) => node.text)).toEqual(['-60', '+25,000']);
    expect(amounts.map((node) => node.color)).toEqual([COLORS.expense, COLORS.income]);
    expect(texts(buildSavedFlex([FOOD]).contents.body)).not.toContain('-60');
  });

  it('puts a soft cancel button in the footer and relabels it by item count', () => {
    const one = buildSavedFlex([FOOD], { buttons: UNDO });
    const many = buildSavedFlex([FOOD, SALARY], { buttons: UNDO });

    expect(footerActions(one)).toEqual([{ ...UNDO[0].action, label: 'ยกเลิกรายการนี้' }]);
    expect(footerActions(many)[0].label).toBe('ยกเลิกทั้งหมด');
    expect(footerActions(many)[0].data).toBe('action=undo&event=ev1');
    expect(one.contents.footer.contents[0].backgroundColor).toBe(COLORS.brandSoft);
  });

  it('omits the footer when no buttons are given', () => {
    expect(buildSavedFlex([FOOD]).contents.footer).toBeUndefined();
  });

  it('draws a gauge per budget alert after a separator', () => {
    const alerts = [
      { level: 'warn', month: '2026-09', category: 'อาหาร', spent: 135, budget: 150 },
      { level: 'over', month: '2026-09', category: 'เดินทาง', spent: 1200, budget: 1000 },
    ];
    const flex = buildSavedFlex([FOOD], { alerts });
    const body = flex.contents.body.contents;

    expect(body.some((node) => node.type === 'separator')).toBe(true);
    expect(texts(flex.contents.body)).toEqual(expect.arrayContaining([
      'งบอาหาร · ใกล้เต็มงบ',
      '90% · เหลือ 15',
      'ใช้ไป 135 จาก 150 บาท (เดือน 09/2026)',
      'งบเดินทาง · เกินงบ',
      '120% · เกิน 200',
    ]));
    expect(flex.altText).toContain('ใกล้เต็มงบ อาหาร เดือน 09/2026: ใช้ไป 135 จาก 150 บาท (90%)');
  });

  it('colors the warn gauge orange and the over gauge red', () => {
    const fills = (level) => {
      const flex = buildSavedFlex([FOOD], { alerts: [{ level, month: '2026-09', category: 'อาหาร', spent: 140, budget: 150 }] });
      return JSON.stringify(flex.contents.body);
    };

    expect(fills('warn')).toContain(COLORS.warnBar);
    expect(fills('over')).toContain(COLORS.expense);
    expect(fills('over')).not.toContain(COLORS.warnBar);
  });

  it('shows the budget check and wallet notices in notice strips', () => {
    const flex = buildSavedFlex([FOOD], { budgetCheckFailed: true, walletReadFailed: true });
    const strips = flex.contents.body.contents.filter((node) => node.backgroundColor === COLORS.noticeBg);

    expect(strips).toHaveLength(2);
    expect(texts(flex.contents.body)).toEqual(expect.arrayContaining([
      'เฮียเช็กงบไม่สำเร็จ ดูสถานะงบได้ในหน้าเว็บ',
      'เฮียอ่านกระเป๋าไม่ได้ รายการนี้อยู่ในเงินสด แก้ได้ในเว็บ',
    ]));
    expect(flex.altText.endsWith('\n\nเฮียอ่านกระเป๋าไม่ได้ รายการนี้อยู่ในเงินสด แก้ได้ในเว็บ')).toBe(true);
  });

  it('keeps altText within the LINE limit even for a long receipt', () => {
    const items = Array.from({ length: 20 }, (_, index) => ({ ...FOOD, note: `รายการสินค้าชื่อยาวมากลำดับที่ ${index}` }));
    const flex = buildSavedFlex(items);

    expect(flex.altText.length).toBeLessThanOrEqual(ALT_TEXT_MAX);
    expect(rowsOf(flex)).toHaveLength(20);
  });
});

describe('buildSavedFlex edit links', () => {
  it('makes each row open its link and adds the hint when there are several items', () => {
    const flex = buildSavedFlex([FOOD, SALARY], { editUrls: ['https://liff.line.me/l?tx=a', 'https://liff.line.me/l?tx=b'] });

    expect(rowsOf(flex).map((row) => row.action)).toEqual([
      { type: 'uri', label: 'แก้ไข', uri: 'https://liff.line.me/l?tx=a' },
      { type: 'uri', label: 'แก้ไข', uri: 'https://liff.line.me/l?tx=b' },
    ]);
    expect(texts(flex.contents.body)).toContain('แตะรายการเพื่อแก้ไขในเว็บ');
  });

  it('shows an edit label on a single linked row instead of the hint', () => {
    const flex = buildSavedFlex([FOOD], { editUrls: ['https://liff.line.me/l?tx=a'] });
    const editLabel = collect(rowsOf(flex)[0]).find((node) => node.text === 'แก้ไข');

    expect(editLabel.color).toBe(COLORS.brand);
    expect(texts(flex.contents.body)).not.toContain('แตะรายการเพื่อแก้ไขในเว็บ');
  });

  it('adds no action, label or hint without links', () => {
    const flex = buildSavedFlex([FOOD]);

    expect(rowsOf(flex)[0].action).toBeUndefined();
    expect(texts(flex.contents.body)).not.toContain('แก้ไข');
  });

  it('ignores links that do not match the items one to one', () => {
    const flex = buildSavedFlex([FOOD, SALARY], { editUrls: ['https://liff.line.me/l?tx=a'] });

    expect(rowsOf(flex).every((row) => row.action === undefined)).toBe(true);
    expect(texts(flex.contents.body)).not.toContain('แตะรายการเพื่อแก้ไขในเว็บ');
  });
});

describe('buildSlipConfirmFlex', () => {
  const MILK = { type: 'expense', category: 'อาหาร', amount: 120, date: '2026-09-28', note: 'นม' };
  const TOOTHPASTE = { type: 'expense', category: 'สุขภาพ', amount: 59, date: '2026-09-28', note: 'ยาสีฟัน' };
  const SAVE = { type: 'action', action: { type: 'postback', label: 'บันทึก', data: 'action=slip_save&slip=s1', displayText: 'บันทึก' } };
  const CANCEL = { type: 'action', action: { type: 'postback', label: 'ยกเลิก', data: 'action=slip_cancel&slip=s1', displayText: 'ยกเลิก' } };

  it('keeps the plain confirm text as altText', () => {
    expect(buildSlipConfirmFlex([MILK], { dateAssumed: true }).altText).toBe(formatSlipConfirmReply([MILK], { dateAssumed: true }));
  });

  it('says it is not saved yet in the header with the total', () => {
    expect(texts(buildSlipConfirmFlex([MILK]).contents.header)).toEqual(['เฮียอ่านสลิปได้ · ยังไม่บันทึก', '-120 บาท']);
    expect(texts(buildSlipConfirmFlex([MILK, TOOTHPASTE]).contents.header)).toEqual(['เฮียอ่านสลิปได้ 2 รายการ · ยังไม่บันทึก', '-179 บาท']);
  });

  it('puts cancel on the left and the yellow save on the right', () => {
    const flex = buildSlipConfirmFlex([MILK], { buttons: [SAVE, CANCEL] });

    expect(footerActions(flex)).toEqual([CANCEL.action, SAVE.action]);
    expect(flex.contents.footer.contents.map((node) => node.backgroundColor)).toEqual([COLORS.secondary, COLORS.cta]);
  });

  it('relabels save for several items but keeps its postback', () => {
    const [, save] = footerActions(buildSlipConfirmFlex([MILK, TOOTHPASTE], { buttons: [SAVE, CANCEL] }));

    expect(save).toEqual({ ...SAVE.action, label: 'บันทึกทั้งหมด' });
  });

  it('ends with the time limit hint and shows the assumed date notice', () => {
    const flex = buildSlipConfirmFlex([MILK], { dateAssumed: true });
    const found = texts(flex.contents.body);

    expect(found[found.length - 1]).toBe('กดบันทึกภายใน 10 นาที');
    expect(found).toContain('อ่านวันที่ไม่ได้ จึงใช้วันนี้');
    expect(texts(buildSlipConfirmFlex([MILK]).contents.body)).not.toContain('อ่านวันที่ไม่ได้ จึงใช้วันนี้');
  });

  it('gives the rows no link action (array index must not leak in as a uri)', () => {
    const items = [MILK, TOOTHPASTE, { ...MILK, note: 'ขนม' }, { ...MILK, note: 'น้ำ' }];

    expect(rowsOf(buildSlipConfirmFlex(items)).map((row) => row.action)).toEqual([undefined, undefined, undefined, undefined]);
  });

  it('keeps altText within the LINE limit for a long receipt', () => {
    const items = Array.from({ length: 20 }, (_, index) => ({ ...MILK, note: `สินค้าชื่อยาวมากลำดับที่ ${index}` }));

    expect(buildSlipConfirmFlex(items).altText.length).toBeLessThanOrEqual(ALT_TEXT_MAX);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/parser/saved-flex.test.js`
Expected: FAIL (header undefined, old texts)

- [ ] **Step 3: Rewrite `src/parser/saved-flex.js`**

```js
const { formatAmount, formatSavedReply, formatSlipConfirmReply } = require('./format-reply');
const { formatBudgetAlerts, describeBudgetGauge, BUDGET_CHECK_FAILED_NOTICE } = require('../budget/alerts');
const { WALLETS_UNREADABLE_NOTICE } = require('../wallets/wallets');
const { capAltText, ALT_TEXT_MAX } = require('../utils/alt-text');
const { shortDate } = require('../utils/date');
const { COLORS, brandHeader, progressBar, gaugeRow, actionRow, softButton, separator } = require('../utils/flex-style');

const GAUGE_BAR_COLORS = { warn: COLORS.warnBar, over: COLORS.expense };
const GAUGE_TEXT_COLORS = { warn: COLORS.warnText, over: COLORS.expense };

function toSatang(amount) {
  return Math.round(Number(amount) * 100);
}

// ยอดในหัวการ์ดคิดเป็นสตางค์กันทศนิยมเพี้ยน รายรับบวก รายจ่ายลบ
function signedTotal(items) {
  const satang = items.reduce((sum, item) => sum + (item.type === 'income' ? 1 : -1) * toSatang(item.amount), 0);
  const sign = satang > 0 ? '+' : satang < 0 ? '-' : '';
  return `${sign}${formatAmount(Math.abs(satang) / 100)} บาท`;
}

function sideText(text, color) {
  return { type: 'text', text, weight: 'bold', size: 'sm', align: 'end', gravity: 'center', flex: 0, color };
}

// editUrl ต้องเป็นสตริงเท่านั้น กันค่าอื่น (เช่น index จาก Array.map) หลุดเข้ามาเป็น uri
function itemRow(item, { editUrl, showAmount }) {
  const hasLink = typeof editUrl === 'string' && editUrl !== '';
  const sub = [item.note ? item.category : '', shortDate(item.date), item.wallet].filter(Boolean).join(' · ');
  const contents = [
    {
      type: 'box',
      layout: 'vertical',
      flex: 1,
      contents: [
        { type: 'text', text: item.note || item.category, weight: 'bold', size: 'md', wrap: true },
        { type: 'text', text: sub, size: 'xs', color: COLORS.muted, wrap: true },
      ],
    },
  ];
  if (showAmount) {
    const sign = item.type === 'income' ? '+' : '-';
    contents.push(sideText(`${sign}${formatAmount(item.amount)}`, item.type === 'income' ? COLORS.income : COLORS.expense));
  } else if (hasLink) {
    contents.push(sideText('แก้ไข', COLORS.brand));
  }
  return {
    type: 'box',
    layout: 'horizontal',
    spacing: 'md',
    margin: 'md',
    ...(hasLink ? { action: { type: 'uri', label: 'แก้ไข', uri: editUrl } } : {}),
    contents,
  };
}

function hint(text) {
  return { type: 'text', text, size: 'xs', color: COLORS.muted, wrap: true, margin: 'md' };
}

function noticeStrip(text) {
  return {
    type: 'box',
    layout: 'vertical',
    margin: 'md',
    paddingAll: 'md',
    cornerRadius: 'md',
    backgroundColor: COLORS.noticeBg,
    contents: [{ type: 'text', text, size: 'sm', color: COLORS.noticeText, wrap: true }],
  };
}

function budgetGauge(alert) {
  const gauge = describeBudgetGauge(alert);
  return {
    type: 'box',
    layout: 'vertical',
    margin: 'lg',
    contents: [
      gaugeRow(gauge.label, gauge.value, GAUGE_TEXT_COLORS[gauge.level]),
      progressBar(gauge.percent, GAUGE_BAR_COLORS[gauge.level]),
      { type: 'text', text: gauge.detail, size: 'xxs', color: COLORS.muted, wrap: true, margin: 'xs' },
    ],
  };
}

// เปลี่ยนแค่ข้อความบนปุ่ม postback data และ displayText เดิมยังใช้ได้
function relabel(action, label) {
  return { ...action, label };
}

function bubble(header, body, footer) {
  const contents = { type: 'bubble', header, body: { type: 'box', layout: 'vertical', contents: body } };
  if (footer) contents.footer = footer;
  return contents;
}

function buildSavedFlex(items, { alerts = [], budgetCheckFailed = false, walletReadFailed = false, buttons, editUrls } = {}) {
  // ใช้ลิงก์เมื่อมีครบทุกแถวเท่านั้น กันลิงก์ไปผิดรายการเมื่อจำนวนไม่ตรงกัน
  const links = Array.isArray(editUrls) && editUrls.length === items.length ? editUrls : null;
  const many = items.length > 1;
  const body = items.map((item, index) => itemRow(item, { editUrl: links && links[index], showAmount: many }));
  if (many && links && links.some(Boolean)) body.push(hint('แตะรายการเพื่อแก้ไขในเว็บ'));
  if (alerts.length > 0) body.push(separator(), ...alerts.map(budgetGauge));
  if (budgetCheckFailed) body.push(noticeStrip(BUDGET_CHECK_FAILED_NOTICE));
  if (walletReadFailed) body.push(noticeStrip(WALLETS_UNREADABLE_NOTICE));

  const altParts = [formatSavedReply(items)];
  if (alerts.length > 0) altParts.push(formatBudgetAlerts(alerts));
  if (budgetCheckFailed) altParts.push(BUDGET_CHECK_FAILED_NOTICE);
  if (walletReadFailed) altParts.push(WALLETS_UNREADABLE_NOTICE);

  const cancelLabel = many ? 'ยกเลิกทั้งหมด' : 'ยกเลิกรายการนี้';
  const footer =
    buttons && buttons.length > 0
      ? {
          type: 'box',
          layout: 'horizontal',
          spacing: 'sm',
          paddingAll: '10px',
          contents: buttons.map((item) => softButton(item.action.label === 'ยกเลิก' ? relabel(item.action, cancelLabel) : item.action)),
        }
      : undefined;

  return {
    type: 'flex',
    altText: capAltText(altParts.join('\n\n')),
    contents: bubble(brandHeader(many ? `เฮียบันทึกแล้ว ${items.length} รายการ` : 'เฮียบันทึกแล้ว', signedTotal(items)), body, footer),
  };
}

// การ์ดสรุปสลิปก่อนกดบันทึก: ข้อความ altText ยังเป็นข้อความเดิมจาก formatSlipConfirmReply
function buildSlipConfirmFlex(items, { dateAssumed = false, buttons } = {}) {
  const many = items.length > 1;
  const body = items.map((item) => itemRow(item, { showAmount: many }));
  if (dateAssumed) body.push(noticeStrip('อ่านวันที่ไม่ได้ จึงใช้วันนี้'));
  body.push(hint('กดบันทึกภายใน 10 นาที'));

  // ปุ่มแรกที่ส่งมาคือปุ่มหลัก (บันทึก) ที่เหลือเป็นปุ่มรอง
  const [first, ...rest] = (buttons ?? []).map((item) => item.action);
  const primary = first && many ? relabel(first, 'บันทึกทั้งหมด') : first;
  const eyebrow = `${many ? `เฮียอ่านสลิปได้ ${items.length} รายการ` : 'เฮียอ่านสลิปได้'} · ยังไม่บันทึก`;

  return {
    type: 'flex',
    altText: capAltText(formatSlipConfirmReply(items, { dateAssumed })),
    contents: bubble(brandHeader(eyebrow, signedTotal(items)), body, actionRow(primary, rest)),
  };
}

module.exports = { buildSavedFlex, buildSlipConfirmFlex, ALT_TEXT_MAX };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/parser/saved-flex.test.js`
Expected: PASS

- [ ] **Step 5: Fix `src/bot.test.js` assertions for these two cards**

Run: `npx vitest run src/bot.test.js`
For each failure that comes from the saved or slip card:
- A helper/assertion that maps `flex.contents.footer.contents` to actions still works (footer is one horizontal box of buttons). Where it picks a button by position, pick it by `action.data` (or `displayText`) instead, because cancel is now first in the slip footer.
- Where a test expects the old cancel label `ยกเลิก` from the saved-card footer, expect `ยกเลิกรายการนี้` (or `ยกเลิกทั้งหมด` for several items); `data` and `displayText` stay the same.
- Assertions that read `contents.body.contents` for rows with `action` keep working (rows are still top-level body items).
Do not change any assertion about altText or about the text replies.

Known failures (verified against the current `src/bot.test.js`; `replyFlexOf` at line ~94 maps footer actions in order, so whole-array `quickReply` comparisons break):
- Saved card, label now `ยกเลิกรายการนี้` (all these are single-item cards): lines ~181, ~312, ~955, ~971, ~988, ~1001 (`quickReply: UNDO_QUICK_REPLY`) and the inline objects at ~1644 and ~1792 (`label: 'ยกเลิก'`). Add near `UNDO_QUICK_REPLY` a constant `const SAVED_UNDO_FOOTER = [{ ...UNDO_QUICK_REPLY[0], action: { ...UNDO_QUICK_REPLY[0].action, label: 'ยกเลิกรายการนี้' } }];` and use it in those six card assertions; change only `label` in the two inline objects. Leave `UNDO_QUICK_REPLY` itself as is (data/displayText unchanged; other non-card uses may still need it).
- Slip confirm card, cancel now first: lines ~1410 and ~1442 (`quickReply: SLIP_QUICK_REPLY`) → `quickReply: [SLIP_QUICK_REPLY[1], SLIP_QUICK_REPLY[0]]`.
- Wallet sub line moved (title is now the note, sub starts with the category): lines ~1339-1340 → `'อาหาร · 29/09 · บัตรเครดิต'` and `'อาหาร · 29/09 · เงินสด'`.
- Line ~1881 reads only `quickReply[0].action.data` and still passes (single footer button).

Run: `npx vitest run src/bot.test.js src/parser`
Expected: PASS

- [ ] **Step 6: Lint and commit**

Run: `npx eslint src/parser src/bot.test.js` (expect no output)

```bash
git add src/parser/saved-flex.js src/parser/saved-flex.test.js src/bot.test.js
git commit -m "feat(flex): redesign saved and slip cards with brand header and budget gauges"
```

---

### Task 4: Summary card with category share bar and web link

**Depends on:** Task 1

**Files:**
- Modify: `src/summary/flex.js`
- Test: `src/summary/flex.test.js`
- Modify: `src/chat/urls.js` (add `buildSummaryUrl`)
- Test: `src/chat/urls.test.js`
- Modify: `src/chat/text.js` (pass `summaryUrl`)
- Modify: `src/notifications/weekly.js` (accept and pass `summaryUrl`)
- Test: `src/notifications/weekly.test.js`
- Modify: `index.js` (pass `summaryUrl` to the weekly runner) — shared file
- Modify: `src/bot.test.js` only if a summary assertion fails — shared file

**Interfaces:**
- Consumes: `COLORS, CHART_COLORS, brandHeader, stackBar, actionRow, separator` from `src/utils/flex-style.js`.
- Produces:
  - `buildSummaryFlex(summary, comment, { summaryUrl } = {})`
  - `createUrlBuilders({ liffUrl }).buildSummaryUrl() -> string | undefined` (`<liffUrl>?tab=summary`)
  - `createWeeklySummaryRunner({ repository, pushFlex, summaryUrl, now, logger })`
  - KEEP exporting `COLORS`, `row`, `baht` from `src/summary/flex.js` with their current values/behavior, because `src/query/answer-flex.js` still imports them until Task 5. Export list becomes `{ buildSummaryFlex, COLORS, row, baht }` (unchanged).

**Card spec:**
- `header`: `brandHeader('สรุป' + summary.label, net >= 0 ? 'คงเหลือ {baht(net)}' : 'ติดลบ {baht(-net)}')`.
- body: a horizontal box with two columns: left `รายรับ` (xxs muted) over `formatAmount(incomeTotal)` (md bold `COLORS.income`), right aligned end `รายจ่าย` over `formatAmount(expenseTotal)` (md bold `COLORS.expense`).
- When `topExpenses` is not empty and `expenseTotal > 0`: `separator()`, text `รายจ่ายตามหมวด` (xs bold, margin lg), `stackBar`, then one legend row per share. Shares = topExpenses in order, plus `หมวดอื่น` last when `otherExpenseTotal > 0`. Share percent = `Math.round(total / expenseTotal * 100)`; bar weight = `Math.max(1, percent)`; color = `CHART_COLORS[index % 6]`.
- Legend row: horizontal, `alignItems: 'center'`, a 12px square box (`cornerRadius: '4px'`, the share color, `flex: 0`), the category text (xs, flex 1, wrap), value `{formatAmount(total)} · {percent}%` (xs, align end, flex 0).
- When `comment` is non-empty: strip box (`COLORS.brandSoft`, paddingAll md, cornerRadius md, margin lg) with `เฮียว่า` (xxs bold brand) then the comment (xs wrap).
- `footer`: only when `summaryUrl`: `actionRow({ type: 'uri', label: 'เปิดหน้าสรุป', uri: summaryUrl })`.
- altText unchanged.

- [ ] **Step 1: Rewrite `src/summary/flex.test.js`**

```js
import { describe, it, expect } from 'vitest';
import { buildSummaryFlex } from './flex.js';
import { COLORS, CHART_COLORS } from '../utils/flex-style.js';

function summary(overrides = {}) {
  return {
    label: 'เดือนนี้ (01/10 - 28/10)',
    incomeTotal: 25000,
    expenseTotal: 14320,
    net: 10680,
    topExpenses: [
      { category: 'อาหาร', total: 5160 },
      { category: 'เดินทาง', total: 3100 },
      { category: 'ช้อปปิ้ง', total: 2450 },
    ],
    otherExpenseTotal: 3610,
    entryCount: 99,
    ...overrides,
  };
}

function texts(node) {
  const found = [];
  (function walk(value) {
    if (value && typeof value === 'object') {
      if (value.type === 'text') found.push(value.text);
      Object.values(value).forEach(walk);
    }
  })(node);
  return found;
}

function findStack(node) {
  if (!node || typeof node !== 'object') return null;
  if (node.type === 'box' && node.height === '8px' && node.spacing === '2px') return node;
  for (const child of node.contents ?? []) {
    const found = findStack(child);
    if (found) return found;
  }
  return null;
}

describe('buildSummaryFlex', () => {
  it('keeps the alt text for notifications', () => {
    expect(buildSummaryFlex(summary(), '').altText).toBe('สรุปเดือนนี้ (01/10 - 28/10): รายรับ 25,000 บาท รายจ่าย 14,320 บาท');
  });

  it('puts the balance in the brand header', () => {
    const flex = buildSummaryFlex(summary(), '');

    expect(flex.contents.header.backgroundColor).toBe(COLORS.brand);
    expect(texts(flex.contents.header)).toEqual(['สรุปเดือนนี้ (01/10 - 28/10)', 'คงเหลือ 10,680 บาท']);
  });

  it('says the balance is negative in words', () => {
    expect(texts(buildSummaryFlex(summary({ incomeTotal: 2000, expenseTotal: 3180, net: -1180 }), '').contents.header)[1]).toBe('ติดลบ 1,180 บาท');
  });

  it('shows income and expense, then the category legend with amount and share', () => {
    const body = texts(buildSummaryFlex(summary(), '').contents.body);

    expect(body).toEqual([
      'รายรับ', '25,000', 'รายจ่าย', '14,320',
      'รายจ่ายตามหมวด',
      'อาหาร', '5,160 · 36%',
      'เดินทาง', '3,100 · 22%',
      'ช้อปปิ้ง', '2,450 · 17%',
      'หมวดอื่น', '3,610 · 25%',
    ]);
  });

  it('draws an 8px stacked bar with the web chart colors in rank order', () => {
    const stack = findStack(buildSummaryFlex(summary(), '').contents.body);

    expect(stack.contents.map((part) => [part.flex, part.backgroundColor])).toEqual([
      [36, CHART_COLORS[0]],
      [22, CHART_COLORS[1]],
      [17, CHART_COLORS[2]],
      [25, CHART_COLORS[3]],
    ]);
  });

  it('keeps a tiny category visible in the bar', () => {
    const stack = findStack(buildSummaryFlex(summary({ expenseTotal: 10001, topExpenses: [{ category: 'อาหาร', total: 10000 }, { category: 'ขนม', total: 1 }], otherExpenseTotal: 0 }), '').contents.body);

    expect(stack.contents.map((part) => part.flex)).toEqual([100, 1]);
  });

  it('omits the category section when there is no expense', () => {
    const body = texts(buildSummaryFlex(summary({ expenseTotal: 0, net: 25000, topExpenses: [], otherExpenseTotal: 0 }), '').contents.body);

    expect(body).not.toContain('รายจ่ายตามหมวด');
  });

  it('shows the comment under a label only when there is one', () => {
    expect(texts(buildSummaryFlex(summary(), 'กินน้อยลงหน่อย').contents.body).slice(-2)).toEqual(['เฮียว่า', 'กินน้อยลงหน่อย']);
    expect(texts(buildSummaryFlex(summary(), '').contents.body)).not.toContain('เฮียว่า');
  });

  it('adds a yellow button to the web summary only when a link is given', () => {
    const footer = buildSummaryFlex(summary(), '', { summaryUrl: 'https://liff.line.me/l?tab=summary' }).contents.footer;

    expect(footer.contents[0].action).toEqual({ type: 'uri', label: 'เปิดหน้าสรุป', uri: 'https://liff.line.me/l?tab=summary' });
    expect(footer.contents[0].backgroundColor).toBe(COLORS.cta);
    expect(buildSummaryFlex(summary(), '').contents.footer).toBeUndefined();
  });
});
```

Add to `src/chat/urls.test.js`:

```js
describe('createUrlBuilders buildSummaryUrl', () => {
  it('opens the summary tab', () => {
    expect(createUrlBuilders({ liffUrl: LIFF_URL }).buildSummaryUrl()).toBe(`${LIFF_URL}?tab=summary`);
  });

  it('has no link without a web page', () => {
    expect(createUrlBuilders({}).buildSummaryUrl()).toBeUndefined();
  });
});
```

In `src/notifications/weekly.test.js`:
- In `setup`, pass `summaryUrl: 'https://liff.line.me/liff-1?tab=summary'` to `createWeeklySummaryRunner`.
- Change the push assertion to `expect(pushFlex).toHaveBeenCalledWith('U1', buildSummaryFlex(buildSummary(ROWS, LABEL), '', { summaryUrl: 'https://liff.line.me/liff-1?tab=summary' }));`
- Replace `expect(JSON.stringify(flex)).not.toContain('"wrap":true');` (it was a proxy for "no comment", but the new header text wraps) with `expect(JSON.stringify(flex)).not.toContain('เฮียว่า');`
- Add: `expect(flex.contents.footer.contents[0].action.uri).toBe('https://liff.line.me/liff-1?tab=summary');`

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/summary/flex.test.js src/chat/urls.test.js src/notifications/weekly.test.js`
Expected: FAIL

- [ ] **Step 3: Implement**

`src/summary/flex.js` (full file):

```js
const { formatAmount } = require('../parser/format-reply');
const { COLORS: STYLE, CHART_COLORS, brandHeader, stackBar, actionRow, separator } = require('../utils/flex-style');

// สีและ row ชุดเดิมคงไว้ให้ query/answer-flex.js ที่ยังใช้อยู่
const COLORS = { income: '#1DB446', expense: '#E53935', muted: '#888888' };

function baht(amount) {
  return `${formatAmount(amount)} บาท`;
}

function row(label, value, color) {
  const valueText = { type: 'text', text: value, size: 'sm', align: 'end', flex: 4 };
  if (color) {
    valueText.color = color;
  }
  return {
    type: 'box',
    layout: 'horizontal',
    contents: [{ type: 'text', text: label, size: 'sm', color: COLORS.muted, flex: 3 }, valueText],
  };
}

function totalColumn(label, amount, color, align) {
  return {
    type: 'box',
    layout: 'vertical',
    flex: 1,
    contents: [
      { type: 'text', text: label, size: 'xxs', color: STYLE.muted, align },
      { type: 'text', text: formatAmount(amount), size: 'md', weight: 'bold', color, align },
    ],
  };
}

function categoryShares(summary) {
  const entries = [...summary.topExpenses];
  if (summary.otherExpenseTotal > 0) entries.push({ category: 'หมวดอื่น', total: summary.otherExpenseTotal });
  return entries.map((entry, index) => ({
    ...entry,
    percent: Math.round((entry.total / summary.expenseTotal) * 100),
    color: CHART_COLORS[index % CHART_COLORS.length],
  }));
}

function legendRow(share) {
  return {
    type: 'box',
    layout: 'horizontal',
    spacing: 'sm',
    margin: 'sm',
    alignItems: 'center',
    contents: [
      { type: 'box', layout: 'vertical', flex: 0, width: '12px', height: '12px', cornerRadius: '4px', backgroundColor: share.color, contents: [] },
      { type: 'text', text: share.category, size: 'xs', flex: 1, wrap: true },
      { type: 'text', text: `${formatAmount(share.total)} · ${share.percent}%`, size: 'xs', align: 'end', flex: 0 },
    ],
  };
}

function balanceTitle(net) {
  return net < 0 ? `ติดลบ ${baht(-net)}` : `คงเหลือ ${baht(net)}`;
}

function buildSummaryFlex(summary, comment, { summaryUrl } = {}) {
  const title = `สรุป${summary.label}`;
  const body = [
    {
      type: 'box',
      layout: 'horizontal',
      contents: [
        totalColumn('รายรับ', summary.incomeTotal, STYLE.income, 'start'),
        totalColumn('รายจ่าย', summary.expenseTotal, STYLE.expense, 'end'),
      ],
    },
  ];
  if (summary.topExpenses.length > 0 && summary.expenseTotal > 0) {
    const shares = categoryShares(summary);
    body.push(
      separator(),
      { type: 'text', text: 'รายจ่ายตามหมวด', size: 'xs', weight: 'bold', margin: 'lg' },
      // ขั้นต่ำ 1 ให้หมวดเล็กยังเห็นในแถบ และ flex ของ LINE ต้องเป็นจำนวนเต็ม
      stackBar(shares.map((share) => ({ weight: Math.max(1, share.percent), color: share.color }))),
      ...shares.map(legendRow)
    );
  }
  if (comment) {
    body.push({
      type: 'box',
      layout: 'vertical',
      margin: 'lg',
      paddingAll: 'md',
      cornerRadius: 'md',
      backgroundColor: STYLE.brandSoft,
      contents: [
        { type: 'text', text: 'เฮียว่า', size: 'xxs', weight: 'bold', color: STYLE.brand },
        { type: 'text', text: comment, size: 'xs', wrap: true },
      ],
    });
  }

  const bubble = {
    type: 'bubble',
    header: brandHeader(title, balanceTitle(summary.net)),
    body: { type: 'box', layout: 'vertical', contents: body },
  };
  if (summaryUrl) bubble.footer = actionRow({ type: 'uri', label: 'เปิดหน้าสรุป', uri: summaryUrl });

  return {
    type: 'flex',
    altText: `${title}: รายรับ ${baht(summary.incomeTotal)} รายจ่าย ${baht(summary.expenseTotal)}`,
    contents: bubble,
  };
}

module.exports = { buildSummaryFlex, COLORS, row, baht };
```

`src/chat/urls.js`: replace the body of `buildGoalsUrl` with a shared private helper and add `buildSummaryUrl`:

```js
  // ลิงก์เปิดแท็บตรงๆ จาก Rich Menu หรือการ์ด
  function buildTabUrl(tab) {
    if (!liffUrl) {
      return undefined;
    }
    try {
      const url = new URL(liffUrl);
      url.searchParams.set('tab', tab);
      const text = url.toString();
      return url.protocol === 'https:' && text.length <= MAX_URI_LENGTH ? text : undefined;
    } catch {
      return undefined;
    }
  }

  function buildGoalsUrl() {
    return buildTabUrl('goals');
  }

  function buildSummaryUrl() {
    return buildTabUrl('summary');
  }
```

Keep the existing comment that sits above `buildGoalsUrl` (it actually describes `buildTotalsListUrl`; move it to sit directly above `buildTotalsListUrl`). Return `{ buildEditUrls, buildEditUrl, buildGoalsUrl, buildSummaryUrl, buildTotalsListUrl }`.

`src/chat/text.js`: destructure `buildSummaryUrl` from `urls` next to `buildGoalsUrl`, and in `handleSummary` use
`return { flex: buildSummaryFlex(summary, comment, { summaryUrl: buildSummaryUrl() }) };`

`src/notifications/weekly.js`: signature `createWeeklySummaryRunner({ repository, pushFlex, summaryUrl, now = () => new Date(), logger = console })` and push `buildSummaryFlex(summary, '', { summaryUrl })`.

`index.js`: add `const { createUrlBuilders } = require('./src/chat/urls');` next to the other requires, and change the runner line to
`runWeeklySummary: createWeeklySummaryRunner({ repository, pushFlex: createPushFlex(lineClient), summaryUrl: createUrlBuilders({ liffUrl }).buildSummaryUrl() }),`
(`liffUrl` is already defined above it in `index.js`.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/summary src/chat src/notifications src/bot.test.js`
Expected: PASS. If a `src/bot.test.js` summary assertion fails because of the new body texts or the new footer, update only that assertion to the new card shape.

- [ ] **Step 5: Lint and commit**

Run: `npx eslint src/summary src/chat src/notifications index.js` (expect no output)

```bash
git add src/summary/flex.js src/summary/flex.test.js src/chat/urls.js src/chat/urls.test.js src/chat/text.js src/notifications/weekly.js src/notifications/weekly.test.js index.js src/bot.test.js
git commit -m "feat(flex): redesign summary card with web chart colors and a link to the summary tab"
```

---

### Task 5: Totals answer card

**Depends on:** Task 1, Task 4 (removes the old `COLORS`/`row` from `src/summary/flex.js` after switching away from them)

**Files:**
- Modify: `src/query/answer-flex.js`
- Test: `src/query/answer-flex.test.js`
- Modify: `src/summary/flex.js` (drop the old `COLORS` and `row`; export `{ buildSummaryFlex, baht }`)
- Modify: `src/bot.test.js` (line ~1129 reads `contents.header.contents[0].text`) — shared file

**Interfaces:**
- Consumes: `COLORS, brandHeader, progressBar, gaugeRow, actionRow` from `src/utils/flex-style.js`; `baht` from `src/summary/flex.js`.
- Produces: unchanged `buildTotalsFlex(question, rows, { listUrl })`.

**Card spec:**
- `header`: eyebrow `ยอด {formatThaiRange(from, to)}`; title:
  - type `expense`: `จ่ายไป {baht(total)}`; type `income`: `รับมา {baht(total)}`
  - type `both`: net = income − expense (satang): `เหลือ {baht(net)}` or `ติดลบ {baht(-net)}`
- body first item: chips row (horizontal box, spacing sm) of chip boxes, in order: `คำค้น {keyword}` (only with keyword), `{category || 'ทุกหมวด'}`, `กระเป๋า {wallet}` (only with wallet). Chip = box `flex: 0`, `cornerRadius: '12px'`, `backgroundColor: COLORS.brandSoft`, paddings 2px/10px, text xs bold `COLORS.brand`.
- Single type: info rows (horizontal: label sm muted flex 1, value sm bold align end flex 0): `จำนวนรายการ` → `{n} รายการ` or `ไม่มีรายการ`; when n > 0 also `เฉลี่ยรายการละ` → `{baht(Math.round(total / n))}`.
- Type `both`: for income then expense: a box (margin lg) containing `gaugeRow('{รายรับ|รายจ่าย} · {n} รายการ' or '… · ไม่มีรายการ', formatAmount(total), color)` and `progressBar(max > 0 ? Math.round(total / max * 100) : 0, color)` where max = larger of the two totals and color = `COLORS.income` / `COLORS.expense`.
- `footer` only with `listUrl`: `actionRow({ type: 'uri', label: 'ดูรายการในเว็บ', uri: listUrl })`.
- altText unchanged.

- [ ] **Step 1: Rewrite `src/query/answer-flex.test.js`**

```js
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { buildTotalsFlex } = require('./answer-flex.js');
const { COLORS } = require('../utils/flex-style.js');

const BASE = { type: 'expense', category: '', keyword: '', from: '2026-10-01', to: '2026-10-19' };
const EXPENSE_ROWS = [{ type: 'expense', total: 450, entryCount: 6 }];
const INCOME_ROWS = [{ type: 'income', total: 25000, entryCount: 1 }];

function texts(node) {
  if (!node || typeof node !== 'object') return [];
  return [...(node.type === 'text' ? [node.text] : []), ...(node.contents ?? []).flatMap(texts)];
}

function bars(node, found = []) {
  if (!node || typeof node !== 'object') return found;
  if (node.type === 'box' && node.height === '8px') found.push(node);
  (node.contents ?? []).forEach((child) => bars(child, found));
  return found;
}

describe('buildTotalsFlex', () => {
  it('puts the range and the answer in the brand header', () => {
    const flex = buildTotalsFlex({ ...BASE, keyword: 'กาแฟ' }, EXPENSE_ROWS, {});

    expect(flex.contents.header.backgroundColor).toBe(COLORS.brand);
    expect(texts(flex.contents.header)).toEqual(['ยอด 1-19 ต.ค. 2569', 'จ่ายไป 450 บาท']);
    expect(texts(buildTotalsFlex({ ...BASE, type: 'income' }, INCOME_ROWS, {}).contents.header)[1]).toBe('รับมา 25,000 บาท');
  });

  it('shows the filters as chips, then the count and the average', () => {
    const flex = buildTotalsFlex({ ...BASE, keyword: 'กาแฟ' }, EXPENSE_ROWS, {});

    expect(texts(flex.contents.body)).toEqual(['คำค้น กาแฟ', 'ทุกหมวด', 'จำนวนรายการ', '6 รายการ', 'เฉลี่ยรายการละ', '75 บาท']);
  });

  it('names the category and adds the wallet chip only when asked', () => {
    const withWallet = buildTotalsFlex({ ...BASE, category: 'อาหาร', wallet: 'บัตรเครดิต' }, EXPENSE_ROWS, {});

    expect(texts(withWallet.contents.body.contents[0])).toEqual(['อาหาร', 'กระเป๋า บัตรเครดิต']);
    expect(withWallet.altText).toContain('กระเป๋า บัตรเครดิต');
    expect(JSON.stringify(buildTotalsFlex(BASE, EXPENSE_ROWS, {}).contents.body)).not.toContain('กระเป๋า');
  });

  it('says there are no entries and skips the average when the count is zero', () => {
    const found = texts(buildTotalsFlex(BASE, [], {}).contents.body);

    expect(found.slice(-2)).toEqual(['จำนวนรายการ', 'ไม่มีรายการ']);
    expect(found).not.toContain('เฉลี่ยรายการละ');
  });

  it('compares income and expense with bars when the type is both', () => {
    const flex = buildTotalsFlex({ ...BASE, type: 'both' }, [...EXPENSE_ROWS, ...INCOME_ROWS], {});

    expect(texts(flex.contents.header)[1]).toBe('เหลือ 24,550 บาท');
    expect(texts(flex.contents.body).slice(-4)).toEqual(['รายรับ · 1 รายการ', '25,000', 'รายจ่าย · 6 รายการ', '450']);
    expect(bars(flex.contents.body).map((bar) => bar.contents[0].width)).toEqual(['100%', '2%']);
  });

  it('says the balance is negative in words when spending is larger', () => {
    const flex = buildTotalsFlex({ ...BASE, type: 'both' }, [{ type: 'income', total: 100, entryCount: 1 }, ...EXPENSE_ROWS], {});

    expect(texts(flex.contents.header)[1]).toBe('ติดลบ 350 บาท');
  });

  it('keeps the plain sentence as the alt text and caps it', () => {
    expect(buildTotalsFlex({ ...BASE, keyword: 'กาแฟ' }, EXPENSE_ROWS, {}).altText).toBe('ช่วง 1-19 ต.ค. 2569 คำว่า "กาแฟ": รายจ่าย 450 บาท (6 รายการ)');
    const long = buildTotalsFlex({ ...BASE, keyword: 'ก'.repeat(500) }, EXPENSE_ROWS, {});
    expect(long.altText).toHaveLength(400);
  });

  it('adds a yellow footer button that opens the list url', () => {
    const footer = buildTotalsFlex(BASE, EXPENSE_ROWS, { listUrl: 'https://liff.line.me/1?tab=list' }).contents.footer;

    expect(footer.contents[0].action).toEqual({ type: 'uri', label: 'ดูรายการในเว็บ', uri: 'https://liff.line.me/1?tab=list' });
    expect(footer.contents[0].backgroundColor).toBe(COLORS.cta);
    expect(buildTotalsFlex(BASE, EXPENSE_ROWS, {}).contents.footer).toBeUndefined();
  });
});
```

(Check: 450 / 6 = 75; `Math.round(450 / 25000 * 100)` = `Math.round(1.8)` = 2.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/query/answer-flex.test.js`
Expected: FAIL

- [ ] **Step 3: Rewrite `src/query/answer-flex.js`**

```js
const { baht } = require('../summary/flex');
const { formatAmount } = require('../parser/format-reply');
const { TYPE_LABELS } = require('../utils/type-labels');
const { capAltText } = require('../utils/alt-text');
const { COLORS, brandHeader, progressBar, gaugeRow, actionRow } = require('../utils/flex-style');
const { formatThaiRange, formatTotalsAnswer } = require('./format-answer');

const TYPE_COLORS = { income: COLORS.income, expense: COLORS.expense };

function totalsOf(type, rows) {
  const found = rows.find((item) => item.type === type);
  return { total: found ? found.total : 0, count: found ? found.entryCount : 0 };
}

function toSatang(amount) {
  return Math.round(Number(amount) * 100);
}

function headerTitle(question, rows) {
  if (question.type === 'both') {
    const net = (toSatang(totalsOf('income', rows).total) - toSatang(totalsOf('expense', rows).total)) / 100;
    return net < 0 ? `ติดลบ ${baht(-net)}` : `เหลือ ${baht(net)}`;
  }
  const { total } = totalsOf(question.type, rows);
  return `${question.type === 'income' ? 'รับมา' : 'จ่ายไป'} ${baht(total)}`;
}

function chip(text) {
  return {
    type: 'box',
    layout: 'vertical',
    flex: 0,
    cornerRadius: '12px',
    backgroundColor: COLORS.brandSoft,
    paddingTop: '2px',
    paddingBottom: '2px',
    paddingStart: '10px',
    paddingEnd: '10px',
    contents: [{ type: 'text', text, size: 'xs', weight: 'bold', color: COLORS.brand, wrap: true }],
  };
}

// ผู้ใช้กระเป๋าเดียวได้ wallet ว่างเสมอ การ์ดจึงไม่มีป้ายกระเป๋า
function chipsRow(question) {
  const labels = [question.keyword ? `คำค้น ${question.keyword}` : '', question.category || 'ทุกหมวด', question.wallet ? `กระเป๋า ${question.wallet}` : ''];
  return { type: 'box', layout: 'horizontal', spacing: 'sm', contents: labels.filter(Boolean).map(chip) };
}

function infoRow(label, value) {
  return {
    type: 'box',
    layout: 'horizontal',
    margin: 'md',
    contents: [
      { type: 'text', text: label, size: 'sm', color: COLORS.muted, flex: 1 },
      { type: 'text', text: value, size: 'sm', weight: 'bold', align: 'end', flex: 0 },
    ],
  };
}

function singleTypeRows(type, rows) {
  const { total, count } = totalsOf(type, rows);
  const result = [infoRow('จำนวนรายการ', count > 0 ? `${count} รายการ` : 'ไม่มีรายการ')];
  if (count > 0) result.push(infoRow('เฉลี่ยรายการละ', baht(Math.round(total / count))));
  return result;
}

function compareRows(rows) {
  const totals = { income: totalsOf('income', rows), expense: totalsOf('expense', rows) };
  const max = Math.max(totals.income.total, totals.expense.total);
  return ['income', 'expense'].map((type) => {
    const { total, count } = totals[type];
    const label = `${TYPE_LABELS[type]} · ${count > 0 ? `${count} รายการ` : 'ไม่มีรายการ'}`;
    return {
      type: 'box',
      layout: 'vertical',
      margin: 'lg',
      contents: [
        gaugeRow(label, formatAmount(total), TYPE_COLORS[type]),
        progressBar(max > 0 ? Math.round((total / max) * 100) : 0, TYPE_COLORS[type]),
      ],
    };
  });
}

function buildTotalsFlex(question, rows, { listUrl } = {}) {
  const body = [chipsRow(question), ...(question.type === 'both' ? compareRows(rows) : singleTypeRows(question.type, rows))];
  const bubble = {
    type: 'bubble',
    header: brandHeader(`ยอด ${formatThaiRange(question.from, question.to)}`, headerTitle(question, rows)),
    body: { type: 'box', layout: 'vertical', contents: body },
  };
  if (listUrl) bubble.footer = actionRow({ type: 'uri', label: 'ดูรายการในเว็บ', uri: listUrl });
  return {
    type: 'flex',
    altText: capAltText(formatTotalsAnswer(question, rows)),
    contents: bubble,
  };
}

module.exports = { buildTotalsFlex };
```

Then in `src/summary/flex.js` delete the old `COLORS` constant, its comment, and `row`, and change the export to `module.exports = { buildSummaryFlex, baht };`. Rename the import alias back: `const { COLORS, CHART_COLORS, brandHeader, stackBar, actionRow, separator } = require('../utils/flex-style');` and replace every `STYLE.` with `COLORS.` in that file. Run `grep -rn "summary/flex" src index.js` and confirm no file still imports `row` or `COLORS` from it.

- [ ] **Step 4: Fix `src/bot.test.js` totals assertions**

Around line 1129 `expect(flex.contents.header.contents[0].text).toBe('ยอด 1-18 ต.ค. 2569');` still holds (eyebrow is the first header text). Run `npx vitest run src/bot.test.js` and update only totals-card assertions that fail because of the new body.

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/query src/summary src/bot.test.js`
Expected: PASS

- [ ] **Step 6: Lint and commit**

Run: `npx eslint src/query src/summary src/bot.test.js` (expect no output)

```bash
git add src/query/answer-flex.js src/query/answer-flex.test.js src/summary/flex.js src/bot.test.js
git commit -m "feat(flex): redesign totals answer card with filter chips and comparison bars"
```

---

### Task 6: Saving to goal card

**Depends on:** Task 1

**Files:**
- Modify: `src/goals/flex.js`
- Test: `src/goals/flex.test.js`
- Modify: `src/bot.test.js` (lines ~742-755 read the saving footer) — shared file

**Interfaces:**
- Consumes: `COLORS, brandHeader, progressBar, gaugeRow, actionRow` from `src/utils/flex-style.js`; `goalPercent, formatSavingReply` from `src/goals/chat.js`.
- Produces: unchanged `buildSavingFlex({ name, amount, saved, target }, { buttons, goalsUrl })`.

**Card spec:**
- `header`: `brandHeader('ออมเข้าเป้าแล้ว', name, '+' + formatAmount(amount))`.
- body: `gaugeRow('ความคืบหน้า', reached ? '{p}% · ถึงเป้าแล้ว' : '{p}% · อีก {formatAmount(remaining)}', reached ? COLORS.income : COLORS.brand)`, `progressBar(p, same color)`, text `ยอดสะสม {saved} จาก {target} บาท` (xxs muted, margin xs). `remaining = max(target − saved, 0)` in satang. When reached (p ≥ 100) add strip (`COLORS.incomeSoft`, text color `COLORS.incomeText`, sm wrap): `ถึงเป้าแล้ว ปิดเป้าได้ในหน้าเว็บ แท็บ ออม`.
- `footer`: `actionRow(primary, buttons.map(b => b.action))` where primary = goals link `{ type: 'uri', label: reached ? 'ปิดเป้าในเว็บ' : 'ดูเป้าในเว็บ', uri: goalsUrl }` when `goalsUrl`, else undefined. No footer when both are missing.
- altText unchanged.

- [ ] **Step 1: Rewrite `src/goals/flex.test.js`**

```js
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { buildSavingFlex } = require('./flex.js');
const { COLORS } = require('../utils/flex-style.js');

const UNDO_BUTTON = {
  type: 'action',
  action: { type: 'postback', label: 'ยกเลิก', data: 'action=undo_saving&event=ev1', displayText: 'ยกเลิก' },
};
const GOALS_URL = 'https://liff.line.me/liff-1?tab=goals';

function texts(node) {
  if (!node || typeof node !== 'object') return [];
  const own = node.type === 'text' ? [node.text] : [];
  return own.concat(...(node.contents ?? []).map(texts));
}

function findBar(node) {
  if (!node || typeof node !== 'object') return null;
  if (node.type === 'box' && node.height === '8px') return node;
  for (const child of node.contents ?? []) {
    const found = findBar(child);
    if (found) return found;
  }
  return null;
}

describe('buildSavingFlex', () => {
  const saving = { name: 'เที่ยวญี่ปุ่น', amount: 1000, saved: 6000.5, target: 50000 };

  it('puts the goal and the amount saved in the brand header and keeps the altText', () => {
    const message = buildSavingFlex(saving, { buttons: [UNDO_BUTTON], goalsUrl: GOALS_URL });

    expect(message.altText).toBe('เฮียจดออมเข้าเป้า เที่ยวญี่ปุ่น 1,000 บาทแล้ว\nยอดสะสม 6,000.5 / 50,000 บาท (12%)');
    expect(message.contents.header.backgroundColor).toBe(COLORS.brand);
    expect(texts(message.contents.header)).toEqual(['ออมเข้าเป้าแล้ว', 'เที่ยวญี่ปุ่น', '+1,000']);
  });

  it('shows the percent with what is left, the bar, and the running total', () => {
    const message = buildSavingFlex(saving, {});

    expect(texts(message.contents.body)).toEqual(['ความคืบหน้า', '12% · อีก 43,999.5', 'ยอดสะสม 6,000.5 จาก 50,000 บาท']);
    expect(findBar(message.contents.body).contents[0]).toMatchObject({ width: '12%', backgroundColor: COLORS.brand });
  });

  it('turns green, caps the bar at 100% and says the goal is reached', () => {
    const message = buildSavingFlex({ name: 'มือถือ', amount: 500, saved: 30500, target: 30000 }, { goalsUrl: GOALS_URL });
    const bar = findBar(message.contents.body);

    expect(bar.contents[0]).toMatchObject({ width: '100%', backgroundColor: COLORS.income });
    expect(texts(message.contents.body)).toContain('ถึงเป้าแล้ว ปิดเป้าได้ในหน้าเว็บ แท็บ ออม');
    expect(texts(message.contents.body)[1]).toBe('101% · ถึงเป้าแล้ว');
    expect(message.contents.footer.contents.at(-1).action.label).toBe('ปิดเป้าในเว็บ');
  });

  // LINE ไม่รับ box ที่กว้าง 0% จึงใช้ filler แทนเมื่อยอดยังไม่ถึง 1%
  it('leaves the bar empty without a zero width box below 1%', () => {
    const bar = findBar(buildSavingFlex({ name: 'บ้าน', amount: 1, saved: 1, target: 1000000 }, {}).contents.body);

    expect(bar.contents).toEqual([{ type: 'filler' }]);
  });

  it('puts undo on the left and the yellow goals link on the right', () => {
    const footer = buildSavingFlex(saving, { buttons: [UNDO_BUTTON], goalsUrl: GOALS_URL }).contents.footer;

    expect(footer.contents.map((node) => node.action)).toEqual([UNDO_BUTTON.action, { type: 'uri', label: 'ดูเป้าในเว็บ', uri: GOALS_URL }]);
    expect(footer.contents.map((node) => node.backgroundColor)).toEqual([COLORS.secondary, COLORS.cta]);
  });

  it('keeps only the undo button without a goals link and has no footer without either', () => {
    expect(buildSavingFlex(saving, { buttons: [UNDO_BUTTON] }).contents.footer.contents.map((node) => node.action)).toEqual([UNDO_BUTTON.action]);
    expect(buildSavingFlex(saving, {}).contents.footer).toBeUndefined();
  });
});
```

(Check: 101% because `goalPercent(30500, 30000)` = floor(101.66) = 101. 50000 − 6000.5 = 43,999.5.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/goals/flex.test.js`
Expected: FAIL

- [ ] **Step 3: Rewrite `src/goals/flex.js`**

```js
const { formatAmount } = require('../parser/format-reply');
const { capAltText } = require('../utils/alt-text');
const { formatSavingReply, goalPercent } = require('./chat');
const { COLORS, brandHeader, progressBar, gaugeRow, actionRow } = require('../utils/flex-style');

function toSatang(amount) {
  return Math.round(Number(amount) * 100);
}

function buildSavingFlex({ name, amount, saved, target }, { buttons, goalsUrl } = {}) {
  const percent = goalPercent(saved, target);
  const reached = percent >= 100;
  const color = reached ? COLORS.income : COLORS.brand;
  const remaining = Math.max(toSatang(target) - toSatang(saved), 0) / 100;
  const body = [
    gaugeRow('ความคืบหน้า', reached ? `${percent}% · ถึงเป้าแล้ว` : `${percent}% · อีก ${formatAmount(remaining)}`, color),
    progressBar(percent, color),
    { type: 'text', text: `ยอดสะสม ${formatAmount(saved)} จาก ${formatAmount(target)} บาท`, size: 'xxs', color: COLORS.muted, margin: 'xs', wrap: true },
  ];
  if (reached) {
    body.push({
      type: 'box',
      layout: 'vertical',
      margin: 'md',
      paddingAll: 'md',
      cornerRadius: 'md',
      backgroundColor: COLORS.incomeSoft,
      contents: [{ type: 'text', text: 'ถึงเป้าแล้ว ปิดเป้าได้ในหน้าเว็บ แท็บ ออม', size: 'sm', color: COLORS.incomeText, wrap: true }],
    });
  }

  const primary = goalsUrl ? { type: 'uri', label: reached ? 'ปิดเป้าในเว็บ' : 'ดูเป้าในเว็บ', uri: goalsUrl } : undefined;
  const bubble = {
    type: 'bubble',
    header: brandHeader('ออมเข้าเป้าแล้ว', name, `+${formatAmount(amount)}`),
    body: { type: 'box', layout: 'vertical', contents: body },
  };
  const footer = actionRow(primary, (buttons ?? []).map((item) => item.action));
  if (footer) bubble.footer = footer;
  return {
    type: 'flex',
    altText: capAltText(formatSavingReply({ name, amount, saved, target })),
    contents: bubble,
  };
}

module.exports = { buildSavingFlex };
```

- [ ] **Step 4: Fix `src/bot.test.js` saving assertions**

Line ~742 maps footer actions and expects only the undo action — keep if the test has no goals url, otherwise expect `[UNDO_SAVING_QUICK_REPLY[0].action, <goals uri action>]`. Line ~755 `footer.contents[0].action` → the goals link is now the LAST item: use `footer.contents.at(-1).action`.

Run: `npx vitest run src/goals src/bot.test.js`
Expected: PASS

- [ ] **Step 5: Lint and commit**

Run: `npx eslint src/goals src/bot.test.js` (expect no output)

```bash
git add src/goals/flex.js src/goals/flex.test.js src/bot.test.js
git commit -m "feat(flex): redesign saving card with progress gauge and cancel on the left"
```

---

### Task 7: Bill request card

**Depends on:** Task 1

**Files:**
- Modify: `src/bills/flex.js`
- Test: `src/bills/flex.test.js`
- Check: `src/bills/service.test.js` (only if it reads the card structure)

**Interfaces:**
- Consumes: `COLORS, brandHeader, actionRow, linkButton` from `src/utils/flex-style.js`.
- Produces: unchanged `buildBillRequestFlex({ billId, title, ownerName, share, occurredOn, categoryName, liffUrl })`, `BILL_CONFIRM_ACTION`, `BILL_DECLINE_ACTION`.

**Card spec:**
- `header`: `brandHeader('{ownerName} ขอให้ยืนยันส่วนแบ่งบิล', title)`.
- body: date line (`thaiDateWithYear(occurredOn)` plus ` · {categoryName}` when given; xs muted wrap) → share box (horizontal, `alignItems: 'center'`, `COLORS.brandSoft`, paddingAll md, cornerRadius md, margin md): `ส่วนของคุณ` (sm `COLORS.brandDark` flex 1) and `{formatAmount(share)} บาท` (lg bold `COLORS.brandDark` align end flex 0) → `ยืนยันแล้วจะบันทึกเป็นรายจ่ายของคุณ` (xs muted wrap, margin sm).
- `footer`: vertical box (spacing sm, paddingAll 0) with `actionRow(confirm, [decline])` then `linkButton(webLink)`. Decline renders left, confirm (yellow) right.
- altText unchanged.

- [ ] **Step 1: Update `src/bills/flex.test.js`**

Replace the first two `it` blocks with:

```js
  it('names the owner and the bill in the header and the share in the body', () => {
    const flex = buildBillRequestFlex(ARGS);

    expect(flex.altText).toBe('เอ ขอให้ยืนยันส่วนแบ่งบิล เนื้อย่าง 1,250.5 บาท');
    expect(texts(flex.contents.header)).toEqual(['เอ ขอให้ยืนยันส่วนแบ่งบิล', 'เนื้อย่าง']);
    expect(texts(flex.contents.body)).toEqual(['08/10/2569 · อาหาร', 'ส่วนของคุณ', '1,250.5 บาท', 'ยืนยันแล้วจะบันทึกเป็นรายจ่ายของคุณ']);
  });

  it('leaves out the category when there is none', () => {
    expect(texts(buildBillRequestFlex({ ...ARGS, categoryName: '' }).contents.body)[0]).toBe('08/10/2569');
  });

  it('puts decline left, the yellow confirm right, and the web link below', () => {
    const footer = buildBillRequestFlex(ARGS).contents.footer;
    const [row, link] = footer.contents;

    expect(row.contents.map((node) => node.action)).toEqual([
      { type: 'postback', label: 'ปฏิเสธ', data: `action=${BILL_DECLINE_ACTION}&bill=${ARGS.billId}`, displayText: 'ปฏิเสธ' },
      { type: 'postback', label: 'ยืนยัน', data: `action=${BILL_CONFIRM_ACTION}&bill=${ARGS.billId}`, displayText: 'ยืนยัน' },
    ]);
    expect(row.contents[1].backgroundColor).toBe(COLORS.cta);
    expect(link.action).toEqual({ type: 'uri', label: 'ดูในเว็บ', uri: `https://liff.line.me/liff-1?bill=${ARGS.billId}` });
  });
```

Add at the top: `import { COLORS } from '../utils/flex-style.js';`. Keep the existing `texts` helper and the alt text length test.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/bills/flex.test.js`
Expected: FAIL

- [ ] **Step 3: Rewrite `src/bills/flex.js`**

```js
const { formatAmount } = require('../parser/format-reply');
const { capAltText } = require('../utils/alt-text');
const { thaiDateWithYear } = require('../utils/date');
const { COLORS, brandHeader, actionRow, linkButton } = require('../utils/flex-style');

const BILL_CONFIRM_ACTION = 'bill_confirm';
const BILL_DECLINE_ACTION = 'bill_decline';

function postback(label, action, billId) {
  return { type: 'postback', label, data: new URLSearchParams({ action, bill: billId }).toString(), displayText: label };
}

function buildBillRequestFlex({ billId, title, ownerName, share, occurredOn, categoryName, liffUrl }) {
  const heading = `${ownerName} ขอให้ยืนยันส่วนแบ่งบิล`;
  const altText = `${heading} ${title} ${formatAmount(share)} บาท`;
  const url = new URL(liffUrl);
  url.searchParams.set('bill', billId);
  const date = thaiDateWithYear(occurredOn);
  return {
    type: 'flex',
    altText: capAltText(altText),
    contents: {
      type: 'bubble',
      header: brandHeader(heading, title),
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          { type: 'text', text: categoryName ? `${date} · ${categoryName}` : date, size: 'xs', color: COLORS.muted, wrap: true },
          {
            type: 'box',
            layout: 'horizontal',
            alignItems: 'center',
            margin: 'md',
            paddingAll: 'md',
            cornerRadius: 'md',
            backgroundColor: COLORS.brandSoft,
            contents: [
              { type: 'text', text: 'ส่วนของคุณ', size: 'sm', color: COLORS.brandDark, flex: 1 },
              { type: 'text', text: `${formatAmount(share)} บาท`, size: 'lg', weight: 'bold', color: COLORS.brandDark, align: 'end', flex: 0 },
            ],
          },
          { type: 'text', text: 'ยืนยันแล้วจะบันทึกเป็นรายจ่ายของคุณ', size: 'xs', color: COLORS.muted, wrap: true, margin: 'sm' },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        paddingAll: '0px',
        contents: [
          actionRow(postback('ยืนยัน', BILL_CONFIRM_ACTION, billId), [postback('ปฏิเสธ', BILL_DECLINE_ACTION, billId)]),
          linkButton({ type: 'uri', label: 'ดูในเว็บ', uri: url.toString() }),
        ],
      },
    },
  };
}

module.exports = { buildBillRequestFlex, BILL_CONFIRM_ACTION, BILL_DECLINE_ACTION };
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/bills`
Expected: PASS (if `src/bills/service.test.js` reads footer buttons by index, switch it to find by `action.data`)

- [ ] **Step 5: Lint and commit**

Run: `npx eslint src/bills` (expect no output)

```bash
git add src/bills/flex.js src/bills/flex.test.js src/bills/service.test.js
git commit -m "feat(flex): redesign bill request card with decline on the left"
```

---

### Final check (controller, after all tasks)

- [ ] Run `npm test` → all pass (report the count)
- [ ] Run `npm run lint` → no errors
- [ ] `grep -rn "#0071E3\|#1DB446\|#E53935" src --include=*.js | grep -v test` → no hits (old colors gone from cards)
- [ ] Update `work-memory/STATE.md` (Done + what the user must check in the LINE app), commit, then `git push`

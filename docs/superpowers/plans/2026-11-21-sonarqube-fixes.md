# SonarQube Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** แก้ issue จริงจากการสแกน SonarQube Community 26.11 (2026-11-21, 61 issues) จน Reliability rating ขึ้นจาก C เป็น A โดยพฤติกรรมของบอทและหน้าเว็บไม่เปลี่ยน

**Architecture:** แก้เป็นจุดเล็กๆ ไม่ refactor ข้างเคียง: เปลี่ยน regex คำสั่งออมที่ backtrack แบบ O(n²) เป็นการหาช่องว่างตัวสุดท้าย, เพิ่ม assertion ให้ test ที่ไม่ได้เช็คอะไร, ใช้ `Number.NaN` และ iterator แทน loop รอบเดียวใน `format.mjs`, ใส่ `void` หน้าการเรียก async ที่ตั้งใจไม่รอ (ทุกฟังก์ชันที่ถูกเรียกจับ error เองแล้ว ดูหัวข้อที่มา) ที่เหลือเป็น false positive ให้ผู้ใช้กดปิดใน SonarQube

**Tech Stack:** Node.js CommonJS (bot) + ES modules (LIFF `public/liff/*.mjs`), vitest, PGlite, ESLint 9, SonarQube Community 26.11 ใน Docker (`D:\GitHub\sonarqube-local`)

**ที่มา (ผลสแกน 2026-11-21, ไม่นับสำเนาซ้อนที่ลบแล้ว):**
- `javascript:S9383` Promise ไม่ได้ await 39 จุด: ตรวจแล้วทุกฟังก์ชันจับ error เอง (`loadProfile` app.mjs:1195, `loadBudgets` :1220, `loadMonth` :1243 จับใน :1286 และ await งบ/trend ที่จับเอง, `loadTrend` :1128, `loadRecurring` :1610, `runEdit` :1358, `runRecurringAction` :1657, `boot` :2150, `openEditor` :1310 ผ่าน `ensureCategories` :1293 ที่ catch และ `walletsPanel.load` wallets-panel.mjs:83 ที่ catch, `bill-form open` bill-form.mjs:256 ผ่าน `loadFriends` :116 และ `loadCategories` :147 ที่ catch, `submit` :286, `budget-sheet run` budget-sheet.mjs:106 ที่ `onSubmit` = `saveBudget` app.mjs:1500 คืน `{ ok: false }` แทน throw, `askDelete`/`confirmDelete` categories-panel.mjs:239/250 ผ่าน `send` :184 ที่ catch, `openAdd` friends-panel.mjs:170, `loadHistory`/`runDetail` goals-panel.mjs:282/322, `focusBill` bills-panel.mjs:463 ผ่าน `load` :267 ที่มี rejection handler) จึงไม่มี unhandled rejection จริง แก้ด้วย `void` ให้เห็นว่าตั้งใจ
- `javascript:S8786` `SAVING_PATTERN` src/goals/chat.js:5 วัดจริง: `ออม a` + ช่องว่าง 20,000 ตัว + `!` ใช้ 650 ms (5,000 ตัว 38 ms) ข้อความ LINE ยาวสุด 5,000 ตัว ความเสี่ยงต่ำแต่รับข้อความผู้ใช้ตรงๆ
- ตรรกะใหม่ใน Task 1 เทียบกับ regex เดิมแบบสุ่ม 300,000 ข้อความ (รวมขั้น `NAMELESS_SAVING_PATTERN` ก่อน) ผลตรงกันทุกข้อความ ใช้ 0.3 ms กับข้อความ 20,000 ตัว
- `javascript:S2699` src/db/sql-functions.test.js:414, `javascript:S7773` 4 จุด, `javascript:S1751` public/liff/format.mjs:354
- false positive: `javascript:S3516` src/bills/service.js:136 (`respondFromWeb` ตั้งใจคืน `result` ทุกทาง), `Web:S6850` 13 จุดใน public/liff/index.html (heading ว่างที่ JS ใส่ข้อความตอนเปิด), `Web:InputWithoutLabelCheck` index.html:895 (`#bill-form-receipt` เป็น file input ที่ซ่อนด้วย `sr-only` และ `aria-hidden` เปิดผ่านปุ่มที่มีข้อความ)

## Global Constraints

- คอมเมนต์ในโค้ดบรรทัดเดียว ภาษาไทย อธิบาย "ทำไม" ศัพท์เทคนิคคงเป็นอังกฤษ; ชื่อตัวแปร/function/log เป็นอังกฤษ; ห้าม emoji ในโค้ด คอมเมนต์ log commit
- ห้ามเปลี่ยนพฤติกรรมที่ผู้ใช้เห็น: ข้อความตอบ, ผลการ parse, ลำดับการโหลด, การจัดการ error
- ห้ามแก้ test เดิมเพื่อให้ผ่าน แก้โค้ดแทน (เพิ่ม test ใหม่ได้)
- ห้ามใส่อักขระ U+2028/U+2029 หรือ `\u2028` ในไฟล์ (เครื่องมือแก้ไฟล์แปลงเป็นอักขระจริงแล้ว JS parse พัง) ใช้ `/^.+$/` เช็คว่าไม่มีตัวขึ้นบรรทัดแทน
- ก่อนเริ่ม task แรก: `npm ci` (repo นี้ยังไม่มี `node_modules`)
- รัน `npm test -- --testTimeout=30000` และ `npm run lint` ก่อน commit ทุก task (timeout 5 วินาทีตกแบบสุ่มตามภาระเครื่อง)
- ทำงานบน branch `fix/sonarqube-issues` (สร้างจาก `main`) ไฟล์ตั้งค่า SonarQube ที่ยังไม่ commit (`sonar-project.properties`, `scripts/sonar-scan.ps1`, `scripts/sonar-report.ps1`, `.gitignore`) ตามไปกับ branch และ commit ใน Task 5
- commit message ลงท้ายด้วย:
  ```

  Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
  ```

---

### Task 1: คำสั่งออมไม่ backtrack (S8786)

**Depends on:** none

**Files:**
- Modify: `src/goals/chat.js:4-5` (แทน `SAVING_PATTERN`), `src/goals/chat.js:26-36` (`parseSavingCommand`)
- Test: `src/goals/chat.test.js`

**Interfaces:**
- Consumes: none
- Produces: `parseSavingCommand(text)` signature และผลลัพธ์เหมือนเดิม (`{ name, amount } | null`)

- [ ] **Step 1: เขียน test ที่ล้ม**

เพิ่มใน `describe('parseSavingCommand', ...)` ของ `src/goals/chat.test.js` ต่อท้าย block (ก่อน `});` ที่ปิด describe):

```js
  // regex เดิม backtrack แบบ O(n²) ข้อความที่มีช่องว่างยาวใช้เวลาเกือบวินาที
  it('reads long whitespace-heavy text in linear time', () => {
    const text = `ออม a${' '.repeat(20000)}!`;
    const started = performance.now();
    expect(parseSavingCommand(text)).toBeNull();
    expect(performance.now() - started).toBeLessThan(100);
  });

  it.each([
    ['ออม ทริป\n1000', { name: 'ทริป', amount: 1000 }],
    ['ออม\nทริป 1000', { name: 'ทริป', amount: 1000 }],
    ['ออม ทริป 1000บาท', { name: 'ทริป', amount: 1000 }],
    ['ออม ทริป\nยาว 1000', null],
    ['ออม ทริป 1000 บาทบาท', null],
    ['ออม ทริป บาท', null],
  ])('keeps the old line-break and baht handling for %j', (text, expected) => {
    expect(parseSavingCommand(text)).toEqual(expected);
  });
```

- [ ] **Step 2: รัน test ให้เห็นว่าล้ม**

Run: `npx vitest run src/goals/chat.test.js`
Expected: FAIL เฉพาะ `reads long whitespace-heavy text in linear time` (`expected 6xx to be less than 100`) ส่วน `keeps the old line-break...` ผ่านทั้ง 6 ข้อ (เป็นตัวกันพฤติกรรมเดิม)

- [ ] **Step 3: แก้โค้ด**

ใน `src/goals/chat.js` แทนบรรทัด 4-5:

```js
// รูปแบบตายตัวจึงไม่ต้องใช้ Claude ชื่อเป้ามีตัวเลขได้ เพราะยอดต้องอยู่ท้ายสุดเสมอ
const SAVING_PATTERN = /^ออม\s*(.+?)\s+([\d,]+(?:\.\d{1,2})?)\s*(?:บาท)?$/;
```

ด้วย:

```js
// รูปแบบตายตัวจึงไม่ต้องใช้ Claude ชื่อเป้ามีตัวเลขได้ เพราะยอดต้องอยู่ท้ายสุดเสมอ
const SAVING_PREFIX = 'ออม';
const BAHT_SUFFIX = 'บาท';
const SAVING_AMOUNT_TOKEN = /^[\d,]+(?:\.\d{1,2})?$/;
const WHITESPACE = /\s/;
// . ไม่จับตัวขึ้นบรรทัด ชื่อเป้าที่ขึ้นบรรทัดกลางชื่อจึงไม่ผ่านเหมือน regex เดิม
const SINGLE_LINE = /^.+$/;
```

แทน `parseSavingCommand` (บรรทัด 26-36) ด้วย:

```js
// หาช่องว่างตัวสุดท้ายแทน regex ตัวเดียว เพราะ regex เดิม backtrack แบบ O(n²) กับข้อความที่มีช่องว่างยาว
function splitNamedSaving(text) {
  if (!text.startsWith(SAVING_PREFIX)) return null;
  let rest = text.slice(SAVING_PREFIX.length);
  if (rest.endsWith(BAHT_SUFFIX)) rest = rest.slice(0, -BAHT_SUFFIX.length);
  rest = rest.trimEnd();
  let start = rest.length;
  while (start > 0 && !WHITESPACE.test(rest[start - 1])) start -= 1;
  const amountText = rest.slice(start);
  const name = rest.slice(0, start).trim();
  if (!name || !SINGLE_LINE.test(name) || !SAVING_AMOUNT_TOKEN.test(amountText)) return null;
  return { name, amountText };
}

function parseSavingCommand(text) {
  const nameless = NAMELESS_SAVING_PATTERN.exec(text.trim());
  if (nameless) {
    return { name: '', amount: toSavingAmount(nameless[1]) };
  }
  const named = splitNamedSaving(text.trim());
  if (!named) {
    return null;
  }
  return { name: named.name, amount: toSavingAmount(named.amountText) };
}
```

- [ ] **Step 4: รัน test ให้ผ่าน**

Run: `npx vitest run src/goals/chat.test.js`
Expected: PASS ทุก test ในไฟล์

- [ ] **Step 5: รันทั้งชุดและ lint**

Run: `npm test -- --testTimeout=30000` แล้ว `npm run lint`
Expected: test ผ่านทั้งหมด lint ไม่มี error

- [ ] **Step 6: Commit**

```bash
git add src/goals/chat.js src/goals/chat.test.js
git commit -m "fix(goals): parse saving commands without regex backtracking"
```

### Task 2: test รหัสเพื่อนมี assertion (S2699)

**Depends on:** none

**Files:**
- Test: `src/db/sql-functions.test.js:414-420`

**Interfaces:**
- Consumes: helper `one(sql, params)` ในไฟล์เดียวกัน (บรรทัด 64-67 คืนแถวแรก)
- Produces: none

- [ ] **Step 1: เพิ่ม assertion**

แทน test บรรทัด 414-420:

```js
  it('accepts every character of the JS friend code alphabet', async () => {
    const user = await createUser('U1');

    for (const char of FRIEND_CODE_ALPHABET) {
      await db.query('update users set friend_code = $1 where id = $2', [char.repeat(8), user]);
    }
  });
```

ด้วย:

```js
  it('accepts every character of the JS friend code alphabet', async () => {
    const user = await createUser('U1');

    for (const char of FRIEND_CODE_ALPHABET) {
      await db.query('update users set friend_code = $1 where id = $2', [char.repeat(8), user]);
      // อ่านกลับมาเช็ค ไม่งั้น test ผ่านแค่เพราะไม่ throw แม้ค่าไม่ได้ถูกบันทึก
      expect((await one('select friend_code from users where id = $1', [user])).friend_code).toBe(char.repeat(8));
    }
  });
```

- [ ] **Step 2: รัน test**

Run: `npx vitest run src/db/sql-functions.test.js -t "friend code alphabet"`
Expected: PASS (เป็น test ของโค้ดที่ทำงานอยู่แล้ว จึงไม่มีขั้นล้มก่อน)

- [ ] **Step 3: รันทั้งชุดและ lint**

Run: `npm test -- --testTimeout=30000` แล้ว `npm run lint`
Expected: ผ่านทั้งหมด

- [ ] **Step 4: Commit**

```bash
git add src/db/sql-functions.test.js
git commit -m "test(db): assert each friend code character is stored"
```

### Task 3: Number.NaN และ grapheme แรก (S7773, S1751)

**Depends on:** none

**Files:**
- Modify: `public/liff/bills/bill-form.mjs:23,25,51`, `public/liff/format.mjs:86,352-357`
- Test: `public/liff/format.test.mjs`, `public/liff/app.bills.dom.test.mjs` (bill-form ไม่มี test แยก ใช้ DOM test ของแท็บบิล)

**Interfaces:**
- Consumes: none
- Produces: ไม่มี export ใหม่ `parseAmountText` และ `profileView` คืนค่าเหมือนเดิม

- [ ] **Step 1: เพิ่ม test ของ grapheme แรกที่ยังไม่มี**

ใน `describe('profileView', ...)` ของ `public/liff/format.test.mjs` ต่อจาก test `takes the first code point as the initial so an emoji name is not split`:

```js
  it('keeps a Thai consonant with its tone mark and vowel as one initial', () => {
    expect(profileView({ ...profile, displayName: 'น้ำ' }).initial).toBe('น้ำ');
  });
```

- [ ] **Step 2: รัน test**

Run: `npx vitest run public/liff/format.test.mjs -t profileView`
Expected: PASS (เป็นตัวกันพฤติกรรมเดิมก่อน refactor)

- [ ] **Step 3: แก้โค้ด**

`public/liff/bills/bill-form.mjs` บรรทัด 23, 25, 51: เปลี่ยนทุก `NaN` ที่เป็นค่า (ไม่ใช่ชื่อในข้อความ) เป็น `Number.NaN`:

```js
  if (cleaned === '') return { empty: true, amount: Number.NaN };
```

```js
  return { empty: false, amount: isNumber ? Number(cleaned) : Number.NaN };
```

```js
  const amountOf = (input) => (input.value === '' ? Number.NaN : Number(input.value));
```

`public/liff/format.mjs` บรรทัด 86:

```js
  return AMOUNT_TEXT_SHAPE.test(trimmed) ? Number(trimmed.replaceAll(',', '')) : Number.NaN;
```

`public/liff/format.mjs` แทน `firstGrapheme` (บรรทัด 352-357):

```js
function firstGrapheme(text) {
  if (graphemeSegmenter) {
    for (const { segment } of graphemeSegmenter.segment(text)) return segment;
  }
  return Array.from(text)[0];
}
```

ด้วย:

```js
function firstGrapheme(text) {
  if (graphemeSegmenter) {
    const first = graphemeSegmenter.segment(text)[Symbol.iterator]().next();
    if (!first.done) return first.value.segment;
  }
  return Array.from(text)[0];
}
```

- [ ] **Step 4: รัน test**

Run: `npx vitest run public/liff/format.test.mjs public/liff/app.bills.dom.test.mjs`
Expected: PASS ทั้งหมด

- [ ] **Step 5: รันทั้งชุดและ lint**

Run: `npm test -- --testTimeout=30000` แล้ว `npm run lint`
Expected: ผ่านทั้งหมด

- [ ] **Step 6: Commit**

```bash
git add public/liff/bills/bill-form.mjs public/liff/format.mjs public/liff/format.test.mjs
git commit -m "refactor(liff): use Number.NaN and read the first grapheme without a one-pass loop"
```

### Task 4: ใส่ void หน้า async ที่ตั้งใจไม่รอ (S9383)

**Depends on:** Task 3 (แก้ `public/liff/bills/bill-form.mjs` ไฟล์เดียวกัน)

**Files:**
- Modify: `public/liff/app.mjs`, `public/liff/bills/bill-form.mjs`, `public/liff/budgets/budget-sheet.mjs`, `public/liff/categories/categories-panel.mjs`, `public/liff/friends/friends-panel.mjs`, `public/liff/goals/goals-panel.mjs`
- Test: `public/liff/app.core.dom.test.mjs`, `app.list.dom.test.mjs`, `app.budgets.dom.test.mjs`, `app.bills.dom.test.mjs`, `app.categories.dom.test.mjs`, `app.friends.dom.test.mjs`, `app.goals.dom.test.mjs`, `app.wallets.dom.test.mjs`, `app.settings.dom.test.mjs` (ใน `public/liff/`)

**Interfaces:**
- Consumes: none
- Produces: none (ไม่เปลี่ยน export หรือพฤติกรรม)

- [ ] **Step 1: รัน DOM test ก่อนแก้เป็น baseline**

Run: `npx vitest run public/liff --testTimeout=30000`
Expected: PASS ทั้งหมด จดจำนวน test ไว้เทียบหลังแก้

- [ ] **Step 2: ใส่ `void` ทุกจุด**

ไม่เพิ่มคอมเมนต์ทีละบรรทัด (39 จุด เหตุผลเดียวกันหมด อยู่ใน commit message) เลขบรรทัดของ `app.mjs` นับจาก `main` ที่ 8671785 ไม่มี task ก่อนหน้าแก้ไฟล์นี้; ไฟล์อื่นยึดข้อความที่ตรงกัน ถ้าข้อความในบรรทัดนั้นไม่ตรงกับคอลัมน์ "ก่อน" ให้หยุดและรายงาน ห้ามเดา

`public/liff/app.mjs`:

| บรรทัด | ก่อน | หลัง |
|---|---|---|
| 445 | `if (refresh === 'budgets') loadBudgets();` | `if (refresh === 'budgets') void loadBudgets();` |
| 558 | `if (api) billForm.open();` | `if (api) void billForm.open();` |
| 686 | `loadMonth();` | `void loadMonth();` |
| 776 | `loadProfile();` | `void loadProfile();` |
| 777 | `walletsPanel.load();` | `void walletsPanel.load();` |
| 892 | `openEditor(item);` | `void openEditor(item);` |
| 1216 | `loadProfile();` | `void loadProfile();` |
| 1379 | `loadProfile();` | `void loadProfile();` |
| 1380 | `walletsPanel.load();` | `void walletsPanel.load();` |
| 1390 | `loadProfile();` | `void loadProfile();` |
| 1391 | `walletsPanel.load();` | `void walletsPanel.load();` |
| 1410 | `runEdit(() => api.updateTransaction(editing.id, body), 'save');` | `void runEdit(() => api.updateTransaction(editing.id, body), 'save');` |
| 1446 | `loadMonth({ reset: true });` | `void loadMonth({ reset: true });` |
| 1532 | `loadBudgets();` | `void loadBudgets();` |
| 1537 | `loadTrend({ animate: true });` | `void loadTrend({ animate: true });` |
| 1542 | `loadProfile();` | `void loadProfile();` |
| 1700 | `runRecurringAction(() => (target ? api.updateRecurring(target.id, body) : api.createRecurring(body)), 'save', target ? target.id : null);` | `void runRecurringAction(() => (target ? api.updateRecurring(target.id, body) : api.createRecurring(body)), 'save', target ? target.id : null);` |
| 1711 | `runRecurringAction(() => api.deleteRecurring(target.id), 'delete');` | `void runRecurringAction(() => api.deleteRecurring(target.id), 'delete');` |
| 1731 | `loadMonth({ reset: true });` | `void loadMonth({ reset: true });` |
| 1733 | `if (!walletsPanel.isLoaded()) walletsPanel.load();` | `if (!walletsPanel.isLoaded()) void walletsPanel.load();` |
| 1749 | `loadRecurring();` | `void loadRecurring();` |
| 1834 | `walletsPanel.load();` | `void walletsPanel.load();` |
| 1846 | `openEditor(item);` | `void openEditor(item);` |
| 1869 | `loadMonth();` | `void loadMonth();` |
| 1870 | `loadRecurring();` | `void loadRecurring();` |
| 1935 | `loadMonth({ reset: true });` | `void loadMonth({ reset: true });` |
| 2045 | `if (!walletsPanel.isLoaded()) walletsPanel.load();` | `if (!walletsPanel.isLoaded()) void walletsPanel.load();` |
| 2188 | `if (billId) billsPanel.focusBill(billId);` | `if (billId) void billsPanel.focusBill(billId);` |
| 2205 | `friendsPanel.openAdd(friendCode);` | `void friendsPanel.openAdd(friendCode);` |
| 2230 | `boot();` | `void boot();` |

ไฟล์อื่น (เลขบรรทัดจากผลสแกน):

| ไฟล์:บรรทัด | ก่อน | หลัง |
|---|---|---|
| `public/liff/bills/bill-form.mjs:357` | `submit();` | `void submit();` |
| `public/liff/budgets/budget-sheet.mjs:171` | `run(amount);` | `void run(amount);` |
| `public/liff/budgets/budget-sheet.mjs:191` | `run(null);` | `void run(null);` |
| `public/liff/categories/categories-panel.mjs:276` | `if (!busy && editing) askDelete();` | `if (!busy && editing) void askDelete();` |
| `public/liff/categories/categories-panel.mjs:279` | `if (!busy && editing) confirmDelete();` | `if (!busy && editing) void confirmDelete();` |
| `public/liff/friends/friends-panel.mjs:118` | `if (resumed) openAdd(resumed);` | `if (resumed) void openAdd(resumed);` |
| `public/liff/friends/friends-panel.mjs:346` | `openAdd(els.input.value);` | `void openAdd(els.input.value);` |
| `public/liff/goals/goals-panel.mjs:311` | `loadHistory();` | `void loadHistory();` |
| `public/liff/goals/goals-panel.mjs:357` | `runDetail(() => getApi().deleteGoalContribution(viewing, id), 'ลบรายการออมแล้ว');` | `void runDetail(() => getApi().deleteGoalContribution(viewing, id), 'ลบรายการออมแล้ว');` |

- [ ] **Step 3: เช็คว่าครบ 39 จุด**

Run: `git diff --stat` แล้ว `git diff | grep -c '^+.*void '`
Expected: 6 ไฟล์ และนับได้ 39

- [ ] **Step 4: รัน DOM test เทียบ baseline**

Run: `npx vitest run public/liff --testTimeout=30000`
Expected: PASS จำนวนเท่ากับ Step 1

- [ ] **Step 5: รันทั้งชุดและ lint**

Run: `npm test -- --testTimeout=30000` แล้ว `npm run lint`
Expected: ผ่านทั้งหมด

- [ ] **Step 6: Commit**

```bash
git add public/liff/app.mjs public/liff/bills/bill-form.mjs public/liff/budgets/budget-sheet.mjs public/liff/categories/categories-panel.mjs public/liff/friends/friends-panel.mjs public/liff/goals/goals-panel.mjs
git commit -m "refactor(liff): mark fire-and-forget async calls with void" -m "ทุกฟังก์ชันที่ถูกเรียกจับ error เองอยู่แล้ว void บอกว่าตั้งใจไม่รอ และให้ SonarQube S9383 จับจุดที่ลืม catch ในอนาคต"
```

### Task 5: สแกนซ้ำ ปิด false positive และบันทึก STATE

**Depends on:** Task 1, Task 2, Task 3, Task 4

**Files:**
- Create: `sonar-project.properties`, `scripts/sonar-scan.ps1`, `scripts/sonar-report.ps1` (มีอยู่ใน working tree แล้ว ยังไม่ commit)
- Modify: `.gitignore` (เพิ่ม `.scannerwork` และ `coverage` แล้ว ยังไม่ commit), `work-memory/STATE.md`

**Interfaces:**
- Consumes: ผลจาก Task 1-4 ที่ commit แล้ว
- Produces: none

- [ ] **Step 1: ผู้ใช้สแกนซ้ำ (executor ไม่ถือ token)**

ขอให้ผู้ใช้รันใน `D:\GitHub\line-expense-bot`: `powershell -ExecutionPolicy Bypass -File .\scripts\sonar-scan.ps1` (SonarQube ต้องรันอยู่ที่ http://localhost:9000) แล้วรอผู้ใช้ตอบว่าเสร็จ

- [ ] **Step 2: อ่านผล**

อ่านจากหน้า http://localhost:9000/project/issues?id=line-expense-bot&resolved=false (ผู้ใช้ล็อกอินในเบราว์เซอร์ไว้) หรือให้ผู้ใช้รัน `scripts/sonar-report.ps1` แล้วอ่าน `.scannerwork/sonar-report.json`
Expected: S9383, S8786, S2699, S7773, S1751 เป็น 0; เหลือ 15 issue ที่เป็น false positive (S3516 1, S6850 13, InputWithoutLabelCheck 1); Reliability rating ยังไม่เป็น A จนกว่าจะปิด 14 จุดที่เป็น RELIABILITY ใน Step 3

- [ ] **Step 3: ผู้ใช้ปิด false positive ใน SonarQube**

ขอให้ผู้ใช้เปิดแต่ละ issue ในหน้า Issues แล้วเปลี่ยนสถานะเป็น **Accept** (หรือ False Positive) พร้อมเหตุผลตามหัวข้อที่มาของแผนนี้:
- `S3516` src/bills/service.js:136: `respondFromWeb` คืนผลคำตอบเสมอ การส่ง LINE ที่พังไม่เปลี่ยนผล
- `S6850` index.html 13 จุด: heading ที่ JS ใส่ข้อความตอนเปิด dialog/แผ่น
- `InputWithoutLabelCheck` index.html:895: file input ซ่อน เปิดผ่านปุ่มที่มีข้อความ
Expected: Reliability rating A, issue ที่เปิดอยู่ 0

- [ ] **Step 4: อัปเดต STATE.md**

ใน `work-memory/STATE.md` แก้บรรทัด 2 เป็น `Updated: 2026-11-21 (ล่าสุด: แก้ issue SonarQube บน fix/sonarqube-issues รอ merge)` แล้วเพิ่มบนสุดของ `## Next`:

```markdown
- [ ] SonarQube (2026-11-21): แก้ 46 issue บน fix/sonarqube-issues รอ merge แผน docs/superpowers/plans/2026-11-21-sonarqube-fixes.md
    สแกนซ้ำ: `scripts/sonar-scan.ps1` (SonarQube ใน Docker ที่ D:\GitHub\sonarqube-local) false positive 15 จุด Accept ใน SonarQube แล้ว
```

ถ้าผู้ใช้ยังไม่ได้ทำ Step 3 ให้เขียน `false positive 15 จุด รอผู้ใช้ Accept ใน SonarQube` แทน; ไฟล์ต้องไม่เกินประมาณ 60 บรรทัดตามกติกาบรรทัด 5 ของ STATE.md

- [ ] **Step 5: รันทั้งชุดและ lint**

Run: `npm test -- --testTimeout=30000` แล้ว `npm run lint`
Expected: ผ่านทั้งหมด

- [ ] **Step 6: Commit**

```bash
git add sonar-project.properties scripts/sonar-scan.ps1 scripts/sonar-report.ps1 .gitignore work-memory/STATE.md docs/superpowers/plans/2026-11-21-sonarqube-fixes.md
git commit -m "chore(sonar): add local SonarQube scan scripts and record the fixes"
```

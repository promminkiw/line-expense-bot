# Split app.dom.test.mjs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** แยก `public/liff/app.dom.test.mjs` (6395 บรรทัด 449 เทสต์) เป็นหลายไฟล์เล็ก เพื่อให้ `npm test` ไม่ล้มด้วย `JavaScript heap out of memory` (worker exit 134) ที่ heap ปกติ

**Architecture:** ย้าย helper ร่วม (fake fetch, `boot`, ข้อมูลตัวอย่าง) ไปไฟล์ `dom-harness.mjs` แล้วย้าย `describe` ทีละกลุ่มไปไฟล์ใหม่ของตัวเอง vitest รันแต่ละไฟล์ใน worker แยก ความจำของ jsdom จึงถูกคืนทุกไฟล์ ไม่สะสมทั้ง 449 เทสต์ ย้ายแบบ "ตัดแล้ววาง" ห้ามแก้เนื้อเทสต์

**Tech Stack:** vitest 5 (ไม่มี config ใช้ค่าเริ่มต้น), jsdom, ESLint, Node ESM

## Global Constraints

- ห้ามแก้โค้ดจริง (`app.mjs`, `*-panel.mjs`, `style.css`, `index.html` ฯลฯ) งานนี้แตะเฉพาะไฟล์เทสต์
- ห้ามแก้เนื้อ `it(...)` หรือ `describe(...)` ย้ายตามที่เป็น ยกเว้น `import` กับ prefix `export` ของ helper
- จำนวนเทสต์รวมต้องเท่าเดิม 449 และรายชื่อเทสต์ (fullName) ต้องตรงกับก่อนย้ายทุกข้อ
- ชื่อไฟล์ใหม่ลงท้าย `.dom.test.mjs` เพื่อให้ vitest เก็บเข้า และบรรทัดแรกต้องเป็น `// @vitest-environment jsdom`
- คอมเมนต์ภาษาไทย บรรทัดเดียว อธิบาย "ทำไม" ไม่ใช้ emoji; ชื่อตัวแปรและ log เป็นภาษาอังกฤษ
- ไม่ commit เองถ้าผู้ใช้ยังไม่อนุญาต (ผู้ใช้เคยอนุญาต commit และ push เฉพาะงานแท็บออม) ให้ถามก่อน commit ครั้งแรกของแผนนี้
- ไฟล์เทสต์ทั้งหมดอยู่ใน `public/liff/` เหมือนเดิม (ตามรูปแบบเทสต์ของโปรเจกต์ที่วางไว้ข้างไฟล์ที่ทดสอบ)

## File Structure

| ไฟล์ใหม่ | เนื้อหา (บรรทัดในไฟล์เดิม) | เทสต์โดยประมาณ |
|---|---|---|
| `public/liff/dom-harness.mjs` | helper ร่วม บรรทัด 11-190 และ 197-228 | ไม่มีเทสต์ |
| `public/liff/app.core.dom.test.mjs` | 230-1209: static invariants, normal boot, freshness, นอก LINE, เดือนว่าง, โหลดล้มเหลว, การ์ดยอดรวม, ลิงก์การ์ด | ~120 |
| `public/liff/app.list.dom.test.mjs` | 1210-1571: swipe ลบ, recurring style r2, small tickets | ~50 |
| `public/liff/app.friends.dom.test.mjs` | 1572-2221 | ~60 |
| `public/liff/app.settings.dom.test.mjs` | 2222-2386: ลิงก์หน้าหลักกับบิล, notification settings, profile picture | ~20 |
| `public/liff/app.bills.dom.test.mjs` | 2387-3708 | ~70 |
| `public/liff/app.categories.dom.test.mjs` | 3709-4480: categories, หน้าย่อยใต้แท็บ ฉัน, ไอคอนหมวด | ~50 |
| `public/liff/app.goals.dom.test.mjs` | 4481-4934 | ~35 |
| `public/liff/app.wallets.dom.test.mjs` | 4935-5397 | ~35 |
| `public/liff/app.budgets.dom.test.mjs` | 5398-6395: ปุ่มย้อนกลับ, งบทั้งหมด | ~60 |

`pointer`, `swipeRow`, `firstRows` (บรรทัด 1210-1222) ใช้ที่ 1262-1563 เท่านั้น จึงอยู่ในไฟล์ list; `ZERO_TREND` (1345) ใช้ที่ 1386 อยู่ list; `BUDGET_SAMPLE` กับ `openBudgets` (5499-5513) ใช้เฉพาะ 5510-6386 อยู่ budgets ตัวเลขบรรทัดเป็นของไฟล์เดิม ณ ตอนเริ่มแผน

**ลำดับสำคัญ:** ตัดจากท้ายไฟล์ขึ้นหน้า (budgets ก่อน, core ท้ายสุด) เพื่อให้เลขบรรทัดของส่วนที่เหลือไม่เลื่อน

---

### Task 1: Baseline และ dom-harness.mjs

**Depends on:** none

**Files:**
- Create: `public/liff/dom-harness.mjs`
- Read only: `public/liff/app.dom.test.mjs`

**Interfaces:**
- Produces: `dom-harness.mjs` export `html, CATEGORIES, TRANSACTIONS, RESPONSES, EMPTY_MONTH, LOADING_ELEMENT_IDS, flush, settle, makeFetch, boot, byId, routeFetch, clickTab, submitEditOfFirstRow, deleteFirstRow, cleanupGlobals`

- [ ] **Step 1: บันทึกรายชื่อเทสต์ก่อนย้าย (baseline)**

เพิ่ม heap เพราะไฟล์เดิมล้มที่ heap ปกติ

```bash
cd /c/GithubPrommin/line-expense-bot
S="C:/Users/Lenovo/AppData/Local/Temp/claude/C--GithubPrommin-line-expense-bot/9c695e41-e794-44b8-b377-1f918aaa5cf7/scratchpad"
NODE_OPTIONS=--max-old-space-size=6144 npx vitest run public/liff/app.dom.test.mjs --reporter=json --outputFile="$S/before.json"
node -e "const r=require('$S/before.json');const n=r.testResults.flatMap(f=>f.assertionResults.map(a=>a.fullName)).sort();require('fs').writeFileSync('$S/before-titles.txt',n.join('\n'));console.log(n.length)"
```

Expected: พิมพ์ `449`

- [ ] **Step 2: สร้าง dom-harness.mjs จากบรรทัดเดิมด้วยสคริปต์**

```bash
node -e "
const fs=require('fs');
const L=fs.readFileSync('public/liff/app.dom.test.mjs','utf8').split('\n');
const take=(a,b)=>L.slice(a-1,b).join('\n');
let body=take(11,190)+'\n\n'+take(197,228);
// export ทุก declaration ระดับบนสุด
body=body.replace(/^(const|let|async function|function) /gm,'export \$1 ');
const head=[
  \"import { readFileSync } from 'node:fs';\",
  \"import { URL as NodeUrl } from 'node:url';\",
  \"import { vi } from 'vitest';\",
  '',
].join('\n');
const tail='\n\n// คืน global ที่ boot() ตั้งไว้ ให้เรียกใน afterEach ของทุกไฟล์\nexport function cleanupGlobals() {\n  vi.unstubAllGlobals();\n  vi.useRealTimers();\n}\n';
fs.writeFileSync('public/liff/dom-harness.mjs',head+body+tail);
"
npx eslint public/liff/dom-harness.mjs
```

Expected: eslint ไม่แสดง error ถ้า `settle` ถูก export แบบ `export const settle = flush;` ถือว่าถูก; ถ้ามี error `no-unused-vars` ที่ตัวแปรใน harness ที่ไม่ได้ export (เช่น `LOADING_ELEMENT_IDS` ถ้าไม่ขึ้น export) ให้เติม `export` ที่ declaration นั้น

- [ ] **Step 3: ตรวจว่า harness โหลดได้และ export ครบ**

```bash
node -e "
const s=require('fs').readFileSync('public/liff/dom-harness.mjs','utf8');
for (const n of ['html','CATEGORIES','TRANSACTIONS','RESPONSES','EMPTY_MONTH','LOADING_ELEMENT_IDS','flush','settle','makeFetch','boot','byId','routeFetch','clickTab','submitEditOfFirstRow','deleteFirstRow','cleanupGlobals']) {
  if (!new RegExp('export (const|let|async function|function) '+n+'\\\\b').test(s)) console.log('missing export', n);
}
console.log('checked');
"
```

Expected: พิมพ์แค่ `checked` (ไม่มีบรรทัด `missing export`)

- [ ] **Step 4: Commit (ถามผู้ใช้ก่อน)**

```bash
git add public/liff/dom-harness.mjs
git commit -m "test: extract shared LIFF dom test helpers into dom-harness"
```

---

### Task 2: ย้ายกลุ่ม budgets (บรรทัด 5398-6395)

**Depends on:** Task 1

**Files:**
- Create: `public/liff/app.budgets.dom.test.mjs`
- Modify: `public/liff/app.dom.test.mjs` (ลบบรรทัด 5398-ท้ายไฟล์)

- [ ] **Step 1: ตั้ง helper สำหรับย้ายกลุ่ม (ใช้ซ้ำทุก task)**

เก็บเป็นไฟล์ชั่วคราวนอก repo ที่ `$S/move-chunk.cjs`

```js
// ใช้: node move-chunk.cjs <start> <end> <newFile>
const fs = require('fs');
const [start, end, out] = process.argv.slice(2);
const src = 'public/liff/app.dom.test.mjs';
const lines = fs.readFileSync(src, 'utf8').split('\n');
const chunk = lines.slice(Number(start) - 1, Number(end)).join('\n');
const header = [
  '// @vitest-environment jsdom',
  "import { existsSync, readFileSync } from 'node:fs';",
  "import { URL as NodeUrl } from 'node:url';",
  "import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';",
  "import { TABS } from './tabs.mjs';",
  "import { categoryStyle } from './categories.mjs';",
  "import { createEmptyState } from './empty-state.mjs';",
  "import { CATEGORY_ICON_KEYS } from './category-icons.mjs';",
  "import { html, CATEGORIES, TRANSACTIONS, RESPONSES, EMPTY_MONTH, LOADING_ELEMENT_IDS, flush, settle, makeFetch, boot, byId, routeFetch, clickTab, submitEditOfFirstRow, deleteFirstRow, cleanupGlobals } from './dom-harness.mjs';",
  '',
  'afterEach(cleanupGlobals);',
  '',
].join('\n');
fs.writeFileSync(out, header + '\n' + chunk.trimEnd() + '\n');
lines.splice(Number(start) - 1, Number(end) - Number(start) + 1);
fs.writeFileSync(src, lines.join('\n').replace(/\n+$/, '\n'));
console.log('moved', Number(end) - Number(start) + 1, 'lines to', out);
```

คำสั่ง `<end>` ของกลุ่มท้ายสุดให้ใช้เลขบรรทัดสุดท้ายของไฟล์ (`wc -l public/liff/app.dom.test.mjs`)

- [ ] **Step 2: ย้ายกลุ่ม**

```bash
S="C:/Users/Lenovo/AppData/Local/Temp/claude/C--GithubPrommin-line-expense-bot/9c695e41-e794-44b8-b377-1f918aaa5cf7/scratchpad"
END=$(wc -l < public/liff/app.dom.test.mjs)
node "$S/move-chunk.cjs" 5398 $END public/liff/app.budgets.dom.test.mjs
```

Expected: พิมพ์ `moved N lines to public/liff/app.budgets.dom.test.mjs`

- [ ] **Step 3: ลบ import ที่ไม่ได้ใช้ตามที่ eslint บอก**

```bash
npx eslint public/liff/app.budgets.dom.test.mjs
```

Expected: eslint รายงาน `no-unused-vars` สำหรับชื่อที่ import เกิน ให้ลบชื่อนั้นออกจากบรรทัด `import` (ถ้าทั้งบรรทัดไม่ได้ใช้ ให้ลบทั้งบรรทัด) จนรัน eslint ซ้ำแล้วสะอาด ถ้ารายงาน `no-undef` แปลว่าต้องใช้ชื่อที่ไม่ได้อยู่ใน harness ให้หาว่าประกาศอยู่บรรทัดไหนของไฟล์เดิม แล้วย้าย declaration นั้นมาไว้บนสุดของไฟล์ใหม่

- [ ] **Step 4: รันไฟล์ใหม่และไฟล์เดิม**

```bash
npx vitest run public/liff/app.budgets.dom.test.mjs
NODE_OPTIONS=--max-old-space-size=6144 npx vitest run public/liff/app.dom.test.mjs
```

Expected: ไฟล์ใหม่ผ่านทุกข้อ ไฟล์เดิมผ่านทุกข้อ (จำนวนเทสต์ใหม่ + เดิมรวม 449 จดตัวเลขทั้งสองไว้ในรายงานของ task)

- [ ] **Step 5: Commit (ถามผู้ใช้ก่อน)**

```bash
git add public/liff/app.budgets.dom.test.mjs public/liff/app.dom.test.mjs
git commit -m "test: move budgets dom tests into their own file"
```

---

### Task 3: ย้ายกลุ่ม wallets (บรรทัด 4935-5397)

**Depends on:** Task 2

**Files:**
- Create: `public/liff/app.wallets.dom.test.mjs`
- Modify: `public/liff/app.dom.test.mjs`

ทำเหมือน Task 2 ทุก step โดยเปลี่ยนค่า

- [ ] **Step 1:** `node "$S/move-chunk.cjs" 4935 5397 public/liff/app.wallets.dom.test.mjs`
- [ ] **Step 2:** `npx eslint public/liff/app.wallets.dom.test.mjs` แล้วลบ import ที่ไม่ได้ใช้จนสะอาด
- [ ] **Step 3:** `npx vitest run public/liff/app.wallets.dom.test.mjs` และ `NODE_OPTIONS=--max-old-space-size=6144 npx vitest run public/liff/app.dom.test.mjs` Expected: ผ่านทั้งคู่
- [ ] **Step 4:** Commit (ถามผู้ใช้ก่อน) `git add public/liff/app.wallets.dom.test.mjs public/liff/app.dom.test.mjs` / `git commit -m "test: move wallets dom tests into their own file"`

---

### Task 4: ย้ายกลุ่ม goals (บรรทัด 4481-4934)

**Depends on:** Task 3

**Files:**
- Create: `public/liff/app.goals.dom.test.mjs`
- Modify: `public/liff/app.dom.test.mjs`

- [ ] **Step 1:** `node "$S/move-chunk.cjs" 4481 4934 public/liff/app.goals.dom.test.mjs`
- [ ] **Step 2:** `npx eslint public/liff/app.goals.dom.test.mjs` ลบ import ที่ไม่ได้ใช้จนสะอาด
- [ ] **Step 3:** `npx vitest run public/liff/app.goals.dom.test.mjs` และ `NODE_OPTIONS=--max-old-space-size=6144 npx vitest run public/liff/app.dom.test.mjs` Expected: ผ่านทั้งคู่
- [ ] **Step 4:** Commit (ถามผู้ใช้ก่อน) `git commit -m "test: move goals dom tests into their own file"` หลัง `git add` สองไฟล์

---

### Task 5: ย้ายกลุ่ม categories และหน้าย่อยแท็บ ฉัน (บรรทัด 3709-4480)

**Depends on:** Task 4

**Files:**
- Create: `public/liff/app.categories.dom.test.mjs`
- Modify: `public/liff/app.dom.test.mjs`

- [ ] **Step 1:** `node "$S/move-chunk.cjs" 3709 4480 public/liff/app.categories.dom.test.mjs`
- [ ] **Step 2:** `npx eslint public/liff/app.categories.dom.test.mjs` ลบ import ที่ไม่ได้ใช้จนสะอาด
- [ ] **Step 3:** `npx vitest run public/liff/app.categories.dom.test.mjs` และ `NODE_OPTIONS=--max-old-space-size=6144 npx vitest run public/liff/app.dom.test.mjs` Expected: ผ่านทั้งคู่
- [ ] **Step 4:** Commit (ถามผู้ใช้ก่อน) `git commit -m "test: move categories and me-tab sub page dom tests into their own file"` หลัง `git add` สองไฟล์

---

### Task 6: ย้ายกลุ่ม bills (บรรทัด 2387-3708)

**Depends on:** Task 5

**Files:**
- Create: `public/liff/app.bills.dom.test.mjs`
- Modify: `public/liff/app.dom.test.mjs`

- [ ] **Step 1:** `node "$S/move-chunk.cjs" 2387 3708 public/liff/app.bills.dom.test.mjs`
- [ ] **Step 2:** `npx eslint public/liff/app.bills.dom.test.mjs` ลบ import ที่ไม่ได้ใช้จนสะอาด
- [ ] **Step 3:** `npx vitest run public/liff/app.bills.dom.test.mjs --logHeapUsage` และ `NODE_OPTIONS=--max-old-space-size=6144 npx vitest run public/liff/app.dom.test.mjs` Expected: ผ่านทั้งคู่ จดค่า heap ที่ vitest พิมพ์ของไฟล์ bills (ไฟล์นี้ใหญ่สุด ~1320 บรรทัด ใช้ตัดสินใจ Task 11)
- [ ] **Step 4:** Commit (ถามผู้ใช้ก่อน) `git commit -m "test: move bills dom tests into their own file"` หลัง `git add` สองไฟล์

---

### Task 7: ย้ายกลุ่ม settings (บรรทัด 2222-2386)

**Depends on:** Task 6

**Files:**
- Create: `public/liff/app.settings.dom.test.mjs`
- Modify: `public/liff/app.dom.test.mjs`

- [ ] **Step 1:** `node "$S/move-chunk.cjs" 2222 2386 public/liff/app.settings.dom.test.mjs`
- [ ] **Step 2:** `npx eslint public/liff/app.settings.dom.test.mjs` ลบ import ที่ไม่ได้ใช้จนสะอาด
- [ ] **Step 3:** `npx vitest run public/liff/app.settings.dom.test.mjs` และ `NODE_OPTIONS=--max-old-space-size=6144 npx vitest run public/liff/app.dom.test.mjs` Expected: ผ่านทั้งคู่
- [ ] **Step 4:** Commit (ถามผู้ใช้ก่อน) `git commit -m "test: move settings dom tests into their own file"` หลัง `git add` สองไฟล์

---

### Task 8: ย้ายกลุ่ม friends (บรรทัด 1572-2221)

**Depends on:** Task 7

**Files:**
- Create: `public/liff/app.friends.dom.test.mjs`
- Modify: `public/liff/app.dom.test.mjs`

- [ ] **Step 1:** `node "$S/move-chunk.cjs" 1572 2221 public/liff/app.friends.dom.test.mjs`
- [ ] **Step 2:** `npx eslint public/liff/app.friends.dom.test.mjs` ลบ import ที่ไม่ได้ใช้จนสะอาด
- [ ] **Step 3:** `npx vitest run public/liff/app.friends.dom.test.mjs` และ `NODE_OPTIONS=--max-old-space-size=6144 npx vitest run public/liff/app.dom.test.mjs` Expected: ผ่านทั้งคู่
- [ ] **Step 4:** Commit (ถามผู้ใช้ก่อน) `git commit -m "test: move friends dom tests into their own file"` หลัง `git add` สองไฟล์

---

### Task 9: ย้ายกลุ่ม list (บรรทัด 1210-1571)

**Depends on:** Task 8

**Files:**
- Create: `public/liff/app.list.dom.test.mjs`
- Modify: `public/liff/app.dom.test.mjs`

- [ ] **Step 1:** `node "$S/move-chunk.cjs" 1210 1571 public/liff/app.list.dom.test.mjs` (รวม `pointer`, `swipeRow`, `firstRows`, `ZERO_TREND` ที่ประกาศอยู่ในช่วงนี้)
- [ ] **Step 2:** `npx eslint public/liff/app.list.dom.test.mjs` ลบ import ที่ไม่ได้ใช้จนสะอาด
- [ ] **Step 3:** `npx vitest run public/liff/app.list.dom.test.mjs` และ `NODE_OPTIONS=--max-old-space-size=6144 npx vitest run public/liff/app.dom.test.mjs` Expected: ผ่านทั้งคู่
- [ ] **Step 4:** Commit (ถามผู้ใช้ก่อน) `git commit -m "test: move list swipe and small ticket dom tests into their own file"` หลัง `git add` สองไฟล์

---

### Task 10: ย้ายกลุ่ม core แล้วลบไฟล์เดิม

**Depends on:** Task 9

**Files:**
- Create: `public/liff/app.core.dom.test.mjs`
- Delete: `public/liff/app.dom.test.mjs`

- [ ] **Step 1: ย้ายบรรทัด 230-1209 ที่เหลือ**

```bash
node "$S/move-chunk.cjs" 230 1209 public/liff/app.core.dom.test.mjs
```

- [ ] **Step 2: ลบ import ที่ไม่ได้ใช้ตาม eslint** (`npx eslint public/liff/app.core.dom.test.mjs`)

- [ ] **Step 3: ตรวจว่าไฟล์เดิมเหลือแต่ helper ซ้ำ ไม่มี describe**

```bash
grep -c "^describe(" public/liff/app.dom.test.mjs
```

Expected: `0` ถ้าไม่ใช่ 0 หยุดและหากลุ่มที่ตกหล่น

- [ ] **Step 4: ลบไฟล์เดิม**

```bash
git rm public/liff/app.dom.test.mjs
```

- [ ] **Step 5: รันไฟล์ core**

```bash
npx vitest run public/liff/app.core.dom.test.mjs
```

Expected: ผ่านทุกข้อ

- [ ] **Step 6: Commit (ถามผู้ใช้ก่อน)**

```bash
git add public/liff/app.core.dom.test.mjs
git commit -m "test: move core dom tests out and remove the old monolithic file"
```

---

### Task 11: ตรวจรวมและอัปเดตเอกสาร

**Depends on:** Task 10

**Files:**
- Modify: `work-memory/STATE.md`
- Modify: `work-memory/LEARNED.md` (หัวข้อ เทสต์ เพิ่ม 1 บรรทัด)

- [ ] **Step 1: รันเทสต์ทั้งโปรเจกต์ที่ heap ปกติ ไม่ตั้ง NODE_OPTIONS**

```bash
npm test 2>&1 | tail -12
npm run lint
```

Expected: ไม่มี `heap out of memory` และไม่มี `Errors`; lint สะอาด; จำนวนเทสต์รวมของ `npm test` เท่าก่อนย้าย (2363 ตอนเริ่มแผน เพราะงานแท็บออมที่ commit แล้วนับรวมแล้ว)

- [ ] **Step 2: เทียบรายชื่อเทสต์กับ baseline**

```bash
npx vitest run public/liff --reporter=json --outputFile="$S/after.json"
node -e "
const r=require('$S/after.json');
const after=r.testResults.filter(f=>/app\.[a-z]+\.dom\.test\.mjs$/.test(f.name)).flatMap(f=>f.assertionResults.map(a=>a.fullName)).sort();
const before=require('fs').readFileSync('$S/before-titles.txt','utf8').split('\n');
console.log('before',before.length,'after',after.length,'same',JSON.stringify(before)===JSON.stringify(after));
"
```

Expected: `before 449 after 449 same true` ถ้า `same false` ให้หาข้อที่หายด้วย diff ของสองรายการแล้วแก้ก่อนไปต่อ

- [ ] **Step 3: วัด heap ต่อไฟล์**

```bash
npx vitest run public/liff --logHeapUsage 2>&1 | grep -E "dom.test|MB"
```

Expected: ทุกไฟล์ใช้ heap ต่ำกว่าไฟล์เดิมมาก จดไฟล์ที่ใช้มากสุด ถ้า `app.bills.dom.test.mjs` ยังเกินครึ่งหนึ่งของเพดาน heap ที่ Node ใช้ ให้ถามผู้ใช้ว่าจะแยก bills ต่อหรือไม่ (ไม่แยกเองเพราะอยู่นอกขอบเขต)

- [ ] **Step 4: อัปเดต STATE.md** เปลี่ยนบรรทัด Done เรื่อง OOM ของแท็บออมเป็น "แก้แล้วด้วยการแยก app.dom.test.mjs เป็น 9 ไฟล์ + dom-harness.mjs" และใส่ผลข้อ 1-3 พร้อมตัวเลขจริง เพิ่มใน LEARNED.md หัวข้อ เทสต์ หนึ่งบรรทัด: ไฟล์เทสต์ jsdom ที่เกิน ~1000 บรรทัดเสี่ยง heap OOM ให้แยกตามแท็บและใช้ `dom-harness.mjs`

- [ ] **Step 5: Commit (ถามผู้ใช้ก่อน)**

```bash
git add work-memory/STATE.md work-memory/LEARNED.md
git commit -m "docs: record the dom test split in STATE and LEARNED"
```

---

## Self-Review

- **Spec coverage:** ปัญหาคือ OOM จากไฟล์เดียวใหญ่เกิน; Task 1-10 แยกไฟล์ Task 11 พิสูจน์ผลที่ heap ปกติ และยืนยันเทสต์ไม่หาย
- **Placeholder scan:** ไม่มีส่วนที่เว้นไว้ ทุกกลุ่มมีช่วงบรรทัดและคำสั่งจริง; ส่วนที่ต้องตัดสินจริงตอนทำ (ลบ import เกิน) มีเกณฑ์จาก eslint
- **ความสอดคล้อง:** ชื่อ export ของ harness (Task 1) ตรงกับ header ใน `move-chunk.cjs` (Task 2) ทุกชื่อ
- **ความเสี่ยงที่ทราบ:** (1) ถ้า OOM มาจากโค้ดที่รั่วใน `boot()` เอง (`vi.resetModules` กับ `innerHTML` ซ้ำ) การแยกไฟล์แค่ลดผลกระทบ ไม่ได้แก้ต้นเหตุ Task 11 ข้อ 3 จะให้ตัวเลขยืนยัน (2) bills ยังเป็นไฟล์ใหญ่ ~1320 บรรทัด
- **Browser check:** ไม่มี เพราะแผนนี้แตะเฉพาะไฟล์เทสต์ ไม่เปลี่ยนสิ่งที่ผู้ใช้เห็น

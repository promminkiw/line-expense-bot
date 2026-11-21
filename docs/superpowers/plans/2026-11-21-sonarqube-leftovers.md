# SonarQube Leftovers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** แก้ SonarQube 15 จุดที่เหลือ (S6850 13 จุด, InputWithoutLabelCheck 1 จุด, S3516 1 จุด) ในโค้ดแทนการกด Accept ให้ไม่เหลือ issue ที่เปิดอยู่และ Reliability ขึ้นเป็น A โดยพฤติกรรมของหน้าเว็บและบอทไม่เปลี่ยน

**Architecture:** ใส่ข้อความตั้งต้นภาษาไทยใน `<h2>` ที่ว่าง 13 ตัวของ `public/liff/index.html` (ทุกตัวอยู่ใน section/dialog ที่ซ่อนอยู่และ JS เขียนทับด้วย `textContent =` ก่อนแสดง ผู้ใช้จึงไม่เห็นข้อความตั้งต้น) เพิ่ม `aria-label` ให้ file input ที่ซ่อนไว้ แล้วแยกส่วนส่ง LINE ของ `respondFromWeb` เป็นฟังก์ชันย่อย `pushWebAnswer` ให้ `respondFromWeb` เหลือ `return` ที่เดียว เพิ่ม test 2 ข้อใน `index.html static invariants` กัน heading ว่างและ field ไม่มีชื่อกลับมา

**Tech Stack:** HTML + ES modules (`public/liff`), Node.js CommonJS (`src/bills`), vitest + jsdom, SonarQube Community 26.11

**ที่มา (สแกน 2026-11-21 13:46 UTC):** issue ที่เปิดอยู่ 15 จุด ทั้งหมดอยู่ในแผนก่อนหน้า (`2026-11-21-sonarqube-fixes.md`) ว่าเป็น false positive รอ Accept ตรวจละเอียดแล้วพบว่าแก้ในโค้ดได้ทุกจุด:
- `Web:S6850` 13 จุดที่ `public/liff/index.html` บรรทัด 352, 374, 428, 584, 821, 872, 937, 953, 990, 1002, 1012, 1051, 1076: `<h2>` ว่าง ทุกตัวอยู่ใน `<section hidden>`, `<div hidden>` หรือ `<dialog>` ที่ปิดอยู่
- `Web:InputWithoutLabelCheck` `public/liff/index.html:895`: `<input id="bill-form-receipt" class="sr-only" type="file" ... tabindex="-1" aria-hidden="true">` เปิดผ่านปุ่ม `#bill-form-receipt-button` (`public/liff/bills/bill-form.mjs:337`)
- `javascript:S3516` `src/bills/service.js:136`: `respondFromWeb` มี `return result` สองที่ (บรรทัด 139 และ 147); ครอบด้วย test อยู่แล้วที่ `src/bills/service.test.js:311-357` (4 test: ส่งข้อความยืนยัน, ส่งข้อความปฏิเสธ, ไม่ส่งเมื่อไม่มีอะไรเปลี่ยน, ส่งไม่ถึงแล้วยังคืนผล)

## Global Constraints

- คอมเมนต์ในโค้ดบรรทัดเดียว ภาษาไทย อธิบาย "ทำไม" ศัพท์เทคนิคคงเป็นอังกฤษ; ชื่อตัวแปร/function/log เป็นอังกฤษ; ห้าม emoji ในโค้ด คอมเมนต์ log commit
- ห้ามเปลี่ยนพฤติกรรมที่ผู้ใช้เห็น: ข้อความที่แสดง, ลำดับการโหลด, การจัดการ error, ข้อความที่ส่งใน LINE
- ห้ามแก้ test เดิมเพื่อให้ผ่าน แก้โค้ดแทน (เพิ่ม test ใหม่ได้) ถ้า test เดิมตกเพราะการแก้นี้ ให้หยุดและรายงาน
- ห้ามใส่อักขระ U+2028/U+2029 หรือ ` ` ในไฟล์ (เครื่องมือแก้ไฟล์แปลงเป็นอักขระจริงแล้ว JS parse พัง)
- รัน `npm test -- --testTimeout=30000` และ `npm run lint` ก่อน commit ทุก task (timeout 5 วินาทีตกแบบสุ่มตามภาระเครื่อง)
- ทำงานต่อบน branch `fix/sonarqube-issues` (ไม่สร้าง branch ใหม่)
- commit message ลงท้ายด้วย:
  ```

  Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
  ```

---

### Task 1: heading มีข้อความตั้งต้นและ file input มีชื่อ (S6850, InputWithoutLabelCheck)

**Depends on:** none

**Files:**
- Modify: `public/liff/index.html` (14 บรรทัด ตามตารางใน Step 3)
- Test: `public/liff/app.core.dom.test.mjs` (เพิ่ม 2 test ใน `describe('index.html static invariants', ...)`)

**Interfaces:**
- Consumes: `html` จาก `./dom-harness.mjs` (import อยู่แล้วที่บรรทัด 10 ของไฟล์ test) และตัวแปร `doc` ใน describe (บรรทัด 15: `new DOMParser().parseFromString(html, 'text/html')`)
- Produces: ไม่มี export ใหม่

- [ ] **Step 1: เขียน test ที่ล้ม**

ใน `public/liff/app.core.dom.test.mjs` แทรกต่อจาก test `names the categories entry for everything the page can do` (บรรทัด 40-42) ทันที ก่อน test `explains what each balance counts`:

```js
  // heading ว่างทำให้ screen reader อ่านชื่อ dialog ไม่ได้ถ้า JS ยังไม่ทำงาน และ SonarQube ตีเป็น S6850
  it('gives every heading text before any script runs', () => {
    const empty = [...doc.querySelectorAll('h1, h2, h3, h4, h5, h6')]
      .filter((heading) => heading.textContent.trim() === '')
      .map((heading) => heading.id || heading.className);

    expect(empty).toEqual([]);
  });

  it('gives every form field an accessible name', () => {
    const unnamed = [...doc.querySelectorAll('input:not([type="hidden"]), select, textarea')]
      .filter((field) => !field.hasAttribute('aria-label') && !field.hasAttribute('aria-labelledby') && !field.hasAttribute('title'))
      .filter((field) => !field.closest('label') && !(field.id && doc.querySelector(`label[for="${field.id}"]`)))
      .map((field) => field.id || field.name || field.type);

    expect(unnamed).toEqual([]);
  });
```

- [ ] **Step 2: รัน test ให้เห็นว่าล้ม**

Run: `npx vitest run public/liff/app.core.dom.test.mjs -t "index.html static invariants" --testTimeout=30000`
Expected: FAIL 2 ข้อ: ข้อแรกรายการ `empty` มี 13 id (`budget-risk-title`, `budget-calm-title`, `budget-all-empty-title`, `profile-name`, `friend-dialog-title`, `bill-dialog-title`, `confirm-title`, `budget-title`, `budget-confirm-title`, `budget-bulk-result-title`, `recurring-editor-title`, `goal-editor-title`, `goal-detail-title`) ข้อสองรายการ `unnamed` เป็น `['bill-form-receipt']` พอดี ถ้า `unnamed` มี field อื่นด้วย ให้หยุดและรายงาน NEEDS_CONTEXT พร้อมรายชื่อ ห้ามเพิ่ม label ให้ field อื่นเอง (SonarQube ตีเฉพาะ `bill-form-receipt` ถือว่าตัวอื่นผ่านแล้ว นิยามใน test ต้องปรับให้ตรง)

- [ ] **Step 3: ตรวจเส้นทางที่ heading ถูกแสดง แล้วแก้ index.html**

ก่อนแก้ ตรวจทีละตัวว่า JS เขียนทับข้อความก่อนที่ element จะถูกแสดง (ตารางคอลัมน์ "JS เขียนทับที่"): เปิดไฟล์และบรรทัดนั้น หา `hidden = false` หรือ `showModal()` ของ container แล้วยืนยันว่าบรรทัดเขียนทับ `textContent` อยู่ก่อนหรือในฟังก์ชันเดียวกันโดยไม่มี `await` คั่น ถ้ามีเส้นทางที่ element แสดงโดยไม่ผ่านการเขียนทับ ให้หยุดและรายงาน NEEDS_CONTEXT ห้ามเดา

แก้ `public/liff/index.html` ทีละบรรทัด (เลขบรรทัดจาก `main` ที่ 8671785 ไม่มี task ก่อนหน้าแก้ไฟล์นี้) ก่อนแก้ให้อ่านบรรทัดแล้วเช็คว่าตรงคอลัมน์ "ก่อน" เป๊ะ ถ้าไม่ตรงให้หยุดและรายงาน:

| บรรทัด | JS เขียนทับที่ | ก่อน | หลัง |
|---|---|---|---|
| 352 | `public/liff/budgets/budgets-panel.mjs:57` | `<h2 id="budget-risk-title"></h2>` | `<h2 id="budget-risk-title">ต้องดูแล</h2>` |
| 374 | `public/liff/budgets/budgets-panel.mjs:101` | `<h2 id="budget-calm-title"></h2>` | `<h2 id="budget-calm-title">ปกติ</h2>` |
| 428 | `public/liff/budgets/budgets-all-panel.mjs:72` | `<h2 id="budget-all-empty-title"></h2>` | `<h2 id="budget-all-empty-title">ไม่พบหมวด</h2>` |
| 584 | `public/liff/app.mjs:1169` | `<h2 id="profile-name" class="profile-name"></h2>` | `<h2 id="profile-name" class="profile-name">ผู้ใช้</h2>` |
| 821 | `public/liff/friends/friends-panel.mjs:149` | `<h2 id="friend-dialog-title"></h2>` | `<h2 id="friend-dialog-title">เพื่อน</h2>` |
| 872 | `public/liff/bills/bills-panel.mjs:420` | `<h2 id="bill-dialog-title"></h2>` | `<h2 id="bill-dialog-title">บิล</h2>` |
| 937 | `public/liff/app.mjs:1416` | `<h2 id="confirm-title"></h2>` | `<h2 id="confirm-title">ลบรายการนี้?</h2>` |
| 953 | `public/liff/budgets/budget-sheet.mjs:139` | `<h2 id="budget-title"></h2>` | `<h2 id="budget-title">ตั้งงบ</h2>` |
| 990 | `public/liff/budgets/budget-sheet.mjs:181` | `<h2 id="budget-confirm-title"></h2>` | `<h2 id="budget-confirm-title">เลิกตั้งงบ</h2>` |
| 1002 | `public/liff/budgets/budget-bulk-panel.mjs:94` | `<h2 id="budget-bulk-result-title"></h2>` | `<h2 id="budget-bulk-result-title">ผลการบันทึกงบ</h2>` |
| 1012 | `public/liff/app.mjs:1632` | `<h2 id="recurring-editor-title" tabindex="-1" autofocus></h2>` | `<h2 id="recurring-editor-title" tabindex="-1" autofocus>รายการประจำ</h2>` |
| 1051 | `public/liff/goals/goals-panel.mjs:144` | `<h2 id="goal-editor-title" tabindex="-1"></h2>` | `<h2 id="goal-editor-title" tabindex="-1">เป้าออม</h2>` |
| 1076 | `public/liff/goals/goals-panel.mjs:231` | `<h2 id="goal-detail-title" tabindex="-1"></h2>` | `<h2 id="goal-detail-title" tabindex="-1">เป้าออม</h2>` |

แก้ file input บรรทัด 895 (ข้อความ "ก่อน" ต้องตรงเป๊ะ):

ก่อน:
```html
          <input id="bill-form-receipt" class="sr-only" type="file" accept="image/*" tabindex="-1" aria-hidden="true">
```
หลัง:
```html
          <input id="bill-form-receipt" class="sr-only" type="file" accept="image/*" tabindex="-1" aria-hidden="true" aria-label="เลือกรูปใบเสร็จ">
```

ห้ามแตะ HTML ส่วนอื่น ห้ามจัดรูปแบบใหม่ ห้ามแปลงปลายบรรทัด (CRLF/LF) ตรวจด้วย `git diff --stat public/liff/index.html` ต้องได้ 14 บรรทัดเพิ่ม 14 บรรทัดลบ

- [ ] **Step 4: รัน test ให้ผ่าน**

Run: `npx vitest run public/liff --testTimeout=30000`
Expected: PASS ทั้งหมด (จำนวน test = จำนวนก่อนแก้ + 2) และ 2 test ใหม่ปรากฏในผล ถ้า test เดิมข้อใดตก ให้หยุดและรายงาน (ห้ามแก้ test เดิม)

- [ ] **Step 5: รัน lint ไฟล์ test**

Run: `npx eslint public/liff/app.core.dom.test.mjs`
Expected: ไม่มี error

- [ ] **Step 6: Commit**

```bash
git add public/liff/index.html public/liff/app.core.dom.test.mjs
git commit -m "fix(liff): give every heading text and the hidden receipt input a name" -m "heading ว่าง 13 ตัวและ file input ที่ซ่อนไว้ถูก SonarQube ตี (S6850, InputWithoutLabelCheck) ใส่ข้อความตั้งต้นที่ JS เขียนทับก่อนแสดงเสมอ และเพิ่ม test กันกลับมาว่าง" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

### Task 2: respondFromWeb คืนค่าที่เดียว (S3516)

**Depends on:** none

**Files:**
- Modify: `src/bills/service.js:136-148`
- Test: `src/bills/service.test.js` (มี `describe('billService.respondFromWeb', ...)` บรรทัด 311-357 ครอบพฤติกรรมครบ 4 ข้อ ไม่ต้องเพิ่ม test: เป็น refactor ที่คงพฤติกรรม)

**Interfaces:**
- Consumes: `buildWebAnswerText(result)`, `repository.getLineUserIds`, `pushText`, `logger` ในไฟล์เดียวกัน
- Produces: `respondFromWeb(userId, billId, answer)` signature และผลลัพธ์เดิม (คืน `result` จาก `respond`); `pushWebAnswer` เป็นฟังก์ชันในไฟล์ ไม่ export

- [ ] **Step 1: รัน test เดิมเป็น baseline**

Run: `npx vitest run src/bills/service.test.js -t "respondFromWeb" --testTimeout=30000`
Expected: PASS 4 test (จดจำนวนที่รัน)

- [ ] **Step 2: แก้โค้ด**

ใน `src/bills/service.js` แทน (ข้อความ "ก่อน" ต้องตรงเป๊ะ):

ก่อน:
```js
  async function respondFromWeb(userId, billId, answer) {
    const result = await respond(userId, billId, answer);
    const text = buildWebAnswerText(result);
    if (!text) return result;
    // บันทึกคำตอบแล้ว ส่งข้อความไม่ถึงต้องไม่ทำให้เว็บขึ้นว่าไม่สำเร็จ
    try {
      const lineId = (await repository.getLineUserIds([userId])).get(userId);
      if (lineId) await pushText(lineId, text);
    } catch (err) {
      logger.error('Failed to push bill answer', { billId, userId }, err);
    }
    return result;
  }
```
หลัง:
```js
  async function pushWebAnswer(userId, billId, result) {
    const text = buildWebAnswerText(result);
    if (!text) return;
    // บันทึกคำตอบแล้ว ส่งข้อความไม่ถึงต้องไม่ทำให้เว็บขึ้นว่าไม่สำเร็จ
    try {
      const lineId = (await repository.getLineUserIds([userId])).get(userId);
      if (lineId) await pushText(lineId, text);
    } catch (err) {
      logger.error('Failed to push bill answer', { billId, userId }, err);
    }
  }

  async function respondFromWeb(userId, billId, answer) {
    const result = await respond(userId, billId, answer);
    await pushWebAnswer(userId, billId, result);
    return result;
  }
```
ห้ามแตะ `return { create, list, cancel, setPaid, respond, respondFromWeb };` ด้านล่าง

- [ ] **Step 3: รัน test ให้ผ่าน**

Run: `npx vitest run src/bills --testTimeout=30000`
Expected: PASS ทั้งโฟลเดอร์ และ 4 test ของ `billService.respondFromWeb` ปรากฏในผลเท่าเดิม

- [ ] **Step 4: รัน lint**

Run: `npx eslint src/bills`
Expected: ไม่มี error

- [ ] **Step 5: Commit**

```bash
git add src/bills/service.js
git commit -m "refactor(bills): return the answer from one place in respondFromWeb" -m "แยกส่วนส่งข้อความเข้า LINE เป็น pushWebAnswer ให้ respondFromWeb เหลือ return ที่เดียว (SonarQube S3516) พฤติกรรมเหมือนเดิม ครอบด้วย test เดิม 4 ข้อ" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

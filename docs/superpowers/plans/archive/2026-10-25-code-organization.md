# Code Organization Implementation Plan

> **Status (2026-10-25):** Part 1 (Tasks 1-7), Part 2 (Tasks 8-12) and Part 3 (Tasks 13-14) executed on branch refactor/code-organization, not yet merged. Move to plans/archive/ after merge. Line numbers cited for src/bot.js refer to the file before Part 2.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** แยกไฟล์ใหญ่ฝั่ง server (`src/db/repository.js` 1,065 บรรทัด, `src/bot.js` 743 บรรทัด) ออกเป็นโมดูลตามโดเมน และจัดระเบียบเอกสารงาน (migration index, STATE.md) โดยไม่เปลี่ยนพฤติกรรมของระบบเลย

**Architecture:** ย้ายโค้ดอย่างเดียว (move-only) โดยคง public API เดิมไว้ที่ `src/db/repository.js` (facade ที่ `require` โมดูลโดเมนแล้ว spread รวมเป็น object เดียว) และ `src/bot.js` (`createBot` ยังรับ dependency ชุดเดิมและคืน `{ handleEvent, handleEvents }`) ผู้เรียกเดิม (`index.js`, เทสต์) จึงไม่ต้องแก้ ใช้เทสต์เดิมทั้งหมดเป็นตาข่ายกันพลาด

**Tech Stack:** Node.js 24 (CommonJS ฝั่ง server), vitest, ESLint (`no-undef` จาก `@eslint/js` recommended ใช้จับ dependency ที่ลืมส่ง)

## Global Constraints

- ห้ามเปลี่ยนพฤติกรรม: ห้ามแก้ logic, ข้อความตอบ, ชื่อตาราง/คอลัมน์, ลำดับการเรียก, ข้อความ error ในโค้ดที่ย้าย ย้ายตัวอักษรต่อตัวอักษร (เปลี่ยนได้แค่ `require`/`module.exports`/ชื่อ factory)
- ห้ามแตะ `public/liff/` (ฝั่งเว็บอยู่นอกแผนนี้) และห้ามแก้ `supabase/*.sql`
- ชื่อไฟล์/ตัวแปร/function/log เป็นภาษาอังกฤษ คอมเมนต์เดิมที่ย้ายไปด้วยคงเป็นภาษาไทยตามเดิม ห้ามเพิ่มคอมเมนต์ใหม่ที่ไม่จำเป็น ห้ามใช้ emoji ในโค้ด คอมเมนต์ log และ commit message
- ห้าม `git push` ห้ามลบไฟล์ (ไฟล์ที่ย้ายใช้ `git mv` หรือตัดแล้ววางใหม่ได้ แต่ห้ามลบไฟล์ที่ไม่ได้ระบุในแผน) ห้ามแก้ `.env`
- ห้ามสั่งเริ่ม/restart/kill dev server (แผนนี้ใช้แค่ `npm test` และ `npm run lint`)
- commit ในเครื่องได้ตาม workflow ของ skill ข้อความขึ้นต้นด้วย `refactor:` หรือ `docs:` ลงท้ายด้วยบรรทัด `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` การ push ให้ผู้ใช้ตัดสินใจเอง
- หลังทุก task ต้องรัน `npm test` และ `npm run lint` ผ่านทั้งคู่ และจำนวนเทสต์ต้องเท่ากับ baseline ที่จดใน Task 1 (เทสต์ที่ย้ายไฟล์ต้องไม่หายและไม่เพิ่ม ยกเว้น Task 1 ที่เพิ่ม 2 ข้อ)
- เทสต์ flaky ที่เคยเจอ: timeout 5 วินาทีตอนรันรวม (ผ่านเมื่อรันซ้ำ) ถ้าล้มให้รันไฟล์นั้นเดี่ยวซ้ำก่อน และจดชื่อเทสต์ที่ล้มลง `work-memory/STATE.md` ห้ามเพิ่ม timeout เพื่อหลบ

### ขั้นตอนมาตรฐานของการย้ายโดเมน repository (ใช้กับ Task 2-7)

แต่ละ task ระบุ "ชื่อไฟล์", "function ที่ย้าย", "helper/constant/require ที่ย้ายตาม", "describe ของเทสต์ที่ย้าย" ให้ทำตามนี้ทุกโดเมนใน task:

- [ ] **P1. สร้าง `src/db/domains/<ชื่อ>.js`** โครงสร้าง:

```js
const { throwIfError } = require('../errors');
// require อื่นที่โค้ดที่ย้ายใช้ (ย้ายบรรทัด require มาจากหัว repository.js)

// helper/constant ของโดเมนนี้ (ย้ายมาจากหัว repository.js ทั้งก้อน)

function create<Name>Repository(supabase) {
  // function ที่ย้าย: วางทั้งตัว ไม่แก้เนื้อใน (ย่อหน้าเดิมอยู่ในระดับเดียวกับเดิม)

  return { /* ชื่อ function ที่ย้ายทั้งหมด คั่นด้วยจุลภาค */ };
}

module.exports = { create<Name>Repository };
```

- [ ] **P2. ตัดของเดิมออกจาก `src/db/repository.js`:** ลบ function ที่ย้าย, ลบ key ของมันออกจาก `return { ... }` ท้ายไฟล์, ลบ helper/constant/require ที่ไม่เหลือผู้ใช้ แล้วเพิ่ม `const { create<Name>Repository } = require('./domains/<ชื่อ>');` ที่หัวไฟล์ และเพิ่ม `...create<Name>Repository(supabase),` เป็นบรรทัดแรกๆ ใน `return {`
- [ ] **P3. ย้ายเทสต์:** สร้าง `src/db/domains/<ชื่อ>.test.js` ย้าย `describe` ที่ระบุจาก `src/db/repository.test.js` ไปทั้งก้อน เปลี่ยน `import { createRepository, DatabaseError } from './repository.js'` เป็น `import { create<Name>Repository } from './<ชื่อ>.js'` และเปลี่ยนการเรียก `createRepository(supabase)` ในก้อนที่ย้ายเป็น `create<Name>Repository(supabase)` ส่วน helper จำลอง supabase ให้ import จาก `../test-helpers.mjs` (สร้างใน Task 1) ถ้า describe ใดเรียก function ข้ามโดเมน ให้คงไว้ใน `repository.test.js`
- [ ] **P4. ตรวจ:** `npx vitest run src/db` ผ่านทั้งหมด (รวม `repository-surface.test.js`), `npm run lint` ไม่มี error (ถ้า `no-undef` ฟ้องชื่อใด แปลว่าลืมย้าย helper/require ตามมา ให้ย้ายแล้วรันใหม่; ถ้า helper ถูกใช้โดยสองโดเมน ให้ย้ายไป `src/db/errors.js` หรือ import ซ้ำจากไฟล์เดียว ห้ามคัดลอกสองสำเนา)
- [ ] **P5. ตรวจจำนวนเทสต์:** `npm test` แล้วเทียบบรรทัด `Tests  N passed` กับ baseline ต้องเท่ากัน
- [ ] **P6. Commit:** `git add src/db` แล้ว `git commit` ข้อความ `refactor: move <ชื่อโดเมน> queries into src/db/domains/<ชื่อ>.js`

---

## Part 1: แยก `src/db/repository.js` ตามโดเมน

ข้อเท็จจริงที่ตรวจแล้ว (2026-10-25): 75 function ใน `createRepository` ไม่เรียกกันเองเลย (ตรวจด้วยสคริปต์วิเคราะห์ call graph) helper ระดับโมดูลผูกกับโดเมนเดียวทั้งหมด ยกเว้น `throwIfError`, `DatabaseError`, `UNIQUE_VIOLATION` (ใช้ใน goals, friends, categories, wallets) จึงแยกได้โดยไม่ต้องปรับ logic

แผนที่ function -> ไฟล์ (รวมครบ 75):

| ไฟล์ (`src/db/domains/`) | function | helper/constant ที่ย้ายตาม |
|---|---|---|
| `users.js` | findUserIdByLineId, createUser, fillMissingDisplayName, getDisplayName, getLineUserIds | - |
| `notifications.js` | getNotificationSettings, updateNotificationSettings, disableNotifications, listWeeklySummaryUsers, reserveNotification, listUsersToRemind | `require('../../notifications/settings')` |
| `pending.js` | getPendingClarification, savePendingClarification, clearPendingClarification, savePendingSlip, claimPendingSlip, deleteExpiredPendingSlips, deleteAllExpiredPendingSlips | - |
| `exports.js` | createExportLink, deleteExpiredExportLinks, claimExportLink | - |
| `categories.js` | seedDefaultCategories, getCategoryIds, listCategories, createCategory, updateCategory, deleteCategory, countCategoryUsage | CATEGORY_COLUMNS, toCategory, `DEFAULT_CATEGORIES`, `categoryKey` (ตามที่โค้ดที่ย้ายใช้จริง) |
| `wallets.js` | listWallets, seedDefaultWallet, createWallet, updateWallet, getWalletTotals | WALLET_COLUMNS, toWallet, `DEFAULT_WALLET_NAME` |
| `transactions.js` | claimEvent, insertTransactions, deleteTransactionsByEvent, listTransactions, listAllTransactions, updateTransaction, deleteTransaction | TRANSACTION_COLUMNS, EXPORT_PAGE_SIZE, EXPORT_COLUMNS, toTransaction, compareOldestFirst |
| `stats.js` | summarizeTransactions, queryTotals, getLifetimeTotals, getMonthlyTotals | - |
| `goals.js` | listGoals, createGoal, updateGoal, addGoalContribution, listGoalContributions, deleteGoalContribution, deleteGoalContributionsByEvent | GOAL_COLUMNS, GOAL_CONTRIBUTION_LIMIT, toGoal |
| `budgets.js` | getBudgetStatus, setBudget | `require` ที่ใช้ (เช่น `lastDayOf`, `monthStartOf`) |
| `recurring.js` | listRecurringRules, createRecurringRule, updateRecurringRule, deleteRecurringRule, listDueRecurringRules, applyRecurringRule | RULE_COLUMNS, DUE_RULE_BATCH, toRule |
| `friends.js` | getFriendCode, setFriendCode, findUserByFriendCode, listFriends, addFriendship, removeFriendship | FOREIGN_KEY_VIOLATION |
| `bills.js` | createBill, markBillMemberNotified, listOwnedBills, listIncomingBills, getBillShare, confirmBillShare, declineBillShare, cancelBill, isBillOwner, setBillMemberPaid | BILL_LIST_LIMIT, toOwnedBill, toIncomingBill |

### Task 1: ตาข่ายกันพลาดและโมดูลที่ใช้ร่วมกัน

**Depends on:** none

**Files:**
- Create: `src/db/errors.js` (DatabaseError, throwIfError, UNIQUE_VIOLATION, FOREIGN_KEY_VIOLATION)
- Create: `src/db/test-helpers.mjs` (helper จำลอง supabase ที่ย้ายจากหัว `src/db/repository.test.js` ก่อน `describe` แรก)
- Create: `src/db/repository-surface.test.js`
- Modify: `src/db/repository.js` (ลบ DatabaseError/throwIfError/SAFE_CAUSE_FIELDS/UNIQUE_VIOLATION/FOREIGN_KEY_VIOLATION แล้ว import จาก `./errors`; คง `module.exports = { createRepository, DatabaseError }`)
- Modify: `src/db/repository.test.js` (ย้าย helper ออก แล้ว import จาก `./test-helpers.mjs`)

**Interfaces:**
- Produces: `require('./errors')` -> `{ DatabaseError, throwIfError(operation, error), UNIQUE_VIOLATION: '23505', FOREIGN_KEY_VIOLATION: '23503' }`; `test-helpers.mjs` export ทุก helper ที่เดิมประกาศไว้ก่อน `describe` แรก (อย่างน้อย `fakeSupabase`, `fakeSupabasePages`) เป็น named export (ไฟล์เป็น .mjs เพราะ ESLint อ่าน .js เป็น CommonJS จึงใช้ export แบบ ESM ใน .js ไม่ได้ แต่ vitest import ได้ปกติ)

- [ ] **Step 1: จด baseline** รัน `npm test` แล้วจดบรรทัด `Tests  N passed` และ `npm run lint` ต้องผ่าน (ถ้าไม่ผ่านตั้งแต่ก่อนเริ่ม ให้หยุดและรายงานผู้ใช้)
- [ ] **Step 2: เขียนเทสต์ surface ก่อน** สร้าง `src/db/repository-surface.test.js` (ต้องผ่านกับโค้ดเดิมทันที เพราะเป็นการล็อก API ก่อนย้าย):

```js
import { describe, it, expect } from 'vitest';
import { createRepository } from './repository.js';

const EXPECTED_METHODS = [
  'addFriendship', 'addGoalContribution', 'applyRecurringRule', 'cancelBill', 'claimEvent',
  'claimExportLink', 'claimPendingSlip', 'clearPendingClarification', 'confirmBillShare',
  'countCategoryUsage', 'createBill', 'createCategory', 'createExportLink', 'createGoal',
  'createRecurringRule', 'createUser', 'createWallet', 'declineBillShare', 'deleteAllExpiredPendingSlips',
  'deleteCategory', 'deleteExpiredExportLinks', 'deleteExpiredPendingSlips', 'deleteGoalContribution',
  'deleteGoalContributionsByEvent', 'deleteRecurringRule', 'deleteTransaction', 'deleteTransactionsByEvent',
  'disableNotifications', 'fillMissingDisplayName', 'findUserByFriendCode', 'findUserIdByLineId',
  'getBillShare', 'getBudgetStatus', 'getCategoryIds', 'getDisplayName', 'getFriendCode',
  'getLifetimeTotals', 'getLineUserIds', 'getMonthlyTotals', 'getNotificationSettings',
  'getPendingClarification', 'getWalletTotals', 'insertTransactions', 'isBillOwner', 'listAllTransactions',
  'listDueRecurringRules', 'listFriends', 'listGoalContributions', 'listGoals', 'listIncomingBills',
  'listOwnedBills', 'listCategories', 'listRecurringRules', 'listTransactions', 'listUsersToRemind',
  'listWallets', 'listWeeklySummaryUsers', 'markBillMemberNotified', 'queryTotals', 'removeFriendship',
  'reserveNotification', 'savePendingClarification', 'savePendingSlip', 'seedDefaultCategories',
  'seedDefaultWallet', 'setBillMemberPaid', 'setBudget', 'setFriendCode', 'summarizeTransactions',
  'updateCategory', 'updateGoal', 'updateNotificationSettings', 'updateRecurringRule', 'updateTransaction',
  'updateWallet',
];

describe('createRepository surface', () => {
  it('exposes exactly the methods that callers depend on', () => {
    const methods = Object.keys(createRepository({})).sort();
    expect(methods).toEqual([...EXPECTED_METHODS].sort());
    expect(methods).toHaveLength(75);
  });

  it('exposes only functions', () => {
    for (const [name, value] of Object.entries(createRepository({}))) {
      expect(typeof value, name).toBe('function');
    }
  });
});
```

หมายเหตุ: ไฟล์นี้มี 2 `it` จึงเพิ่มเทสต์ 2 ข้อ (baseline ใหม่ = baseline เดิม + 2)

- [ ] **Step 3: รันให้ผ่านกับโค้ดเดิม** `npx vitest run src/db/repository-surface.test.js` คาดว่า 2 passed ถ้า `toHaveLength(75)` ล้ม ให้นับ key ใน `return {` ของ `repository.js` ใหม่และแก้รายการให้ตรงกับของจริง (ห้ามแก้ `repository.js`)
- [ ] **Step 4: สร้าง `src/db/errors.js`** ย้าย `SAFE_CAUSE_FIELDS`, `class DatabaseError`, `throwIfError`, `UNIQUE_VIOLATION`, `FOREIGN_KEY_VIOLATION` จากหัว `repository.js` ไปทั้งก้อน `module.exports = { DatabaseError, throwIfError, UNIQUE_VIOLATION, FOREIGN_KEY_VIOLATION };` ใน `repository.js` เพิ่ม `const { DatabaseError, throwIfError, UNIQUE_VIOLATION, FOREIGN_KEY_VIOLATION } = require('./errors');` (ถ้าตัวใดไม่ถูกใช้ใน repository.js แล้วหลัง Task 7 ค่อยเก็บกวาด ตอนนี้ลบตัวที่ lint ฟ้อง `no-unused-vars`)
- [ ] **Step 5: ย้าย helper เทสต์** ตัดโค้ดจากบรรทัดแรกของ `repository.test.js` ถึงก่อน `describe` แรก (ส่วน `fakeSupabase`, `fakeSupabasePages` และอื่นๆ ถ้ามี) ไปไว้ `src/db/test-helpers.mjs` พร้อม `export` ทุกตัว ใน `repository.test.js` เพิ่ม `import { fakeSupabase, fakeSupabasePages /* + ตัวอื่นที่ใช้ */ } from './test-helpers.mjs';`
- [ ] **Step 6: ตรวจ** `npx vitest run src/db` ผ่าน, `npm run lint` ผ่าน, `npm test` จำนวนเทสต์ = baseline + 2
- [ ] **Step 7: Commit** `git add src/db` แล้ว `git commit -m "refactor: add repository surface test and extract db errors and test helpers"`

### Task 2: users และ notifications

**Depends on:** Task 1

**Files:**
- Create: `src/db/domains/users.js`, `src/db/domains/users.test.js`
- Create: `src/db/domains/notifications.js`, `src/db/domains/notifications.test.js`
- Modify: `src/db/repository.js`, `src/db/repository.test.js`

**Interfaces:**
- Produces: `createUsersRepository(supabase)`, `createNotificationsRepository(supabase)` (คืน object ของ function ตามตารางข้างบน)

เทสต์ที่ย้าย: users <- `describe` ที่ชื่อมี `findUserIdByLineId`, `createUser`, `fillMissingDisplayName`, `getDisplayName`; notifications <- `describe('repository notification settings')`, `disableNotifications`, `listWeeklySummaryUsers`, ก้อนของ `reserveNotification` และ `listUsersToRemind` (ค้นด้วย `grep -n "describe(" src/db/repository.test.js`)

- [ ] ทำ P1-P6 ตามขั้นตอนมาตรฐานสำหรับ `users` แล้วทำซ้ำสำหรับ `notifications` (commit แยกกัน 2 ครั้ง)

### Task 3: pending และ exports

**Depends on:** Task 2

**Files:**
- Create: `src/db/domains/pending.js`, `src/db/domains/pending.test.js`
- Create: `src/db/domains/exports.js`, `src/db/domains/exports.test.js`
- Modify: `src/db/repository.js`, `src/db/repository.test.js`

**Interfaces:**
- Produces: `createPendingRepository(supabase)`, `createExportsRepository(supabase)`

เทสต์ที่ย้าย: pending <- `describe` ของ `getPendingClarification`, `savePendingClarification`, `clearPendingClarification`, `savePendingSlip`, `claimPendingSlip`, `deleteAllExpiredPendingSlips`, `deleteExpiredPendingSlips`; exports <- `describe` ของ `createExportLink`, `deleteExpiredExportLinks`, `claimExportLink`

- [ ] ทำ P1-P6 สำหรับ `pending` แล้วสำหรับ `exports` (commit แยก)

### Task 4: categories และ wallets

**Depends on:** Task 3

**Files:**
- Create: `src/db/domains/categories.js`, `src/db/domains/categories.test.js`
- Create: `src/db/domains/wallets.js`, `src/db/domains/wallets.test.js`
- Modify: `src/db/repository.js`, `src/db/repository.test.js`

**Interfaces:**
- Produces: `createCategoriesRepository(supabase)`, `createWalletsRepository(supabase)`

เทสต์ที่ย้าย: categories <- `describe` ของ `seedDefaultCategories`, `getCategoryIds`, `listCategories`, `createCategory`, `updateCategory`, `deleteCategory`, `countCategoryUsage`; wallets <- `describe('repository wallets')`

- [ ] ทำ P1-P6 สำหรับ `categories` แล้วสำหรับ `wallets` (commit แยก)

### Task 5: transactions และ stats

**Depends on:** Task 4

**Files:**
- Create: `src/db/domains/transactions.js`, `src/db/domains/transactions.test.js`
- Create: `src/db/domains/stats.js`, `src/db/domains/stats.test.js`
- Modify: `src/db/repository.js`, `src/db/repository.test.js`

**Interfaces:**
- Produces: `createTransactionsRepository(supabase)`, `createStatsRepository(supabase)`

เทสต์ที่ย้าย: transactions <- `describe` ของ `claimEvent`, `insertTransactions`, `deleteTransactionsByEvent`, `listTransactions`, `listAllTransactions`, `updateTransaction`, `deleteTransaction`; stats <- `describe` ของ `summarizeTransactions`, `queryTotals`, `getLifetimeTotals`, `getMonthlyTotals`. หมายเหตุ: `src/db/transaction-rows.js` และ `sql-functions.test.js` อยู่ที่เดิม ไม่ย้าย

- [ ] ทำ P1-P6 สำหรับ `transactions` แล้วสำหรับ `stats` (commit แยก)

### Task 6: goals, budgets, recurring

**Depends on:** Task 5

**Files:**
- Create: `src/db/domains/goals.js`, `src/db/domains/goals.test.js`
- Create: `src/db/domains/budgets.js`, `src/db/domains/budgets.test.js`
- Create: `src/db/domains/recurring.js`, `src/db/domains/recurring.test.js`
- Modify: `src/db/repository.js`, `src/db/repository.test.js`

**Interfaces:**
- Produces: `createGoalsRepository(supabase)`, `createBudgetsRepository(supabase)`, `createRecurringRepository(supabase)`

เทสต์ที่ย้าย: goals <- `describe` ของ goal ทั้งหมด (`listGoals` ถึง `deleteGoalContributionsByEvent`); budgets <- `describe` ของ `getBudgetStatus`, `setBudget`; recurring <- `describe('repository recurring rules')`

- [ ] ทำ P1-P6 สำหรับ `goals`, `budgets`, `recurring` ตามลำดับ (commit แยก 3 ครั้ง)

### Task 7: friends, bills และเก็บกวาด facade

**Depends on:** Task 6

**Files:**
- Create: `src/db/domains/friends.js`, `src/db/domains/friends.test.js`
- Create: `src/db/domains/bills.js`, `src/db/domains/bills.test.js`
- Modify: `src/db/repository.js` (เหลือเฉพาะ require ของโดเมน, `createRepository`, `module.exports`), `src/db/repository.test.js` (เหลือเทสต์ข้ามโดเมนและ `DatabaseError`)
- Modify: `README.md` (บรรทัดโครงสร้างโฟลเดอร์: เพิ่ม `db/domains`)

**Interfaces:**
- Produces: `createFriendsRepository(supabase)`, `createBillsRepository(supabase)`; `createRepository(supabase)` ยังคืน 75 method เดิม

- [ ] ทำ P1-P6 สำหรับ `friends` แล้วสำหรับ `bills` (commit แยก)
- [ ] **ตรวจ facade สุดท้าย:** เปิด `src/db/repository.js` ต้องเหลือเพียง `require` ของ 13 โดเมน + `errors`, ฟังก์ชัน `createRepository` ที่ `return { ...createUsersRepository(supabase), ... }` ครบ 13 บรรทัด, และ `module.exports = { createRepository, DatabaseError };` ไม่มี helper/constant/query ค้าง ไฟล์ควรสั้นกว่า 60 บรรทัด
- [ ] ย้าย `describe('DatabaseError')` ไป `src/db/errors.test.js` (import จาก `./errors.js`) ถ้ายังอยู่ใน `repository.test.js`
- [ ] **ตรวจ:** `grep -rn "db/repository" --include=*.js . --exclude-dir=node_modules` ผู้เรียกต้องมีแค่ `index.js` กับเทสต์ ไม่มีที่ใดต้องแก้ path; `npm test` จำนวน = baseline + 2; `npm run lint` ผ่าน; `node --check index.js` ผ่าน
- [ ] Commit `refactor: reduce repository.js to a facade over db/domains`

---

## Part 2: แยก `src/bot.js` ตามหน้าที่

ข้อเท็จจริงที่ตรวจแล้ว: ใน `createBot` ตัวแปร closure ที่ใช้ร่วมกันมีน้อย (`runSlipTask` ใช้เฉพาะ `handleImage`, `liffUrl` ใช้เฉพาะ URL builder กับ `handleText`, `now`/`logger` กระจายหลายจุด) call graph เป็นชั้นชัดเจน: dispatch (`handleEvents` -> `handleEvent` -> `buildReplyBeforeDeadline` -> `buildReply`) -> handler 3 กลุ่ม (text, image/slip, postback) -> ตัวช่วยร่วม (url, loader, budget check) เทสต์ `src/bot.test.js` (2,255 บรรทัด) เรียกผ่าน `createBot` อย่างเดียว จึงเป็นตาข่ายที่ครอบทั้งหมด

โครงสร้างปลายทาง (โฟลเดอร์ `src/chat/` ไม่ใช้ชื่อ `src/bot/` เพราะซ้ำกับ `src/bot.js` ทำให้ `require('./bot')` อ่านสับสน):

| ไฟล์ | เนื้อหา |
|---|---|
| `src/chat/replies.js` | ค่าคงที่ข้อความตอบและ quick reply builder จากส่วนหัวของ `bot.js` (บรรทัด 28-153 ยกเว้น event predicate ที่บรรทัด 78-94 ซึ่งอยู่ใน bot.js: `*_REPLY`, `BILL_REPLIES`, `SLIP_*_ACTION`, `buildUndoQuickReply`, `buildUndoSavingQuickReply`, `buildSavedReply`, `buildSlipQuickReply`, `buildSummaryQuickReply`, `button`) |
| `src/chat/urls.js` | `buildEditUrls`, `buildEditUrl`, `buildGoalsUrl`, `buildTotalsListUrl` |
| `src/chat/support.js` | `loadHistory`, `rememberConversation`, `forgetConversation`, `loadTextCategories`, `loadQuestionCategories`, `loadTextWallets`, `loadQuestionWallets`, `checkBudgets`, `commentOn` |
| `src/chat/slip.js` | `clearExpiredSlips`, `handleImage`, `claimSlip`, `claimPostback`, `handleSlipSave`, `handleSlipCancel` และ `runSlipTask` |
| `src/chat/postback.js` | `handleUndo`, `handleUndoSaving`, `handleBillAnswer`, `handlePostback` |
| `src/chat/text.js` | `answerQuestion`, `handleSummary`, `handleSaving`, `handleText` |
| `src/bot.js` (เหลือ) | event predicate (`isFromUser` ฯลฯ), `buildReply`, `buildReplyBeforeDeadline`, `handleEvent`, `handleEvents`, `createBot`, `module.exports` เดิมครบ |

กติกาการต่อ dependency: ใน `createBot` สร้าง bag เดียวชื่อ `deps` หลังรับพารามิเตอร์:

```js
const deps = {
  parseMessage, parseQuestion, commentSummary, downloadImage, parseSlip,
  repository, users, bills, allowRequest, liffUrl, now, logger,
};
```

แต่ละ factory ในตารางรับ `deps` (บวก factory ที่มันต้องพึ่ง) แล้ว destructure เฉพาะที่โค้ดที่ย้ายอ้างถึงจริง `replyText`/`replyFlex`/`replyDeadlineMs` ไม่อยู่ใน `deps` เพราะใช้เฉพาะ `handleEvent`/`buildReplyBeforeDeadline` ที่อยู่ใน `bot.js` ถ้า ESLint `no-undef` ฟ้องชื่อใดในไฟล์ที่ย้าย ให้เพิ่มชื่อนั้นเข้า destructure (ถ้ามาจาก `deps`) หรือ `require` (ถ้าเป็นโมดูลภายนอก) อย่าคัดลอกค่าคงที่ซ้ำ

ขั้นตอนมาตรฐานของ Part 2 (ใช้กับ Task 8-12 ใน Global): **B1** สร้างไฟล์ใหม่ตามโครง `function createXxx({ ...deps }) { /* function ที่ย้าย วางทั้งตัวไม่แก้เนื้อใน */ return { ... }; }` + `module.exports`, **B2** ตัดของเดิมออกจาก `bot.js` แล้วเรียก factory ใน `createBot` ในตำแหน่งที่ function เดิมเคยประกาศ (ลำดับ factory ต้องสร้าง dependency ก่อนผู้ใช้) และแทนการเรียก function ที่ย้ายด้วยค่าที่ destructure จาก object ที่ factory คืน, **B3** `npx vitest run src/bot.test.js` ผ่าน, **B4** `npm run lint` ผ่าน, **B5** `npm test` จำนวน = baseline + 2, **B6** commit `refactor: move <ชื่อ> out of bot.js into src/chat/<ไฟล์>`

### Task 8: replies และ urls

**Depends on:** Task 7

**Files:**
- Create: `src/chat/replies.js`, `src/chat/urls.js`, `src/chat/urls.test.js`
- Modify: `src/bot.js` (import จาก `./chat/replies`; re-export ค่าคงที่เดิมใน `module.exports` ให้ครบเท่าเดิม), `src/bot.test.js` (ไม่ควรต้องแก้)

**Interfaces:**
- Produces: `replies.js` export ชื่อเดียวกับที่ `bot.js` เคยมีในบรรทัด 28-153; `createUrlBuilders({ liffUrl })` -> `{ buildEditUrls(rows, ids), buildEditUrl(id, date), buildGoalsUrl(), buildTotalsListUrl(question) }`

- [ ] **Step 1:** บันทึกรายการ `module.exports` ปัจจุบันของ `bot.js` (บรรทัด 722 เป็นต้นไป) ไว้เทียบ
- [ ] **Step 2: เขียนเทสต์ก่อน** `src/chat/urls.test.js`: เปิด `src/bot.test.js` ค้น `describe('bot edit links on the saved card'` และ `describe('bot edit links stay safe'` ดูตัวอย่างค่า `liffUrl` กับ URL ที่คาดหวัง แล้วเขียนเทสต์ตรงของ `createUrlBuilders({ liffUrl: 'https://liff.line.me/test' })` อย่างน้อย 4 ข้อ ข้อละ builder โดยใช้ค่าคาดหวังที่คัดมาจากเทสต์เดิมตรงๆ (ห้ามเดาค่า) รันแล้วต้องล้ม (ยังไม่มีไฟล์) `npx vitest run src/chat/urls.test.js`
- [ ] **Step 3:** สร้าง `src/chat/urls.js` ย้าย 4 function (บรรทัด 264-316 ของ `bot.js`) ตาม B1 จนเทสต์ผ่าน
- [ ] **Step 4:** สร้าง `src/chat/replies.js` ย้ายค่าคงที่และ builder ตามตาราง ตัดออกจาก `bot.js` แล้ว `require('./chat/replies')` ทำให้ `module.exports` ของ `bot.js` เหมือนเดิมทุกชื่อ
- [ ] **Step 5:** ทำ B2-B6 (จำนวนเทสต์ = baseline + 2 + จำนวนเทสต์ใหม่ใน `urls.test.js`)

### Task 9: support (loader, budget check, comment)

**Depends on:** Task 8

**Files:**
- Create: `src/chat/support.js`
- Modify: `src/bot.js`

**Interfaces:**
- Consumes: `deps` (ใช้ `repository`, `logger`, `now`, `commentSummary`)
- Produces: `createSupport(deps)` -> `{ loadHistory(userId), rememberConversation(userId, messages), forgetConversation(userId), loadTextCategories(userId), loadQuestionCategories(userId), loadTextWallets(userId), loadQuestionWallets(userId), checkBudgets(userId, rows), commentOn(summary, userId) }` (ลายเซ็นตามบรรทัด 174-344 ของ `bot.js` ปัจจุบัน ยืนยันลายเซ็นจากโค้ดก่อนย้ายและห้ามเปลี่ยน)

- [ ] ทำ B1-B6 (ไม่มีเทสต์ใหม่ เพราะ `bot.test.js` ครอบคลุม `bot text categories`, `bot budget alerts`, `bot summary command` อยู่แล้ว)

### Task 10: slip handlers

**Depends on:** Task 9

**Files:**
- Create: `src/chat/slip.js`
- Modify: `src/bot.js`

**Interfaces:**
- Consumes: `deps`, `createUrlBuilders(...)`, `createSupport(...)`; ค่าคงที่จาก `./replies`; `createConcurrencyLimit` และ `MAX_CONCURRENT_SLIPS` (ย้ายมาด้วย)
- Produces: `createSlipHandlers({ ...deps, urls, support })` -> `{ handleImage(event, lineUserId), handleSlipSave(event, params, lineUserId), handleSlipCancel(event, params, lineUserId) }` และ `runSlipTask` สร้างภายในไฟล์นี้ (ใช้โดย `handleImage` เท่านั้น)

- [ ] ทำ B1-B6 (เทสต์ที่ครอบ: `bot slip image`, `bot slip confirmation`, `bot slip with several items`)

### Task 11: postback handlers

**Depends on:** Task 10

**Files:**
- Create: `src/chat/postback.js`
- Modify: `src/bot.js`

**Interfaces:**
- Consumes: `deps`, `slip` (ผลจาก Task 10), ค่าคงที่/builder จาก `./replies`
- Produces: `createPostbackHandlers({ ...deps, slip })` -> `{ handlePostback(event, lineUserId) }` (`handleUndo`, `handleUndoSaving`, `handleBillAnswer` เป็นภายใน)

- [ ] ทำ B1-B6 (เทสต์ที่ครอบ: `bot undo postback`, `bot undo saving postback`, `bot bill card buttons`, `BILL_REPLIES`)

### Task 12: text handlers และเก็บกวาด bot.js

**Depends on:** Task 11

**Files:**
- Create: `src/chat/text.js`
- Modify: `src/bot.js`, `README.md` (บรรทัดโครงสร้างโฟลเดอร์: เพิ่ม `chat`), `SPEC.md` (เฉพาะถ้ามีข้อความอ้างถึง `src/bot.js` ว่ารวม handler ทั้งหมด; ค้นด้วย `grep -n "bot.js" SPEC.md README.md` และแก้เฉพาะประโยคที่ไม่จริงแล้ว)

**Interfaces:**
- Consumes: `deps`, `urls`, `support`
- Produces: `createTextHandlers({ ...deps, urls, support })` -> `{ handleText(event, lineUserId, deadline) }` (`answerQuestion`, `handleSummary`, `handleSaving` เป็นภายใน)

- [ ] ทำ B1-B6 (เทสต์ที่ครอบ: `bot text message`, `bot summary command`, `bot saving command`, `bot totals questions`, `bot wallets`, `bot reply deadline`)
- [ ] **ตรวจ bot.js สุดท้าย:** ต้องเหลือ event predicate, `buildReply`, `buildReplyBeforeDeadline`, `handleEvent`, `handleEvents`, การสร้าง `deps` และ factory ทั้ง 5, และ `module.exports` เท่ากับที่จดไว้ใน Task 8 Step 1 ทุกชื่อ ขนาดไฟล์ควรต่ำกว่า 250 บรรทัด
- [ ] **ตรวจ:** `grep -rn "require('./src/bot')\|require('./bot')\|from './bot" --include=*.js --include=*.mjs . --exclude-dir=node_modules` ผู้เรียกต้องเป็น `index.js` กับ `src/bot.test.js` เท่านั้น; `node --check index.js`; `npm test` ครบ; `npm run lint` ผ่าน

---

## Part 3: จัดระเบียบเอกสารและงาน

### Task 13: ดัชนี migration ของ Supabase

**Depends on:** none (ทำขนานกับ Part 1-2 ได้ ไม่แตะไฟล์ร่วมกัน)

**Files:**
- Create: `supabase/README.md`
- Modify: `README.md` (ขั้นตอนข้อ 3 ของหัวข้อ "รันในเครื่อง": เพิ่มลิงก์ไป `supabase/README.md` และคงข้อความเตือน 020/024 ไว้)

**Interfaces:** ไม่มี (เอกสารล้วน; ไม่แก้ไฟล์ `.sql`)

- [ ] **Step 1:** ดึงหัวไฟล์ทุก migration: `for f in supabase/0*.sql supabase/schema.sql; do echo "== $f"; head -n 6 "$f"; done` อ่านผลทั้งหมด
- [ ] **Step 2:** เขียน `supabase/README.md` เป็นตาราง `ไฟล์ | ทำอะไร | ต้องรันก่อน push หรือหลัง | หมายเหตุ` ครบทุกไฟล์ (schema.sql, 002-015, 017-025; ไม่มี 016 ให้เขียนระบุไว้) ค่าในคอลัมน์ต้องมาจากหัวไฟล์จริงเท่านั้น ถ้าหัวไฟล์ไม่ได้บอกว่าต้องรันก่อนหรือหลังให้เขียนว่า `ไม่ระบุในหัวไฟล์` ห้ามเดา ใส่หัวข้อ "ข้อควรระวัง" ที่คัดมาจาก README หลัก: ห้ามรัน `020` ซ้ำหลัง `024` ถ้าเผลอให้รัน `024` ซ้ำ
- [ ] **Step 3:** ตรวจว่าตารางครบ: `ls supabase/*.sql | wc -l` เท่ากับจำนวนแถวในตาราง
- [ ] **Step 4: Commit** `docs: add a migration index for supabase`

### Task 14: จัด STATE.md ให้อ่านง่ายและตรงกับความจริง

**Depends on:** none (แตะ `work-memory/` เท่านั้น); ควรทำหลังได้รับอนุมัติจากผู้ใช้เพราะเป็นไฟล์ที่ผู้ใช้ใช้ตอบคำถาม "ทำถึงไหน"

**Files:**
- Create: `work-memory/user-checks.md`
- Modify: `work-memory/STATE.md`

**Interfaces:** ไม่มี

ปัญหาที่พบ (2026-10-25): กติกาในไฟล์บอกรายการละไม่เกิน 2 บรรทัด แต่ข้อ 6-12 ของ "รอผู้ใช้ทำ" ยาวหลายร้อยตัวอักษรต่อข้อ และสถานะขัดกัน: บรรทัดหัวไฟล์บอกงบเฟส 1-3 push แล้ว แต่ใน Next ข้อแรกบอก "โค้ดเสร็จ รอ commit" และ "ทั้งหมดยังไม่push"

- [ ] **Step 1: ตรวจความจริงของ git ก่อนแก้เอกสาร** `git status -sb` และ `git log origin/main..HEAD --oneline` ผลที่ได้คือแหล่งอ้างอิงเดียวว่าอะไร push แล้ว
- [ ] **Step 2:** สร้าง `work-memory/user-checks.md` ย้ายข้อความเต็มของข้อ 6-12 จาก "รอผู้ใช้ทำ" ใน `STATE.md` ไปทั้งตัวอักษร คงเลขข้อเดิม หัวไฟล์: `# รายการที่ผู้ใช้ต้องลองด้วยตา (รายละเอียดเต็ม)` และบอกว่า STATE.md ชี้มาที่นี่
- [ ] **Step 3:** ใน `STATE.md` แทนข้อ 6-12 ด้วยบรรทัดเดียวต่อข้อ (ข้อ 1-5 คงเดิม):

```
6. งาน 2026-10-21: ปุ่ม วิธีใช้งาน, เสียงเฮีย, หน้าย่อยแท็บ ฉัน (รายละเอียด user-checks.md ข้อ 6)
7. ปุ่มย้อนกลับของเครื่องในหน้าย่อย บน Android/iOS จริง (user-checks.md ข้อ 7)
8. งบเฟส 1 หน้างบและดูทั้งหมด (user-checks.md ข้อ 8)
9. งบเฟส 2 แผ่นแก้งบ (user-checks.md ข้อ 9)
10. งบเฟส 3 แก้หลายหมวดพร้อมกัน (user-checks.md ข้อ 10)
11. แท็บออม ดีไซน์ A (user-checks.md ข้อ 11)
12. animation 10 ข้อ (user-checks.md ข้อ 12)
```

- [ ] **Step 4:** แก้บรรทัดที่ขัดกันใน Next ตามผล Step 1 (เช่น เปลี่ยน "รอ commit" / "ยังไม่ push" ให้ตรงกับ git จริง) แก้เฉพาะสถานะ ห้ามลบรายการ
- [ ] **Step 5:** เพิ่มใน Done 2 รายการ (Part 1, Part 2 ของแผนนี้) หลังทำเสร็จ พร้อมผล `npm test` จริง และเลื่อน Done เก่าสุดไป `work-memory/archive/` ตามกติกา "Done เก็บ 5 รายการ" (ถ้าเกิน)
- [ ] **Step 6:** นับบรรทัด `wc -l work-memory/STATE.md` ควรไม่เกินประมาณ 60 และอ่านผ่านๆ ว่าหัวข้อ "รอผู้ใช้ทำ" ยังขึ้นต้นด้วยข้อที่ผู้ใช้ต้องลงมือ (กติกาตอบคำถาม "ทำถึงไหน")
- [ ] **Step 7: Commit** `docs: move long user check lists out of STATE.md`

---

## สิ่งที่ตั้งใจไม่ทำในแผนนี้ (ต้องมีแผนแยก)

1. **`public/liff/app.mjs` (2,100 บรรทัด):** state ร่วมกันผ่านตัวแปร `let` ระดับโมดูล (`categories`, `wallets`, `editing`, `loadError` ฯลฯ) ผู้สมัครแรกคือส่วนรายการประจำ (บรรทัด ~1446-1648) และส่วน sub-page (~1769-1935) แต่ทั้งสองอ้างตัวแปรร่วม 10+ ตัว ต้องออกแบบ interface แบบ `createXxxPanel({ ... })` ที่มีอยู่แล้ว และเทสต์ jsdom ต้องผ่านครบ จึงควรเขียนเป็นแผนของตัวเองหลังอ่านโค้ดแต่ละส่วน
2. **ความเสถียร/ความปลอดภัย:** เทสต์ที่ล้มสุ่มจาก timeout 5 วินาที, rate limiter ใน memory, ความเสี่ยงที่ผู้ใช้ยอมรับไว้แล้วใน STATE.md (ไม่แก้ตามที่ตัดสินไว้) ต้องตัดสินใจเป็นรายข้อกับผู้ใช้ก่อน
3. **ระบบ migration:** เปลี่ยนไปใช้เครื่องมือ migration จริงเป็นงานที่เปลี่ยนวิธี deploy จึงไม่ทำจนกว่าผู้ใช้ขอ (Task 13 เป็นทางเลือกที่ปลอดภัยกว่า)
4. **`.superpowers/sdd/` (248 ไฟล์รายงานงานเก่า):** ถูก ignore โดย `.gitignore` ของโฟลเดอร์เองอยู่แล้ว ไม่กระทบ repo การลบต้องให้ผู้ใช้อนุมัติเอง

## Self-Review

- **Spec coverage:** ขอบเขตที่ผู้ใช้เลือก 4 ข้อ -> แยกไฟล์ใหญ่ (Part 1-2 สำหรับ server; app.mjs แยกแผนเพราะเหตุผลข้างบน), จัดระเบียบเอกสาร/งาน (Part 3), ความเสถียร (แยกแผน) ข้อจำกัด "ย้ายโค้ดอย่างเดียว" อยู่ใน Global Constraints
- **Placeholder scan:** ส่วนที่ต้องอ่านโค้ดจริงตอนทำ (ลายเซ็น, describe ที่ต้องย้าย, ค่าคาดหวังของ `urls.test.js`) ระบุวิธีหาที่แน่นอน (grep หรือคัดจากเทสต์เดิม) ไม่ใช่การเดา
- **Test coverage:** ทุก task โค้ดมี test เดิมเป็นตาข่าย + `repository-surface.test.js` ล็อก API ของ repository; ไม่มี Browser check เพราะไม่มีสิ่งที่ผู้ใช้เห็นเปลี่ยน
- **Type consistency:** ชื่อ factory/ลายเซ็นใน Task 8-12 ตรงกัน (`createUrlBuilders`, `createSupport`, `createSlipHandlers`, `createPostbackHandlers`, `createTextHandlers`; `deps` bag นิยามครั้งเดียวในหัว Part 2)

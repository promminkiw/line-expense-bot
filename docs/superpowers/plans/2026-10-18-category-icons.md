# หน้าหมวดของฉันแบบใหม่ (แบบ A) และไอคอนหมวดที่ผู้ใช้เลือกเอง Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ย้าย "หมวดของฉัน" ออกจากแท็บโปรไฟล์ไปเป็นหน้าย่อยที่เปิดจากปุ่มล่างสุดของแท็บจัดการงบ หน้าตาแบบ A (การ์ดตาราง 3 คอลัมน์ + bottom sheet) และให้ผู้ใช้เลือกไอคอนหมวดเองจาก 36 ตัว แสดงไอคอนนั้นทุกที่ที่หน้าเว็บแสดงหมวด

**Architecture:** เพิ่มคอลัมน์ `categories.icon` (null = ไอคอนตั้งต้นตามชื่อ) server ตรวจค่ากับรายชื่อไอคอนชุดเดียวใน `src/parser/categories.js` และ LIFF มีรายชื่อคู่กันใน `public/liff/category-icons.mjs` ที่มี parity test ผูกไว้ ไอคอนทั้งหมดเป็น symbol ใน sprite ของ `index.html` (`cat-<key>`) badge ของหมวดหาไอคอนจากหมวดที่โหลดไว้ด้วยชื่อ+ประเภท และใช้สีตามประเภท (`cat-tone-expense`/`cat-tone-income`) หน้าหมวดเป็น panel ที่ไม่อยู่ใน `TABS` เข้า/ออกแบบเดียวกับ `enterBillsPage` (ซ่อน bottom nav) และมีปุ่มย้อนกลับใน app bar

**Tech Stack:** Node.js 24 + Express 5, Supabase Postgres (PGlite ในเทสต์), LIFF vanilla JS ES modules ใน `public/liff/`, vitest + jsdom

## Global Constraints

คัดจาก `docs/superpowers/plans/2026-10-18-roadmap-b.md` (Global Constraints) ทั้งหมด:

- ทำทีละฟีเจอร์ตามลำดับในไฟล์นี้ ห้ามทำขนานกัน (ทุกฟีเจอร์แก้ `src/bot.js`, `src/api/router.js`, `src/db/repository.js`, `public/liff/app.mjs`, `public/liff/index.html`)
- หนึ่งฟีเจอร์ = หนึ่ง branch `feat/<name>` แตกจาก main ล่าสุด, TDD (เขียน test ให้ fail ก่อน), commit ทีละ task, merge เข้า main ในเครื่องด้วย `--no-ff` เมื่อจบฟีเจอร์
- ห้าม `git push`, ห้ามรัน SQL ใน Supabase, ห้ามแก้ `.env`, ห้ามติดตั้งแพ็กเกจใหม่โดยไม่ถาม
- migration ใหม่ต่อเลข รันซ้ำได้ (`if not exists`, `create or replace`) เพิ่มชื่อไฟล์ใน `MIGRATIONS` ของ `src/db/sql-functions.test.js` และหัวไฟล์ `supabase/schema.sql` และบรรทัด "ไฟล์ล่าสุด" ใน README
- ถ้าโค้ดใหม่ต้องใช้คอลัมน์/ตารางใหม่ตั้งแต่ request แรก README ต้องบอกว่าต้องรัน SQL ก่อน push
- คอมเมนต์ในโค้ดภาษาไทย บรรทัดเดียว อธิบาย "ทำไม" เท่านั้น; ชื่อตัวแปร/function/log ภาษาอังกฤษ; ไม่มี emoji ในโค้ด คอมเมนต์ log commit
- ข้อความที่ผู้ใช้เห็นเป็นภาษาไทย
- ก่อนจบแต่ละฟีเจอร์: `npm test` และ `npm run lint` ผ่านทั้งหมด, อัปเดต SPEC.md (ฟังก์ชัน, Database, ลำดับการทำ) และ `work-memory/STATE.md`
- ไฟล์ใหม่ใช้ CRLF เหมือนไฟล์เดิมส่วนใหญ่ (git autocrlf=true จัดการให้ตอน commit)

ข้อตัดสินใจของผู้ใช้สำหรับฟีเจอร์นี้ (ผูกมัด):

- branch `feat/category-icons`; migration `018_category_icon.sql` (017 มีแล้ว ไม่มี 016)
- หน้าหมวดของฉันไม่อยู่ใน bottom nav เข้าจากปุ่มเต็มความกว้างแบบขอบ "เพิ่มหมวดของฉัน" ล่างสุดของแท็บจัดการงบ มีข้อความใต้ปุ่ม "เพิ่ม เปลี่ยนชื่อ เลือกไอคอน หรือซ่อนหมวด" หน้ามีปุ่มย้อนกลับไปจัดการงบ ลบส่วน "หมวดของฉัน" เดิมออกจากแท็บโปรไฟล์
- หน้า: segmented control "รายจ่าย · N" / "รายรับ · N" (N = จำนวนหมวดที่ไม่ซ่อน), การ์ด 3 คอลัมน์ (badge ไอคอน 48px + ชื่อ) หมวดระบบมีรูปกุญแจและแตะแก้ไม่ได้, การ์ดสุดท้ายเส้นประ "+ เพิ่มหมวด", แถวพับ "ซ่อนอยู่ N หมวด" กดแล้วกางการ์ดหมวดที่ซ่อน (แตะเพื่อแก้/เลิกซ่อน), ข้อความอธิบาย
- แก้/เพิ่ม = bottom sheet (`<dialog>`): badge ตัวอย่างใหญ่ + ช่องชื่อ, ตารางไอคอน 6 คอลัมน์ (ไอคอนทั้งหมดที่เลือกได้), สวิตช์ "ซ่อนหมวดนี้" (เฉพาะตอนแก้), ปุ่ม ยกเลิก + บันทึก สีเหลือง; ตอนเพิ่มใช้ประเภทของ segment ปัจจุบัน
- ผู้ใช้เลือกไอคอนได้ทุกหมวดที่ไม่ใช่หมวดระบบ (หมวดเริ่มต้นด้วย); เก็บใน `categories.icon` (text, null = ไอคอนตั้งต้นตามชื่อ: หมวดเริ่มต้นใช้ไอคอนเดิม หมวดที่สร้างเองใช้ `other`); server ตรวจไอคอนกับรายชื่อคงที่; POST/PATCH `/api/categories` รับ `icon`, GET คืน `icon`
- ไอคอนแสดงทุกที่ที่ LIFF แสดง badge หมวด (แถวรายการ, กราฟสรุป, งบ, หน้าหมวด, sheet); รายรับโทนเขียว รายจ่ายโทนน้ำเงิน (token เดิม); Flex card ในแชทไม่เปลี่ยน
- หมวดระบบ (อื่นๆ, ใบเสร็จ/สลิปโอนเงิน) แก้ไอคอนไม่ได้
- คงพฤติกรรมเดิมของหมวดของผู้ใช้เองทั้งหมด: เพดาน 30 หมวดที่ไม่ซ่อนต่อประเภท / 100 หมวดรวม, ชื่อสงวน, การซ่อน, รูปแบบ focus/busy/error, โหลดรายการ งบ รายการประจำใหม่หลังแก้หมวด, ตัวเลือก keepId

ข้อตัดสินใจเพิ่มที่แผนนี้ทำเอง:

- Task 1 commit `work-memory/STATE.md` ที่แก้ค้างอยู่บน main ก่อนแตก branch (เป็นแค่บันทึกว่า push แล้ว)
- DB ตรวจแค่รูปแบบ `icon ~ '^[a-z]{2,20}$'` ไม่ใส่รายชื่อใน SQL เพื่อเพิ่มไอคอนใหม่ได้โดยไม่ต้องมี migration; server ตรวจรายชื่อจริง; `icon: null` ใน PATCH = กลับไปใช้ไอคอนตั้งต้น
- ทุกไอคอน 36 ตัวเลือกได้ (รวม `receipt` และ `other`) ลำดับในตารางตามหน้า "ชุดไอคอน" ของ design
- เพิ่มหมวดใหม่เริ่มที่ไอคอน `other`; ถ้าแก้แล้วไม่มีอะไรเปลี่ยน sheet ปิดโดยไม่ส่ง request; PATCH ส่งเฉพาะ field ที่เปลี่ยน
- เพิ่มหมวดใหม่ไม่โหลดรายการ/งบ/รายการประจำใหม่ (หมวดใหม่ยังไม่มีรายการ) ส่วนการแก้ยังโหลดใหม่เหมือนเดิม
- ปุ่มย้อนกลับเป็นปุ่มใน app bar ไม่ใส่ history entry (ปุ่ม back ของ Android จะปิด LIFF เหมือนหน้าอื่นของแอป)
- ปุ่ม "เพิ่มหมวดของฉัน" disabled จนกว่าโหลดหมวดสำเร็จ
- ไฟล์ `public/liff/categories-panel.mjs` เขียนใหม่ทั้งไฟล์แต่คงชื่อไฟล์และชื่อ export `createCategoriesPanel` (ไม่ลบไฟล์)
- `tabs.mjs` `select(id, { force })` เพื่อกลับเข้าแท็บงบที่ controller ยังจำว่าเป็นแท็บปัจจุบัน
- ข้อความ error ใหม่ `400:Invalid icon` -> "เลือกไอคอนจากรายการที่มีให้"
- แถบ app bar ตอนอยู่หน้าหมวดใช้ class `categories-page` บน `#app` ซ่อนมาสคอตเหมือน `bills-page`

---

## File Structure

| ไฟล์ | หน้าที่ |
|---|---|
| `supabase/018_category_icon.sql` (ใหม่) | คอลัมน์ `categories.icon` + check รูปแบบ |
| `src/parser/categories.js` | เพิ่ม `CATEGORY_ICONS` รายชื่อ key ที่ server รับ |
| `src/api/validate.js` | `icon` ใน `validateCategoryCreate` / `validateCategoryUpdate` |
| `src/db/repository.js` | select/insert/update `icon` |
| `public/liff/category-icons.mjs` (ใหม่) | รายชื่อไอคอนฝั่ง LIFF `{ key, label }` ตามลำดับในตาราง |
| `public/liff/categories.mjs` | หา key ไอคอนจากหมวด, badge พร้อมโทนสีตามประเภท |
| `public/liff/index.html` | sprite symbol ใหม่, ปุ่มเข้าหน้าหมวด, panel หมวด, sheet, ปุ่มย้อนกลับ; ลบส่วนเดิมในโปรไฟล์และ `#category-dialog` |
| `public/liff/style.css` | สไตล์หน้าหมวด, sheet, โทน badge; ลบสไตล์ส่วนจัดการหมวดเดิม |
| `public/liff/categories-panel.mjs` | เขียนใหม่: หน้าแบบ A + sheet |
| `public/liff/categories-format.mjs` | ข้อความ `Invalid icon` |
| `public/liff/tabs.mjs` | `select(id, { force })` |
| `public/liff/app.mjs` | badge ใช้ไอคอนของผู้ใช้, เข้า/ออกหน้าหมวด, wiring panel ใหม่ |

---

### Task 1: Branch และ migration `018_category_icon.sql`

**Depends on:** none

**Files:**
- Create: `supabase/018_category_icon.sql`
- Modify: `supabase/schema.sql:1` (หัวไฟล์)
- Test: `src/db/sql-functions.test.js` (`MIGRATIONS` และ describe ใหม่ก่อน `describe('function permissions'`)
- Also commits: `work-memory/STATE.md` (แก้ค้างอยู่บน main)

**Interfaces:**
- Produces: คอลัมน์ `public.categories.icon text null` + constraint `categories_icon_format` (`icon is null or icon ~ '^[a-z]{2,20}$'`)

- [ ] **Step 1: commit STATE ที่ค้างบน main แล้วแตก branch**

```bash
git checkout main
git add work-memory/STATE.md
git commit -m "docs: record the custom categories push in STATE

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014ArNrjZ5mrVWNCqmZkKcsc"
git checkout -b feat/category-icons
```

Expected: `git status --short` ว่าง, `git branch --show-current` = `feat/category-icons`

- [ ] **Step 2: เขียน test ที่ fail**

ใน `src/db/sql-functions.test.js` เพิ่มบรรทัดใน `MIGRATIONS` หลัง `'017_category_hidden.sql',`:

```js
  '018_category_icon.sql',
```

แล้วเพิ่ม describe นี้ก่อน `describe('function permissions', () => {`:

```js
describe('018_category_icon.sql', () => {
  it('adds icon to categories, empty by default', async () => {
    const user = await createUser('U1');
    const food = await createCategory(user, 'อาหาร', 'expense');

    expect((await one('select icon from categories where id = $1', [food])).icon).toBeNull();

    await db.query('update categories set icon = $2 where id = $1', [food, 'coffee']);
    expect((await one('select icon from categories where id = $1', [food])).icon).toBe('coffee');
  });

  it('refuses an icon that is not a lowercase key', async () => {
    const user = await createUser('U1');
    const food = await createCategory(user, 'อาหาร', 'expense');

    await db.exec('savepoint bad_icon');
    await expect(db.query('update categories set icon = $2 where id = $1', [food, 'Bad Icon'])).rejects.toThrow('categories_icon_format');
    await db.exec('rollback to savepoint bad_icon');
  });

  it('can run again without failing', async () => {
    await expect(db.exec(readMigration('018_category_icon.sql'))).resolves.toBeDefined();
  });
});
```

- [ ] **Step 3: รัน test ให้เห็นว่า fail**

Run: `npx vitest run src/db/sql-functions.test.js`
Expected: FAIL (ENOENT อ่าน `018_category_icon.sql` ไม่ได้ ทุก test ใน file ถูก skip)

- [ ] **Step 4: เขียน migration**

`supabase/018_category_icon.sql`:

```sql
-- รันใน Supabase SQL Editor ต่อจาก 017 ก่อน push โค้ดที่ให้ผู้ใช้เลือกไอคอนหมวด รันซ้ำได้
-- null = ใช้ไอคอนตั้งต้นตามชื่อหมวด ส่วนรายชื่อไอคอนที่ใช้ได้ server ตรวจเอง เพิ่มไอคอนใหม่จะได้ไม่ต้องแก้ SQL

alter table public.categories add column if not exists icon text;

alter table public.categories drop constraint if exists categories_icon_format;
alter table public.categories add constraint categories_icon_format check (icon is null or icon ~ '^[a-z]{2,20}$');
```

ใน `supabase/schema.sql` บรรทัดแรก แทนข้อความ

```
015_bill_invariants.sql และ 017_category_hidden.sql ต่อตามลำดับ (ไม่มี 016 เพราะถูกถอยออก)
```

ด้วย

```
015_bill_invariants.sql, 017_category_hidden.sql และ 018_category_icon.sql ต่อตามลำดับ (ไม่มี 016 เพราะถูกถอยออก)
```

- [ ] **Step 5: รัน test ให้ผ่าน**

Run: `npx vitest run src/db/sql-functions.test.js`
Expected: PASS ทั้ง file รวม 3 test ใหม่ของ 018

- [ ] **Step 6: Commit**

```bash
git add supabase/018_category_icon.sql supabase/schema.sql src/db/sql-functions.test.js
git commit -m "feat: add an icon column to categories

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014ArNrjZ5mrVWNCqmZkKcsc"
```

---

### Task 2: รายชื่อไอคอนฝั่ง server และการตรวจ `icon`

**Depends on:** Task 1

**Files:**
- Modify: `src/parser/categories.js`
- Modify: `src/api/validate.js`
- Test: `src/parser/categories.test.js`, `src/api/validate.test.js`

**Interfaces:**
- Produces: `CATEGORY_ICONS: string[]` (36 key ตามลำดับด้านล่าง) export จาก `src/parser/categories.js`
- Produces: `validateCategoryCreate(body)` คืน `value: { type, name }` และมี `icon` เฉพาะเมื่อ body ส่ง `icon` มา; `validateCategoryUpdate(body)` รับ `icon` (string ในรายชื่อ หรือ `null`); ค่าผิดคืน `{ ok: false, error: 'Invalid icon' }`

- [ ] **Step 1: เขียน test ที่ fail**

ท้าย `src/parser/categories.test.js` (เพิ่ม `CATEGORY_ICONS` ใน import จาก `./categories` ที่มีอยู่แล้วบนสุดของไฟล์):

```js
describe('CATEGORY_ICONS', () => {
  it('lists 36 unique lowercase keys that fit the database check', () => {
    expect(CATEGORY_ICONS).toHaveLength(36);
    expect(new Set(CATEGORY_ICONS).size).toBe(36);
    for (const key of CATEGORY_ICONS) expect(key).toMatch(/^[a-z]{2,20}$/);
  });

  it('keeps the icons of the default categories', () => {
    for (const key of ['food', 'transport', 'shopping', 'bill', 'health', 'fun', 'salary', 'side', 'receipt', 'other']) {
      expect(CATEGORY_ICONS).toContain(key);
    }
  });
});
```

ใน `src/api/validate.test.js` เพิ่มใน `describe('validateCategoryCreate'`:

```js
  it('accepts a known icon and leaves icon out when it is not sent', () => {
    expect(validateCategoryCreate({ type: 'expense', name: 'กาแฟ', icon: 'coffee' })).toEqual({
      ok: true,
      value: { type: 'expense', name: 'กาแฟ', icon: 'coffee' },
    });
    expect(validateCategoryCreate({ type: 'expense', name: 'กาแฟ' }).value).not.toHaveProperty('icon');
  });

  it.each([['unicorn'], [''], [42], ['Coffee']])('rejects the icon %j', (icon) => {
    expect(validateCategoryCreate({ type: 'expense', name: 'กาแฟ', icon })).toEqual({ ok: false, error: 'Invalid icon' });
  });
```

และใน `describe('validateCategoryUpdate'`:

```js
  it('accepts a known icon, and null to go back to the default icon', () => {
    expect(validateCategoryUpdate({ icon: 'pet' })).toEqual({ ok: true, value: { icon: 'pet' } });
    expect(validateCategoryUpdate({ icon: null })).toEqual({ ok: true, value: { icon: null } });
    expect(validateCategoryUpdate({ name: 'แมว', icon: 'pet', hidden: false })).toEqual({
      ok: true,
      value: { name: 'แมว', hidden: false, icon: 'pet' },
    });
  });

  it('rejects an unknown icon', () => {
    expect(validateCategoryUpdate({ icon: 'unicorn' })).toEqual({ ok: false, error: 'Invalid icon' });
  });
```

- [ ] **Step 2: รัน test ให้เห็นว่า fail**

Run: `npx vitest run src/parser/categories.test.js src/api/validate.test.js`
Expected: FAIL (`CATEGORY_ICONS` undefined, validator ไม่รู้จัก `icon`)

- [ ] **Step 3: เขียนโค้ด**

`src/parser/categories.js` เพิ่มหลัง `const MAX_TOTAL_CATEGORIES = 100;`:

```js
// ไอคอนที่ผู้ใช้เลือกให้หมวดได้ ต้องตรงกับ public/liff/category-icons.mjs (มีเทสต์ผูกไว้)
const CATEGORY_ICONS = [
  'food', 'coffee', 'shopping', 'grocery', 'clothes', 'beauty', 'pet', 'gift',
  'bill', 'home', 'electric', 'water', 'internet', 'phone', 'insurance', 'tax',
  'transport', 'car', 'fuel', 'travel', 'health', 'medicine', 'fitness', 'family',
  'fun', 'game', 'music', 'education', 'donation', 'receipt', 'other',
  'salary', 'side', 'savings', 'bonus', 'sale',
];
```

และเพิ่ม `CATEGORY_ICONS,` ใน `module.exports` ต่อจาก `MAX_TOTAL_CATEGORIES,`

`src/api/validate.js`: ใน require จาก `../parser/categories` ที่มีอยู่ (บรรทัดที่ดึง `MAX_CATEGORY_NAME_LENGTH, isReservedCategoryName`) เพิ่ม `CATEGORY_ICONS` แล้วเพิ่มฟังก์ชันนี้ก่อน `function validateCategoryCreate`:

```js
// null แปลว่ากลับไปใช้ไอคอนตั้งต้นตามชื่อหมวด
function isValidIcon(value) {
  return value === null || CATEGORY_ICONS.includes(value);
}
```

แทน `validateCategoryCreate` ทั้งฟังก์ชันด้วย:

```js
function validateCategoryCreate(body) {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Invalid body' };
  }
  if (body.type !== 'expense' && body.type !== 'income') {
    return { ok: false, error: 'Invalid type' };
  }
  const name = validateCategoryName(body.name);
  if (!name.ok) return name;
  const value = { type: body.type, name: name.value };
  if (body.icon !== undefined) {
    if (!isValidIcon(body.icon)) {
      return { ok: false, error: 'Invalid icon' };
    }
    value.icon = body.icon;
  }
  return { ok: true, value };
}
```

ใน `validateCategoryUpdate` เพิ่มก่อนบรรทัด `if (Object.keys(value).length === 0) {`:

```js
  if (body.icon !== undefined) {
    if (!isValidIcon(body.icon)) {
      return { ok: false, error: 'Invalid icon' };
    }
    value.icon = body.icon;
  }
```

- [ ] **Step 4: รัน test ให้ผ่าน**

Run: `npx vitest run src/parser/categories.test.js src/api/validate.test.js`
Expected: PASS ทั้งสองไฟล์ รวม test ใหม่

- [ ] **Step 5: Commit**

```bash
git add src/parser/categories.js src/parser/categories.test.js src/api/validate.js src/api/validate.test.js
git commit -m "feat: validate the category icon against a fixed list

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014ArNrjZ5mrVWNCqmZkKcsc"
```

---

### Task 3: repository อ่านและเขียน `icon`

**Depends on:** Task 1

**Files:**
- Modify: `src/db/repository.js` (`CATEGORY_COLUMNS`, `toCategory`, `createCategory`, `updateCategory`)
- Test: `src/db/repository.test.js`

**Interfaces:**
- Produces: `listCategories(userId)` / `createCategory` / `updateCategory` คืนหมวด `{ id, name, type, hidden, icon }` (`icon` = string หรือ `null`); `createCategory(userId, { type, name, icon? })` ใส่ `icon` เฉพาะเมื่อส่งมา; `updateCategory(userId, id, { name?, hidden?, icon? })` ส่ง `icon` เมื่อไม่ใช่ `undefined` (`null` ส่งได้)

- [ ] **Step 1: แก้ test เดิมและเขียน test ใหม่ที่ fail**

ใน `src/db/repository.test.js`:

1. ทุกที่ที่เป็น `['select', 'id, name, type, hidden']` ในสาม describe `repository.listCategories`, `repository.createCategory`, `repository.updateCategory` เปลี่ยนเป็น `['select', 'id, name, type, hidden, icon']`
2. fixture ของ row หมวดในสาม describe นั้นเพิ่ม `icon: null`:
   - `listCategories`: `data: [{ id: 'c1', name: 'อาหาร', type: 'expense', hidden: false, icon: null }]` และค่าที่คาด `[{ id: 'c1', name: 'อาหาร', type: 'expense', hidden: false, icon: null }]`
   - `createCategory`: `const row = { id: 'c9', name: 'ค่าแมว', type: 'expense', hidden: false, icon: null };`
   - `updateCategory`: `const row = { id: 'c9', name: 'แมว', type: 'expense', hidden: false, icon: null };`

เพิ่ม test ใหม่:

```js
describe('repository category icons', () => {
  it('reads a missing icon as null', async () => {
    const { supabase } = fakeSupabase({ data: [{ id: 'c1', name: 'อาหาร', type: 'expense', hidden: false }], error: null });

    expect((await createRepository(supabase).listCategories('user-1'))[0].icon).toBeNull();
  });

  it('inserts the icon when one is given', async () => {
    const row = { id: 'c9', name: 'กาแฟ', type: 'expense', hidden: false, icon: 'coffee' };
    const { supabase, calls } = fakeSupabase({ data: row, error: null });

    const result = await createRepository(supabase).createCategory('user-1', { type: 'expense', name: 'กาแฟ', icon: 'coffee' });

    expect(result).toEqual({ status: 'ok', category: row });
    expect(calls[1]).toEqual(['insert', { user_id: 'user-1', type: 'expense', name: 'กาแฟ', icon: 'coffee' }]);
  });

  it('sends the icon, including null to reset it', async () => {
    const row = { id: 'c9', name: 'แมว', type: 'expense', hidden: false, icon: null };
    const first = fakeSupabase({ data: [{ ...row, icon: 'pet' }], error: null });
    await createRepository(first.supabase).updateCategory('user-1', 'c9', { icon: 'pet' });
    expect(first.calls[1]).toEqual(['update', { icon: 'pet' }]);

    const second = fakeSupabase({ data: [row], error: null });
    await createRepository(second.supabase).updateCategory('user-1', 'c9', { icon: null });
    expect(second.calls[1]).toEqual(['update', { icon: null }]);
  });
});
```

- [ ] **Step 2: รัน test ให้เห็นว่า fail**

Run: `npx vitest run src/db/repository.test.js`
Expected: FAIL (select ยังไม่มี `icon`, insert/update ไม่ส่ง `icon`)

- [ ] **Step 3: เขียนโค้ด**

`src/db/repository.js`:

```js
const CATEGORY_COLUMNS = 'id, name, type, hidden, icon';
```

```js
function toCategory(row) {
  return { id: row.id, name: row.name, type: row.type, hidden: row.hidden, icon: row.icon ?? null };
}
```

แทนส่วนต้นของ `createCategory`:

```js
  async function createCategory(userId, { type, name, icon }) {
    const row = { user_id: userId, type, name };
    if (icon !== undefined) row.icon = icon;
    const { data, error } = await supabase
      .from('categories')
      .insert(row)
      .select(CATEGORY_COLUMNS)
      .single();
```

(ส่วนที่เหลือของฟังก์ชันคงเดิม)

ใน `updateCategory` เพิ่มหลัง `if (fields.hidden !== undefined) changes.hidden = fields.hidden;`:

```js
    if (fields.icon !== undefined) changes.icon = fields.icon;
```

- [ ] **Step 4: รัน test ให้ผ่าน**

Run: `npx vitest run src/db/repository.test.js`
Expected: PASS ทั้งไฟล์

- [ ] **Step 5: Commit**

```bash
git add src/db/repository.js src/db/repository.test.js
git commit -m "feat: read and write the category icon

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014ArNrjZ5mrVWNCqmZkKcsc"
```

---

### Task 4: API ส่งต่อ `icon` (test เท่านั้น)

**Depends on:** Task 2, Task 3

**Files:**
- Test: `src/api/router.test.js` (describe `'categories API'`)

**Interfaces:**
- Consumes: validator จาก Task 2, repository จาก Task 3; `src/api/router.js` ไม่ต้องแก้ เพราะส่ง `result.value` ต่อให้ repository ทั้งก้อนอยู่แล้ว และหมวดระบบถูกปฏิเสธทุกการแก้ที่ router.js (`isSystemCategory` ก่อน update)

- [ ] **Step 1: เขียน test**

เพิ่มใน `describe('categories API', () => {` (ใช้ `withCategories`, `start`, `call`, `CAT`, `CAT_ID`, `OTHER`, `OTHER_ID` ที่มีอยู่):

```js
  it('creates a category with the picked icon', async () => {
    const deps = withCategories([OTHER]);
    const base = await start(deps);

    const res = await call(base, '/categories', { method: 'POST', body: { type: 'expense', name: 'กาแฟ', icon: 'coffee' } });

    expect(res.status).toBe(201);
    expect(deps.repository.createCategory).toHaveBeenCalledWith('user-1', { type: 'expense', name: 'กาแฟ', icon: 'coffee' });
  });

  it('refuses an unknown icon', async () => {
    const deps = withCategories([OTHER, CAT]);
    const base = await start(deps);

    const created = await call(base, '/categories', { method: 'POST', body: { type: 'expense', name: 'กาแฟ', icon: 'unicorn' } });
    const patched = await call(base, `/categories/${CAT_ID}`, { method: 'PATCH', body: { icon: 'unicorn' } });

    expect(created.status).toBe(400);
    expect(await created.json()).toEqual({ error: 'Invalid icon' });
    expect(patched.status).toBe(400);
    expect(await patched.json()).toEqual({ error: 'Invalid icon' });
    expect(deps.repository.createCategory).not.toHaveBeenCalled();
    expect(deps.repository.updateCategory).not.toHaveBeenCalled();
  });

  it('changes only the icon of a category', async () => {
    const deps = withCategories([OTHER, CAT]);
    const base = await start(deps);

    const res = await call(base, `/categories/${CAT_ID}`, { method: 'PATCH', body: { icon: 'pet' } });

    expect(res.status).toBe(200);
    expect(deps.repository.updateCategory).toHaveBeenCalledWith('user-1', CAT_ID, { icon: 'pet' });
  });

  it('refuses to change the icon of a system category', async () => {
    const deps = withCategories([OTHER, CAT]);
    const base = await start(deps);

    const res = await call(base, `/categories/${OTHER_ID}`, { method: 'PATCH', body: { icon: 'pet' } });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'System category' });
    expect(deps.repository.updateCategory).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: รัน test**

Run: `npx vitest run src/api/router.test.js`
Expected: PASS ทั้งไฟล์ (โค้ด router ผ่านอยู่แล้วเมื่อ Task 2-3 เสร็จ; ให้ยืนยันว่า test ใหม่แดงจริงโดยลบ `icon` ออกจาก `validateCategoryUpdate` ชั่วคราว แล้วคืนค่า และบันทึกผลใน report)

- [ ] **Step 3: Commit**

```bash
git add src/api/router.test.js
git commit -m "test: pin the category icon through the categories API

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014ArNrjZ5mrVWNCqmZkKcsc"
```

---

### Task 5: ไอคอนฝั่ง LIFF: รายชื่อ, sprite และ badge ตามประเภท

**Depends on:** Task 2

**Files:**
- Create: `public/liff/category-icons.mjs`
- Modify: `public/liff/categories.mjs`
- Modify: `public/liff/index.html` (เฉพาะ sprite: เพิ่ม symbol ก่อน `</svg>` ที่ปิด sprite)
- Modify: `public/liff/style.css` (เฉพาะโทน badge ท้ายไฟล์)
- Test: `public/liff/category-icons.test.mjs` (ใหม่), `public/liff/categories.test.mjs`, `public/liff/app.dom.test.mjs` (describe `'index.html static invariants'`)

**Interfaces:**
- Consumes: `CATEGORY_ICONS` จาก `src/parser/categories.js` (parity test)
- Produces: `CATEGORY_ICONS: { key: string, label: string }[]` และ `CATEGORY_ICON_KEYS: string[]` จาก `public/liff/category-icons.mjs`
- Produces: จาก `public/liff/categories.mjs`: `iconKeyFor(name, icon) -> string`, `effectiveIconKey(category) -> string`, `createCategoryBadge(doc, name, { icon = null, type = null } = {}) -> HTMLSpanElement` (class `cat-badge cat-<key>` และเพิ่ม `cat-tone-<type>` เมื่อ type เป็น `expense`/`income`); `categoryStyle(name)` คงเดิม
- Produces: sprite symbol `cat-<key>` ครบ 36 ตัว และ `icon-back`, `icon-plus`, `icon-lock`, `icon-eye-off`, `icon-categories`

- [ ] **Step 1: เขียน test ที่ fail**

`public/liff/category-icons.test.mjs`:

```js
import { describe, it, expect } from 'vitest';
import { CATEGORY_ICONS, CATEGORY_ICON_KEYS } from './category-icons.mjs';
import { CATEGORY_ICONS as SERVER_ICONS } from '../../src/parser/categories.js';

describe('CATEGORY_ICONS', () => {
  it('matches the list the server accepts, in the same order', () => {
    expect(CATEGORY_ICON_KEYS).toEqual(SERVER_ICONS);
  });

  it('gives every icon a Thai label for screen readers', () => {
    expect(CATEGORY_ICONS.map((icon) => icon.key)).toEqual(CATEGORY_ICON_KEYS);
    for (const icon of CATEGORY_ICONS) expect(icon.label.length).toBeGreaterThan(0);
    expect(CATEGORY_ICONS.find((icon) => icon.key === 'pet').label).toBe('สัตว์เลี้ยง');
  });
});
```

แทนเนื้อหา `public/liff/categories.test.mjs` ส่วน `describe('createCategoryBadge'` ด้วย (คง `describe('categoryStyle'` เดิม และแก้ import บรรทัดบนเป็น `import { categoryStyle, createCategoryBadge, iconKeyFor, effectiveIconKey } from './categories.mjs';`):

```js
describe('createCategoryBadge', () => {
  it('wraps the default icon of the category name in a badge', () => {
    const badge = createCategoryBadge(document, 'อาหาร');

    expect(badge.className).toBe('cat-badge cat-food');
    expect(badge.querySelector('use').getAttribute('href')).toBe('#cat-food');
  });

  it('uses the icon the user picked and the tone of the category type', () => {
    const badge = createCategoryBadge(document, 'ค่าแมว', { icon: 'pet', type: 'expense' });

    expect(badge.className).toBe('cat-badge cat-pet cat-tone-expense');
    expect(badge.querySelector('use').getAttribute('href')).toBe('#cat-pet');
    expect(createCategoryBadge(document, 'โบนัส', { icon: 'bonus', type: 'income' }).className).toBe('cat-badge cat-bonus cat-tone-income');
  });

  it('ignores an unknown icon or type', () => {
    expect(createCategoryBadge(document, 'อาหาร', { icon: 'unicorn', type: 'saving' }).className).toBe('cat-badge cat-food');
  });
});

describe('iconKeyFor and effectiveIconKey', () => {
  it('prefers a known picked icon, then the default of the name, then other', () => {
    expect(iconKeyFor('อาหาร', 'coffee')).toBe('coffee');
    expect(iconKeyFor('อาหาร', null)).toBe('food');
    expect(iconKeyFor('ค่าแมว', undefined)).toBe('other');
    expect(iconKeyFor('constructor', 'toString')).toBe('other');
    expect(effectiveIconKey({ name: 'เงินเดือน', icon: null })).toBe('salary');
    expect(effectiveIconKey({ name: 'เงินเดือน', icon: 'bonus' })).toBe('bonus');
  });
});
```

ใน `public/liff/app.dom.test.mjs` เพิ่ม import บนสุด `import { CATEGORY_ICON_KEYS } from './category-icons.mjs';` และเพิ่ม test ใน `describe('index.html static invariants'` ต่อจาก test `'defines a sprite symbol for every category icon'`:

```js
  it('defines a sprite symbol for every icon a user can pick and for the categories page', () => {
    const missing = CATEGORY_ICON_KEYS.map((key) => `cat-${key}`).filter((id) => !symbolIds.has(id));

    expect(missing).toEqual([]);
    expect(['icon-back', 'icon-plus', 'icon-lock', 'icon-eye-off', 'icon-categories'].filter((id) => !symbolIds.has(id))).toEqual([]);
  });
```

- [ ] **Step 2: รัน test ให้เห็นว่า fail**

Run: `npx vitest run public/liff/category-icons.test.mjs public/liff/categories.test.mjs public/liff/app.dom.test.mjs`
Expected: FAIL (ไม่มี `category-icons.mjs`, badge ไม่รับ options, ไม่มี symbol ใหม่)

- [ ] **Step 3: เขียน `public/liff/category-icons.mjs`**

```js
// ลำดับคือลำดับในตารางเลือกไอคอน ต้องตรงกับ CATEGORY_ICONS ใน src/parser/categories.js (มีเทสต์ผูกไว้)
export const CATEGORY_ICONS = [
  { key: 'food', label: 'อาหาร' },
  { key: 'coffee', label: 'กาแฟ' },
  { key: 'shopping', label: 'ช้อปปิ้ง' },
  { key: 'grocery', label: 'ซูเปอร์' },
  { key: 'clothes', label: 'เสื้อผ้า' },
  { key: 'beauty', label: 'ความงาม' },
  { key: 'pet', label: 'สัตว์เลี้ยง' },
  { key: 'gift', label: 'ของขวัญ' },
  { key: 'bill', label: 'บิล' },
  { key: 'home', label: 'บ้าน' },
  { key: 'electric', label: 'ไฟฟ้า' },
  { key: 'water', label: 'น้ำประปา' },
  { key: 'internet', label: 'เน็ต' },
  { key: 'phone', label: 'มือถือ' },
  { key: 'insurance', label: 'ประกัน' },
  { key: 'tax', label: 'ภาษี' },
  { key: 'transport', label: 'เดินทาง' },
  { key: 'car', label: 'รถยนต์' },
  { key: 'fuel', label: 'น้ำมัน' },
  { key: 'travel', label: 'ท่องเที่ยว' },
  { key: 'health', label: 'สุขภาพ' },
  { key: 'medicine', label: 'ยา' },
  { key: 'fitness', label: 'ฟิตเนส' },
  { key: 'family', label: 'ครอบครัว' },
  { key: 'fun', label: 'บันเทิง' },
  { key: 'game', label: 'เกม' },
  { key: 'music', label: 'เพลง' },
  { key: 'education', label: 'การศึกษา' },
  { key: 'donation', label: 'ทำบุญ' },
  { key: 'receipt', label: 'ใบเสร็จ' },
  { key: 'other', label: 'อื่นๆ' },
  { key: 'salary', label: 'เงินเดือน' },
  { key: 'side', label: 'รายได้เสริม' },
  { key: 'savings', label: 'เงินออม' },
  { key: 'bonus', label: 'โบนัส' },
  { key: 'sale', label: 'ขายของ' },
];

export const CATEGORY_ICON_KEYS = CATEGORY_ICONS.map((icon) => icon.key);
```

- [ ] **Step 4: แก้ `public/liff/categories.mjs`**

แทนทั้งไฟล์ด้วย:

```js
import { createSvgIcon } from './icons.mjs';
import { CATEGORY_ICON_KEYS } from './category-icons.mjs';

// ใช้ Map เพราะชื่อหมวดมาจากผู้ใช้ ชื่ออย่าง constructor ต้องไม่หลุดไปเจอ property ของ Object
const CATEGORY_KEYS = new Map([
  ['อาหาร', 'food'],
  ['เดินทาง', 'transport'],
  ['ช้อปปิ้ง', 'shopping'],
  ['บิล/ค่าบริการ', 'bill'],
  ['สุขภาพ', 'health'],
  ['บันเทิง', 'fun'],
  ['เงินเดือน', 'salary'],
  ['รายได้เสริม', 'side'],
  ['ใบเสร็จ/สลิปโอนเงิน', 'receipt'],
  ['อื่นๆ', 'other'],
]);
const TONES = new Set(['expense', 'income']);

export function categoryStyle(name) {
  const key = CATEGORY_KEYS.get(name) ?? 'other';
  return { key, symbol: `cat-${key}`, className: `cat-${key}` };
}

// ไอคอนที่ผู้ใช้เลือกมาก่อน ถ้ายังไม่เลือกหรือไม่รู้จักใช้ไอคอนตั้งต้นตามชื่อหมวด
export function iconKeyFor(name, icon) {
  return CATEGORY_ICON_KEYS.includes(icon) ? icon : categoryStyle(name).key;
}

export function effectiveIconKey(category) {
  return iconKeyFor(category.name, category.icon);
}

// ไอคอนที่เลือกเองไม่บอกว่าเป็นรายรับหรือรายจ่าย จึงให้สีตามประเภทของหมวดเมื่อรู้
export function createCategoryBadge(doc, name, { icon = null, type = null } = {}) {
  const key = iconKeyFor(name, icon);
  const badge = doc.createElement('span');
  badge.className = TONES.has(type) ? `cat-badge cat-${key} cat-tone-${type}` : `cat-badge cat-${key}`;
  badge.append(createSvgIcon(doc, `cat-${key}`));
  return badge;
}
```

- [ ] **Step 5: เพิ่ม symbol ใน sprite ของ `public/liff/index.html`**

หา `  </svg>` ที่อยู่ติดก่อน `  <main id="app">` แล้วแทรกบล็อกนี้ก่อน `  </svg>` นั้น (path ตรงกับหน้า "ชุดไอคอน" ของ design):

```html
    <symbol id="cat-coffee" viewBox="0 0 24 24">
      <path d="M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5V9zM16 10h1.5a2.5 2.5 0 0 1 0 5H16M8 3.5v2.5M11 3.5v2.5M14 3.5v2.5" />
    </symbol>
    <symbol id="cat-grocery" viewBox="0 0 24 24">
      <path d="M3 4h2.5l2.2 10.5h10l2-7.5H6.5M9.5 19.5a1 1 0 1 0 0 .01M16.5 19.5a1 1 0 1 0 0 .01" />
    </symbol>
    <symbol id="cat-clothes" viewBox="0 0 24 24">
      <path d="M8 4l-4 3 2 3 2-1v11h8V9l2 1 2-3-4-3c-.5 1.5-2 2.5-4 2.5S8.5 5.5 8 4z" />
    </symbol>
    <symbol id="cat-beauty" viewBox="0 0 24 24">
      <path d="M6 4.5a2.5 2.5 0 1 1 0 5a2.5 2.5 0 1 1 0-5zM6 14.5a2.5 2.5 0 1 1 0 5a2.5 2.5 0 1 1 0-5zM8.2 8.3L19 15.5M8.2 15.7L19 8.5" />
    </symbol>
    <symbol id="cat-pet" viewBox="0 0 24 24">
      <path d="M12 13c-3 0-5 3-5 5a2 2 0 0 0 2 2c1.2 0 2-.6 3-.6s1.8.6 3 .6a2 2 0 0 0 2-2c0-2-2-5-5-5zM5 10a1.6 2 0 1 0 3.2 0a1.6 2 0 1 0-3.2 0zM15.8 10a1.6 2 0 1 0 3.2 0a1.6 2 0 1 0-3.2 0zM8.4 5.5a1.6 2 0 1 0 3.2 0a1.6 2 0 1 0-3.2 0zM12.4 5.5a1.6 2 0 1 0 3.2 0a1.6 2 0 1 0-3.2 0z" />
    </symbol>
    <symbol id="cat-gift" viewBox="0 0 24 24">
      <path d="M4 9h16v4H4zM5.5 13h13v7h-13zM12 9v11M12 9c-1.5-3-5-3.5-5-1.5S10 9 12 9zM12 9c1.5-3 5-3.5 5-1.5S14 9 12 9z" />
    </symbol>
    <symbol id="cat-home" viewBox="0 0 24 24">
      <path d="M4 11l8-7 8 7M6 9.5V20h12V9.5M10 20v-5h4v5" />
    </symbol>
    <symbol id="cat-electric" viewBox="0 0 24 24">
      <path d="M13 3L5 14h6l-1 7 8-11h-6l1-7z" />
    </symbol>
    <symbol id="cat-water" viewBox="0 0 24 24">
      <path d="M12 3.5s-6 6.5-6 10.5a6 6 0 0 0 12 0c0-4-6-10.5-6-10.5z" />
    </symbol>
    <symbol id="cat-internet" viewBox="0 0 24 24">
      <path d="M4 9.5a12 12 0 0 1 16 0M7 13a7.5 7.5 0 0 1 10 0M10 16.5a3 3 0 0 1 4 0M12 20h.01" />
    </symbol>
    <symbol id="cat-phone" viewBox="0 0 24 24">
      <path d="M8 3h8a1.5 1.5 0 0 1 1.5 1.5v15A1.5 1.5 0 0 1 16 21H8a1.5 1.5 0 0 1-1.5-1.5v-15A1.5 1.5 0 0 1 8 3zM11 18h2" />
    </symbol>
    <symbol id="cat-insurance" viewBox="0 0 24 24">
      <path d="M12 3l7 3v5.5c0 4.4-3 7.7-7 9.5-4-1.8-7-5.1-7-9.5V6l7-3zM9 12l2 2 4-4" />
    </symbol>
    <symbol id="cat-tax" viewBox="0 0 24 24">
      <path d="M7 3h7l4 4v14H7zM14 3v4h4M10 12h5M10 16h5" />
    </symbol>
    <symbol id="cat-car" viewBox="0 0 24 24">
      <path d="M5 16v-4l2-5h10l2 5v4M3 16h18M7.5 16v2.5M16.5 16v2.5M5 12h14M8 14h.01M16 14h.01" />
    </symbol>
    <symbol id="cat-fuel" viewBox="0 0 24 24">
      <path d="M5 20V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v15M4 20h12M7 8h6M15 9l3 2v6a1.5 1.5 0 0 0 3 0V9l-3-3" />
    </symbol>
    <symbol id="cat-travel" viewBox="0 0 24 24">
      <path d="M4 8h16v11H4zM9 8V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V8M9 8v11M15 8v11" />
    </symbol>
    <symbol id="cat-medicine" viewBox="0 0 24 24">
      <path d="M9.2 20.3l-5.5-5.5a3.5 3.5 0 0 1 5-5l5.5 5.5a3.5 3.5 0 0 1-5 5zM6.2 12.3l5.5 5.5M14 6l4 4M16 4l4 4" />
    </symbol>
    <symbol id="cat-fitness" viewBox="0 0 24 24">
      <path d="M3 10v4M6 8v8M18 8v8M21 10v4M6 12h12" />
    </symbol>
    <symbol id="cat-family" viewBox="0 0 24 24">
      <path d="M9 5a3 3 0 1 1 0 6a3 3 0 1 1 0-6zM3.5 20c0-3.3 2.5-5.5 5.5-5.5s5.5 2.2 5.5 5.5M16 6a2.5 2.5 0 1 1 0 5M16.5 14.5c2.4.4 4 2.4 4 5.5" />
    </symbol>
    <symbol id="cat-game" viewBox="0 0 24 24">
      <path d="M7 8h10a4 4 0 0 1 4 4v1a3 3 0 0 1-5.5 1.7L14.5 14h-5l-1 .7A3 3 0 0 1 3 13v-1a4 4 0 0 1 4-4zM8 10.5v3M6.5 12h3M15.5 11h.01M17.5 13h.01" />
    </symbol>
    <symbol id="cat-music" viewBox="0 0 24 24">
      <path d="M9 18V5l11-2v13M6 15a3 3 0 1 1 0 6a3 3 0 1 1 0-6zM17 13a3 3 0 1 1 0 6a3 3 0 1 1 0-6z" />
    </symbol>
    <symbol id="cat-education" viewBox="0 0 24 24">
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v15H5.5A1.5 1.5 0 0 0 4 20.5zM20 5.5A1.5 1.5 0 0 0 18.5 4H13v15h5.5a1.5 1.5 0 0 1 1.5 1.5z" />
    </symbol>
    <symbol id="cat-donation" viewBox="0 0 24 24">
      <path d="M12 8.5s-3-2.5-3-4.3A1.8 1.8 0 0 1 12 3a1.8 1.8 0 0 1 3 1.2c0 1.8-3 4.3-3 4.3zM3 14h3l3 6h7.5a2 2 0 0 0 1.7-1l2.3-4a1.5 1.5 0 0 0-2.4-1.7L16 15.5h-4" />
    </symbol>
    <symbol id="cat-savings" viewBox="0 0 24 24">
      <path d="M5 11a6 5 0 0 1 11.5-2H19v3l1.5.8v2.4L19 16h-1.5L16 19h-2.5l-.5-1.5H9L8.5 19H6l-.5-3A5 5 0 0 1 5 11zM16 11.5h.01" />
    </symbol>
    <symbol id="cat-bonus" viewBox="0 0 24 24">
      <path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />
    </symbol>
    <symbol id="cat-sale" viewBox="0 0 24 24">
      <path d="M3 9l1.5-5h15L21 9M3 9h18M3 9a3 3 0 0 0 6 0a3 3 0 0 0 6 0a3 3 0 0 0 6 0M5 12v8h14v-8M10 20v-4h4v4" />
    </symbol>
    <symbol id="icon-back" viewBox="0 0 24 24">
      <path d="M15 5l-7 7 7 7" />
    </symbol>
    <symbol id="icon-plus" viewBox="0 0 24 24">
      <path d="M12 5v14M5 12h14" />
    </symbol>
    <symbol id="icon-lock" viewBox="0 0 24 24">
      <path d="M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3" />
    </symbol>
    <symbol id="icon-eye-off" viewBox="0 0 24 24">
      <path d="M3 3l18 18M10.6 6.1A9.8 9.8 0 0 1 12 6c5 0 8.5 4 9.5 6a12.6 12.6 0 0 1-2.4 3.3M6.5 7.6A12.4 12.4 0 0 0 2.5 12c1 2 4.5 6 9.5 6a9.6 9.6 0 0 0 4.4-1.1M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </symbol>
    <symbol id="icon-categories" viewBox="0 0 24 24">
      <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM17 14v6M14 17h6" />
    </symbol>
```

(หมายเหตุ: symbol `cat-food`, `cat-transport`, `cat-shopping`, `cat-bill`, `cat-health`, `cat-fun`, `cat-salary`, `cat-side`, `cat-receipt`, `cat-other` มีอยู่แล้ว ไม่ต้องแก้)

- [ ] **Step 6: เพิ่มโทน badge ท้าย `public/liff/style.css`**

```css
/* อยู่ท้ายไฟล์เพื่อทับสีประจำไอคอน ไอคอนที่ผู้ใช้เลือกเองต้องใช้สีตามประเภทหมวด */
.cat-tone-expense { --cat-bg: var(--cat-food-bg); --cat-fg: var(--cat-food-fg); }
.cat-tone-income { --cat-bg: var(--cat-salary-bg); --cat-fg: var(--cat-salary-fg); }
```

- [ ] **Step 7: รัน test ให้ผ่าน**

Run: `npx vitest run public/liff/category-icons.test.mjs public/liff/categories.test.mjs public/liff/app.dom.test.mjs public/liff/style.test.mjs public/liff/tokens.test.mjs`
Expected: PASS ทั้งหมด

- [ ] **Step 8: Commit**

```bash
git add public/liff/category-icons.mjs public/liff/category-icons.test.mjs public/liff/categories.mjs public/liff/categories.test.mjs public/liff/index.html public/liff/style.css public/liff/app.dom.test.mjs
git commit -m "feat: add 36 category icons and a badge tone by category type

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014ArNrjZ5mrVWNCqmZkKcsc"
```

---

### Task 6: badge ในรายการ กราฟ และงบใช้ไอคอนที่ผู้ใช้เลือก

**Depends on:** Task 5

**Files:**
- Modify: `public/liff/app.mjs` (เพิ่ม `badgeFor`, แก้ 3 จุดที่เรียก `createCategoryBadge`)
- Test: `public/liff/app.dom.test.mjs` (describe ใหม่ `'LIFF category icons on rows'`)

**Interfaces:**
- Consumes: `createCategoryBadge(doc, name, { icon, type })` จาก Task 5; ตัวแปร `categories` ใน app.mjs (โหลดก่อน `loadMonth` ใน `loadAll`)
- Produces: `badgeFor(name, type)` (ฟังก์ชันภายใน app.mjs) ให้ Task 8 ใช้ต่อไม่ได้ (panel ใช้ `createCategoryBadge` ตรง)

- [ ] **Step 1: เขียน test ที่ fail**

เพิ่มท้าย `public/liff/app.dom.test.mjs`:

```js
describe('LIFF category icons on rows', () => {
  const WITH_ICON = { categories: [{ ...CATEGORIES[0], icon: 'coffee' }, ...CATEGORIES.slice(1)] };

  it('shows the icon the user picked on list rows, the chart and the budgets', async () => {
    await boot({ overrides: { '/api/categories': WITH_ICON } });

    const row = [...document.querySelectorAll('#list .row')].find((item) => item.textContent.includes('ข้าวมันไก่'));
    expect(row.querySelector('.cat-badge use').getAttribute('href')).toBe('#cat-coffee');
    expect(row.querySelector('.cat-badge').classList.contains('cat-tone-expense')).toBe(true);
    expect(byId('chart-rows').querySelector('.cat-badge use').getAttribute('href')).toBe('#cat-coffee');
    expect(byId('budget-rows').querySelector('.cat-badge use').getAttribute('href')).toBe('#cat-coffee');
  });

  it('keeps the default icon and uses the income tone for income rows', async () => {
    await boot();

    const salary = [...document.querySelectorAll('#list .row')].find((item) => item.textContent.includes('เงินเดือน'));
    expect(salary.querySelector('.cat-badge use').getAttribute('href')).toBe('#cat-salary');
    expect(salary.querySelector('.cat-badge').classList.contains('cat-tone-income')).toBe(true);
  });
});
```

- [ ] **Step 2: รัน test ให้เห็นว่า fail**

Run: `npx vitest run public/liff/app.dom.test.mjs -t "LIFF category icons on rows"`
Expected: FAIL (ยังเป็น `#cat-food` และไม่มี class `cat-tone-*`)

- [ ] **Step 3: เขียนโค้ดใน `public/liff/app.mjs`**

เพิ่มฟังก์ชันนี้ก่อน `// ใช้ textContent ทุกจุดเพราะโน้ตมาจากข้อความที่ผู้ใช้พิมพ์` (เหนือ `function renderRow(item) {`):

```js
// ไอคอนที่ผู้ใช้เลือกอยู่ที่หมวด ส่วนแถวรายการ กราฟ และงบรู้แค่ชื่อกับประเภท จึงหาจากหมวดที่โหลดไว้
function badgeFor(name, type) {
  const category = categories.find((item) => item.type === type && item.name === name);
  return createCategoryBadge(document, name, { icon: category ? category.icon : null, type });
}
```

แทน

```js
  button.append(createCategoryBadge(document, item.categoryName), text, amount);
```

ด้วย

```js
  button.append(badgeFor(item.categoryName, item.type), text, amount);
```

แทน

```js
    label.className = 'chart-label chart-label-wrap';
    const labelText = document.createElement('span');
    labelText.textContent = row.category;
    label.append(createCategoryBadge(document, row.category), labelText);
```

ด้วย

```js
    label.className = 'chart-label chart-label-wrap';
    const labelText = document.createElement('span');
    labelText.textContent = row.category;
    label.append(badgeFor(row.category, chartType), labelText);
```

แทน

```js
    label.className = 'budget-label budget-label-wrap';
    const labelText = document.createElement('span');
    labelText.textContent = row.category;
    label.append(createCategoryBadge(document, row.category), labelText);
```

ด้วย

```js
    label.className = 'budget-label budget-label-wrap';
    const labelText = document.createElement('span');
    labelText.textContent = row.category;
    // งบมีเฉพาะหมวดรายจ่าย
    label.append(badgeFor(row.category, 'expense'), labelText);
```

- [ ] **Step 4: รัน test ให้ผ่าน**

Run: `npx vitest run public/liff/app.dom.test.mjs`
Expected: PASS ทั้งไฟล์ (test เดิมที่คาด `#cat-food` ยังผ่าน เพราะ fixture เดิมไม่มี icon)

- [ ] **Step 5: Commit**

```bash
git add public/liff/app.mjs public/liff/app.dom.test.mjs
git commit -m "feat: show the picked category icon on rows, chart and budgets

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014ArNrjZ5mrVWNCqmZkKcsc"
```

---

### Task 7: tab controller เลือกแท็บเดิมซ้ำได้เมื่อสั่ง force

**Depends on:** none

**Files:**
- Modify: `public/liff/tabs.mjs`
- Test: `public/liff/tabs.test.mjs`

**Interfaces:**
- Produces: `tabController.select(id, { force = false } = {})` ถ้า `force` เป็น true แสดง panel ตั้ง title/เดือน และเรียก `onChange` แม้เป็นแท็บปัจจุบัน

- [ ] **Step 1: เขียน test ที่ fail**

เพิ่มใน `describe('createTabController'` ของ `public/liff/tabs.test.mjs`:

```js
  it('shows the current tab again when forced, for coming back from a sub page', () => {
    ctx.controller.select('budgets');
    ctx.onChange.mockClear();
    for (const [, panel] of ctx.panels) panel.hidden = true;
    ctx.titleEl.textContent = 'หน้าอื่น';

    ctx.controller.select('budgets', { force: true });

    expect([...ctx.panels].filter(([, panel]) => !panel.hidden).map(([id]) => id)).toEqual(['budgets']);
    expect(ctx.titleEl.textContent).toBe(findTab('budgets').title);
    expect(ctx.onChange).toHaveBeenCalledWith('budgets');
  });
```

- [ ] **Step 2: รัน test ให้เห็นว่า fail**

Run: `npx vitest run public/liff/tabs.test.mjs`
Expected: FAIL (select คืนค่าทันทีเมื่อเป็นแท็บเดิม)

- [ ] **Step 3: เขียนโค้ด**

ใน `public/liff/tabs.mjs` แทน

```js
  function select(id) {
    const tab = findTab(id);
    if (tab.id === current) return;
```

ด้วย

```js
  // force ใช้ตอนกลับจากหน้าย่อยที่ซ่อน panel ของแท็บปัจจุบันไป
  function select(id, { force = false } = {}) {
    const tab = findTab(id);
    if (tab.id === current && !force) return;
```

- [ ] **Step 4: รัน test ให้ผ่าน**

Run: `npx vitest run public/liff/tabs.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add public/liff/tabs.mjs public/liff/tabs.test.mjs
git commit -m "feat: let the tab controller show the current tab again

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014ArNrjZ5mrVWNCqmZkKcsc"
```

---

### Task 8: หน้าหมวดของฉันแบบ A และ bottom sheet เลือกไอคอน

**Depends on:** Task 4, Task 6, Task 7

**Files:**
- Modify: `public/liff/index.html` (ปุ่มย้อนกลับใน bar, ปุ่มเข้าหน้าหมวดใต้ `#budgets`, `#panel-categories`, `#category-sheet`; ลบ `#categories-manager` และ `#category-dialog`)
- Modify: `public/liff/style.css` (ลบกฎของส่วนจัดการหมวดเดิม เพิ่มกฎหน้าใหม่)
- Modify: `public/liff/categories-panel.mjs` (เขียนใหม่ทั้งไฟล์)
- Modify: `public/liff/categories-format.mjs` (`Invalid icon`)
- Modify: `public/liff/app.mjs` (els, wiring panel, `setCategories`, เข้า/ออกหน้า)
- Test: `public/liff/categories-format.test.mjs`, `public/liff/app.dom.test.mjs` (แทน describe `'LIFF category manager'` ทั้งก้อน, แก้รายการ id ที่ซ่อนตอนเริ่ม)

**Interfaces:**
- Consumes: `createCategoryBadge`, `effectiveIconKey` (Task 5), `CATEGORY_ICONS` (Task 5), `tabController.select(id, { force })` (Task 7), API `POST/PATCH /api/categories` รับ `icon` (Task 2-4), `api.createCategory(body)`, `api.updateCategory(id, body)` (มีอยู่แล้วใน `public/liff/api.mjs`)
- Produces: `createCategoriesPanel({ doc, els, getApi, getCategories, onChanged }) -> { render }` โดย `onChanged(next, { refresh })`; DOM ids: `categories-open`, `page-back`, `panel-categories`, `category-seg-expense`, `category-seg-income`, `category-status`, `category-tiles`, `category-hidden-toggle`, `category-hidden-text`, `category-hidden-tiles`, `category-sheet`, `category-sheet-form`, `category-sheet-title`, `category-sheet-close`, `category-sheet-preview`, `category-sheet-name`, `category-sheet-icons`, `category-sheet-hidden-row`, `category-sheet-hidden`, `category-sheet-error`, `category-sheet-cancel`, `category-sheet-save`

**Browser check:**
- Preconditions: รัน `supabase/018_category_icon.sql` ใน Supabase แล้ว, deploy branch นี้ (หรือชี้ LIFF Endpoint ไปที่ tunnel ของเครื่อง), มีบัญชี LINE ที่เปิดหน้าเว็บผ่าน LIFF ได้ (hawk เปิดไม่ได้เพราะต้อง login LINE ผู้ใช้ทำเองในแอป)
- Base URL: ลิงก์ LIFF ของบอท (`https://liff.line.me/<LIFF_ID>`) เปิดจากแอป LINE

| # | Action | Expected |
|---|---|---|
| 1 | แตะแท็บ "จัดการงบ" แล้วเลื่อนลงล่างสุด | ปุ่มขอบน้ำเงินเต็มความกว้าง "เพิ่มหมวดของฉัน" และข้อความ "เพิ่ม เปลี่ยนชื่อ เลือกไอคอน หรือซ่อนหมวด" |
| 2 | แตะ "เพิ่มหมวดของฉัน" | หัวหน้าเป็น "หมวดของฉัน" มีปุ่มลูกศรย้อนกลับ แถบเมนูล่างหายไป เห็นปุ่ม "รายจ่าย · N" "รายรับ · N" และการ์ด 3 คอลัมน์ การ์ดสุดท้ายเป็นเส้นประ "เพิ่มหมวด" |
| 3 | ดูการ์ด "อื่นๆ" และ "ใบเสร็จ/สลิปโอนเงิน" แล้วแตะ | มีรูปกุญแจมุมขวาบน แตะแล้วไม่มีอะไรเปิด |
| 4 | แตะการ์ด "อาหาร" | sheet เลื่อนขึ้นจากล่าง หัวข้อ "แก้หมวด" ช่องชื่อเป็น "อาหาร" ไอคอนอาหารถูกเลือก (พื้นน้ำเงิน) มีสวิตช์ "ซ่อนหมวดนี้" |
| 5 | เลือกไอคอนกาแฟ แล้วกด "บันทึก" | sheet ปิด การ์ดอาหารเป็นไอคอนกาแฟ ข้อความ "บันทึกหมวด อาหาร แล้ว" |
| 6 | กดย้อนกลับ แล้วไปแท็บรายการ และแท็บสรุป | รายการหมวดอาหารและแถวกราฟอาหารใช้ไอคอนกาแฟ โทนน้ำเงิน |
| 7 | กลับเข้าหน้าหมวด แตะ "เพิ่มหมวด" พิมพ์ "ค่าแมว" เลือกไอคอนสัตว์เลี้ยง กด "บันทึก" | sheet หัวข้อ "เพิ่มหมวดรายจ่าย" ไม่มีสวิตช์ซ่อน หลังบันทึกการ์ด "ค่าแมว" พร้อมไอคอนสัตว์เลี้ยงขึ้นก่อนการ์ดเพิ่มหมวด |
| 8 | แตะ "รายรับ" แล้วเพิ่มหมวด "โบนัส" ไอคอนดาว | การ์ดโบนัสโทนเขียว |
| 9 | แตะการ์ด "ค่าแมว" เปิดสวิตช์ซ่อน กด "บันทึก" | การ์ดหายจากตาราง แถว "ซ่อนอยู่ 1 หมวด" ปรากฏ แตะแล้วกางเห็นการ์ดค่าแมว |
| 10 | เพิ่มหมวดชื่อ "อาหาร" ซ้ำ | sheet ยังเปิดอยู่ ข้อความแดง "มีหมวดชื่อนี้อยู่แล้ว" |
| 11 | แท็บโปรไฟล์ | ไม่มีส่วน "หมวดของฉัน" แล้ว |
| 12 | บน iPhone แตะช่องชื่อใน sheet | หน้าไม่ซูม |

- [ ] **Step 1: เขียน test ที่ fail**

`public/liff/categories-format.test.mjs` เพิ่มแถวในตาราง `it.each` ที่มีอยู่ (ถ้าไฟล์ใช้ตารางแบบ `[status, error, message]`) หรือเพิ่ม test นี้:

```js
it('explains an unknown icon', () => {
  expect(describeCategoryError(400, 'Invalid icon')).toBe('เลือกไอคอนจากรายการที่มีให้');
});
```

ใน `public/liff/app.dom.test.mjs`:

1. ในรายการ `ids` ของ test "hidden by default" (describe `'index.html static invariants'`) แทน `'categories-manager',` ด้วย:

```js
      'panel-categories',
      'page-back',
      'category-hidden-toggle',
      'category-hidden-tiles',
```

2. แทน describe `'LIFF category manager'` ทั้งก้อน (ตั้งแต่ `describe('LIFF category manager', () => {` จนถึง `});` ก่อน `describe('LIFF bill form with a hidden category'`) ด้วย:

```js
describe('LIFF categories page', () => {
  const MANAGED = [
    { id: 'c-food', name: 'อาหาร', type: 'expense', hidden: false, system: false, icon: null },
    { id: 'c-trip', name: 'เดินทาง', type: 'expense', hidden: true, system: false, icon: null },
    { id: 'c-cat', name: 'ค่าแมว', type: 'expense', hidden: false, system: false, icon: 'pet' },
    { id: 'c-other', name: 'อื่นๆ', type: 'expense', hidden: false, system: true, icon: null },
    { id: 'c-salary', name: 'เงินเดือน', type: 'income', hidden: false, system: false, icon: null },
  ];

  // หยุด boot ที่ liff.init เพื่อให้ route ใช้กับการโหลดหมวดครั้งแรกด้วย และเก็บ body ที่ส่งไว้ตรวจ
  async function openPage(route = () => undefined) {
    const liff = await boot({ holdInit: true });
    const calls = [];
    const bodies = [];
    const fallback = makeFetch({});
    vi.stubGlobal('fetch', async (url, options = {}) => {
      const path = new URL(url, 'http://localhost').pathname;
      const method = options.method ?? 'GET';
      calls.push(`${method} ${path}`);
      if (options.body) bodies.push({ call: `${method} ${path}`, body: JSON.parse(options.body) });
      const routed = route(method, path);
      const override = routed !== undefined ? routed : method === 'GET' && path === '/api/categories' ? { categories: MANAGED } : undefined;
      return override === undefined ? fallback(url, options) : makeFetch({ [path]: override })(url, options);
    });
    liff.releaseInit();
    await settle();
    clickTab('budgets');
    byId('categories-open').click();
    return { calls, bodies };
  }

  const tileNames = (id = 'category-tiles') => [...byId(id).querySelectorAll('.category-tile-name')].map((el) => el.textContent);
  const tileOf = (id) => document.querySelector(`.category-tile[data-category-id="${id}"]`);
  const optionsOf = (id) => [...byId(id).options].map((option) => option.textContent);
  const submitSheet = () => byId('category-sheet-form').dispatchEvent(new Event('submit', { cancelable: true }));
  const isOpen = () => byId('category-sheet').hasAttribute('open');

  it('opens from the bottom of the budgets tab as a page without the bottom nav', async () => {
    await openPage();

    expect(byId('panel-categories').hidden).toBe(false);
    expect(byId('panel-budgets').hidden).toBe(true);
    expect(byId('bottom-nav').hidden).toBe(true);
    expect(byId('page-title').textContent).toBe('หมวดของฉัน');
    expect(byId('month').hidden).toBe(true);
    expect(byId('page-back').hidden).toBe(false);
    expect(document.activeElement).toBe(byId('page-back'));
  });

  it('goes back to the budgets tab', async () => {
    await openPage();

    byId('page-back').click();

    expect(byId('panel-categories').hidden).toBe(true);
    expect(byId('panel-budgets').hidden).toBe(false);
    expect(byId('bottom-nav').hidden).toBe(false);
    expect(byId('page-back').hidden).toBe(true);
    expect(byId('page-title').textContent).toBe('จัดการงบประมาณ');
    expect(document.activeElement).toBe(byId('categories-open'));
  });

  it('shows the visible tiles of the selected type, a locked system tile and the add tile last', async () => {
    await openPage();

    expect(byId('category-seg-expense').textContent).toBe('รายจ่าย · 3');
    expect(byId('category-seg-income').textContent).toBe('รายรับ · 1');
    expect(byId('category-seg-expense').getAttribute('aria-pressed')).toBe('true');
    expect(tileNames()).toEqual(['อาหาร', 'ค่าแมว', 'อื่นๆ', 'เพิ่มหมวด']);
    const system = [...byId('category-tiles').querySelectorAll('.category-tile.system')];
    expect(system).toHaveLength(1);
    expect(system[0].tagName).toBe('DIV');
    expect(system[0].querySelector('.category-lock')).not.toBeNull();
    expect(tileOf('c-cat').querySelector('.cat-badge use').getAttribute('href')).toBe('#cat-pet');
    expect(tileOf('c-cat').querySelector('.cat-badge').classList.contains('cat-tone-expense')).toBe(true);
    expect(byId('category-tiles').lastElementChild.querySelector('[data-action="add"]')).not.toBeNull();
  });

  it('switches to the income tiles', async () => {
    await openPage();

    byId('category-seg-income').click();

    expect(byId('category-seg-income').getAttribute('aria-pressed')).toBe('true');
    expect(tileNames()).toEqual(['เงินเดือน', 'เพิ่มหมวด']);
    expect(tileOf('c-salary').querySelector('.cat-badge').classList.contains('cat-tone-income')).toBe(true);
    expect(byId('category-hidden-toggle').hidden).toBe(true);
  });

  it('expands the hidden categories', async () => {
    await openPage();

    expect(byId('category-hidden-text').textContent).toBe('ซ่อนอยู่ 1 หมวด');
    expect(byId('category-hidden-tiles').hidden).toBe(true);
    byId('category-hidden-toggle').click();

    expect(byId('category-hidden-toggle').getAttribute('aria-expanded')).toBe('true');
    expect(byId('category-hidden-tiles').hidden).toBe(false);
    expect(tileNames('category-hidden-tiles')).toEqual(['เดินทาง']);
  });

  it('changes the icon of a category and sends only the icon', async () => {
    const { bodies } = await openPage((method, path) =>
      method === 'PATCH' && path === '/api/categories/c-food' ? { category: { ...MANAGED[0], icon: 'coffee' } } : undefined
    );

    tileOf('c-food').click();
    expect(isOpen()).toBe(true);
    expect(byId('category-sheet-title').textContent).toBe('แก้หมวด');
    expect(byId('category-sheet-name').value).toBe('อาหาร');
    expect(byId('category-sheet-hidden-row').hidden).toBe(false);
    expect(byId('category-sheet-icons').querySelector('[aria-pressed="true"]').dataset.icon).toBe('food');
    expect(byId('category-sheet-icons').querySelectorAll('button')).toHaveLength(36);

    byId('category-sheet-icons').querySelector('[data-icon="coffee"]').click();
    expect(byId('category-sheet-preview').querySelector('use').getAttribute('href')).toBe('#cat-coffee');
    submitSheet();
    await settle();

    expect(bodies).toContainEqual({ call: 'PATCH /api/categories/c-food', body: { icon: 'coffee' } });
    expect(isOpen()).toBe(false);
    expect(tileOf('c-food').querySelector('.cat-badge use').getAttribute('href')).toBe('#cat-coffee');
    expect(byId('category-status').textContent).toBe('บันทึกหมวด อาหาร แล้ว');
    expect(document.activeElement).toBe(tileOf('c-food'));
  });

  it('closes without a request when nothing changed', async () => {
    const { calls } = await openPage();

    tileOf('c-cat').click();
    submitSheet();
    await settle();

    expect(calls.filter((call) => call.startsWith('PATCH'))).toEqual([]);
    expect(isOpen()).toBe(false);
  });

  it('adds a category of the selected type with the picked icon and no extra reload', async () => {
    const created = { id: 'c-new', name: 'กาแฟ', type: 'expense', hidden: false, system: false, icon: 'coffee' };
    const { calls, bodies } = await openPage((method, path) => (method === 'POST' && path === '/api/categories' ? { category: created } : undefined));
    const listBefore = calls.filter((call) => call === 'GET /api/transactions').length;

    document.querySelector('[data-action="add"]').click();
    expect(byId('category-sheet-title').textContent).toBe('เพิ่มหมวดรายจ่าย');
    expect(byId('category-sheet-hidden-row').hidden).toBe(true);
    expect(byId('category-sheet-icons').querySelector('[aria-pressed="true"]').dataset.icon).toBe('other');
    byId('category-sheet-name').value = '  กาแฟ ';
    byId('category-sheet-icons').querySelector('[data-icon="coffee"]').click();
    submitSheet();
    await settle();

    expect(bodies).toContainEqual({ call: 'POST /api/categories', body: { type: 'expense', name: 'กาแฟ', icon: 'coffee' } });
    expect(tileNames()).toEqual(['อาหาร', 'ค่าแมว', 'อื่นๆ', 'กาแฟ', 'เพิ่มหมวด']);
    expect(optionsOf('edit-category')).toContain('กาแฟ');
    expect(calls.filter((call) => call === 'GET /api/transactions').length).toBe(listBefore);
    expect(document.activeElement).toBe(tileOf('c-new'));
  });

  it('hides a category from the sheet and moves focus to the hidden toggle', async () => {
    const { bodies } = await openPage((method, path) =>
      method === 'PATCH' && path === '/api/categories/c-food' ? { category: { ...MANAGED[0], hidden: true } } : undefined
    );

    tileOf('c-food').click();
    byId('category-sheet-hidden').checked = true;
    submitSheet();
    await settle();

    expect(bodies).toContainEqual({ call: 'PATCH /api/categories/c-food', body: { hidden: true } });
    expect(tileNames()).toEqual(['ค่าแมว', 'อื่นๆ', 'เพิ่มหมวด']);
    expect(byId('category-hidden-text').textContent).toBe('ซ่อนอยู่ 2 หมวด');
    expect(byId('category-status').textContent).toBe('ซ่อนหมวด อาหาร แล้ว');
    expect(optionsOf('edit-category')).not.toContain('อาหาร');
    expect(document.activeElement).toBe(byId('category-hidden-toggle'));
  });

  it('refreshes the list and recurring rules after an edit', async () => {
    const { calls } = await openPage((method, path) =>
      method === 'PATCH' && path === '/api/categories/c-food' ? { category: { ...MANAGED[0], name: 'ข้าว' } } : undefined
    );
    const count = (path) => calls.filter((call) => call === `GET ${path}`).length;
    const listBefore = count('/api/transactions');
    const recurringBefore = count('/api/recurring');

    tileOf('c-food').click();
    byId('category-sheet-name').value = 'ข้าว';
    submitSheet();
    await settle();

    expect(count('/api/transactions')).toBe(listBefore + 1);
    expect(count('/api/recurring')).toBe(recurringBefore + 1);
  });

  it('keeps the sheet open with the reason when saving fails', async () => {
    await openPage((method, path) => (method === 'PATCH' && path === '/api/categories/c-food' ? { status: 409, error: 'Duplicate name' } : undefined));

    tileOf('c-food').click();
    byId('category-sheet-name').value = 'ค่าแมว';
    submitSheet();
    await settle();

    expect(isOpen()).toBe(true);
    expect(byId('category-sheet-error').textContent).toBe('มีหมวดชื่อนี้อยู่แล้ว');
  });

  it('keeps the sheet open while the save is in flight', async () => {
    await openPage();
    let release;
    const gate = new Promise((resolve) => (release = resolve));
    const original = globalThis.fetch;
    vi.stubGlobal('fetch', async (url, options = {}) => {
      if (options.method === 'PATCH') await gate;
      return original(url, options);
    });

    tileOf('c-food').click();
    byId('category-sheet-name').value = 'ข้าว';
    submitSheet();
    await settle();

    expect(byId('category-sheet-cancel').disabled).toBe(true);
    expect(byId('category-sheet-close').disabled).toBe(true);
    const escape = new Event('cancel', { cancelable: true });
    byId('category-sheet').dispatchEvent(escape);
    expect(escape.defaultPrevented).toBe(true);
    expect(isOpen()).toBe(true);
    release();
    await settle();
  });

  it('keeps hidden categories out of the pickers but in the list filter', async () => {
    await openPage();

    expect(optionsOf('edit-category')).toEqual(['อาหาร', 'ค่าแมว', 'อื่นๆ', 'เงินเดือน']);
    expect(optionsOf('recurring-category')).toEqual(['อาหาร', 'ค่าแมว', 'อื่นๆ', 'เงินเดือน']);
    expect(optionsOf('filter-category')).toEqual(['ทุกหมวด', 'อาหาร', 'เดินทาง (ซ่อนอยู่)', 'ค่าแมว', 'อื่นๆ', 'เงินเดือน']);
  });

  it('keeps the hidden category selected when editing an old entry in it', async () => {
    await openPage();
    byId('page-back').click();
    clickTab('list');

    [...document.querySelectorAll('#list .row-button')].find((button) => button.textContent.includes('BTS')).click();
    await settle();

    expect(byId('edit-category').value).toBe('c-trip');
    expect(optionsOf('edit-category')).toContain('เดินทาง (ซ่อนอยู่)');
  });

  it('no longer has a category section in the profile tab', async () => {
    await openPage();

    expect(byId('categories-manager')).toBeNull();
    expect(byId('category-dialog')).toBeNull();
  });
});
```

- [ ] **Step 2: รัน test ให้เห็นว่า fail**

Run: `npx vitest run public/liff/app.dom.test.mjs public/liff/categories-format.test.mjs`
Expected: FAIL (ยังไม่มี `#categories-open`, `#panel-categories`, `Invalid icon`)

- [ ] **Step 3: แก้ `public/liff/categories-format.mjs`**

เพิ่มใน Map `MESSAGES` ต่อจากแถว `'400:System category'`:

```js
  ['400:Invalid icon', 'เลือกไอคอนจากรายการที่มีให้'],
```

- [ ] **Step 4: แก้ `public/liff/index.html`**

4.1 ใน `<header class="bar">` แทน

```html
        <img class="bar-mascot" src="assets/mascot.webp" alt="" width="44" height="44">
```

ด้วย

```html
        <button type="button" id="page-back" class="bar-back" aria-label="กลับไปจัดการงบ" hidden><svg class="icon"
            aria-hidden="true" focusable="false">
            <use href="#icon-back"></use>
          </svg></button>
        <img class="bar-mascot" src="assets/mascot.webp" alt="" width="44" height="44">
```

4.2 ใน `#panel-budgets` แทน (ส่วนท้ายของ section งบ)

```html
        <div id="budgets-error" class="budgets-error" hidden>
          <p id="budgets-error-text"></p>
          <button type="button" id="budgets-retry">ลองใหม่</button>
        </div>
      </section>
    </div>
```

ด้วย

```html
        <div id="budgets-error" class="budgets-error" hidden>
          <p id="budgets-error-text"></p>
          <button type="button" id="budgets-retry">ลองใหม่</button>
        </div>
      </section>
      <div class="categories-entry">
        <button type="button" id="categories-open" class="categories-open" disabled><svg class="icon"
            aria-hidden="true" focusable="false">
            <use href="#icon-categories"></use>
          </svg>เพิ่มหมวดของฉัน</button>
        <p class="categories-entry-hint">เพิ่ม เปลี่ยนชื่อ เลือกไอคอน หรือซ่อนหมวด</p>
      </div>
    </div>
    <div id="panel-categories" class="panel" hidden>
      <div class="category-segment" role="group" aria-label="ประเภทหมวด">
        <button type="button" id="category-seg-expense" aria-pressed="true">รายจ่าย</button>
        <button type="button" id="category-seg-income" aria-pressed="false">รายรับ</button>
      </div>
      <p id="category-status" class="category-status" role="status" aria-live="polite"></p>
      <ul id="category-tiles" class="category-tiles"></ul>
      <button type="button" id="category-hidden-toggle" class="category-hidden-toggle" aria-expanded="false"
        aria-controls="category-hidden-tiles" hidden><svg class="icon" aria-hidden="true" focusable="false">
          <use href="#icon-eye-off"></use>
        </svg><span id="category-hidden-text"></span><svg class="icon category-chevron" aria-hidden="true"
          focusable="false">
          <use href="#icon-chevron"></use>
        </svg></button>
      <ul id="category-hidden-tiles" class="category-tiles category-hidden-tiles" hidden></ul>
      <p class="category-page-hint">แตะหมวดเพื่อเปลี่ยนชื่อ ไอคอน หรือซ่อน หมวดที่มีรูปกุญแจเป็นของระบบ แก้ไม่ได้</p>
    </div>
```

(ให้แน่ใจว่าแทนเฉพาะบล็อกที่อยู่ใน `#panel-budgets`: ข้อความ `id="budgets-retry"` มีที่เดียว)

4.3 ลบ section `<section id="categories-manager" ...>` ทั้งก้อนใน `#panel-profile` (ตั้งแต่ `<section id="categories-manager"` จนถึง `</section>` ของมัน ก่อน `<section id="friends"`)

4.4 แทน dialog `<dialog id="category-dialog" ...>...</dialog>` ทั้งก้อนด้วย:

```html
  <dialog id="category-sheet" class="category-sheet" aria-labelledby="category-sheet-title">
    <form id="category-sheet-form" novalidate>
      <h2 id="category-sheet-title">แก้หมวด</h2>
      <button type="button" id="category-sheet-close" class="dialog-close" aria-label="ปิด"><svg class="icon"
          aria-hidden="true" focusable="false">
          <use href="#icon-close"></use>
        </svg></button>
      <div class="category-sheet-head">
        <span id="category-sheet-preview" class="category-sheet-preview" aria-hidden="true"></span>
        <label class="category-sheet-label">ชื่อหมวด
          <input id="category-sheet-name" type="text" maxlength="30" autocomplete="off" placeholder="เช่น ค่าแมว">
        </label>
      </div>
      <fieldset class="category-icon-field">
        <legend>ไอคอน</legend>
        <div id="category-sheet-icons" class="category-icon-grid"></div>
      </fieldset>
      <div id="category-sheet-hidden-row" class="category-hidden-row">
        <label class="category-switch"><span class="category-switch-text"><span>ซ่อนหมวดนี้</span><small>รายการเก่ายังอยู่
              แค่ไม่ให้เลือกใหม่</small></span><input id="category-sheet-hidden" type="checkbox" role="switch"></label>
      </div>
      <p id="category-sheet-error" class="error" role="alert"></p>
      <div class="actions">
        <button type="button" id="category-sheet-cancel">ยกเลิก</button>
        <button type="submit" id="category-sheet-save" class="primary">บันทึก</button>
      </div>
    </form>
  </dialog>
```

- [ ] **Step 5: แก้ `public/liff/style.css`**

5.1 ลบ `.category-add button, ` ออกจากกฎบรรทัดปุ่มรอง (บรรทัดที่ขึ้นต้น `.actions button, .export button, .friend-actions button, .friend-add button, .category-add button,`), จากกฎ `:is(.actions button, ... .category-add button, ...):active` และจากกฎ `button:disabled, ...` (ตัด `.category-add button:disabled, `) และลบ `#category-add-submit, ` ออกจากกฎ `.bill-new, #friend-add-submit, #category-add-submit, ...` และ `:is(.actions .primary, .bill-new, #friend-add-submit, #category-add-submit, ...):active`

5.2 ลบกฎทั้งหมดตั้งแต่ `.categories-manager {` จนถึง `#category-add-error:empty, #category-toggle-error:empty, #category-dialog .error:empty { display: none; }` แล้วใส่แทนด้วย:

```css
.categories-entry { margin: 16px 16px 0; }
.categories-open { display: flex; align-items: center; justify-content: center; gap: 10px; width: 100%; min-height: 52px; padding: 8px 20px; font: inherit; font-size: 16px; font-weight: 700; border: 1.5px solid var(--primary); border-radius: var(--radius-pill); background: var(--surface); color: var(--primary); cursor: pointer; }
.categories-open:active { background: var(--brand-soft); }
.categories-entry-hint { margin: 8px 0 0; text-align: center; font-size: 13px; color: var(--muted); }
.bar-back { display: inline-flex; align-items: center; justify-content: center; flex: none; width: 44px; height: 44px; margin-left: -8px; padding: 0; border: none; border-radius: 50%; background: none; color: var(--on-primary); cursor: pointer; }
main#app.categories-page .bar-mascot { display: none; }
main#app.categories-page { padding-bottom: calc(16px + env(safe-area-inset-bottom)); }
.category-segment { display: flex; margin: 16px 16px 0; padding: 4px; border-radius: var(--radius-pill); background: var(--track); }
.category-segment button { flex: 1; min-height: var(--tap); border: none; border-radius: var(--radius-pill); background: transparent; color: var(--muted); font: inherit; font-size: 16px; font-weight: 700; cursor: pointer; }
.category-segment button[aria-pressed="true"] { background: var(--surface); color: var(--primary); font-weight: 800; box-shadow: var(--shadow-card); }
.category-status { margin: 12px 20px 0; font-size: 13px; color: var(--muted); }
.category-status:empty { display: none; }
.category-tiles { list-style: none; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin: 16px 16px 0; padding: 0; }
.category-tile { position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; box-sizing: border-box; width: 100%; min-height: 104px; padding: 12px 6px; border: none; border-radius: 20px; background: var(--surface); box-shadow: var(--shadow-card); font: inherit; color: var(--text); text-align: center; cursor: pointer; }
.category-tile:active { background: var(--brand-soft); }
.category-tile .cat-badge { width: 48px; height: 48px; }
.category-tile .cat-badge .icon { width: 26px; height: 26px; }
.category-tile-name { font-size: 15px; font-weight: 700; line-height: 1.3; overflow-wrap: anywhere; }
.category-tile.system { cursor: default; }
.category-tile.system:active { background: var(--surface); }
.category-lock { position: absolute; top: 8px; right: 10px; width: 16px; height: 16px; color: var(--muted); }
.category-tile.add { border: 2px dashed var(--outline); background: transparent; box-shadow: none; color: var(--primary); }
.category-add-badge { display: inline-flex; align-items: center; justify-content: center; width: 48px; height: 48px; border-radius: 50%; background: var(--cta); color: var(--on-cta); }
.category-add-badge .icon { width: 26px; height: 26px; stroke-width: 2.6; }
.category-hidden-toggle { display: flex; align-items: center; gap: 12px; width: calc(100% - 32px); min-height: 52px; margin: 16px 16px 0; padding: 0 16px; border: none; border-radius: var(--radius-input); background: var(--surface); box-shadow: var(--shadow-card); font: inherit; font-size: 15px; font-weight: 700; color: var(--muted); text-align: left; cursor: pointer; }
.category-hidden-toggle span { flex: 1; }
.category-chevron { transform: rotate(90deg); }
.category-hidden-toggle[aria-expanded="true"] .category-chevron { transform: rotate(-90deg); }
.category-hidden-tiles .category-tile { background: var(--bg); box-shadow: inset 0 0 0 1.5px var(--border); }
.category-page-hint { margin: 8px 20px 0; font-size: 13px; color: var(--muted); }
.category-sheet-head { display: flex; align-items: flex-end; gap: 14px; margin-top: 8px; }
.category-sheet-preview .cat-badge { width: 64px; height: 64px; }
.category-sheet-preview .cat-badge .icon { width: 34px; height: 34px; }
.category-sheet-label { flex: 1; min-width: 0; margin-top: 0; }
.category-icon-field { min-width: 0; margin: 16px 0 0; padding: 0; border: none; }
.category-icon-field legend { padding: 0; font-size: 14px; font-weight: 700; }
.category-icon-grid { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 8px; margin-top: 8px; }
.category-icon-grid button { display: inline-flex; align-items: center; justify-content: center; height: 48px; padding: 0; border: 1.5px solid var(--border); border-radius: var(--radius-input); background: var(--bg); color: var(--primary); cursor: pointer; }
.category-icon-grid button[aria-pressed="true"] { border: 2px solid var(--brand-dark); background: var(--primary); color: var(--on-primary); }
.category-hidden-row { margin-top: 16px; border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); }
.category-switch { display: flex; align-items: center; gap: 12px; min-height: 52px; margin: 0; }
.category-switch-text { display: flex; flex: 1; flex-direction: column; font-size: 16px; font-weight: 700; }
.category-switch-text small { font-size: 13px; font-weight: 400; color: var(--muted); }
#category-sheet-hidden { -webkit-appearance: none; appearance: none; position: relative; flex: none; width: 52px; height: 32px; min-height: 0; margin: 0; padding: 0; border: none; border-radius: var(--radius-pill); background: var(--outline); cursor: pointer; }
#category-sheet-hidden::before { content: ""; position: absolute; top: 3px; left: 3px; width: 26px; height: 26px; border-radius: 50%; background: var(--surface); transition: transform 0.15s; }
#category-sheet-hidden:checked { background: var(--primary); }
#category-sheet-hidden:checked::before { transform: translateX(20px); }
#category-sheet-hidden:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
#category-sheet .error:empty { display: none; }
```

(กฎ `.cat-tone-*` ที่ Task 5 เพิ่มต้องยังอยู่ท้ายไฟล์ ถ้าบล็อกนี้ไปอยู่หลังกฎนั้น ให้ย้ายกฎ `.cat-tone-*` กลับไปไว้ท้ายสุด)

- [ ] **Step 6: เขียน `public/liff/categories-panel.mjs` ใหม่ทั้งไฟล์**

```js
import { ApiError } from './api.mjs';
import { createCategoryBadge, effectiveIconKey } from './categories.mjs';
import { CATEGORY_ICONS } from './category-icons.mjs';
import { describeCategoryError } from './categories-format.mjs';
import { createSvgIcon } from './icons.mjs';

const statusOf = (err) => (err instanceof ApiError ? err.status : 0);
const errorOf = (err) => (err instanceof ApiError ? err.error : undefined);
const TYPE_LABELS = { expense: 'รายจ่าย', income: 'รายรับ' };
const DEFAULT_NEW_ICON = 'other';

// หน้าหมวดของฉัน แตะการ์ดเพื่อแก้ใน sheet แก้แล้วส่งชุดใหม่ให้ app อัปเดตตัวเลือกหมวดทุกที่
export function createCategoriesPanel({ doc, els, getApi, getCategories, onChanged }) {
  let busy = false;
  let type = 'expense';
  let showHidden = false;
  let sheetOpen = false;
  // หมวดที่กำลังแก้ ถ้าเป็น null แปลว่ากำลังเพิ่มหมวดใหม่
  let editing = null;
  let pickedIcon = DEFAULT_NEW_ICON;
  // การ์ดถูกสร้างใหม่ทุกครั้งที่ render จึงจำ selector ไว้คืนโฟกัสแทนการจำ element
  let returnFocus = null;

  function setBusy(next) {
    busy = next;
    els.sheetSave.disabled = next;
    els.sheetCancel.disabled = next;
    els.sheetClose.disabled = next;
  }

  function setStatus(text) {
    els.status.textContent = text;
  }

  function focusSelector(selector) {
    if (selector) els.page.querySelector(selector)?.focus();
  }

  function tileSelector(category) {
    return `.category-tile[data-category-id="${category.id}"]`;
  }

  function appendTileContent(target, category) {
    const name = doc.createElement('span');
    name.className = 'category-tile-name';
    name.textContent = category.name;
    target.append(createCategoryBadge(doc, category.name, { icon: category.icon, type: category.type }), name);
  }

  function renderTile(category) {
    const item = doc.createElement('li');
    if (category.system) {
      const tile = doc.createElement('div');
      tile.className = 'category-tile system';
      appendTileContent(tile, category);
      const note = doc.createElement('span');
      note.className = 'sr-only';
      note.textContent = 'หมวดของระบบ แก้ไม่ได้';
      tile.append(createSvgIcon(doc, 'icon-lock', 'icon category-lock'), note);
      item.append(tile);
      return item;
    }
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'category-tile';
    button.dataset.categoryId = category.id;
    button.setAttribute('aria-label', `แก้หมวด ${category.name}`);
    appendTileContent(button, category);
    button.addEventListener('click', () => openSheet(category));
    item.append(button);
    return item;
  }

  function renderAddTile() {
    const item = doc.createElement('li');
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'category-tile add';
    button.dataset.action = 'add';
    const badge = doc.createElement('span');
    badge.className = 'category-add-badge';
    badge.append(createSvgIcon(doc, 'icon-plus'));
    const label = doc.createElement('span');
    label.className = 'category-tile-name';
    label.textContent = 'เพิ่มหมวด';
    button.append(badge, label);
    button.addEventListener('click', () => openSheet(null));
    item.append(button);
    return item;
  }

  function render() {
    const categories = getCategories();
    for (const [segmentType, button] of [
      ['expense', els.segExpense],
      ['income', els.segIncome],
    ]) {
      const count = categories.filter((category) => category.type === segmentType && !category.hidden).length;
      button.textContent = `${TYPE_LABELS[segmentType]} · ${count}`;
      button.setAttribute('aria-pressed', String(segmentType === type));
    }
    const ofType = categories.filter((category) => category.type === type);
    const hidden = ofType.filter((category) => category.hidden);
    els.tiles.replaceChildren(...ofType.filter((category) => !category.hidden).map(renderTile), renderAddTile());
    els.hiddenToggle.hidden = hidden.length === 0;
    els.hiddenText.textContent = `ซ่อนอยู่ ${hidden.length} หมวด`;
    els.hiddenToggle.setAttribute('aria-expanded', String(showHidden && hidden.length > 0));
    els.hiddenTiles.hidden = !showHidden || hidden.length === 0;
    els.hiddenTiles.replaceChildren(...hidden.map(renderTile));
  }

  function selectType(next) {
    if (next === type) return;
    type = next;
    showHidden = false;
    setStatus('');
    render();
  }

  function renderPreview() {
    const name = editing ? editing.name : '';
    const previewType = editing ? editing.type : type;
    els.sheetPreview.replaceChildren(createCategoryBadge(doc, name, { icon: pickedIcon, type: previewType }));
  }

  function pickIcon(key) {
    pickedIcon = key;
    for (const button of els.sheetIcons.querySelectorAll('button[data-icon]')) {
      button.setAttribute('aria-pressed', String(button.dataset.icon === key));
    }
    renderPreview();
  }

  function renderIconChoices() {
    els.sheetIcons.replaceChildren(
      ...CATEGORY_ICONS.map(({ key, label }) => {
        const button = doc.createElement('button');
        button.type = 'button';
        button.dataset.icon = key;
        button.setAttribute('aria-label', label);
        button.setAttribute('aria-pressed', String(key === pickedIcon));
        button.append(createSvgIcon(doc, `cat-${key}`));
        button.addEventListener('click', () => pickIcon(key));
        return button;
      })
    );
  }

  function openSheet(category) {
    editing = category;
    sheetOpen = true;
    returnFocus = category ? tileSelector(category) : '[data-action="add"]';
    pickedIcon = category ? effectiveIconKey(category) : DEFAULT_NEW_ICON;
    els.sheetTitle.textContent = category ? 'แก้หมวด' : `เพิ่มหมวด${TYPE_LABELS[type]}`;
    els.sheetName.value = category ? category.name : '';
    els.sheetHidden.checked = category ? category.hidden : false;
    els.sheetHiddenRow.hidden = !category;
    els.sheetError.textContent = '';
    renderIconChoices();
    renderPreview();
    els.sheet.showModal();
    els.sheetName.focus();
  }

  // ปิดเองแล้วคืนโฟกัสทันที เพราะ event close ไม่ได้ยิงในทุก browser
  function closeSheet(focusAfter) {
    sheetOpen = false;
    editing = null;
    returnFocus = null;
    els.sheet.close();
    focusSelector(focusAfter);
  }

  async function send(request) {
    setBusy(true);
    try {
      return await request();
    } catch (err) {
      els.sheetError.textContent = describeCategoryError(statusOf(err), errorOf(err));
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function submitAdd(name) {
    const result = await send(() => getApi().createCategory({ type, name, icon: pickedIcon }));
    if (!result) return;
    const created = result.category;
    // หมวดใหม่ยังไม่มีรายการ จึงไม่ต้องโหลดรายการ งบ และรายการประจำใหม่
    onChanged([...getCategories(), created], { refresh: false });
    setStatus(`เพิ่มหมวด ${created.name} แล้ว`);
    closeSheet(tileSelector(created));
  }

  function changesFor(category, name) {
    const changes = {};
    if (name !== category.name) changes.name = name;
    if (pickedIcon !== effectiveIconKey(category)) changes.icon = pickedIcon;
    if (els.sheetHidden.checked !== category.hidden) changes.hidden = els.sheetHidden.checked;
    return changes;
  }

  function savedMessage(updated, changes) {
    if (changes.hidden === true) return `ซ่อนหมวด ${updated.name} แล้ว`;
    if (changes.hidden === false) return `เลิกซ่อนหมวด ${updated.name} แล้ว`;
    return `บันทึกหมวด ${updated.name} แล้ว`;
  }

  async function submitEdit(name) {
    const category = editing;
    const changes = changesFor(category, name);
    if (Object.keys(changes).length === 0) {
      closeSheet(tileSelector(category));
      return;
    }
    const result = await send(() => getApi().updateCategory(category.id, changes));
    if (!result) return;
    const updated = result.category;
    onChanged(
      getCategories().map((item) => (item.id === updated.id ? updated : item)),
      { refresh: true }
    );
    setStatus(savedMessage(updated, changes));
    // หมวดที่เพิ่งซ่อนอาจอยู่ในส่วนที่พับไว้ จึงให้โฟกัสปุ่มเปิดส่วนนั้นแทน
    closeSheet(updated.hidden && !showHidden ? '#category-hidden-toggle' : tileSelector(updated));
  }

  els.sheetForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy || !sheetOpen) return;
    els.sheetError.textContent = '';
    const name = els.sheetName.value.trim();
    if (editing) await submitEdit(name);
    else await submitAdd(name);
  });

  els.sheetCancel.addEventListener('click', () => closeSheet(returnFocus));
  els.sheetClose.addEventListener('click', () => closeSheet(returnFocus));
  // กัน Esc ปิด sheet ระหว่างรอ request ไม่งั้นข้อผิดพลาดที่ตามมาจะไม่มีที่แสดง
  els.sheet.addEventListener('cancel', (event) => {
    if (busy) event.preventDefault();
  });
  els.sheet.addEventListener('close', () => {
    // browser บางตัวปิด dialog แม้ preventDefault แล้ว จึงเปิดกลับ
    if (busy) {
      els.sheet.showModal();
      return;
    }
    // ปิดด้วย Esc ไม่ผ่าน closeSheet จึงล้างสถานะและคืนโฟกัสที่นี่
    if (sheetOpen) {
      const target = returnFocus;
      sheetOpen = false;
      editing = null;
      returnFocus = null;
      focusSelector(target);
    }
  });

  els.segExpense.addEventListener('click', () => selectType('expense'));
  els.segIncome.addEventListener('click', () => selectType('income'));
  els.hiddenToggle.addEventListener('click', () => {
    showHidden = !showHidden;
    render();
  });

  return { render };
}
```

- [ ] **Step 7: แก้ `public/liff/app.mjs`**

7.1 ใน `const els = {` เพิ่มก่อน `};` ที่ปิด (ต่อจาก `profileStaleNotice: document.getElementById('profile-stale'),`):

```js
  categoriesOpen: document.getElementById('categories-open'),
  pageBack: document.getElementById('page-back'),
  bottomNav: document.getElementById('bottom-nav'),
```

7.2 แทนบล็อก `const categoriesPanel = createCategoriesPanel({ ... });` ทั้งก้อนด้วย:

```js
const categoriesPanel = createCategoriesPanel({
  doc: document,
  els: {
    page: document.getElementById('panel-categories'),
    segExpense: document.getElementById('category-seg-expense'),
    segIncome: document.getElementById('category-seg-income'),
    status: document.getElementById('category-status'),
    tiles: document.getElementById('category-tiles'),
    hiddenToggle: document.getElementById('category-hidden-toggle'),
    hiddenText: document.getElementById('category-hidden-text'),
    hiddenTiles: document.getElementById('category-hidden-tiles'),
    sheet: document.getElementById('category-sheet'),
    sheetForm: document.getElementById('category-sheet-form'),
    sheetTitle: document.getElementById('category-sheet-title'),
    sheetClose: document.getElementById('category-sheet-close'),
    sheetPreview: document.getElementById('category-sheet-preview'),
    sheetName: document.getElementById('category-sheet-name'),
    sheetIcons: document.getElementById('category-sheet-icons'),
    sheetHiddenRow: document.getElementById('category-sheet-hidden-row'),
    sheetHidden: document.getElementById('category-sheet-hidden'),
    sheetError: document.getElementById('category-sheet-error'),
    sheetSave: document.getElementById('category-sheet-save'),
    sheetCancel: document.getElementById('category-sheet-cancel'),
  },
  getApi: () => api,
  getCategories: () => categories,
  onChanged: (next, { refresh }) => {
    setCategories(next);
    if (refresh) refreshAfterCategoryChange();
  },
});
```

7.3 แทน

```js
function setCategories(next) {
  categories = next;
  fillCategoryOptions();
  categoriesPanel.render();
}
```

ด้วย

```js
function setCategories(next) {
  categories = next;
  fillCategoryOptions();
  categoriesPanel.render();
  // ยังโหลดหมวดไม่ได้ หน้าหมวดจะว่างเปล่า จึงยังไม่ให้เข้า
  els.categoriesOpen.disabled = categories.length === 0;
}
```

7.4 เพิ่มหลังฟังก์ชัน `refreshAfterCategoryChange` (ก่อน `// โหลดทุกอย่างที่หน้าต้องใช้ตอนเปิด`):

```js
// หมวดของฉันเป็นหน้าย่อยของแท็บงบ ไม่อยู่ในแถบเมนูล่าง จึงซ่อนเมนูและมีปุ่มย้อนกลับแทน
function enterCategoriesPage() {
  document.getElementById('app').classList.add('categories-page');
  els.bottomNav.hidden = true;
  for (const panel of document.querySelectorAll('.panel')) panel.hidden = panel.id !== 'panel-categories';
  document.getElementById('page-title').textContent = 'หมวดของฉัน';
  els.month.hidden = true;
  els.pageBack.hidden = false;
  showStickyLoadError();
  window.scrollTo(0, 0);
  categoriesPanel.render();
  els.pageBack.focus();
}

function leaveCategoriesPage() {
  document.getElementById('app').classList.remove('categories-page');
  els.bottomNav.hidden = false;
  els.pageBack.hidden = true;
  document.getElementById('panel-categories').hidden = true;
  // controller ยังจำว่าอยู่แท็บงบ จึงต้อง force ให้แสดง panel และหัวข้อกลับมา
  tabController.select('budgets', { force: true });
  els.categoriesOpen.focus();
}

els.categoriesOpen.addEventListener('click', enterCategoriesPage);
els.pageBack.addEventListener('click', leaveCategoriesPage);
```

- [ ] **Step 8: รัน test ให้ผ่าน**

Run: `npx vitest run public/liff`
Expected: PASS ทุกไฟล์ใน `public/liff` รวม describe `'LIFF categories page'`

- [ ] **Step 9: lint และ commit**

Run: `npx eslint public/liff`
Expected: ไม่มี error

```bash
git add public/liff/index.html public/liff/style.css public/liff/categories-panel.mjs public/liff/categories-format.mjs public/liff/categories-format.test.mjs public/liff/app.mjs public/liff/app.dom.test.mjs
git commit -m "feat: move my categories to a tile page with an icon picker

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014ArNrjZ5mrVWNCqmZkKcsc"
```

---

### Task 9: เอกสารและตรวจทั้งชุด

**Depends on:** Task 1, Task 2, Task 3, Task 4, Task 5, Task 6, Task 7, Task 8

**Files:**
- Modify: `SPEC.md`, `README.md`, `work-memory/STATE.md`

**Interfaces:**
- Consumes: ทุก task ก่อนหน้า (ข้อความในเอกสารต้องตรงกับโค้ดที่อ่านใน session นี้)

- [ ] **Step 1: แก้ SPEC.md**

1. ข้อ 3 (เว็บ LIFF): แทน `และ "หมวดของฉัน" (เพิ่ม เปลี่ยนชื่อ ซ่อน/เลิกซ่อนหมวด)` ด้วยข้อความว่าแท็บโปรไฟล์ไม่มีส่วนหมวดแล้ว และเพิ่มในส่วนจัดการงบว่า "ปุ่ม เพิ่มหมวดของฉัน ล่างสุดของแท็บจัดการงบ เปิดหน้าหมวดของฉัน (ไม่อยู่ในแถบเมนูล่าง มีปุ่มย้อนกลับ)"
2. ข้อ 9: แทน `แท็บโปรไฟล์มีส่วน "หมวดของฉัน"` ด้วย `หน้า "หมวดของฉัน" (เปิดจากปุ่มล่างสุดของแท็บจัดการงบ การ์ด 3 คอลัมน์ แยกรายจ่าย/รายรับ แก้และเพิ่มใน bottom sheet)` และเพิ่มประโยค: ผู้ใช้เลือกไอคอนหมวดได้ 36 ตัว (หมวดระบบเปลี่ยนไม่ได้) เก็บใน `categories.icon` ถ้าว่างใช้ไอคอนตั้งต้นตามชื่อ (หมวดที่สร้างเองใช้ "อื่นๆ") ไอคอนแสดงในรายการ กราฟสรุป งบ และหน้าหมวด สีตามประเภท (รายจ่ายน้ำเงิน รายรับเขียว) ส่วนการ์ดในแชทไม่เปลี่ยน; API `POST /api/categories` รับ `icon` เพิ่ม, `PATCH /api/categories/:id` รับ `icon` (`null` = กลับไปใช้ไอคอนตั้งต้น), `GET` คืน `icon`
3. Database: แทน `\- categories: id, user\_id, name, type, hidden (ซ่อนแทนการลบ ใช้ SQL `017_category_hidden.sql`)` ด้วย `\- categories: id, user\_id, name, type, hidden (ซ่อนแทนการลบ ใช้ SQL `017_category_hidden.sql`), icon (key ไอคอนที่ผู้ใช้เลือก null = ตั้งต้นตามชื่อ ใช้ SQL `018_category_icon.sql`)`
4. ลำดับการทำ: เพิ่มบรรทัดว่างและ `13\. หน้าหมวดของฉันแบบใหม่และไอคอนหมวด (docs/superpowers/plans/2026-10-18-category-icons.md)` หลังข้อ 12

- [ ] **Step 2: แก้ README.md**

1. บรรทัด bullet โปรไฟล์: ตัด `และส่วน "หมวดของฉัน" (เพิ่ม เปลี่ยนชื่อ ซ่อน/เลิกซ่อนหมวด)` ออก
2. bullet `  - จัดการงบ: ตั้งงบต่อหมวดต่อเดือน` เปลี่ยนเป็น `  - จัดการงบ: ตั้งงบต่อหมวดต่อเดือน และปุ่ม "เพิ่มหมวดของฉัน" ล่างสุด เปิดหน้าหมวดของฉัน (เพิ่ม เปลี่ยนชื่อ เลือกไอคอน ซ่อน/เลิกซ่อนหมวด)`
3. ขั้นติดตั้ง: แทน `` `002` ถึง `017` (ไม่มี 016 เพราะถูกถอยออก) `` ด้วย `` `002` ถึง `018` (ไม่มี 016 เพราะถูกถอยออก) ``
4. บรรทัด deploy: แทนข้อความในวงเล็บ `(ไฟล์ล่าสุดตอนนี้คือ `017_category_hidden.sql` ...)` ทั้งวงเล็บด้วย `(ไฟล์ล่าสุดตอนนี้คือ `018_category_icon.sql` ต้องรันก่อน push เพราะโค้ดเวอร์ชันนั้นอ่านคอลัมน์ icon ทุกครั้งที่โหลดหมวด ถ้ายังไม่รัน หน้าเว็บ การดาวน์โหลด CSV และการสร้างบิลจะล้มเหลว (ตอบ 500) ส่วนบอทยังบันทึกรายการได้โดยใช้หมวดเริ่มต้น; ไม่มีไฟล์ 016 เพราะถูกถอยออก)` (ตรวจกับ `src/db/repository.js` `CATEGORY_COLUMNS`, `src/bot.js` `loadTextCategories` ก่อนเขียน)

- [ ] **Step 3: แก้ work-memory/STATE.md**

เปลี่ยน `Updated:` เป็นวันที่วันนี้ และเพิ่มบรรทัดแรกใต้ `## Next`:

```
- [ ] หน้าหมวดของฉันแบบใหม่ (แบบ A) และไอคอนหมวด (branch feat/category-icons, แผน docs/superpowers/plans/2026-10-18-category-icons.md, design https://claude.ai/artifact/YDCJv1accQmNZyRTSXy9Pt): Task 1-8 เสร็จ npm test <ผลจริง> lint ผ่าน ยังไม่ merge ยังไม่ push; ผู้ใช้ต้อง (1) รัน supabase/018_category_icon.sql ใน Supabase SQL Editor ก่อน push (2) ทำ Browser check ของ Task 8 ในแอป LINE
```

(แทน `<ผลจริง>` ด้วยตัวเลขจาก Step 4)

- [ ] **Step 4: รันทั้งชุด**

Run: `npm test` แล้ว `npm run lint` แล้ว `node --check index.js`
Expected: ผ่านทั้งหมด จดจำนวน test ที่รันจริง

- [ ] **Step 5: Commit**

```bash
git add SPEC.md README.md work-memory/STATE.md
git commit -m "docs: record the categories page and category icons

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014ArNrjZ5mrVWNCqmZkKcsc"
```

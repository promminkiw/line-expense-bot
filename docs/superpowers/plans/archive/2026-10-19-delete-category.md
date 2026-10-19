# ลบหมวดของผู้ใช้ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ผู้ใช้ลบหมวดที่ตั้งเองได้จาก sheet แก้หมวด โดยรายการ รายการประจำ และบิลในหมวดนั้นย้ายไปหมวด อื่นๆ ของประเภทเดียวกัน และงบของหมวดนั้นหายไป

**Architecture:** SQL function `delete_category` (ไฟล์ 019) ย้ายแถวที่อ้างหมวดแล้วลบหมวดใน transaction เดียว งบหายเองเพราะ FK ของ budgets เป็น `on delete cascade` API เพิ่ม `GET /api/categories/:id/usage` (นับจำนวนที่จะย้ายเพื่อแสดงตอนยืนยัน) และ `DELETE /api/categories/:id` หน้า LIFF เพิ่มปุ่ม ลบหมวด ท้าย sheet แก้หมวด กดแล้วโชว์ข้อความยืนยันในตัว sheet พร้อมจำนวนที่จะย้าย

**Tech Stack:** Node.js + Express 5, Supabase (PostgREST + plpgsql), vitest, PGlite สำหรับเทสต์ SQL, LIFF แบบ HTML + JS ธรรมดา (`.mjs`)

## Global Constraints

- เขียน test ก่อนโค้ด ทุก task (CLAUDE.md ของโปรเจกต์)
- คอมเมนต์สั้นบรรทัดเดียว เป็นภาษาไทย อธิบาย "ทำไม" เท่านั้น ศัพท์เทคนิคคงเป็นอังกฤษ
- ชื่อตัวแปร function และ log message เป็นภาษาอังกฤษ ห้าม emoji ในโค้ด คอมเมนต์ และ commit message
- commit message ลงท้ายด้วย `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- หมวดระบบลบไม่ได้: รายจ่าย `อื่นๆ` และ `ใบเสร็จ/สลิปโอนเงิน`, รายรับ `อื่นๆ` (ตรงกับ `SYSTEM_CATEGORIES` ใน `src/parser/categories.js`)
- ห้ามแตะ `.env`
- คำสั่งตรวจ: `npm test`, `npm run lint`, `node --check index.js` (`scripts/try-parse.test.js` อาจ timeout ตอนรันพร้อมกัน ให้รันไฟล์นั้นเดี่ยวซ้ำก่อนสรุปว่าพัง)

---

### Task 1: SQL function delete_category (019)

**Depends on:** none

**Files:**
- Create: `supabase/019_delete_category.sql`
- Modify: `supabase/schema.sql:1` (คอมเมนต์บรรทัดแรกที่บอกลำดับไฟล์)
- Test: `src/db/sql-functions.test.js` (รายการ `MIGRATIONS` บรรทัด ~9-27, describe ใหม่, และ `function permissions`)

**Interfaces:**
- Produces: `public.delete_category(p_user uuid, p_category uuid) returns text` คืน `'deleted'`, `'not_found'` (ไม่มีหมวดนี้ของผู้ใช้นี้) หรือ `'system'` (หมวดระบบ) ถ้าไม่มีหมวด อื่นๆ ของประเภทนั้น raise exception `Fallback category is missing`

- [ ] **Step 1: เพิ่ม 019 ใน MIGRATIONS และเขียนเทสต์ที่ fail**

ใน `src/db/sql-functions.test.js` เพิ่ม `'019_delete_category.sql',` ต่อท้าย `'018_category_icon.sql',` ในอาร์เรย์ `MIGRATIONS` แล้วเพิ่ม describe นี้ก่อน `describe('function permissions'`:

```js
describe('019_delete_category.sql', () => {
  async function setupUser() {
    const user = await createUser('U1');
    const other = await createCategory(user, 'อื่นๆ', 'expense');
    const slip = await createCategory(user, 'ใบเสร็จ/สลิปโอนเงิน', 'expense');
    const incomeOther = await createCategory(user, 'อื่นๆ', 'income');
    const cat = await createCategory(user, 'ค่าแมว', 'expense');
    return { user, other, slip, incomeOther, cat };
  }

  it('moves entries, recurring rules and bills to the other category, drops the budget and deletes the category', async () => {
    const { user, other, cat } = await setupUser();
    await addTransaction(user, cat, 'expense', 120, '2026-10-05');
    await db.query(
      "insert into recurring_rules (user_id, type, category_id, amount, day_of_month) values ($1, 'expense', $2, 300, 5)",
      [user, cat]
    );
    await db.query("insert into bills (owner_id, title, total, category_id, occurred_on, owner_share) values ($1, 'ข้าวแมว', 500, $2, '2026-10-05', 500)", [
      user,
      cat,
    ]);
    await db.query("insert into budgets (user_id, category_id, month, amount) values ($1, $2, '2026-10-01', 1000)", [user, cat]);

    expect((await one('select delete_category($1, $2) as status', [user, cat])).status).toBe('deleted');

    expect(await rows('select category_id from transactions where user_id = $1', [user])).toEqual([{ category_id: other }]);
    expect(await rows('select category_id from recurring_rules where user_id = $1', [user])).toEqual([{ category_id: other }]);
    expect(await rows('select category_id from bills where owner_id = $1', [user])).toEqual([{ category_id: other }]);
    expect(await rows('select id from budgets where user_id = $1', [user])).toEqual([]);
    expect(await rows('select id from categories where id = $1', [cat])).toEqual([]);
  });

  it('moves an income category to the income other category', async () => {
    const { user, incomeOther } = await setupUser();
    const bonus = await createCategory(user, 'โบนัส', 'income');
    await addTransaction(user, bonus, 'income', 5000, '2026-10-01');

    expect((await one('select delete_category($1, $2) as status', [user, bonus])).status).toBe('deleted');
    expect(await rows('select category_id from transactions where user_id = $1', [user])).toEqual([{ category_id: incomeOther }]);
  });

  it('refuses the system categories', async () => {
    const { user, other, slip, incomeOther } = await setupUser();

    for (const id of [other, slip, incomeOther]) {
      expect((await one('select delete_category($1, $2) as status', [user, id])).status).toBe('system');
    }
    expect((await one('select count(*)::int as n from categories where user_id = $1', [user])).n).toBe(4);
  });

  it('answers not_found for a category of another user and leaves it alone', async () => {
    const { cat } = await setupUser();
    const stranger = await createUser('U2');

    expect((await one('select delete_category($1, $2) as status', [stranger, cat])).status).toBe('not_found');
    expect(await rows('select id from categories where id = $1', [cat])).toEqual([{ id: cat }]);
  });

  it('fails without changing anything when the other category is missing', async () => {
    const user = await createUser('U3');
    const cat = await createCategory(user, 'ค่าแมว', 'expense');
    await addTransaction(user, cat, 'expense', 50, '2026-10-02');

    await db.exec('savepoint no_fallback');
    await expect(db.query('select delete_category($1, $2)', [user, cat])).rejects.toThrow('Fallback category is missing');
    await db.exec('rollback to savepoint no_fallback');
    expect(await rows('select category_id from transactions where user_id = $1', [user])).toEqual([{ category_id: cat }]);
  });

  it('can run again without failing', async () => {
    await expect(db.exec(readMigration('019_delete_category.sql'))).resolves.toBeDefined();
  });
});
```

และใน `describe('function permissions'` เพิ่มแถวนี้ต่อท้ายอาร์เรย์ `calls`:

```js
    ['delete_category', 'select delete_category(gen_random_uuid(), gen_random_uuid())'],
```

(ผู้ใช้สุ่มจึงคืน `'not_found'` และผ่าน `resolves.toBeDefined()` ใน `lets service_role call` ได้เลย)

- [ ] **Step 2: รันให้เห็นว่า fail**

Run: `npx vitest run src/db/sql-functions.test.js`
Expected: FAIL เพราะหาไฟล์ `019_delete_category.sql` ไม่เจอ (ENOENT) ใน beforeAll

- [ ] **Step 3: เขียน 019**

สร้าง `supabase/019_delete_category.sql`:

```sql
-- รันใน Supabase SQL Editor ต่อจาก 018 ก่อน push โค้ดที่ให้ผู้ใช้ลบหมวด รันซ้ำได้
-- ย้ายทุกแถวที่อ้างหมวดไปหมวด อื่นๆ แล้วลบใน transaction เดียว ยอดรวมจึงไม่หายถ้าพังกลางทาง

create or replace function public.delete_category(p_user uuid, p_category uuid)
returns text
language plpgsql
set search_path = public
as $$
declare
  c public.categories;
  fallback uuid;
begin
  select * into c from public.categories where id = p_category and user_id = p_user for update;
  if not found then
    return 'not_found';
  end if;
  -- โค้ดอ้างหมวดระบบด้วยชื่อ ต้องตรงกับ SYSTEM_CATEGORIES ใน src/parser/categories.js
  if c.name = 'อื่นๆ' or (c.type = 'expense' and c.name = 'ใบเสร็จ/สลิปโอนเงิน') then
    return 'system';
  end if;
  select id into fallback from public.categories where user_id = p_user and type = c.type and name = 'อื่นๆ';
  if fallback is null then
    raise exception 'Fallback category is missing';
  end if;

  update public.transactions set category_id = fallback where user_id = p_user and category_id = p_category;
  update public.recurring_rules set category_id = fallback where user_id = p_user and category_id = p_category;
  update public.bills set category_id = fallback where owner_id = p_user and category_id = p_category;
  -- budgets ใช้ on delete cascade งบของหมวดนี้จึงหายไปพร้อมกัน
  delete from public.categories where id = p_category and user_id = p_user;
  return 'deleted';
end
$$;

revoke execute on function public.delete_category(uuid, uuid) from public, anon, authenticated;
grant execute on function public.delete_category(uuid, uuid) to service_role;
```

ใน `supabase/schema.sql` บรรทัดแรก เปลี่ยน `017_category_hidden.sql และ 018_category_icon.sql ต่อตามลำดับ` เป็น `017_category_hidden.sql, 018_category_icon.sql และ 019_delete_category.sql ต่อตามลำดับ`

- [ ] **Step 4: รันให้ผ่าน**

Run: `npx vitest run src/db/sql-functions.test.js`
Expected: PASS ทั้งไฟล์ (ถ้า worker crash ด้วย exit code 2147483651 ให้รันซ้ำ เป็นอาการ flaky ของ PGlite ที่เคยเจอ)

- [ ] **Step 5: Commit**

```bash
git add supabase/019_delete_category.sql supabase/schema.sql src/db/sql-functions.test.js
git commit -m "feat: add a function that deletes a category into the other category"
```

---

### Task 2: repository deleteCategory และ countCategoryUsage

**Depends on:** none (ใช้แค่ชื่อ function จาก Task 1)

**Files:**
- Modify: `src/db/repository.js` (เพิ่ม 2 function ถัดจาก `updateCategory` ~บรรทัด 598-614 และเพิ่มใน object ที่ return ~บรรทัด 741-742)
- Test: `src/db/repository.test.js` (describe ใหม่ถัดจาก `describe('repository.updateCategory'` ~บรรทัด 731)

**Interfaces:**
- Consumes: rpc `delete_category` พารามิเตอร์ `{ p_user, p_category }` คืน text
- Produces:
  - `deleteCategory(userId: string, id: string): Promise<'deleted' | 'not_found' | 'system'>`
  - `countCategoryUsage(userId: string, id: string): Promise<{ transactions: number, recurring: number, bills: number }>`

- [ ] **Step 1: เขียนเทสต์ที่ fail**

เพิ่มใน `src/db/repository.test.js` ถัดจาก describe ของ `updateCategory` (ใช้ `fakeSupabase` ที่มีอยู่แล้วต้นไฟล์):

```js
describe('repository.deleteCategory', () => {
  it('deletes through the rpc and returns its status', async () => {
    const { supabase, calls } = fakeSupabase({ data: 'deleted', error: null });

    expect(await createRepository(supabase).deleteCategory('user-1', 'c9')).toBe('deleted');
    expect(calls).toEqual([['rpc', 'delete_category', { p_user: 'user-1', p_category: 'c9' }]]);
  });

  it('throws a DatabaseError when the rpc fails', async () => {
    const { supabase } = fakeSupabase({ data: null, error: { message: 'boom' } });

    await expect(createRepository(supabase).deleteCategory('user-1', 'c9')).rejects.toThrow('Database deleteCategory failed: boom');
  });
});

describe('repository.countCategoryUsage', () => {
  it('counts the entries, recurring rules and bills of the category', async () => {
    const { supabase, calls } = fakeSupabase({ count: 3, error: null }, { count: 1, error: null }, { count: 2, error: null });

    expect(await createRepository(supabase).countCategoryUsage('user-1', 'c9')).toEqual({ transactions: 3, recurring: 1, bills: 2 });
    expect(calls.filter(([method]) => method === 'from')).toEqual([
      ['from', 'transactions'],
      ['from', 'recurring_rules'],
      ['from', 'bills'],
    ]);
    expect(calls).toContainEqual(['select', 'id', { count: 'exact', head: true }]);
    expect(calls).toContainEqual(['eq', 'owner_id', 'user-1']);
    expect(calls.filter((call) => call[0] === 'eq' && call[1] === 'category_id')).toHaveLength(3);
  });

  it('throws a DatabaseError when a count fails', async () => {
    const { supabase } = fakeSupabase({ count: null, error: { message: 'boom' } });

    await expect(createRepository(supabase).countCategoryUsage('user-1', 'c9')).rejects.toThrow('Database countCategoryUsage failed: boom');
  });
});
```

- [ ] **Step 2: รันให้เห็นว่า fail**

Run: `npx vitest run src/db/repository.test.js -t "deleteCategory|countCategoryUsage"`
Expected: FAIL ด้วย `deleteCategory is not a function` และ `countCategoryUsage is not a function`

- [ ] **Step 3: เขียนโค้ด**

ใน `src/db/repository.js` ถัดจาก `updateCategory`:

```js
  async function deleteCategory(userId, id) {
    const { data, error } = await supabase.rpc('delete_category', { p_user: userId, p_category: id });
    throwIfError('deleteCategory', error);
    return data;
  }

  // ใช้บอกผู้ใช้ก่อนยืนยันว่าจะมีกี่แถวย้ายไปหมวด อื่นๆ
  async function countCategoryUsage(userId, id) {
    const count = (table, ownerColumn) =>
      supabase.from(table).select('id', { count: 'exact', head: true }).eq(ownerColumn, userId).eq('category_id', id);
    const results = await Promise.all([count('transactions', 'user_id'), count('recurring_rules', 'user_id'), count('bills', 'owner_id')]);
    for (const { error } of results) throwIfError('countCategoryUsage', error);
    const [transactions, recurring, bills] = results.map((result) => result.count);
    return { transactions, recurring, bills };
  }
```

และเพิ่ม `deleteCategory,` กับ `countCategoryUsage,` ใน object ที่ return ถัดจาก `updateCategory,`

- [ ] **Step 4: รันให้ผ่าน**

Run: `npx vitest run src/db/repository.test.js`
Expected: PASS ทั้งไฟล์

- [ ] **Step 5: Commit**

```bash
git add src/db/repository.js src/db/repository.test.js
git commit -m "feat: let the repository delete a category and count what it holds"
```

---

### Task 3: API GET /api/categories/:id/usage และ DELETE /api/categories/:id

**Depends on:** none (mock repository ตาม interface ของ Task 2)

**Files:**
- Modify: `src/api/router.js` (เพิ่ม 2 route ถัดจาก `router.patch('/categories/:id'` ~บรรทัด 112-150)
- Test: `src/api/router.test.js` (ใน `describe('categories API'` ~บรรทัด 223)

**Interfaces:**
- Consumes: `repository.listCategories(userId)`, `repository.countCategoryUsage(userId, id)`, `repository.deleteCategory(userId, id)` (Task 2)
- Produces:
  - `GET /api/categories/:id/usage` -> 200 `{ usage: { transactions, recurring, bills } }`, 404 `{ error: 'Not found' }`, 400 `{ error: 'System category' }`
  - `DELETE /api/categories/:id` -> 204 ไม่มี body, 404 `{ error: 'Not found' }`, 400 `{ error: 'System category' }`

- [ ] **Step 1: เขียนเทสต์ที่ fail**

ใน `src/api/router.test.js` ภายใน `describe('categories API'` ฟังก์ชัน `withCategories` เพิ่มสองบรรทัดนี้ก่อน `return deps;`:

```js
    deps.repository.countCategoryUsage = vi.fn().mockResolvedValue({ transactions: 3, recurring: 1, bills: 0 });
    deps.repository.deleteCategory = vi.fn().mockResolvedValue('deleted');
```

แล้วเพิ่มเทสต์ท้าย describe เดียวกัน:

```js
  it('counts what a category holds before deleting it', async () => {
    const deps = withCategories([CAT, OTHER]);
    const base = await start(deps);

    const res = await call(base, `/categories/${CAT_ID}/usage`);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ usage: { transactions: 3, recurring: 1, bills: 0 } });
    expect(deps.repository.countCategoryUsage).toHaveBeenCalledWith('user-1', CAT_ID);
  });

  it('deletes a category', async () => {
    const deps = withCategories([CAT, OTHER]);
    const base = await start(deps);

    const res = await call(base, `/categories/${CAT_ID}`, { method: 'DELETE' });

    expect(res.status).toBe(204);
    expect(deps.repository.deleteCategory).toHaveBeenCalledWith('user-1', CAT_ID);
  });

  it('refuses to count or delete a system category', async () => {
    const deps = withCategories([CAT, OTHER]);
    const base = await start(deps);

    const usage = await call(base, `/categories/${OTHER_ID}/usage`);
    const deleted = await call(base, `/categories/${OTHER_ID}`, { method: 'DELETE' });

    expect(usage.status).toBe(400);
    expect(await usage.json()).toEqual({ error: 'System category' });
    expect(deleted.status).toBe(400);
    expect(await deleted.json()).toEqual({ error: 'System category' });
    expect(deps.repository.deleteCategory).not.toHaveBeenCalled();
  });

  it('answers 404 for an unknown, a non-uuid or an already deleted category', async () => {
    const deps = withCategories([CAT, OTHER]);
    deps.repository.deleteCategory.mockResolvedValue('not_found');
    const base = await start(deps);

    const unknownUsage = await call(base, '/categories/99999999-8888-7777-6666-555555555555/usage');
    const badDelete = await call(base, '/categories/abc', { method: 'DELETE' });
    const gone = await call(base, `/categories/${CAT_ID}`, { method: 'DELETE' });

    expect(unknownUsage.status).toBe(404);
    expect(badDelete.status).toBe(404);
    expect(gone.status).toBe(404);
    expect(await gone.json()).toEqual({ error: 'Not found' });
  });

  it('deletes a category whose id in the url is uppercase', async () => {
    const lettered = { ...CAT, id: 'abcdef12-3333-4444-5555-666666666666' };
    const deps = withCategories([lettered, OTHER]);
    const base = await start(deps);

    const res = await call(base, `/categories/${lettered.id.toUpperCase()}`, { method: 'DELETE' });

    expect(res.status).toBe(204);
    expect(deps.repository.deleteCategory).toHaveBeenCalledWith('user-1', lettered.id);
  });

  it('refuses to delete without a valid token', async () => {
    const deps = withCategories([CAT, OTHER]);
    const base = await start(deps);

    const res = await call(base, `/categories/${CAT_ID}`, { token: null, method: 'DELETE' });

    expect(res.status).toBe(401);
    expect(deps.repository.deleteCategory).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: รันให้เห็นว่า fail**

Run: `npx vitest run src/api/router.test.js -t "categories API"`
Expected: FAIL ที่เทสต์ใหม่ (route ยังไม่มี ได้ 404 แทน 200/204/400)

- [ ] **Step 3: เขียนโค้ด**

ใน `src/api/router.js` เพิ่ม helper ถัดจาก `countVisible` (~บรรทัด 26):

```js
// Postgres คืน uuid เป็นตัวพิมพ์เล็กเสมอ แต่ UUID_PATTERN รับตัวพิมพ์ใหญ่ด้วย
async function findOwnCategory(repository, userId, rawId) {
  if (!UUID_PATTERN.test(rawId)) return { status: 'not_found' };
  const id = rawId.toLowerCase();
  const category = (await repository.listCategories(userId)).find((item) => item.id === id);
  if (!category) return { status: 'not_found' };
  if (isSystemCategory(category.type, category.name)) return { status: 'system' };
  return { status: 'ok', category };
}

function answerCategoryLookup(res, found) {
  if (found.status === 'not_found') res.status(404).json({ error: 'Not found' });
  else res.status(400).json({ error: 'System category' });
}
```

และเพิ่ม route ถัดจาก `router.patch('/categories/:id', ...)`:

```js
  router.get('/categories/:id/usage', async (req, res) => {
    const found = await findOwnCategory(repository, req.userId, req.params.id);
    if (found.status !== 'ok') {
      answerCategoryLookup(res, found);
      return;
    }
    res.json({ usage: await repository.countCategoryUsage(req.userId, found.category.id) });
  });

  router.delete('/categories/:id', async (req, res) => {
    const found = await findOwnCategory(repository, req.userId, req.params.id);
    if (found.status !== 'ok') {
      answerCategoryLookup(res, found);
      return;
    }
    // ตรวจซ้ำใน SQL เพราะหมวดอาจถูกลบไปแล้วระหว่างที่อ่านรายการหมวด
    const status = await repository.deleteCategory(req.userId, found.category.id);
    if (status !== 'deleted') {
      answerCategoryLookup(res, { status });
      return;
    }
    res.status(204).end();
  });
```

ห้ามแก้ route PATCH เดิม (ไม่ refactor ให้ใช้ helper ใหม่)

- [ ] **Step 4: รันให้ผ่าน**

Run: `npx vitest run src/api/router.test.js`
Expected: PASS ทั้งไฟล์

- [ ] **Step 5: Commit**

```bash
git add src/api/router.js src/api/router.test.js
git commit -m "feat: add the category usage and delete endpoints"
```

---

### Task 4: ปุ่มลบหมวดใน sheet แก้หมวด (LIFF)

**Depends on:** none (mock fetch ตาม interface ของ Task 3)

**Files:**
- Modify: `public/liff/api.mjs:37-40` (เพิ่ม 2 method)
- Modify: `public/liff/categories-format.mjs` (เพิ่ม `describeCategoryUsage`)
- Modify: `public/liff/categories-panel.mjs` (setBusy, openSheet, handler ปุ่มลบ)
- Modify: `public/liff/index.html:533-534` (เพิ่มแถวปุ่มลบและกล่องยืนยันใน `#category-sheet-form`)
- Modify: `public/liff/app.mjs:240-262` (ส่ง element ใหม่เข้า `createCategoriesPanel`)
- Modify: `public/liff/style.css` (style ปุ่มลบและกล่องยืนยัน)
- Test: `public/liff/api.test.mjs`, `public/liff/categories-format.test.mjs`, `public/liff/app.dom.test.mjs` (ใน `describe('LIFF categories page'` ~บรรทัด 3218)

**Interfaces:**
- Consumes: `GET /api/categories/:id/usage` -> `{ usage: { transactions, recurring, bills } }`, `DELETE /api/categories/:id` -> 204
- Produces:
  - `api.getCategoryUsage(id)` -> `Promise<{ usage }>`
  - `api.deleteCategory(id)` -> `Promise<true>` (คืน `true` ไม่ใช่ `null` เพราะ `send()` ใน panel ถือว่า `null` คือ error)
  - `describeCategoryUsage(category, usage)` -> string

**Browser check:**
- Preconditions: deploy บน Render แล้ว และรัน `019_delete_category.sql` ใน Supabase แล้ว เปิดหน้าเว็บของบอทในแอป LINE มีหมวด ค่าแมว (รายจ่าย) ที่มีรายการอย่างน้อย 1 รายการ
- Base URL: เปิดจาก Rich Menu ในแอป LINE

| # | Action | Expected |
|---|---|---|
| 1 | แท็บงบประมาณ > กด หมวดของฉัน > กด tile ค่าแมว | sheet แก้หมวดเปิด มีปุ่ม ลบหมวด สีแดงอยู่ใต้ช่องซ่อนหมวด |
| 2 | กด ลบหมวด | เห็นข้อความ "ลบหมวด ค่าแมว? รายการ N รายการ จะย้ายไปหมวด อื่นๆ และงบของหมวดนี้จะหายไป" กับปุ่ม ไม่ลบ และ ลบเลย |
| 3 | กด ไม่ลบ | ข้อความยืนยันหายไป sheet ยังเปิดอยู่ |
| 4 | กด ลบหมวด แล้วกด ลบเลย | sheet ปิด หัวหน้าขึ้น "ลบหมวด ค่าแมว แล้ว" ไม่มี tile ค่าแมว |
| 5 | กดย้อนกลับ ไปแท็บรายการ | รายการที่เคยอยู่ใน ค่าแมว ขึ้นเป็นหมวด อื่นๆ ยอดรวมเท่าเดิม |
| 6 | เข้าหน้าหมวดของฉัน กด tile เพิ่มหมวด | sheet เพิ่มหมวดไม่มีปุ่ม ลบหมวด |

- [ ] **Step 1: เขียนเทสต์ที่ fail (format + api)**

ต่อท้าย `public/liff/categories-format.test.mjs` (และเพิ่ม `describeCategoryUsage` ใน import จาก `./categories-format.mjs` บรรทัด 2):

```js
describe('describeCategoryUsage', () => {
  const cat = { name: 'ค่าแมว', type: 'expense' };

  it('lists only what will move and warns that the budget goes away for an expense category', () => {
    expect(describeCategoryUsage(cat, { transactions: 3, recurring: 1, bills: 0 })).toBe(
      'ลบหมวด ค่าแมว? รายการ 3 รายการ และรายการประจำ 1 รายการ จะย้ายไปหมวด อื่นๆ และงบของหมวดนี้จะหายไป'
    );
    expect(describeCategoryUsage(cat, { transactions: 2, recurring: 1, bills: 4 })).toBe(
      'ลบหมวด ค่าแมว? รายการ 2 รายการ, รายการประจำ 1 รายการ และบิล 4 ใบ จะย้ายไปหมวด อื่นๆ และงบของหมวดนี้จะหายไป'
    );
  });

  it('says so when the category holds nothing, and leaves the budget note off income', () => {
    expect(describeCategoryUsage(cat, { transactions: 0, recurring: 0, bills: 0 })).toBe('ลบหมวด ค่าแมว? หมวดนี้ยังไม่มีรายการ และงบของหมวดนี้จะหายไป');
    expect(describeCategoryUsage({ name: 'โบนัส', type: 'income' }, { transactions: 1, recurring: 0, bills: 0 })).toBe(
      'ลบหมวด โบนัส? รายการ 1 รายการ จะย้ายไปหมวด อื่นๆ'
    );
  });
});
```

ใน `public/liff/api.test.mjs` ดูรูปแบบเทสต์ของ `updateCategory` ที่มีอยู่ (ค้นด้วย `grep -n "updateCategory" public/liff/api.test.mjs`) แล้วเพิ่มเทสต์ในรูปแบบเดียวกันว่า
- `getCategoryUsage('c 1')` เรียก `GET /api/categories/c%201/usage`
- `deleteCategory('c 1')` เรียก `DELETE /api/categories/c%201` และเมื่อ server ตอบ 204 ได้ค่า `true`

- [ ] **Step 2: รันให้เห็นว่า fail**

Run: `npx vitest run public/liff/categories-format.test.mjs public/liff/api.test.mjs`
Expected: FAIL ด้วย `describeCategoryUsage is not a function` และ `getCategoryUsage is not a function`

- [ ] **Step 3: เขียนโค้ด format + api**

ต่อท้าย `public/liff/categories-format.mjs`:

```js
// บอกก่อนยืนยันว่าอะไรจะย้ายไป อื่นๆ ผู้ใช้จะได้ไม่ตกใจว่ารายการหาย
export function describeCategoryUsage(category, usage) {
  const parts = [
    usage.transactions > 0 ? `รายการ ${usage.transactions} รายการ` : null,
    usage.recurring > 0 ? `รายการประจำ ${usage.recurring} รายการ` : null,
    usage.bills > 0 ? `บิล ${usage.bills} ใบ` : null,
  ].filter(Boolean);
  const moved =
    parts.length === 0
      ? 'หมวดนี้ยังไม่มีรายการ'
      : `${parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} และ${parts[parts.length - 1]}`} จะย้ายไปหมวด อื่นๆ`;
  const budget = category.type === 'expense' ? ' และงบของหมวดนี้จะหายไป' : '';
  return `ลบหมวด ${category.name}? ${moved}${budget}`;
}
```

ใน `public/liff/api.mjs` ถัดจาก `updateCategory`:

```js
    getCategoryUsage: (id) => request(`/categories/${encodeURIComponent(id)}/usage`),
    // คืน true เพราะ 204 ได้ null ซึ่งฝั่ง panel ใช้แทนความล้มเหลว
    deleteCategory: (id) => request(`/categories/${encodeURIComponent(id)}`, { method: 'DELETE' }).then(() => true),
```

- [ ] **Step 4: รันให้ผ่าน**

Run: `npx vitest run public/liff/categories-format.test.mjs public/liff/api.test.mjs`
Expected: PASS

- [ ] **Step 5: เขียน DOM test ที่ fail**

ใน `public/liff/app.dom.test.mjs` ภายใน `describe('LIFF categories page'` เพิ่ม (ใช้ `openPage`, `tileOf`, `tileNames`, `isOpen` ที่มีอยู่แล้ว):

```js
  it('deletes a category after showing what will move', async () => {
    const { calls } = await openPage((method, path) => {
      if (method === 'GET' && path === '/api/categories/c-cat/usage') return { usage: { transactions: 2, recurring: 0, bills: 0 } };
      if (method === 'DELETE' && path === '/api/categories/c-cat') return null;
      return undefined;
    });
    const listBefore = calls.filter((call) => call === 'GET /api/transactions').length;

    tileOf('c-cat').click();
    expect(byId('category-sheet-delete-row').hidden).toBe(false);
    byId('category-sheet-delete').click();
    await settle();

    expect(byId('category-sheet-confirm').hidden).toBe(false);
    expect(byId('category-sheet-confirm-text').textContent).toBe(
      'ลบหมวด ค่าแมว? รายการ 2 รายการ จะย้ายไปหมวด อื่นๆ และงบของหมวดนี้จะหายไป'
    );
    expect(document.activeElement).toBe(byId('category-sheet-confirm-cancel'));
    byId('category-sheet-confirm-ok').click();
    await settle();

    expect(calls).toContain('DELETE /api/categories/c-cat');
    expect(isOpen()).toBe(false);
    expect(tileNames()).toEqual(['อาหาร', 'อื่นๆ', 'เพิ่มหมวด']);
    expect(byId('category-status').textContent).toBe('ลบหมวด ค่าแมว แล้ว');
    // รายการที่ย้ายไป อื่นๆ ต้องแสดงชื่อหมวดใหม่ จึงโหลดใหม่
    expect(calls.filter((call) => call === 'GET /api/transactions').length).toBe(listBefore + 1);
    expect(document.activeElement).toBe(document.querySelector('[data-action="add"]'));
  });

  it('keeps the category when the user backs out of the delete', async () => {
    const { calls } = await openPage((method, path) =>
      method === 'GET' && path === '/api/categories/c-cat/usage' ? { usage: { transactions: 0, recurring: 0, bills: 0 } } : undefined
    );

    tileOf('c-cat').click();
    byId('category-sheet-delete').click();
    await settle();
    byId('category-sheet-confirm-cancel').click();

    expect(byId('category-sheet-confirm').hidden).toBe(true);
    expect(isOpen()).toBe(true);
    expect(document.activeElement).toBe(byId('category-sheet-delete'));
    expect(calls.some((call) => call.startsWith('DELETE'))).toBe(false);
  });

  it('has no delete button when adding and shows the reason when the delete fails', async () => {
    await openPage((method, path) => {
      if (method === 'GET' && path === '/api/categories/c-cat/usage') return { usage: { transactions: 0, recurring: 0, bills: 0 } };
      return undefined;
    });

    document.querySelector('[data-action="add"]').click();
    expect(byId('category-sheet-delete-row').hidden).toBe(true);
    byId('category-sheet-cancel').click();

    const original = globalThis.fetch;
    vi.stubGlobal('fetch', async (url, options = {}) =>
      options.method === 'DELETE' ? new Response(JSON.stringify({ error: 'Not found' }), { status: 404 }) : original(url, options)
    );
    tileOf('c-cat').click();
    byId('category-sheet-delete').click();
    await settle();
    byId('category-sheet-confirm-ok').click();
    await settle();

    expect(isOpen()).toBe(true);
    expect(byId('category-sheet-error').textContent).toBe('ไม่พบหมวดนี้แล้ว ลองเปิดหน้าใหม่');
    expect(tileOf('c-cat')).not.toBeNull();
  });
```

หมายเหตุสำหรับคนทำ: ตรวจก่อนว่า helper `makeFetch` ในไฟล์นี้ตอบ `null` เป็น 204 หรือไม่ (`grep -n "function makeFetch" -A20 public/liff/app.dom.test.mjs`) ถ้าไม่ ให้ให้ route ของ DELETE ใน test แรกคืน `{}` แทน `null` (`api.deleteCategory` ไม่สน body อยู่แล้ว)

- [ ] **Step 6: รันให้เห็นว่า fail**

Run: `npx vitest run public/liff/app.dom.test.mjs -t "LIFF categories page"`
Expected: FAIL ด้วย `Cannot read properties of null` เพราะยังไม่มี `#category-sheet-delete-row`

- [ ] **Step 7: เพิ่ม HTML และ CSS**

ใน `public/liff/index.html` ระหว่าง `<p id="category-sheet-error" ...>` กับ `<div class="category-sheet-footer">`:

```html
      <div id="category-sheet-delete-row" class="category-delete-row">
        <button type="button" id="category-sheet-delete" class="category-delete">ลบหมวด</button>
      </div>
      <div id="category-sheet-confirm" class="category-delete-confirm" hidden>
        <p id="category-sheet-confirm-text" class="confirm-detail"></p>
        <div class="actions">
          <button type="button" id="category-sheet-confirm-cancel">ไม่ลบ</button>
          <button type="button" id="category-sheet-confirm-ok" class="danger-solid">ลบเลย</button>
        </div>
      </div>
```

ต่อท้าย `public/liff/style.css`:

```css
.category-delete-row { margin-top: 12px; }
.category-delete { color: var(--danger); border-color: var(--danger); background: transparent; }
.category-delete-confirm { margin-top: 12px; padding: 12px; border: 1px solid var(--danger); border-radius: 12px; }
.category-delete:disabled, .category-delete-confirm button:disabled { color: var(--muted); border-color: var(--muted); cursor: not-allowed; }
```

(ตรวจว่า `--danger` และ `--muted` มีใน `public/liff/tokens.css` ก่อนใช้ ถ้า `style.test.mjs` หรือ `tokens.test.mjs` มีกฎเรื่อง token ให้ทำตาม)

- [ ] **Step 8: ต่อ element ใน app.mjs**

ใน `public/liff/app.mjs` ใน `els:` ของ `createCategoriesPanel({...})` เพิ่มถัดจาก `sheetCancel`:

```js
    sheetDeleteRow: document.getElementById('category-sheet-delete-row'),
    sheetDelete: document.getElementById('category-sheet-delete'),
    sheetConfirm: document.getElementById('category-sheet-confirm'),
    sheetConfirmText: document.getElementById('category-sheet-confirm-text'),
    sheetConfirmOk: document.getElementById('category-sheet-confirm-ok'),
    sheetConfirmCancel: document.getElementById('category-sheet-confirm-cancel'),
```

`onChanged` เดิมรองรับ `{ refresh: true }` อยู่แล้ว (โหลดรายการ งบ และรายการประจำใหม่) ไม่ต้องแก้

- [ ] **Step 9: เขียนโค้ดใน categories-panel.mjs**

แก้ import บรรทัด 4 เป็น:

```js
import { describeCategoryError, describeCategoryUsage } from './categories-format.mjs';
```

ใน `setBusy` เพิ่มก่อน `els.sheetBusy.hidden = !next;`:

```js
    els.sheetDelete.disabled = next;
    els.sheetConfirmOk.disabled = next;
    els.sheetConfirmCancel.disabled = next;
```

ใน `openSheet` เพิ่มก่อน `renderIconChoices();`:

```js
    els.sheetDeleteRow.hidden = !category;
    els.sheetConfirm.hidden = true;
```

เพิ่ม function ถัดจาก `submitEdit`:

```js
  async function askDelete() {
    const category = editing;
    els.sheetError.textContent = '';
    const result = await send(() => getApi().getCategoryUsage(category.id));
    if (!result || editing !== category) return;
    els.sheetConfirmText.textContent = describeCategoryUsage(category, result.usage);
    els.sheetConfirm.hidden = false;
    // ปุ่มที่โฟกัสก่อนคือไม่ลบ กันกด Enter แล้วลบโดยไม่ตั้งใจ
    els.sheetConfirmCancel.focus();
  }

  async function confirmDelete() {
    const category = editing;
    els.sheetError.textContent = '';
    const result = await send(() => getApi().deleteCategory(category.id));
    if (!result) return;
    // รายการที่ย้ายไป อื่นๆ ต้องแสดงชื่อหมวดใหม่ จึงโหลดรายการ งบ และรายการประจำใหม่
    onChanged(
      getCategories().filter((item) => item.id !== category.id),
      { refresh: true }
    );
    setStatus(`ลบหมวด ${category.name} แล้ว`);
    closeSheet('[data-action="add"]');
  }
```

และเพิ่ม listener ถัดจาก `els.sheetClose.addEventListener(...)`:

```js
  els.sheetDelete.addEventListener('click', () => {
    if (!busy && editing) askDelete();
  });
  els.sheetConfirmOk.addEventListener('click', () => {
    if (!busy && editing) confirmDelete();
  });
  els.sheetConfirmCancel.addEventListener('click', () => {
    els.sheetConfirm.hidden = true;
    els.sheetDelete.focus();
  });
```

- [ ] **Step 10: รันให้ผ่าน**

Run: `npx vitest run public/liff`
Expected: PASS ทุกไฟล์ใน `public/liff`

- [ ] **Step 11: Commit**

```bash
git add public/liff/api.mjs public/liff/api.test.mjs public/liff/categories-format.mjs public/liff/categories-format.test.mjs public/liff/categories-panel.mjs public/liff/index.html public/liff/app.mjs public/liff/style.css public/liff/app.dom.test.mjs
git commit -m "feat: delete a category from its sheet after confirming what moves"
```

---

### Task 5: เอกสาร

**Depends on:** Task 1, Task 2, Task 3, Task 4

**Files:**
- Modify: `README.md` (ขั้นตอนตั้งค่าที่บอกให้รัน `002` ถึง `018` และประโยค deploy), `SPEC.md` (ส่วนหมวดของฉัน), `work-memory/STATE.md`

**Interfaces:**
- Consumes: พฤติกรรมจาก Task 1-4

- [ ] **Step 1: อัปเดต README และ SPEC**

- README: ทุกจุดที่บอกช่วงไฟล์ SQL ที่ต้องรัน (ค้นด้วย `grep -n "018\|017" README.md`) ให้รวม `019` และในส่วนหมวดของฉันเพิ่มว่า ลบหมวดได้ รายการ รายการประจำ และบิลย้ายไป อื่นๆ งบของหมวดนั้นหายไป หมวดระบบลบไม่ได้
- SPEC: ในส่วนกฎของหมวด (ค้นด้วย `grep -n "ซ่อน" SPEC.md`) เพิ่มกฎการลบแบบเดียวกัน
- ทุกประโยคต้องตรงกับโค้ดที่อ่านจริง

- [ ] **Step 2: อัปเดต STATE**

ใน `work-memory/STATE.md` ส่วน Next เพิ่มบรรทัด: ลบหมวด (แผน docs/superpowers/plans/2026-10-19-delete-category.md) Task 1-5 เสร็จ ผู้ใช้ต้องรัน `supabase/019_delete_category.sql` ก่อน push และทำ Browser check ของ Task 4 ในแอป LINE

- [ ] **Step 3: ตรวจทั้งหมดแล้ว commit**

Run: `npm test`, `npm run lint`, `node --check index.js`
Expected: ผ่านทั้งหมด

```bash
git add README.md SPEC.md work-memory/STATE.md
git commit -m "docs: describe deleting a category"
```

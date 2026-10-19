import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { PGlite } from '@electric-sql/pglite';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';

const { FRIEND_CODE_ALPHABET } = createRequire(import.meta.url)('../friends/code.js');

// ลำดับเดียวกับที่ schema.sql บอกให้รันใน Supabase SQL Editor
const MIGRATIONS = [
  'schema.sql',
  '002_pending_clarifications.sql',
  '003_summary_function.sql',
  '004_export_links.sql',
  '005_budgets.sql',
  '006_pending_slips.sql',
  '007_pending_slips_items.sql',
  '008_pending_slips_event_index.sql',
  '009_recurring.sql',
  '010_profile_and_trend.sql',
  '011_slip_category.sql',
  '012_friends.sql',
  '013_bills.sql',
  '014_bill_indexes.sql',
  '015_bill_invariants.sql',
  '017_category_hidden.sql',
  '018_category_icon.sql',
  '019_delete_category.sql',
  '020_query_totals.sql',
  '021_notification_settings.sql',
  '022_daily_reminder.sql',
  '023_savings_goals.sql',
  '024_wallets.sql',
];

const readMigration = (file) => readFileSync(new URL(`../../supabase/${file}`, import.meta.url), 'utf8');

let db;

beforeAll(async () => {
  db = new PGlite();
  // role ของ Supabase ที่ migration อ้างถึงใน grant/revoke; service_role ของจริงข้าม RLS และใช้ตารางได้
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
  for (const file of MIGRATIONS) {
    await db.exec(readMigration(file));
  }
  await db.exec('grant usage on schema public to service_role; grant all on all tables in schema public to service_role;');
}, 60000);

afterAll(async () => {
  await db.close();
});

// แต่ละเทสต์อยู่ใน transaction ที่ rollback ทิ้ง ข้อมูลจึงไม่ข้ามเทสต์
beforeEach(async () => {
  await db.exec('begin');
});

afterEach(async () => {
  await db.exec('rollback');
});

async function one(sql, params = []) {
  const { rows } = await db.query(sql, params);
  return rows[0];
}

async function rows(sql, params = []) {
  return (await db.query(sql, params)).rows;
}

async function createUser(lineUserId) {
  return (await one('insert into users (line_user_id) values ($1) returning id', [lineUserId])).id;
}

async function createCategory(userId, name, type) {
  return (await one('insert into categories (user_id, name, type) values ($1, $2, $3) returning id', [userId, name, type])).id;
}

async function addTransaction(userId, categoryId, type, amount, occurredOn) {
  await db.query('insert into transactions (user_id, category_id, type, amount, occurred_on) values ($1, $2, $3, $4, $5)', [
    userId,
    categoryId,
    type,
    amount,
    occurredOn,
  ]);
}

// numeric และ bigint กลับมาเป็น string/bigint แปลงเป็น number ให้เทียบง่าย
function numbers(row) {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, typeof value === 'bigint' || /^-?\d+(\.\d+)?$/.test(value) ? Number(value) : value]),
  );
}

describe('summarize_transactions', () => {
  it('totals this user rows in the date range by type and category, biggest first', async () => {
    const user = await createUser('U1');
    const other = await createUser('U2');
    const food = await createCategory(user, 'อาหาร', 'expense');
    const trip = await createCategory(user, 'เดินทาง', 'expense');
    const salary = await createCategory(user, 'เงินเดือน', 'income');
    const otherFood = await createCategory(other, 'อาหาร', 'expense');
    await addTransaction(user, food, 'expense', 60, '2026-09-01');
    await addTransaction(user, food, 'expense', 45.5, '2026-09-30');
    await addTransaction(user, trip, 'expense', 300, '2026-09-15');
    await addTransaction(user, salary, 'income', 25000, '2026-09-25');
    await addTransaction(user, food, 'expense', 999, '2026-10-01');
    await addTransaction(user, food, 'expense', 999, '2026-08-31');
    await addTransaction(other, otherFood, 'expense', 777, '2026-09-10');

    const result = await rows('select * from summarize_transactions($1, $2, $3)', [user, '2026-09-01', '2026-09-30']);

    expect(result.map(numbers)).toEqual([
      { type: 'expense', category: 'เดินทาง', total: 300, entry_count: 1 },
      { type: 'expense', category: 'อาหาร', total: 105.5, entry_count: 2 },
      { type: 'income', category: 'เงินเดือน', total: 25000, entry_count: 1 },
    ]);
  });

  it('returns no rows for a month without entries', async () => {
    const user = await createUser('U1');

    expect(await rows('select * from summarize_transactions($1, $2, $3)', [user, '2026-09-01', '2026-09-30'])).toEqual([]);
  });
});

describe('query_totals', () => {
  async function addNoted(userId, categoryId, type, amount, occurredOn, note) {
    await db.query(
      'insert into transactions (user_id, category_id, type, amount, occurred_on, note) values ($1, $2, $3, $4, $5, $6)',
      [userId, categoryId, type, amount, occurredOn, note],
    );
  }

  async function totals(userId, type, category = '', keyword = '', from = '2026-10-01', to = '2026-10-31') {
    const result = await rows('select * from query_totals($1, $2, $3, $4, $5, $6)', [userId, from, to, type, category, keyword]);
    return result.map(numbers);
  }

  it('totals this user rows in the range by type when asked for both', async () => {
    const user = await createUser('U1');
    const other = await createUser('U2');
    const food = await createCategory(user, 'อาหาร', 'expense');
    const salary = await createCategory(user, 'เงินเดือน', 'income');
    const otherFood = await createCategory(other, 'อาหาร', 'expense');
    await addNoted(user, food, 'expense', 60, '2026-10-01', 'กินข้าว');
    await addNoted(user, food, 'expense', 45.5, '2026-10-31', 'กาแฟ');
    await addNoted(user, salary, 'income', 25000, '2026-10-25', 'เงินเดือน');
    await addNoted(user, food, 'expense', 999, '2026-09-30', 'นอกช่วง');
    await addNoted(user, food, 'expense', 999, '2026-11-01', 'นอกช่วง');
    await addNoted(other, otherFood, 'expense', 777, '2026-10-10', 'กาแฟ');

    expect(await totals(user, 'both')).toEqual([
      { type: 'expense', total: 105.5, entry_count: 2 },
      { type: 'income', total: 25000, entry_count: 1 },
    ]);
    expect(await totals(user, 'expense')).toEqual([{ type: 'expense', total: 105.5, entry_count: 2 }]);
  });

  it('filters by category name across both types', async () => {
    const user = await createUser('U1');
    const food = await createCategory(user, 'อาหาร', 'expense');
    const otherExpense = await createCategory(user, 'อื่นๆ', 'expense');
    const otherIncome = await createCategory(user, 'อื่นๆ', 'income');
    await addNoted(user, food, 'expense', 60, '2026-10-01', 'กินข้าว');
    await addNoted(user, otherExpense, 'expense', 30, '2026-10-02', 'ค่าจอด');
    await addNoted(user, otherIncome, 'income', 500, '2026-10-03', 'ขายของ');

    expect(await totals(user, 'both', 'อื่นๆ')).toEqual([
      { type: 'expense', total: 30, entry_count: 1 },
      { type: 'income', total: 500, entry_count: 1 },
    ]);
    expect(await totals(user, 'expense', 'อาหาร')).toEqual([{ type: 'expense', total: 60, entry_count: 1 }]);
  });

  it('finds the keyword anywhere in the note ignoring letter case', async () => {
    const user = await createUser('U1');
    const food = await createCategory(user, 'อาหาร', 'expense');
    await addNoted(user, food, 'expense', 45, '2026-10-01', 'กาแฟเย็น');
    await addNoted(user, food, 'expense', 55, '2026-10-02', 'Coffee ร้านหน้าออฟฟิศ');
    await addNoted(user, food, 'expense', 60, '2026-10-03', 'กินข้าว');

    expect(await totals(user, 'expense', '', 'กาแฟ')).toEqual([{ type: 'expense', total: 45, entry_count: 1 }]);
    expect(await totals(user, 'expense', '', 'coffee')).toEqual([{ type: 'expense', total: 55, entry_count: 1 }]);
  });

  // คำค้นมาจากข้อความผู้ใช้ % และ _ ต้องเป็นตัวอักษรธรรมดา ไม่ใช่ wildcard ที่จับทุกแถว
  it('treats % and _ in the keyword as plain characters', async () => {
    const user = await createUser('U1');
    const food = await createCategory(user, 'อาหาร', 'expense');
    await addNoted(user, food, 'expense', 10, '2026-10-01', 'ลด 50% ร้านกาแฟ');
    await addNoted(user, food, 'expense', 20, '2026-10-02', 'กินข้าว');
    await addNoted(user, food, 'expense', 30, '2026-10-03', 'a_b');

    expect(await totals(user, 'expense', '', '%')).toEqual([{ type: 'expense', total: 10, entry_count: 1 }]);
    expect(await totals(user, 'expense', '', '_')).toEqual([{ type: 'expense', total: 30, entry_count: 1 }]);
  });

  it('returns no rows when nothing matches', async () => {
    const user = await createUser('U1');

    expect(await totals(user, 'both')).toEqual([]);
  });
});

describe('budget_status', () => {
  it('lists every expense category with the latest budget up to the month and the month spending', async () => {
    const user = await createUser('U1');
    const food = await createCategory(user, 'อาหาร', 'expense');
    // PGlite เรียงข้อความแบบ C collation ต่างจาก Supabase จึงใช้ชื่อที่ไม่ขึ้นต้นด้วยสระหน้า ให้ลำดับตรงกันทั้งสองแบบ
    const trip = await createCategory(user, 'รถ', 'expense');
    const shop = await createCategory(user, 'ช้อปปิ้ง', 'expense');
    await createCategory(user, 'เงินเดือน', 'income');
    await db.query('insert into budgets (user_id, category_id, month, amount) values ($1, $2, $3, $4)', [user, food, '2026-07-01', 2000]);
    await db.query('insert into budgets (user_id, category_id, month, amount) values ($1, $2, $3, $4)', [user, food, '2026-09-01', 3000]);
    // งบของเดือนหลังจากเดือนที่ถามยังไม่มีผล
    await db.query('insert into budgets (user_id, category_id, month, amount) values ($1, $2, $3, $4)', [user, food, '2026-11-01', 9000]);
    await db.query('insert into budgets (user_id, category_id, month, amount) values ($1, $2, $3, $4)', [user, trip, '2026-08-01', 1000]);
    // amount null = ยกเลิกงบตั้งแต่เดือนนั้น
    await db.query('insert into budgets (user_id, category_id, month, amount) values ($1, $2, $3, null)', [user, trip, '2026-10-01']);
    await addTransaction(user, food, 'expense', 120, '2026-10-01');
    await addTransaction(user, food, 'expense', 80, '2026-10-31');
    await addTransaction(user, food, 'expense', 500, '2026-11-01');
    await addTransaction(user, food, 'expense', 500, '2026-09-30');

    const result = await rows('select * from budget_status($1, $2)', [user, '2026-10-01']);

    expect(result.map(numbers)).toEqual([
      { category_id: shop, category: 'ช้อปปิ้ง', budget: null, spent: 0 },
      { category_id: trip, category: 'รถ', budget: null, spent: 0 },
      { category_id: food, category: 'อาหาร', budget: 3000, spent: 200 },
    ]);
  });

  it('ignores another user budgets and spending', async () => {
    const user = await createUser('U1');
    const other = await createUser('U2');
    const food = await createCategory(user, 'อาหาร', 'expense');
    const otherFood = await createCategory(other, 'อาหาร', 'expense');
    await db.query('insert into budgets (user_id, category_id, month, amount) values ($1, $2, $3, $4)', [other, otherFood, '2026-10-01', 500]);
    await addTransaction(other, otherFood, 'expense', 100, '2026-10-05');

    const result = await rows('select * from budget_status($1, $2)', [user, '2026-10-01']);

    expect(result.map(numbers)).toEqual([{ category_id: food, category: 'อาหาร', budget: null, spent: 0 }]);
  });
});

describe('apply_recurring_rule', () => {
  async function createRule(active = true) {
    const user = await createUser('U1');
    const bill = await createCategory(user, 'ค่าบ้าน', 'expense');
    const rule = (
      await one(
        `insert into recurring_rules (user_id, type, category_id, amount, note, day_of_month, active)
         values ($1, 'expense', $2, 5500, 'ค่าเช่า', 1, $3) returning id`,
        [user, bill, active],
      )
    ).id;
    return { user, bill, rule };
  }

  const eventId = (rule, month) => `recurring:${rule}:${month}`;

  it('records the transaction once and moves last_run_on to the due date', async () => {
    const { user, bill, rule } = await createRule();

    const first = await one('select apply_recurring_rule($1, $2, $3) as applied', [rule, '2026-10-01', eventId(rule, '2026-10')]);
    const second = await one('select apply_recurring_rule($1, $2, $3) as applied', [rule, '2026-10-01', eventId(rule, '2026-10')]);

    expect(first.applied).toBe(true);
    expect(second.applied).toBe(false);
    const saved = await rows('select user_id, category_id, type, amount, note, occurred_on::text, source, line_event_id from transactions');
    expect(saved.map(numbers)).toEqual([
      {
        user_id: user,
        category_id: bill,
        type: 'expense',
        amount: 5500,
        note: 'ค่าเช่า',
        occurred_on: '2026-10-01',
        source: 'recurring',
        line_event_id: eventId(rule, '2026-10'),
      },
    ]);
    expect((await one('select last_run_on::text from recurring_rules where id = $1', [rule])).last_run_on).toBe('2026-10-01');
  });

  it('runs again in the next month', async () => {
    const { rule } = await createRule();
    await one('select apply_recurring_rule($1, $2, $3)', [rule, '2026-10-01', eventId(rule, '2026-10')]);

    const next = await one('select apply_recurring_rule($1, $2, $3) as applied', [rule, '2026-11-01', eventId(rule, '2026-11')]);

    expect(next.applied).toBe(true);
    expect(Number((await one('select count(*) from transactions')).count)).toBe(2);
  });

  it('skips a paused rule', async () => {
    const { rule } = await createRule(false);

    const result = await one('select apply_recurring_rule($1, $2, $3) as applied', [rule, '2026-10-01', eventId(rule, '2026-10')]);

    expect(result.applied).toBe(false);
    expect(Number((await one('select count(*) from transactions')).count)).toBe(0);
    expect((await one('select last_run_on from recurring_rules where id = $1', [rule])).last_run_on).toBeNull();
  });

  it('moves last_run_on without recording when the month event was already claimed', async () => {
    const { user, rule } = await createRule();
    await db.query('insert into line_events (webhook_event_id, user_id) values ($1, $2)', [eventId(rule, '2026-10'), user]);

    const result = await one('select apply_recurring_rule($1, $2, $3) as applied', [rule, '2026-10-01', eventId(rule, '2026-10')]);

    expect(result.applied).toBe(false);
    expect(Number((await one('select count(*) from transactions')).count)).toBe(0);
    expect((await one('select last_run_on::text from recurring_rules where id = $1', [rule])).last_run_on).toBe('2026-10-01');
  });

  it('rejects an event id that does not match the rule and month', async () => {
    const { rule } = await createRule();

    await expect(db.query('select apply_recurring_rule($1, $2, $3)', [rule, '2026-10-01', eventId(rule, '2026-11')])).rejects.toThrow(
      'invalid recurring event id',
    );
  });
});

describe('lifetime_totals', () => {
  it('returns one zero row for a user without entries', async () => {
    const user = await createUser('U1');

    const result = await rows('select * from lifetime_totals($1)', [user]);

    expect(result.map(numbers)).toEqual([{ income: 0, expense: 0, entry_count: 0, first_date: null }]);
  });

  it('sums every entry of this user and finds the first date', async () => {
    const user = await createUser('U1');
    const other = await createUser('U2');
    const food = await createCategory(user, 'อาหาร', 'expense');
    const salary = await createCategory(user, 'เงินเดือน', 'income');
    const otherFood = await createCategory(other, 'อาหาร', 'expense');
    await addTransaction(user, food, 'expense', 60, '2026-05-03');
    await addTransaction(user, food, 'expense', 40.25, '2026-10-01');
    await addTransaction(user, salary, 'income', 25000, '2026-06-25');
    await addTransaction(other, otherFood, 'expense', 999, '2026-01-01');

    const result = await one('select income, expense, entry_count, first_date::text from lifetime_totals($1)', [user]);

    expect(numbers(result)).toEqual({ income: 25000, expense: 100.25, entry_count: 3, first_date: '2026-05-03' });
  });
});

describe('monthly_totals', () => {
  it('totals this user rows in the range by month and type, oldest month first', async () => {
    const user = await createUser('U1');
    const other = await createUser('U2');
    const food = await createCategory(user, 'อาหาร', 'expense');
    const salary = await createCategory(user, 'เงินเดือน', 'income');
    const otherFood = await createCategory(other, 'อาหาร', 'expense');
    await addTransaction(user, food, 'expense', 60, '2026-09-01');
    await addTransaction(user, food, 'expense', 40, '2026-09-30');
    await addTransaction(user, salary, 'income', 25000, '2026-09-25');
    await addTransaction(user, food, 'expense', 100, '2026-10-31');
    await addTransaction(user, food, 'expense', 999, '2026-08-31');
    await addTransaction(user, food, 'expense', 999, '2026-11-01');
    await addTransaction(other, otherFood, 'expense', 777, '2026-09-10');

    const result = await rows('select * from monthly_totals($1, $2, $3)', [user, '2026-09-01', '2026-10-31']);

    expect(result.map(numbers)).toEqual([
      { month: '2026-09', type: 'expense', total: 100 },
      { month: '2026-09', type: 'income', total: 25000 },
      { month: '2026-10', type: 'expense', total: 100 },
    ]);
  });
});

describe('011_slip_category.sql', () => {
  it('gives every existing user the slip expense category once, even when run again', async () => {
    const first = await createUser('U1');
    const second = await createUser('U2');
    await createCategory(first, 'อาหาร', 'expense');

    await db.exec(readMigration('011_slip_category.sql'));
    await db.exec(readMigration('011_slip_category.sql'));

    const result = await rows(
      "select user_id, type from categories where name = 'ใบเสร็จ/สลิปโอนเงิน' order by user_id",
    );
    expect(result).toEqual(
      [first, second].sort().map((userId) => ({ user_id: userId, type: 'expense' })),
    );
  });
});

describe('012_friends.sql', () => {
  it('accepts a well formed friend code and rejects any other shape', async () => {
    const user = await createUser('U1');

    await db.query('update users set friend_code = $1 where id = $2', ['ABCD2345', user]);

    for (const bad of ['abcd2345', 'ABCD234', 'ABCDEFGI', 'ABCDEFG0']) {
      await db.exec('savepoint bad_code');
      await expect(db.query('update users set friend_code = $1 where id = $2', [bad, user])).rejects.toThrow('check constraint');
      await db.exec('rollback to savepoint bad_code');
    }
  });

  it('accepts every character of the JS friend code alphabet', async () => {
    const user = await createUser('U1');

    for (const char of FRIEND_CODE_ALPHABET) {
      await db.query('update users set friend_code = $1 where id = $2', [char.repeat(8), user]);
    }
  });

  it('does not let two users share a friend code', async () => {
    const first = await createUser('U1');
    const second = await createUser('U2');
    await db.query('update users set friend_code = $1 where id = $2', ['ABCD2345', first]);

    await expect(db.query('update users set friend_code = $1 where id = $2', ['ABCD2345', second])).rejects.toThrow(
      'duplicate key',
    );
  });

  it('does not let a user befriend themselves or the same friend twice', async () => {
    const user = await createUser('U1');
    const friend = await createUser('U2');
    await db.query('insert into friendships (user_id, friend_id) values ($1, $2)', [user, friend]);

    await db.exec('savepoint dup');
    await expect(db.query('insert into friendships (user_id, friend_id) values ($1, $2)', [user, friend])).rejects.toThrow(
      'duplicate key',
    );
    await db.exec('rollback to savepoint dup');
    await expect(db.query('insert into friendships (user_id, friend_id) values ($1, $1)', [user])).rejects.toThrow(
      'check constraint',
    );
  });

  // supabase-js อ้างชื่อ FK นี้ตอน embed ชื่อเพื่อน เปลี่ยนชื่อแล้วรายชื่อเพื่อนจะพัง
  it('keeps the foreign key name the repository embeds through, and row level security on', async () => {
    const fk = await one("select conname from pg_constraint where conrelid = 'public.friendships'::regclass and contype = 'f' and conname = 'friendships_friend_id_fkey'");
    const rls = await one("select relrowsecurity from pg_class where oid = 'public.friendships'::regclass");

    expect(fk.conname).toBe('friendships_friend_id_fkey');
    expect(rls.relrowsecurity).toBe(true);
  });

  it('removes the friendships of a deleted user in both directions', async () => {
    const user = await createUser('U1');
    const friend = await createUser('U2');
    await db.query('insert into friendships (user_id, friend_id) values ($1, $2), ($2, $1)', [user, friend]);

    await db.query('delete from users where id = $1', [friend]);

    expect(Number((await one('select count(*) from friendships')).count)).toBe(0);
  });
});

async function setupBill({ ownerShare = 100, shares = [150, 150] } = {}) {
  const owner = await createUser('U1');
  const friends = [];
  for (const [index] of shares.entries()) friends.push(await createUser(`F${index}`));
  const food = await createCategory(owner, 'อาหาร', 'expense');
  const total = ownerShare + shares.reduce((sum, share) => sum + share, 0);
  const members = JSON.stringify(friends.map((userId, index) => ({ user_id: userId, share: shares[index] })));
  const bill = (
    await one('select create_bill($1, $2, $3, $4, $5, $6, $7) as id', [owner, 'เนื้อย่าง', total, food, '2026-10-08', ownerShare, members])
  ).id;
  return { owner, friends, food, bill, total };
}

describe('013_bills.sql', () => {
  it('creates the bill, the owner transaction and one pending row per member in one call', async () => {
    const { owner, friends, bill } = await setupBill();

    const saved = await one('select owner_id, title, total, status, owner_share, owner_transaction_id from bills where id = $1', [bill]);
    expect(numbers(saved)).toMatchObject({ owner_id: owner, title: 'เนื้อย่าง', total: 400, status: 'open', owner_share: 100 });
    const ownerTx = await one('select user_id, type, amount, note, occurred_on::text, source from transactions where id = $1', [
      saved.owner_transaction_id,
    ]);
    expect(numbers(ownerTx)).toEqual({ user_id: owner, type: 'expense', amount: 100, note: 'เนื้อย่าง', occurred_on: '2026-10-08', source: 'bill' });
    const members = await rows('select user_id, share, status, paid, notified from bill_members where bill_id = $1 order by share', [bill]);
    expect(members.map(numbers).map((row) => row.user_id).sort()).toEqual([...friends].sort());
    expect(members.every((row) => row.status === 'pending' && row.paid === false && row.notified === false)).toBe(true);
  });

  it('records no owner transaction when the owner share is zero', async () => {
    const { bill } = await setupBill({ ownerShare: 0, shares: [200] });

    expect((await one('select owner_transaction_id from bills where id = $1', [bill])).owner_transaction_id).toBeNull();
    expect(Number((await one('select count(*) from transactions')).count)).toBe(0);
  });

  it('confirms a pending share once, recording the friend expense in the given category', async () => {
    const { friends, bill } = await setupBill();
    const friendFood = await createCategory(friends[0], 'อาหาร', 'expense');

    const first = await one('select confirm_bill_share($1, $2, $3) as status', [bill, friends[0], friendFood]);
    const again = await one('select confirm_bill_share($1, $2, $3) as status', [bill, friends[0], friendFood]);

    expect([first.status, again.status]).toEqual(['confirmed', 'already_confirmed']);
    const member = await one('select status, transaction_id, responded_at from bill_members where bill_id = $1 and user_id = $2', [bill, friends[0]]);
    expect(member.status).toBe('confirmed');
    expect(member.responded_at).not.toBeNull();
    const tx = await one('select user_id, category_id, amount, note, source from transactions where id = $1', [member.transaction_id]);
    expect(numbers(tx)).toEqual({ user_id: friends[0], category_id: friendFood, amount: 150, note: 'เนื้อย่าง', source: 'bill' });
    expect(Number((await one('select count(*) from transactions where user_id = $1', [friends[0]])).count)).toBe(1);
  });

  it('declines a pending share and reports earlier answers without changing them', async () => {
    const { friends, bill } = await setupBill();
    const friendFood = await createCategory(friends[0], 'อาหาร', 'expense');

    expect((await one('select decline_bill_share($1, $2) as status', [bill, friends[1]])).status).toBe('declined');
    expect((await one('select confirm_bill_share($1, $2, $3) as status', [bill, friends[0], friendFood])).status).toBe('confirmed');
    expect((await one('select decline_bill_share($1, $2) as status', [bill, friends[0]])).status).toBe('already_confirmed');
    expect((await one('select status from bill_members where bill_id = $1 and user_id = $2', [bill, friends[1]])).status).toBe('declined');
  });

  it('reports an earlier confirm distinctly from a new one', async () => {
    const { friends, bill } = await setupBill();
    const friendFood = await createCategory(friends[0], 'อาหาร', 'expense');

    const answers = [];
    answers.push((await one('select confirm_bill_share($1, $2, $3) as status', [bill, friends[0], friendFood])).status);
    answers.push((await one('select confirm_bill_share($1, $2, $3) as status', [bill, friends[0], friendFood])).status);
    answers.push((await one('select decline_bill_share($1, $2) as status', [bill, friends[0]])).status);

    expect(answers).toEqual(['confirmed', 'already_confirmed', 'already_confirmed']);
    expect((await one('select status from bill_members where bill_id = $1 and user_id = $2', [bill, friends[0]])).status).toBe('confirmed');
    expect(Number((await one('select count(*) from transactions where user_id = $1', [friends[0]])).count)).toBe(1);
  });

  it('reports an earlier decline distinctly from a new one', async () => {
    const { friends, bill } = await setupBill();
    const friendFood = await createCategory(friends[0], 'อาหาร', 'expense');

    const answers = [];
    answers.push((await one('select decline_bill_share($1, $2) as status', [bill, friends[0]])).status);
    answers.push((await one('select decline_bill_share($1, $2) as status', [bill, friends[0]])).status);
    answers.push((await one('select confirm_bill_share($1, $2, $3) as status', [bill, friends[0], friendFood])).status);

    expect(answers).toEqual(['declined', 'already_declined', 'already_declined']);
    expect((await one('select status from bill_members where bill_id = $1 and user_id = $2', [bill, friends[0]])).status).toBe('declined');
    expect(Number((await one('select count(*) from transactions where user_id = $1', [friends[0]])).count)).toBe(0);
  });

  it('cancels an open bill of the owner and deletes the owner expense in the same call', async () => {
    const { owner, bill } = await setupBill();
    const ownerTx = (await one('select owner_transaction_id from bills where id = $1', [bill])).owner_transaction_id;

    expect((await one('select cancel_bill($1, $2) as done', [bill, owner])).done).toBe(true);

    expect((await one('select status, owner_transaction_id from bills where id = $1', [bill]))).toEqual({ status: 'cancelled', owner_transaction_id: null });
    expect(Number((await one('select count(*) from transactions where id = $1', [ownerTx])).count)).toBe(0);
  });

  it('keeps friends confirmed expenses when the owner cancels', async () => {
    const { owner, friends, bill } = await setupBill();
    const friendFood = await createCategory(friends[0], 'อาหาร', 'expense');
    await one('select confirm_bill_share($1, $2, $3)', [bill, friends[0], friendFood]);

    await one('select cancel_bill($1, $2)', [bill, owner]);

    expect(Number((await one('select count(*) from transactions where user_id = $1', [friends[0]])).count)).toBe(1);
    expect((await one('select status from bill_members where bill_id = $1 and user_id = $2', [bill, friends[0]])).status).toBe('confirmed');
    expect((await one('select confirm_bill_share($1, $2, $3) as status', [bill, friends[1], friendFood])).status).toBe('cancelled');
  });

  it('cancels a bill without an owner expense', async () => {
    const { owner, bill } = await setupBill({ ownerShare: 0, shares: [200] });

    expect((await one('select cancel_bill($1, $2) as done', [bill, owner])).done).toBe(true);
    expect((await one('select status from bills where id = $1', [bill])).status).toBe('cancelled');
  });

  it('refuses to cancel for another user, a cancelled bill or an unknown bill and changes nothing', async () => {
    const { owner, friends, bill } = await setupBill();

    expect((await one('select cancel_bill($1, $2) as done', [bill, friends[0]])).done).toBe(false);
    expect((await one('select status from bills where id = $1', [bill])).status).toBe('open');
    expect(Number((await one('select count(*) from transactions where user_id = $1', [owner])).count)).toBe(1);
    expect((await one('select cancel_bill(gen_random_uuid(), $1) as done', [owner])).done).toBe(false);
    expect((await one('select cancel_bill($1, $2) as done', [bill, owner])).done).toBe(true);
    expect((await one('select cancel_bill($1, $2) as done', [bill, owner])).done).toBe(false);
  });

  it('cancel_bill locks the bill row before deleting the owner expense', async () => {
    const { def } = await one("select pg_get_functiondef('public.cancel_bill'::regproc) as def");

    const billLock = def.search(/from public\.bills\s+where id = p_bill[^;]*for update/i);
    const txDelete = def.search(/delete from public\.transactions/i);
    expect(billLock).toBeGreaterThan(-1);
    expect(txDelete).toBeGreaterThan(-1);
    expect(billLock).toBeLessThan(txDelete);
  });

  it('refuses to confirm or decline once the bill is cancelled, and reports a stranger as not found', async () => {
    const { friends, bill } = await setupBill();
    const friendFood = await createCategory(friends[0], 'อาหาร', 'expense');
    const stranger = await createUser('S1');
    await db.query("update bills set status = 'cancelled' where id = $1", [bill]);

    expect((await one('select confirm_bill_share($1, $2, $3) as status', [bill, friends[0], friendFood])).status).toBe('cancelled');
    expect((await one('select decline_bill_share($1, $2) as status', [bill, friends[1]])).status).toBe('cancelled');
    expect((await one('select decline_bill_share($1, $2) as status', [bill, stranger])).status).toBe('not_found');
    expect(Number((await one('select count(*) from transactions where user_id = $1', [friends[0]])).count)).toBe(0);
  });

  it('rejects a non-positive share, an unknown status and the same member twice', async () => {
    const { friends, bill } = await setupBill();

    for (const sql of [
      ['update bill_members set share = 0 where bill_id = $1', [bill], 'check constraint'],
      ["update bill_members set status = 'maybe' where bill_id = $1", [bill], 'check constraint'],
      ["update bills set status = 'paid' where id = $1", [bill], 'check constraint'],
      ['insert into bill_members (bill_id, user_id, share) values ($1, $2, 10)', [bill, friends[0]], 'duplicate key'],
    ]) {
      await db.exec('savepoint bad');
      await expect(db.query(sql[0], sql[1])).rejects.toThrow(sql[2]);
      await db.exec('rollback to savepoint bad');
    }
  });

  it.each(['confirm_bill_share', 'decline_bill_share'])(
    '%s locks the bill row before the member row so a cancel cannot slip in between',
    async (name) => {
      const { def } = await one('select pg_get_functiondef($1::regproc) as def', [`public.${name}`]);

      const billLock = def.search(/from public\.bills\s+where id = p_bill\s+for share/i);
      const memberLock = def.search(/from public\.bill_members\s+where[^;]*for update/i);
      expect(billLock).toBeGreaterThan(-1);
      expect(memberLock).toBeGreaterThan(-1);
      expect(billLock).toBeLessThan(memberLock);
    }
  );

  it('removes the members with the bill and keeps a confirmed expense when the bill is deleted', async () => {
    const { friends, bill } = await setupBill();
    const friendFood = await createCategory(friends[0], 'อาหาร', 'expense');
    await one('select confirm_bill_share($1, $2, $3)', [bill, friends[0], friendFood]);

    await db.query('delete from bills where id = $1', [bill]);

    expect(Number((await one('select count(*) from bill_members')).count)).toBe(0);
    expect(Number((await one('select count(*) from transactions where user_id = $1', [friends[0]])).count)).toBe(1);
  });
});

describe('013_bills.sql edge cases', () => {
  async function expectError(sql, params, message) {
    await db.exec('savepoint expect_error');
    await expect(db.query(sql, params)).rejects.toThrow(message);
    await db.exec('rollback to savepoint expect_error');
  }

  it('stores each member share as given when the shares are not equal', async () => {
    const { friends, bill } = await setupBill({ ownerShare: 50, shares: [120.5, 229.5] });

    const shares = await rows('select user_id, share from bill_members where bill_id = $1', [bill]);
    const byUser = Object.fromEntries(shares.map((row) => [row.user_id, Number(row.share)]));
    expect(byUser).toEqual({ [friends[0]]: 120.5, [friends[1]]: 229.5 });
  });

  it('leaves no bill and no owner expense when a member row fails', async () => {
    const owner = await createUser('U1');
    const food = await createCategory(owner, 'อาหาร', 'expense');
    const stranger = '99999999-9999-9999-9999-999999999999';
    const members = JSON.stringify([{ user_id: stranger, share: 100 }]);

    await expectError('select create_bill($1, $2, $3, $4, $5, $6, $7)', [owner, 'ชาบู', 200, food, '2026-10-08', 100, members], 'foreign key');

    expect(Number((await one('select count(*) from bills')).count)).toBe(0);
    expect(Number((await one('select count(*) from transactions')).count)).toBe(0);
  });

  it('refuses to confirm into a category of another user and keeps the share pending', async () => {
    const { owner, friends, bill } = await setupBill();
    const ownerOther = await createCategory(owner, 'อื่นๆ', 'expense');

    await expectError('select confirm_bill_share($1, $2, $3)', [bill, friends[0], ownerOther], 'foreign key');

    expect((await one('select status from bill_members where bill_id = $1 and user_id = $2', [bill, friends[0]])).status).toBe('pending');
  });

  it('removes the bills of a deleted owner and the member row of a deleted friend', async () => {
    const first = await setupBill();
    await db.query('delete from users where id = $1', [first.friends[0]]);
    expect(Number((await one('select count(*) from bill_members where bill_id = $1', [first.bill])).count)).toBe(1);

    await db.query('delete from users where id = $1', [first.owner]);
    expect(Number((await one('select count(*) from bills where id = $1', [first.bill])).count)).toBe(0);
    expect(Number((await one('select count(*) from bill_members where bill_id = $1', [first.bill])).count)).toBe(0);
  });

  // เพื่อนลบรายจ่ายของตัวเองได้ แต่คำตอบยังเป็นยืนยันแล้ว จึงยืนยันซ้ำเพื่อบันทึกใหม่ไม่ได้
  it('keeps a confirmed answer when the friend deletes the expense, and does not record it again', async () => {
    const { friends, bill } = await setupBill();
    const friendFood = await createCategory(friends[0], 'อาหาร', 'expense');
    await one('select confirm_bill_share($1, $2, $3) as status', [bill, friends[0], friendFood]);
    const { transaction_id: tx } = await one('select transaction_id from bill_members where bill_id = $1 and user_id = $2', [bill, friends[0]]);

    await db.query('delete from transactions where id = $1', [tx]);

    const member = await one('select status, transaction_id from bill_members where bill_id = $1 and user_id = $2', [bill, friends[0]]);
    expect(member).toEqual({ status: 'confirmed', transaction_id: null });
    expect((await one('select confirm_bill_share($1, $2, $3) as status', [bill, friends[0], friendFood])).status).toBe('already_confirmed');
    expect(Number((await one('select count(*) from transactions where user_id = $1', [friends[0]])).count)).toBe(0);
  });
});

describe('015_bill_invariants.sql', () => {
  async function createWith({ ownerShare = 100, shares = [150], total, categoryType = 'expense' } = {}) {
    const owner = await createUser('U1');
    const friends = [];
    for (const [index] of shares.entries()) friends.push(await createUser(`F${index}`));
    const category = await createCategory(owner, 'หมวด', categoryType);
    const members = JSON.stringify(friends.map((userId, index) => ({ user_id: userId, share: shares[index] })));
    const sum = ownerShare + shares.reduce((acc, share) => acc + share, 0);
    return db.query('select create_bill($1, $2, $3, $4, $5, $6, $7) as id', [owner, 'ชาบู', total ?? sum, category, '2026-10-08', ownerShare, members]);
  }

  // JS ตรวจไว้แล้ว ส่วนนี้กันข้อมูลผิดถ้าเรียก function ตรงหรือ JS มีบั๊ก
  it.each([
    ['an income category', { categoryType: 'income' }, 'Bill category must be an expense category'],
    ['no members', { shares: [] }, 'Bill needs at least one member'],
    ['shares that do not add up', { total: 999 }, 'Bill shares must add up to the total'],
    ['an owner share above the total', { ownerShare: 300, shares: [150], total: 250 }, 'Bill shares must add up to the total'],
  ])('refuses %s and saves nothing', async (name, options, message) => {
    await db.exec('savepoint invariant');
    await expect(createWith(options)).rejects.toThrow(message);
    await db.exec('rollback to savepoint invariant');

    expect(Number((await one('select count(*) from bills')).count)).toBe(0);
  });

  it('refuses an owner share above the total at the table too', async () => {
    const { bill } = await setupBill();

    await db.exec('savepoint owner_share');
    await expect(db.query('update bills set owner_share = 1000 where id = $1', [bill])).rejects.toThrow('bills_owner_share_within_total');
    await db.exec('rollback to savepoint owner_share');
  });

  it('still creates a valid bill', async () => {
    const result = await createWith();

    expect(result.rows[0].id).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('014_bill_indexes.sql', () => {
  // ลบรายการหรือหมวดต้องหาแถวบิลที่อ้างถึง ไม่มี index จะสแกนทั้งตารางทุกครั้ง
  it('indexes every foreign key from the bill tables to transactions and categories', async () => {
    const indexes = await rows(
      "select indexname, indexdef from pg_indexes where schemaname = 'public' and tablename in ('bills', 'bill_members') order by indexname"
    );
    const defs = Object.fromEntries(indexes.map((row) => [row.indexname, row.indexdef]));

    expect(defs.bills_owner_transaction_idx).toContain('(owner_transaction_id)');
    expect(defs.bill_members_transaction_idx).toContain('(transaction_id)');
    expect(defs.bills_category_owner_idx).toContain('(category_id, owner_id)');
  });

  it('can run again without failing', async () => {
    await expect(db.exec(readMigration('014_bill_indexes.sql'))).resolves.toBeDefined();
  });
});

describe('017_category_hidden.sql', () => {
  it('adds hidden to categories, false by default', async () => {
    const user = await createUser('U1');
    const food = await createCategory(user, 'อาหาร', 'expense');

    expect((await one('select hidden from categories where id = $1', [food])).hidden).toBe(false);

    await db.query('update categories set hidden = true where id = $1', [food]);
    expect((await one('select hidden from categories where id = $1', [food])).hidden).toBe(true);
  });

  // เตือนงบยังต้องทำงานกับหมวดที่ซ่อน เพราะรายการประจำยังบันทึกลงหมวดนั้นได้
  it('keeps a hidden category in budget_status', async () => {
    const user = await createUser('U1');
    const food = await createCategory(user, 'อาหาร', 'expense');
    await db.query('update categories set hidden = true where id = $1', [food]);

    expect(await rows('select category from budget_status($1, $2)', [user, '2026-10-01'])).toEqual([{ category: 'อาหาร' }]);
  });

  it('refuses a null hidden', async () => {
    const user = await createUser('U1');
    const food = await createCategory(user, 'อาหาร', 'expense');

    await db.exec('savepoint null_hidden');
    await expect(db.query('update categories set hidden = null where id = $1', [food])).rejects.toThrow('hidden');
    await db.exec('rollback to savepoint null_hidden');
  });

  it('can run again without failing', async () => {
    await expect(db.exec(readMigration('017_category_hidden.sql'))).resolves.toBeDefined();
  });
});

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

describe('021_notification_settings.sql', () => {
  it('adds both notification switches to users, off by default', async () => {
    const user = await createUser('U1');

    expect(await one('select weekly_summary_enabled, daily_reminder_enabled from users where id = $1', [user])).toEqual({
      weekly_summary_enabled: false,
      daily_reminder_enabled: false,
    });
  });

  it('refuses a null switch', async () => {
    const user = await createUser('U1');

    for (const column of ['weekly_summary_enabled', 'daily_reminder_enabled']) {
      await db.exec('savepoint null_switch');
      await expect(db.query(`update users set ${column} = null where id = $1`, [user])).rejects.toThrow(column);
      await db.exec('rollback to savepoint null_switch');
    }
  });

  // งาน cron จองด้วย insert on conflict do nothing ถ้าไม่ได้แถวกลับมาแปลว่าเคยส่งแล้ว
  it('keeps one log row per user, kind and period', async () => {
    const user = await createUser('U1');
    const reserve = (kind, period) =>
      rows('insert into notification_log (user_id, kind, period) values ($1, $2, $3) on conflict do nothing returning user_id', [
        user,
        kind,
        period,
      ]);

    expect(await reserve('weekly_summary', '2026-10-12')).toHaveLength(1);
    expect(await reserve('weekly_summary', '2026-10-12')).toHaveLength(0);
    expect(await reserve('weekly_summary', '2026-10-19')).toHaveLength(1);
    expect(await reserve('daily_reminder', '2026-10-12')).toHaveLength(1);
  });

  it('refuses an unknown kind and a period that is not a date', async () => {
    const user = await createUser('U1');

    for (const [kind, period] of [
      ['monthly', '2026-10-01'],
      ['weekly_summary', 'last week'],
    ]) {
      await db.exec('savepoint bad_log');
      await expect(db.query('insert into notification_log (user_id, kind, period) values ($1, $2, $3)', [user, kind, period])).rejects.toThrow(
        'check constraint',
      );
      await db.exec('rollback to savepoint bad_log');
    }
  });

  it('removes the log rows of a deleted user and keeps row level security on', async () => {
    const user = await createUser('U1');
    await db.query("insert into notification_log (user_id, kind, period) values ($1, 'weekly_summary', '2026-10-12')", [user]);

    await db.query('delete from users where id = $1', [user]);

    expect(Number((await one('select count(*) from notification_log')).count)).toBe(0);
    expect((await one("select relrowsecurity from pg_class where oid = 'public.notification_log'::regclass")).relrowsecurity).toBe(true);
  });

  it('can run again without failing', async () => {
    await expect(db.exec(readMigration('021_notification_settings.sql'))).resolves.toBeDefined();
  });
});

describe('users_to_remind', () => {
  // วันที่ 2026-10-19 ตามเวลาไทยเริ่มที่ 2026-10-18T17:00:00Z และจบก่อน 2026-10-19T17:00:00Z
  async function addEntry(userId, categoryId, source, createdAt) {
    await db.query(
      "insert into transactions (user_id, category_id, type, amount, occurred_on, source, created_at) values ($1, $2, 'expense', 50, '2026-10-19', $3, $4)",
      [userId, categoryId, source, createdAt],
    );
  }

  async function enable(userId) {
    await db.query('update users set daily_reminder_enabled = true where id = $1', [userId]);
  }

  const remind = (day = '2026-10-19') => rows('select * from users_to_remind($1)', [day]);

  it('lists users who turned the reminder on and wrote nothing today', async () => {
    const quiet = await createUser('U1');
    await enable(quiet);
    await createUser('U2');

    expect(await remind()).toEqual([{ user_id: quiet, line_user_id: 'U1' }]);
  });

  it('leaves out a user who typed or sent a slip today in Bangkok time', async () => {
    const typed = await createUser('U1');
    const slip = await createUser('U2');
    await enable(typed);
    await enable(slip);
    const food = await createCategory(typed, 'อาหาร', 'expense');
    const receipt = await createCategory(slip, 'ใบเสร็จ/สลิปโอนเงิน', 'expense');
    await addEntry(typed, food, 'text', '2026-10-18T17:00:00Z');
    await addEntry(slip, receipt, 'slip', '2026-10-19T16:59:59Z');

    expect(await remind()).toEqual([]);
  });

  // บิลเกิดจากผู้ใช้สร้างหรือยืนยันเอง จึงนับว่าจดแล้ว (ผู้ใช้ตัดสิน 2026-10-19)
  it('leaves out a user whose bill entry was saved today', async () => {
    const user = await createUser('U1');
    await enable(user);
    const food = await createCategory(user, 'อาหาร', 'expense');
    await addEntry(user, food, 'bill', '2026-10-19T03:00:00Z');

    expect(await remind()).toEqual([]);
  });

  // รายการประจำไม่นับว่าจดเอง และวันตัดตามเวลาไทยไม่ใช่ UTC
  it('still reminds when the only entries today came from recurring rules, or fall outside the Bangkok day', async () => {
    const user = await createUser('U1');
    await enable(user);
    const food = await createCategory(user, 'อาหาร', 'expense');
    await addEntry(user, food, 'recurring', '2026-10-19T02:00:00Z');
    await addEntry(user, food, 'bill', '2026-10-18T16:59:59Z');
    await addEntry(user, food, 'text', '2026-10-18T16:59:59Z');
    await addEntry(user, food, 'text', '2026-10-19T17:00:00Z');

    expect(await remind()).toEqual([{ user_id: user, line_user_id: 'U1' }]);
  });

  it('does not let another user entries hide a quiet user', async () => {
    const quiet = await createUser('U1');
    const busy = await createUser('U2');
    await enable(quiet);
    const busyFood = await createCategory(busy, 'อาหาร', 'expense');
    await addEntry(busy, busyFood, 'text', '2026-10-19T05:00:00Z');

    expect(await remind()).toEqual([{ user_id: quiet, line_user_id: 'U1' }]);
  });

  it('can run again without failing', async () => {
    await expect(db.exec(readMigration('022_daily_reminder.sql'))).resolves.toBeDefined();
  });
});

describe('023_savings_goals.sql', () => {
  async function createGoal(userId, name, target = 1000, { closed = false, createdAt = '2026-10-01T00:00:00Z', targetDate = null } = {}) {
    return (
      await one(
        'insert into savings_goals (user_id, name, target_amount, target_date, closed, created_at) values ($1, $2, $3, $4, $5, $6) returning id',
        [userId, name, target, targetDate, closed, createdAt],
      )
    ).id;
  }

  async function contribute(goalId, userId, amount, occurredOn = '2026-10-10') {
    await db.query('insert into goal_contributions (goal_id, user_id, amount, occurred_on) values ($1, $2, $3, $4)', [goalId, userId, amount, occurredOn]);
  }

  async function progress(userId) {
    const result = await rows(
      'select id, name, target_amount, target_date::text as target_date, closed, saved, contribution_count from goal_progress($1)',
      [userId],
    );
    return result.map(numbers);
  }

  it('totals each goal of this user, open goals first in the order they were made', async () => {
    const user = await createUser('U1');
    const other = await createUser('U2');
    const trip = await createGoal(user, 'เที่ยวญี่ปุ่น', 50000, { createdAt: '2026-10-02T00:00:00Z', targetDate: '2026-12-31' });
    const phone = await createGoal(user, 'มือถือ', 30000, { closed: true, createdAt: '2026-09-01T00:00:00Z' });
    const fund = await createGoal(user, 'กองทุนฉุกเฉิน', 10000, { createdAt: '2026-10-01T00:00:00Z' });
    const otherGoal = await createGoal(other, 'เที่ยวญี่ปุ่น', 1000);
    await contribute(trip, user, 1000);
    await contribute(trip, user, 5000.5);
    await contribute(phone, user, 30000);
    await contribute(otherGoal, other, 999);

    expect(await progress(user)).toEqual([
      { id: fund, name: 'กองทุนฉุกเฉิน', target_amount: 10000, target_date: null, closed: false, saved: 0, contribution_count: 0 },
      { id: trip, name: 'เที่ยวญี่ปุ่น', target_amount: 50000, target_date: '2026-12-31', closed: false, saved: 6000.5, contribution_count: 2 },
      { id: phone, name: 'มือถือ', target_amount: 30000, target_date: null, closed: true, saved: 30000, contribution_count: 1 },
    ]);
  });

  // แชตหาเป้าจากชื่อแบบไม่สนตัวพิมพ์ ชื่อที่ต่างกันแค่ตัวพิมพ์จึงต้องชนกัน
  it('does not let one user have two goals with the same name ignoring letter case', async () => {
    const user = await createUser('U1');
    const other = await createUser('U2');
    await createGoal(user, 'Japan');
    await createGoal(other, 'Japan');

    await expect(createGoal(user, 'japan')).rejects.toThrow('duplicate key');
  });

  it('refuses a bad name, an amount outside 0-10,000,000 and a contribution to a goal of another user', async () => {
    const user = await createUser('U1');
    const stranger = await createUser('U2');
    const goal = await createGoal(user, 'เที่ยว');
    const insertGoal = 'insert into savings_goals (user_id, name, target_amount) values ($1, $2, $3)';
    const insertContribution = "insert into goal_contributions (goal_id, user_id, amount, occurred_on) values ($1, $2, $3, '2026-10-10')";
    const bad = [
      [insertGoal, [user, '', 1000], 'check constraint'],
      [insertGoal, [user, 'ก'.repeat(31), 1000], 'check constraint'],
      [insertGoal, [user, 'ศูนย์', 0], 'check constraint'],
      [insertGoal, [user, 'เกิน', 10000000.01], 'check constraint'],
      [insertContribution, [goal, user, 0], 'check constraint'],
      [insertContribution, [goal, user, 10000000.01], 'check constraint'],
      [insertContribution, [goal, stranger, 100], 'foreign key'],
    ];

    for (const [sql, params, message] of bad) {
      await db.exec('savepoint bad_row');
      await expect(db.query(sql, params)).rejects.toThrow(message);
      await db.exec('rollback to savepoint bad_row');
    }
  });

  it('adds a contribution with its chat event and returns the new saved total', async () => {
    const user = await createUser('U1');
    const goal = await createGoal(user, 'เที่ยว', 5000);
    await contribute(goal, user, 1000);
    await db.query('insert into line_events (webhook_event_id, user_id) values ($1, $2)', ['ev-1', user]);

    const result = numbers(await one('select * from add_goal_contribution($1, $2, $3, $4, $5)', [user, goal, 250.5, '2026-10-19', 'ev-1']));

    expect(result.status).toBe('ok');
    expect(result.saved).toBe(1250.5);
    const saved = await rows('select amount, occurred_on::text as occurred_on, line_event_id from goal_contributions where id = $1', [
      result.contribution_id,
    ]);
    expect(saved.map(numbers)).toEqual([{ amount: 250.5, occurred_on: '2026-10-19', line_event_id: 'ev-1' }]);
  });

  it('answers not_found for a goal of another user and closed for a closed goal, adding nothing', async () => {
    const user = await createUser('U1');
    const stranger = await createUser('U2');
    const goal = await createGoal(user, 'เที่ยว');
    const closed = await createGoal(user, 'มือถือ', 1000, { closed: true });

    expect(await one('select * from add_goal_contribution($1, $2, 100, $3, null)', [stranger, goal, '2026-10-19'])).toEqual({
      status: 'not_found',
      contribution_id: null,
      saved: null,
    });
    expect(await one('select * from add_goal_contribution($1, $2, 100, $3, null)', [user, closed, '2026-10-19'])).toEqual({
      status: 'closed',
      contribution_id: null,
      saved: null,
    });
    expect(Number((await one('select count(*) from goal_contributions')).count)).toBe(0);
  });

  it('removes the goals and contributions of a deleted user', async () => {
    const user = await createUser('U1');
    const goal = await createGoal(user, 'เที่ยว');
    await contribute(goal, user, 100);

    await db.query('delete from users where id = $1', [user]);

    expect(Number((await one('select count(*) from savings_goals')).count)).toBe(0);
    expect(Number((await one('select count(*) from goal_contributions')).count)).toBe(0);
  });

  it('turns on row level security for both tables', async () => {
    const result = await rows(
      "select relname, relrowsecurity from pg_class where oid in ('public.savings_goals'::regclass, 'public.goal_contributions'::regclass) order by relname",
    );

    expect(result).toEqual([
      { relname: 'goal_contributions', relrowsecurity: true },
      { relname: 'savings_goals', relrowsecurity: true },
    ]);
  });

  it('can run again without failing', async () => {
    await expect(db.exec(readMigration('023_savings_goals.sql'))).resolves.toBeDefined();
  });
});

describe('024_wallets.sql', () => {
  async function createWallet(userId, name) {
    return (await one('insert into wallets (user_id, name) values ($1, $2) returning id', [userId, name])).id;
  }

  async function addToWallet(userId, categoryId, walletId, type, amount, occurredOn, note = '') {
    await db.query(
      'insert into transactions (user_id, category_id, wallet_id, type, amount, occurred_on, note) values ($1, $2, $3, $4, $5, $6, $7)',
      [userId, categoryId, walletId, type, amount, occurredOn, note],
    );
  }

  async function walletQuestion(userId, wallet, type = 'expense') {
    const result = await rows('select * from query_totals($1, $2, $3, $4, $5, $6, $7)', [userId, '2026-10-01', '2026-10-31', type, '', '', wallet]);
    return result.map(numbers);
  }

  it('gives every existing user the cash wallet once, even when run again', async () => {
    const first = await createUser('U1');
    const second = await createUser('U2');

    await db.exec(readMigration('024_wallets.sql'));
    await db.exec(readMigration('024_wallets.sql'));

    const result = await rows("select user_id from wallets where name = 'เงินสด' order by user_id");
    expect(result).toEqual([first, second].sort().map((userId) => ({ user_id: userId })));
  });

  // ไม่ backfill: รายการเก่าและรายการที่ไม่ระบุกระเป๋ามี wallet_id เป็น null
  it('leaves wallet_id empty when an entry names no wallet', async () => {
    const user = await createUser('U1');
    const food = await createCategory(user, 'อาหาร', 'expense');
    await addTransaction(user, food, 'expense', 60, '2026-10-01');

    expect(await rows('select wallet_id from transactions where user_id = $1', [user])).toEqual([{ wallet_id: null }]);
  });

  it('refuses a wallet of another user on an entry', async () => {
    const user = await createUser('U1');
    const stranger = await createUser('U2');
    const food = await createCategory(user, 'อาหาร', 'expense');
    const strangerCard = await createWallet(stranger, 'บัตรเครดิต');

    await db.exec('savepoint foreign_wallet');
    await expect(addToWallet(user, food, strangerCard, 'expense', 60, '2026-10-01')).rejects.toThrow('transactions_wallet_fkey');
    await db.exec('rollback to savepoint foreign_wallet');
  });

  it('refuses the same wallet name twice for one user but allows it for another user', async () => {
    const user = await createUser('U1');
    const other = await createUser('U2');
    await createWallet(user, 'บัตรเครดิต');
    await createWallet(other, 'บัตรเครดิต');

    await db.exec('savepoint same_name');
    await expect(createWallet(user, 'บัตรเครดิต')).rejects.toThrow('wallets_user_id_name_key');
    await db.exec('rollback to savepoint same_name');
  });

  it('refuses an empty wallet name', async () => {
    const user = await createUser('U1');

    await db.exec('savepoint empty_name');
    await expect(createWallet(user, '')).rejects.toThrow('wallets_name_check');
    await db.exec('rollback to savepoint empty_name');
  });

  it('totals each wallet of this user, counting entries without a wallet as cash', async () => {
    const user = await createUser('U1');
    const other = await createUser('U2');
    const food = await createCategory(user, 'อาหาร', 'expense');
    const salary = await createCategory(user, 'เงินเดือน', 'income');
    const otherFood = await createCategory(other, 'อาหาร', 'expense');
    const cash = await createWallet(user, 'เงินสด');
    // PGlite เรียงแบบ C collation และ created_at เท่ากันใน transaction เดียว จึงใช้ชื่อที่ ก มาก่อน บ ทั้งสองแบบ
    const bank = await createWallet(user, 'กสิกร');
    const card = await createWallet(user, 'บัตรเครดิต');
    await createWallet(other, 'เงินสด');
    await addToWallet(user, food, null, 'expense', 60, '2026-10-01');
    await addToWallet(user, food, cash, 'expense', 40, '2026-10-02');
    await addToWallet(user, salary, null, 'income', 25000, '2026-10-03');
    await addToWallet(user, food, card, 'expense', 300, '2026-10-04');
    await addToWallet(other, otherFood, null, 'expense', 999, '2026-10-05');

    const result = await rows('select * from wallet_totals($1)', [user]);

    expect(result.map(numbers)).toEqual([
      { wallet_id: cash, name: 'เงินสด', hidden: false, income: 25000, expense: 100, entry_count: 3 },
      { wallet_id: bank, name: 'กสิกร', hidden: false, income: 0, expense: 0, entry_count: 0 },
      { wallet_id: card, name: 'บัตรเครดิต', hidden: false, income: 0, expense: 300, entry_count: 1 },
    ]);
  });

  it('filters a totals question by wallet name, treating entries without a wallet as cash', async () => {
    const user = await createUser('U1');
    const food = await createCategory(user, 'อาหาร', 'expense');
    const cash = await createWallet(user, 'เงินสด');
    const card = await createWallet(user, 'บัตรเครดิต');
    await addToWallet(user, food, null, 'expense', 60, '2026-10-01');
    await addToWallet(user, food, cash, 'expense', 40, '2026-10-02');
    await addToWallet(user, food, card, 'expense', 300, '2026-10-03');

    expect(await walletQuestion(user, 'เงินสด')).toEqual([{ type: 'expense', total: 100, entry_count: 2 }]);
    expect(await walletQuestion(user, 'บัตรเครดิต')).toEqual([{ type: 'expense', total: 300, entry_count: 1 }]);
    expect(await walletQuestion(user, '')).toEqual([{ type: 'expense', total: 400, entry_count: 3 }]);
    expect(await walletQuestion(user, 'ไม่มีกระเป๋านี้')).toEqual([]);
  });

  // โค้ดที่ deploy อยู่ก่อน push ยังเรียกแบบ 6 พารามิเตอร์ ต้องได้ function ใหม่ตัวเดียว ไม่ใช่ overload สองตัว
  it('keeps one query_totals that still accepts the six-argument call', async () => {
    const user = await createUser('U1');
    const food = await createCategory(user, 'อาหาร', 'expense');
    await addTransaction(user, food, 'expense', 60, '2026-10-01');

    const count = await one(
      "select count(*)::int as n from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname = 'query_totals'"
    );
    const result = await rows('select * from query_totals($1, $2, $3, $4, $5, $6)', [user, '2026-10-01', '2026-10-31', 'expense', '', '']);

    expect(count.n).toBe(1);
    expect(result.map(numbers)).toEqual([{ type: 'expense', total: 60, entry_count: 1 }]);
  });

  it('records recurring entries in the default wallet', async () => {
    const user = await createUser('U1');
    const bill = await createCategory(user, 'ค่าบ้าน', 'expense');
    const rule = (
      await one(
        "insert into recurring_rules (user_id, type, category_id, amount, note, day_of_month) values ($1, 'expense', $2, 5500, 'ค่าเช่า', 1) returning id",
        [user, bill],
      )
    ).id;

    await one('select apply_recurring_rule($1, $2, $3)', [rule, '2026-10-01', `recurring:${rule}:2026-10`]);

    expect(await rows('select wallet_id from transactions where user_id = $1', [user])).toEqual([{ wallet_id: null }]);
  });

  it('enables row level security on wallets', async () => {
    const result = await one("select relname, relrowsecurity from pg_class where oid = 'public.wallets'::regclass");

    expect(result).toEqual({ relname: 'wallets', relrowsecurity: true });
  });

  it('can run again without failing', async () => {
    await expect(db.exec(readMigration('024_wallets.sql'))).resolves.toBeDefined();
  });
});

describe('function permissions', () => {
  const calls = [
    ['summarize_transactions', "select * from summarize_transactions(gen_random_uuid(), '2026-09-01', '2026-09-30')"],
    ['budget_status', "select * from budget_status(gen_random_uuid(), '2026-09-01')"],
    ['apply_recurring_rule', "select apply_recurring_rule(gen_random_uuid(), '2026-09-01', 'x')"],
    ['lifetime_totals', 'select * from lifetime_totals(gen_random_uuid())'],
    ['monthly_totals', "select * from monthly_totals(gen_random_uuid(), '2026-09-01', '2026-09-30')"],
    ['create_bill', "select create_bill(gen_random_uuid(), 'x', 1, gen_random_uuid(), '2026-10-08', 0, '[]'::jsonb)"],
    ['confirm_bill_share', 'select confirm_bill_share(gen_random_uuid(), gen_random_uuid(), gen_random_uuid())'],
    ['decline_bill_share', 'select decline_bill_share(gen_random_uuid(), gen_random_uuid())'],
    ['cancel_bill', 'select cancel_bill(gen_random_uuid(), gen_random_uuid())'],
    ['delete_category', 'select delete_category(gen_random_uuid(), gen_random_uuid())'],
    ['query_totals', "select * from query_totals(gen_random_uuid(), '2026-10-01', '2026-10-31', 'both', '', '', '')"],
    ['users_to_remind', "select * from users_to_remind('2026-10-19')"],
    ['goal_progress', 'select * from goal_progress(gen_random_uuid())'],
    ['add_goal_contribution', "select * from add_goal_contribution(gen_random_uuid(), gen_random_uuid(), 1, '2026-10-19', null)"],
    ['wallet_totals', 'select * from wallet_totals(gen_random_uuid())'],
  ];

  // anon key ของ Supabase เรียก function ได้ถ้าลืม revoke จึงต้องปิดไว้ทุกตัว
  it.each(calls)('does not let anon or authenticated call %s', async (name, sql) => {
    for (const role of ['anon', 'authenticated']) {
      await db.exec('savepoint denied');
      await db.exec(`set local role ${role}`);
      await expect(db.query(sql)).rejects.toThrow(`permission denied for function ${name}`);
      await db.exec('rollback to savepoint denied');
    }
  });

  it.each(calls)('lets service_role call %s', async (name, sql) => {
    await db.exec('set local role service_role');
    // apply_recurring_rule ปฏิเสธ event id ปลอม แต่ต้องผ่านการตรวจสิทธิ์มาก่อน
    const query = db.query(sql);
    if (name === 'apply_recurring_rule') {
      await expect(query).rejects.toThrow('invalid recurring event id');
    } else if (name === 'create_bill') {
      // owner และหมวดสุ่มขึ้นมาจึงไม่ผ่านการตรวจหมวด แต่ต้องผ่านการตรวจสิทธิ์มาก่อน
      await expect(query).rejects.toThrow('Bill category must be an expense category');
    } else {
      await expect(query).resolves.toBeDefined();
    }
  });
});

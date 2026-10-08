import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';

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

  it('removes the friendships of a deleted user in both directions', async () => {
    const user = await createUser('U1');
    const friend = await createUser('U2');
    await db.query('insert into friendships (user_id, friend_id) values ($1, $2), ($2, $1)', [user, friend]);

    await db.query('delete from users where id = $1', [friend]);

    expect(Number((await one('select count(*) from friendships')).count)).toBe(0);
  });
});

describe('function permissions', () => {
  const calls = [
    ['summarize_transactions', "select * from summarize_transactions(gen_random_uuid(), '2026-09-01', '2026-09-30')"],
    ['budget_status', "select * from budget_status(gen_random_uuid(), '2026-09-01')"],
    ['apply_recurring_rule', "select apply_recurring_rule(gen_random_uuid(), '2026-09-01', 'x')"],
    ['lifetime_totals', 'select * from lifetime_totals(gen_random_uuid())'],
    ['monthly_totals', "select * from monthly_totals(gen_random_uuid(), '2026-09-01', '2026-09-30')"],
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
    } else {
      await expect(query).resolves.toBeDefined();
    }
  });
});

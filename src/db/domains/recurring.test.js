import { describe, it, expect } from 'vitest';
import { createRecurringRepository } from './recurring.js';
import { fakeSupabase } from '../test-helpers.mjs';

describe('repository recurring rules', () => {
  const ROW = {
    id: 'r1',
    type: 'expense',
    category_id: 'c1',
    amount: '590.00',
    note: 'ค่าเน็ต',
    day_of_month: 5,
    active: true,
    last_run_on: null,
  };
  const RULE = {
    id: 'r1',
    type: 'expense',
    categoryId: 'c1',
    amount: 590,
    note: 'ค่าเน็ต',
    dayOfMonth: 5,
    active: true,
    lastRunOn: null,
  };
  const COLUMNS = 'id, type, category_id, amount, note, day_of_month, active, last_run_on';

  it('lists the rules of one user in day order and converts amount to a number', async () => {
    const { supabase, calls } = fakeSupabase({ data: [ROW], error: null });

    expect(await createRecurringRepository(supabase).listRecurringRules('user-1')).toEqual([RULE]);
    expect(calls).toEqual([
      ['from', 'recurring_rules'],
      ['select', COLUMNS],
      ['eq', 'user_id', 'user-1'],
      ['order', 'day_of_month'],
      ['order', 'created_at'],
    ]);
  });

  it('creates a rule and returns it', async () => {
    const { supabase, calls } = fakeSupabase({ data: ROW, error: null });

    const rule = await createRecurringRepository(supabase).createRecurringRule({
      userId: 'user-1',
      type: 'expense',
      categoryId: 'c1',
      amount: 590,
      note: 'ค่าเน็ต',
      dayOfMonth: 5,
      active: true,
      lastRunOn: null,
    });

    expect(rule).toEqual(RULE);
    expect(calls).toEqual([
      ['from', 'recurring_rules'],
      [
        'insert',
        {
          user_id: 'user-1',
          type: 'expense',
          category_id: 'c1',
          amount: 590,
          note: 'ค่าเน็ต',
          day_of_month: 5,
          active: true,
          last_run_on: null,
        },
      ],
      ['select', COLUMNS],
      ['single'],
    ]);
  });

  it('updates only this user rule and reports whether it existed', async () => {
    const { supabase, calls } = fakeSupabase({ data: [{ id: 'r1' }], error: null });

    const updated = await createRecurringRepository(supabase).updateRecurringRule('user-1', 'r1', {
      type: 'expense',
      categoryId: 'c1',
      amount: 600,
      note: 'ค่าเน็ต',
      dayOfMonth: 6,
      active: false,
      lastRunOn: '2026-10-06',
    });

    expect(updated).toBe(true);
    expect(calls).toEqual([
      ['from', 'recurring_rules'],
      [
        'update',
        {
          type: 'expense',
          category_id: 'c1',
          amount: 600,
          note: 'ค่าเน็ต',
          day_of_month: 6,
          active: false,
          last_run_on: '2026-10-06',
        },
      ],
      ['eq', 'user_id', 'user-1'],
      ['eq', 'id', 'r1'],
      ['select', 'id'],
    ]);
  });

  it('returns false when updating or deleting a rule that does not exist', async () => {
    const empty = fakeSupabase({ data: [], count: 0, error: null }).supabase;

    expect(await createRecurringRepository(empty).updateRecurringRule('user-1', 'r1', {})).toBe(false);
    expect(await createRecurringRepository(empty).deleteRecurringRule('user-1', 'r1')).toBe(false);
  });

  it('deletes only this user rule', async () => {
    const { supabase, calls } = fakeSupabase({ count: 1, error: null });

    expect(await createRecurringRepository(supabase).deleteRecurringRule('user-1', 'r1')).toBe(true);
    expect(calls).toEqual([
      ['from', 'recurring_rules'],
      ['delete', { count: 'exact' }],
      ['eq', 'user_id', 'user-1'],
      ['eq', 'id', 'r1'],
    ]);
  });

  it('lists due rules with the line user id and category name, filtered by day before the last day of the month', async () => {
    const dueRow = { ...ROW, user_id: 'user-1', users: { line_user_id: 'U1' }, categories: { name: 'ค่าสาธารณูปโภค' } };
    const { supabase, calls } = fakeSupabase({ data: [dueRow], error: null });

    const rules = await createRecurringRepository(supabase).listDueRecurringRules('2026-10-15');

    expect(rules).toEqual([{ ...RULE, userId: 'user-1', lineUserId: 'U1', categoryName: 'ค่าสาธารณูปโภค' }]);
    expect(calls).toEqual([
      ['from', 'recurring_rules'],
      ['select', `${COLUMNS}, user_id, users(line_user_id), categories(name)`],
      ['eq', 'active', true],
      ['or', 'last_run_on.is.null,last_run_on.lt.2026-10-01'],
      ['lte', 'day_of_month', 15],
      ['order', 'created_at'],
      ['limit', 500],
    ]);
  });

  it('does not filter by day on the last day of the month so day 31 rules are caught up', async () => {
    const { supabase, calls } = fakeSupabase({ data: [], error: null });

    await createRecurringRepository(supabase).listDueRecurringRules('2026-02-28');

    expect(calls.some(([method]) => method === 'lte')).toBe(false);
  });

  it('applies a rule through the rpc and returns whether a transaction was created', async () => {
    const { supabase, calls } = fakeSupabase({ data: true, error: null });

    const created = await createRecurringRepository(supabase).applyRecurringRule({
      ruleId: 'r1',
      dueOn: '2026-10-05',
      eventId: 'recurring:r1:2026-10',
    });

    expect(created).toBe(true);
    expect(calls).toEqual([
      ['rpc', 'apply_recurring_rule', { p_rule_id: 'r1', p_due: '2026-10-05', p_event_id: 'recurring:r1:2026-10' }],
    ]);
  });

  it('throws DatabaseError when Supabase returns an error', async () => {
    const failing = fakeSupabase({ data: null, count: null, error: { message: 'boom' } }).supabase;
    const repository = createRecurringRepository(failing);

    await expect(repository.listRecurringRules('u')).rejects.toThrow('Database listRecurringRules failed: boom');
    await expect(repository.createRecurringRule({})).rejects.toThrow('Database createRecurringRule failed: boom');
    await expect(repository.updateRecurringRule('u', 'r', {})).rejects.toThrow('Database updateRecurringRule failed: boom');
    await expect(repository.deleteRecurringRule('u', 'r')).rejects.toThrow('Database deleteRecurringRule failed: boom');
    await expect(repository.listDueRecurringRules('2026-10-15')).rejects.toThrow('Database listDueRecurringRules failed: boom');
    await expect(repository.applyRecurringRule({})).rejects.toThrow('Database applyRecurringRule failed: boom');
  });
});

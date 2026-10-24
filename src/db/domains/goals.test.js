import { describe, it, expect } from 'vitest';
import { DatabaseError } from '../repository.js';
import { createGoalsRepository } from './goals.js';
import { fakeSupabase } from '../test-helpers.mjs';

describe('repository savings goals', () => {
  const GOAL_ROW = { id: 'g1', name: 'เที่ยว', target_amount: '50000.00', target_date: null, closed: false };

  it('lists goals with their saved totals from the SQL function', async () => {
    const { supabase, calls } = fakeSupabase({
      data: [{ ...GOAL_ROW, target_date: '2026-12-31', saved: '6000.50', contribution_count: '2' }],
      error: null,
    });

    const goals = await createGoalsRepository(supabase).listGoals('user-1');

    expect(goals).toEqual([
      { id: 'g1', name: 'เที่ยว', targetAmount: 50000, targetDate: '2026-12-31', closed: false, saved: 6000.5, contributionCount: 2 },
    ]);
    expect(calls).toEqual([['rpc', 'goal_progress', { p_user_id: 'user-1' }]]);
  });

  it('creates a goal for this user', async () => {
    const { supabase, calls } = fakeSupabase({ data: GOAL_ROW, error: null });

    const result = await createGoalsRepository(supabase).createGoal('user-1', { name: 'เที่ยว', targetAmount: 50000, targetDate: null });

    expect(result).toEqual({ status: 'ok', goal: { id: 'g1', name: 'เที่ยว', targetAmount: 50000, targetDate: null, closed: false } });
    expect(calls).toEqual([
      ['from', 'savings_goals'],
      ['insert', { user_id: 'user-1', name: 'เที่ยว', target_amount: 50000, target_date: null }],
      ['select', 'id, name, target_amount, target_date, closed'],
      ['single'],
    ]);
  });

  it('reports a duplicate name when creating or renaming', async () => {
    const duplicate = () => fakeSupabase({ data: null, error: { message: 'dup', code: '23505' } }).supabase;

    expect(await createGoalsRepository(duplicate()).createGoal('user-1', { name: 'เที่ยว', targetAmount: 1, targetDate: null })).toEqual({
      status: 'duplicate',
    });
    expect(await createGoalsRepository(duplicate()).updateGoal('user-1', 'g1', { name: 'เที่ยว' })).toEqual({ status: 'duplicate' });
  });

  it('updates only the given fields of this user goal', async () => {
    const { supabase, calls } = fakeSupabase({ data: [{ ...GOAL_ROW, name: 'ทริป', closed: true }], error: null });

    const result = await createGoalsRepository(supabase).updateGoal('user-1', 'g1', { name: 'ทริป', closed: true });

    expect(result).toEqual({ status: 'ok', goal: { id: 'g1', name: 'ทริป', targetAmount: 50000, targetDate: null, closed: true } });
    expect(calls).toEqual([
      ['from', 'savings_goals'],
      ['update', { name: 'ทริป', closed: true }],
      ['eq', 'user_id', 'user-1'],
      ['eq', 'id', 'g1'],
      ['select', 'id, name, target_amount, target_date, closed'],
    ]);
  });

  it('maps the target fields to their columns and answers not_found when no row changed', async () => {
    const { supabase, calls } = fakeSupabase({ data: [], error: null });

    const result = await createGoalsRepository(supabase).updateGoal('user-1', 'g1', { targetAmount: 900, targetDate: '2027-01-31' });

    expect(result).toEqual({ status: 'not_found' });
    expect(calls[1]).toEqual(['update', { target_amount: 900, target_date: '2027-01-31' }]);
  });

  it('adds a contribution through the SQL function', async () => {
    const { supabase, calls } = fakeSupabase({ data: [{ status: 'ok', contribution_id: 'gc1', saved: '1250.50' }], error: null });

    const result = await createGoalsRepository(supabase).addGoalContribution('user-1', 'g1', {
      amount: 250.5,
      occurredOn: '2026-10-19',
      lineEventId: 'ev1',
    });

    expect(result).toEqual({ status: 'ok', contributionId: 'gc1', saved: 1250.5 });
    expect(calls).toEqual([
      [
        'rpc',
        'add_goal_contribution',
        { p_user_id: 'user-1', p_goal_id: 'g1', p_amount: 250.5, p_occurred_on: '2026-10-19', p_line_event_id: 'ev1' },
      ],
    ]);
  });

  it('sends no event id from the web and passes a refusal through', async () => {
    const { supabase, calls } = fakeSupabase({ data: [{ status: 'closed', contribution_id: null, saved: null }], error: null });

    const result = await createGoalsRepository(supabase).addGoalContribution('user-1', 'g1', { amount: 100, occurredOn: '2026-10-19' });

    expect(result).toEqual({ status: 'closed', contributionId: null, saved: null });
    expect(calls[0][2].p_line_event_id).toBeNull();
  });

  it('lists the latest contributions of this user goal', async () => {
    const { supabase, calls } = fakeSupabase({ data: [{ id: 'gc2', amount: '1000.00', occurred_on: '2026-10-14' }], error: null });

    expect(await createGoalsRepository(supabase).listGoalContributions('user-1', 'g1')).toEqual([
      { id: 'gc2', amount: 1000, occurredOn: '2026-10-14' },
    ]);
    expect(calls).toEqual([
      ['from', 'goal_contributions'],
      ['select', 'id, amount, occurred_on'],
      ['eq', 'user_id', 'user-1'],
      ['eq', 'goal_id', 'g1'],
      ['order', 'occurred_on', { ascending: false }],
      ['order', 'created_at', { ascending: false }],
      ['limit', 100],
    ]);
  });

  it('deletes one contribution of this user goal', async () => {
    const { supabase, calls } = fakeSupabase({ count: 1, error: null });

    expect(await createGoalsRepository(supabase).deleteGoalContribution('user-1', 'g1', 'gc1')).toBe(true);
    expect(calls).toEqual([
      ['from', 'goal_contributions'],
      ['delete', { count: 'exact' }],
      ['eq', 'user_id', 'user-1'],
      ['eq', 'goal_id', 'g1'],
      ['eq', 'id', 'gc1'],
    ]);
  });

  it('answers false when the contribution is not there', async () => {
    const { supabase } = fakeSupabase({ count: 0, error: null });

    expect(await createGoalsRepository(supabase).deleteGoalContribution('user-1', 'g1', 'gc1')).toBe(false);
  });

  it('deletes the contributions of a chat message for this user', async () => {
    const { supabase, calls } = fakeSupabase({ count: 1, error: null });

    expect(await createGoalsRepository(supabase).deleteGoalContributionsByEvent('user-1', 'ev1')).toBe(1);
    expect(calls).toEqual([
      ['from', 'goal_contributions'],
      ['delete', { count: 'exact' }],
      ['eq', 'user_id', 'user-1'],
      ['eq', 'line_event_id', 'ev1'],
    ]);
  });

  it.each([
    ['listGoals', (repo) => repo.listGoals('user-1')],
    ['createGoal', (repo) => repo.createGoal('user-1', { name: 'x', targetAmount: 1, targetDate: null })],
    ['updateGoal', (repo) => repo.updateGoal('user-1', 'g1', { closed: true })],
    ['addGoalContribution', (repo) => repo.addGoalContribution('user-1', 'g1', { amount: 1, occurredOn: '2026-10-19' })],
    ['listGoalContributions', (repo) => repo.listGoalContributions('user-1', 'g1')],
    ['deleteGoalContribution', (repo) => repo.deleteGoalContribution('user-1', 'g1', 'gc1')],
    ['deleteGoalContributionsByEvent', (repo) => repo.deleteGoalContributionsByEvent('user-1', 'ev1')],
  ])('throws DatabaseError when %s fails', async (name, run) => {
    const { supabase } = fakeSupabase({ data: null, count: null, error: { message: 'boom' } });

    const promise = run(createGoalsRepository(supabase));

    await expect(promise).rejects.toBeInstanceOf(DatabaseError);
    await expect(promise).rejects.toThrow(`Database ${name} failed: boom`);
  });
});

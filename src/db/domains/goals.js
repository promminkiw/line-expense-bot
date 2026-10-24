const { throwIfError, UNIQUE_VIOLATION } = require('../errors');

const GOAL_COLUMNS = 'id, name, target_amount, target_date, closed';
// ประวัติการออมในหน้าเว็บแสดงเฉพาะของล่าสุด กันหน้าโหลดช้าเมื่อออมมานาน
const GOAL_CONTRIBUTION_LIMIT = 100;

function toGoal(row) {
  return {
    id: row.id,
    name: row.name,
    targetAmount: Number(row.target_amount),
    targetDate: row.target_date,
    closed: row.closed,
  };
}

function createGoalsRepository(supabase) {
  async function listGoals(userId) {
    const { data, error } = await supabase.rpc('goal_progress', { p_user_id: userId });
    throwIfError('listGoals', error);
    return data.map((row) => ({ ...toGoal(row), saved: Number(row.saved), contributionCount: Number(row.contribution_count) }));
  }

  // ชื่อซ้ำของผู้ใช้คนเดียวกันชน unique index จึงคืน duplicate ให้ API ตอบ 409
  async function createGoal(userId, { name, targetAmount, targetDate }) {
    const { data, error } = await supabase
      .from('savings_goals')
      .insert({ user_id: userId, name, target_amount: targetAmount, target_date: targetDate })
      .select(GOAL_COLUMNS)
      .single();
    if (error && error.code === UNIQUE_VIOLATION) {
      return { status: 'duplicate' };
    }
    throwIfError('createGoal', error);
    return { status: 'ok', goal: toGoal(data) };
  }

  async function updateGoal(userId, id, fields) {
    const changes = {};
    if (fields.name !== undefined) changes.name = fields.name;
    if (fields.targetAmount !== undefined) changes.target_amount = fields.targetAmount;
    if (fields.targetDate !== undefined) changes.target_date = fields.targetDate;
    if (fields.closed !== undefined) changes.closed = fields.closed;
    const { data, error } = await supabase
      .from('savings_goals')
      .update(changes)
      .eq('user_id', userId)
      .eq('id', id)
      .select(GOAL_COLUMNS);
    if (error && error.code === UNIQUE_VIOLATION) {
      return { status: 'duplicate' };
    }
    throwIfError('updateGoal', error);
    return data.length > 0 ? { status: 'ok', goal: toGoal(data[0]) } : { status: 'not_found' };
  }

  async function addGoalContribution(userId, goalId, { amount, occurredOn, lineEventId = null }) {
    const { data, error } = await supabase.rpc('add_goal_contribution', {
      p_user_id: userId,
      p_goal_id: goalId,
      p_amount: amount,
      p_occurred_on: occurredOn,
      p_line_event_id: lineEventId,
    });
    throwIfError('addGoalContribution', error);
    const row = data[0];
    return { status: row.status, contributionId: row.contribution_id, saved: row.saved === null ? null : Number(row.saved) };
  }

  async function listGoalContributions(userId, goalId) {
    const { data, error } = await supabase
      .from('goal_contributions')
      .select('id, amount, occurred_on')
      .eq('user_id', userId)
      .eq('goal_id', goalId)
      .order('occurred_on', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(GOAL_CONTRIBUTION_LIMIT);
    throwIfError('listGoalContributions', error);
    return data.map((row) => ({ id: row.id, amount: Number(row.amount), occurredOn: row.occurred_on }));
  }

  async function deleteGoalContribution(userId, goalId, id) {
    const { count, error } = await supabase
      .from('goal_contributions')
      .delete({ count: 'exact' })
      .eq('user_id', userId)
      .eq('goal_id', goalId)
      .eq('id', id);
    throwIfError('deleteGoalContribution', error);
    return count > 0;
  }

  async function deleteGoalContributionsByEvent(userId, webhookEventId) {
    const { count, error } = await supabase
      .from('goal_contributions')
      .delete({ count: 'exact' })
      .eq('user_id', userId)
      .eq('line_event_id', webhookEventId);
    throwIfError('deleteGoalContributionsByEvent', error);
    return count;
  }

  return {
    listGoals,
    createGoal,
    updateGoal,
    addGoalContribution,
    listGoalContributions,
    deleteGoalContribution,
    deleteGoalContributionsByEvent,
  };
}

module.exports = { createGoalsRepository };

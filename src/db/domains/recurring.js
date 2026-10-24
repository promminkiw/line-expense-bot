const { throwIfError } = require('../errors');
const { lastDayOf, monthStartOf } = require('../../recurring/schedule');

const RULE_COLUMNS = 'id, type, category_id, amount, note, day_of_month, active, last_run_on';
// กันงานรอบเดียวหนักเกินไป ที่เหลือจะถูกหยิบในรอบถัดไป
const DUE_RULE_BATCH = 500;

function toRule(row) {
  return {
    id: row.id,
    type: row.type,
    categoryId: row.category_id,
    amount: Number(row.amount),
    note: row.note,
    dayOfMonth: row.day_of_month,
    active: row.active,
    lastRunOn: row.last_run_on,
  };
}

function createRecurringRepository(supabase) {
  async function listRecurringRules(userId) {
    const { data, error } = await supabase
      .from('recurring_rules')
      .select(RULE_COLUMNS)
      .eq('user_id', userId)
      .order('day_of_month')
      .order('created_at');
    throwIfError('listRecurringRules', error);
    return data.map(toRule);
  }

  async function createRecurringRule({ userId, type, categoryId, amount, note, dayOfMonth, active, lastRunOn }) {
    const { data, error } = await supabase
      .from('recurring_rules')
      .insert({
        user_id: userId,
        type,
        category_id: categoryId,
        amount,
        note,
        day_of_month: dayOfMonth,
        active,
        last_run_on: lastRunOn,
      })
      .select(RULE_COLUMNS)
      .single();
    throwIfError('createRecurringRule', error);
    return toRule(data);
  }

  async function updateRecurringRule(userId, id, fields) {
    const { data, error } = await supabase
      .from('recurring_rules')
      .update({
        type: fields.type,
        category_id: fields.categoryId,
        amount: fields.amount,
        note: fields.note,
        day_of_month: fields.dayOfMonth,
        active: fields.active,
        last_run_on: fields.lastRunOn,
      })
      .eq('user_id', userId)
      .eq('id', id)
      .select('id');
    throwIfError('updateRecurringRule', error);
    return data.length > 0;
  }

  async function deleteRecurringRule(userId, id) {
    const { count, error } = await supabase
      .from('recurring_rules')
      .delete({ count: 'exact' })
      .eq('user_id', userId)
      .eq('id', id);
    throwIfError('deleteRecurringRule', error);
    return count > 0;
  }

  // กรองใน SQL ให้เหลือเฉพาะกฎที่ยังไม่ทำเดือนนี้และถึงวันแล้ว วันสุดท้ายของเดือนไม่กรองวัน เพื่อเก็บกฎวันที่ 29-31
  async function listDueRecurringRules(today) {
    const todayDay = Number(today.slice(8, 10));
    let query = supabase
      .from('recurring_rules')
      .select(`${RULE_COLUMNS}, user_id, users(line_user_id), categories(name)`)
      .eq('active', true)
      .or(`last_run_on.is.null,last_run_on.lt.${monthStartOf(today)}`);
    if (todayDay < lastDayOf(today)) {
      query = query.lte('day_of_month', todayDay);
    }
    const { data, error } = await query.order('created_at').limit(DUE_RULE_BATCH);
    throwIfError('listDueRecurringRules', error);
    return data.map((row) => ({
      ...toRule(row),
      userId: row.user_id,
      lineUserId: row.users.line_user_id,
      categoryName: row.categories.name,
    }));
  }

  async function applyRecurringRule({ ruleId, dueOn, eventId }) {
    const { data, error } = await supabase.rpc('apply_recurring_rule', {
      p_rule_id: ruleId,
      p_due: dueOn,
      p_event_id: eventId,
    });
    throwIfError('applyRecurringRule', error);
    return data === true;
  }

  return {
    listRecurringRules,
    createRecurringRule,
    updateRecurringRule,
    deleteRecurringRule,
    listDueRecurringRules,
    applyRecurringRule,
  };
}

module.exports = { createRecurringRepository };

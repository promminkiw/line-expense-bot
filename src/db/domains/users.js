const { throwIfError } = require('../errors');

function createUsersRepository(supabase) {
  async function findUserIdByLineId(lineUserId) {
    const { data, error } = await supabase
      .from('users')
      .select('id')
      .eq('line_user_id', lineUserId)
      .maybeSingle();
    throwIfError('findUserIdByLineId', error);
    return data ? data.id : null;
  }

  async function createUser({ lineUserId, displayName }) {
    // upsert กันกรณี event แรกของผู้ใช้ใหม่มาพร้อมกันหลายอัน
    const { data, error } = await supabase
      .from('users')
      .upsert({ line_user_id: lineUserId, display_name: displayName }, { onConflict: 'line_user_id' })
      .select('id')
      .single();
    throwIfError('createUser', error);
    return data.id;
  }

  // เงื่อนไข is null กันเขียนทับชื่อที่มีอยู่แล้ว
  async function fillMissingDisplayName(userId, displayName) {
    const { error } = await supabase
      .from('users')
      .update({ display_name: displayName })
      .eq('id', userId)
      .is('display_name', null);
    throwIfError('fillMissingDisplayName', error);
  }

  async function getDisplayName(userId) {
    const { data, error } = await supabase.from('users').select('display_name').eq('id', userId).maybeSingle();
    throwIfError('getDisplayName', error);
    return data ? data.display_name : null;
  }

  async function getLineUserIds(userIds) {
    const { data, error } = await supabase.from('users').select('id, line_user_id').in('id', userIds);
    throwIfError('getLineUserIds', error);
    return new Map(data.map((row) => [row.id, row.line_user_id]));
  }

  return {
    findUserIdByLineId,
    createUser,
    fillMissingDisplayName,
    getDisplayName,
    getLineUserIds,
  };
}

module.exports = { createUsersRepository };

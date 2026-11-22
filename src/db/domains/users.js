const { throwIfError } = require('../errors');

function createUsersRepository(supabase) {
  // คืน language ดิบ (อาจเป็น null) ผู้เรียกฝั่งแชตค่อย normalize เอง
  async function findUserByLineId(lineUserId) {
    const { data, error } = await supabase
      .from('users')
      .select('id, language')
      .eq('line_user_id', lineUserId)
      .maybeSingle();
    throwIfError('findUserByLineId', error);
    return data ? { id: data.id, language: data.language } : null;
  }

  async function createUser({ lineUserId, displayName, language }) {
    // upsert กันกรณี event แรกของผู้ใช้ใหม่มาพร้อมกันหลายอัน
    const { data, error } = await supabase
      .from('users')
      .upsert({ line_user_id: lineUserId, display_name: displayName, language }, { onConflict: 'line_user_id' })
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

  async function getUserLanguage(userId) {
    const { data, error } = await supabase.from('users').select('language').eq('id', userId).maybeSingle();
    throwIfError('getUserLanguage', error);
    return data ? data.language : null;
  }

  async function setUserLanguage(userId, language) {
    const { error } = await supabase.from('users').update({ language }).eq('id', userId);
    throwIfError('setUserLanguage', error);
  }

  // ส่ง language มาด้วยเพื่อให้ push ข้อความถึงผู้ใช้ได้ถูกภาษาโดยไม่ต้อง query เพิ่ม
  async function getLineUserIds(userIds) {
    const { data, error } = await supabase.from('users').select('id, line_user_id, language').in('id', userIds);
    throwIfError('getLineUserIds', error);
    return new Map(data.map((row) => [row.id, { lineUserId: row.line_user_id, language: row.language }]));
  }

  return {
    findUserByLineId,
    createUser,
    fillMissingDisplayName,
    getDisplayName,
    getUserLanguage,
    setUserLanguage,
    getLineUserIds,
  };
}

module.exports = { createUsersRepository };

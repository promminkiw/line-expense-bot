const { throwIfError } = require('../errors');

function createExportsRepository(supabase) {
  async function deleteExpiredExportLinks(userId, nowIso) {
    const { error } = await supabase
      .from('export_links')
      .delete()
      .eq('user_id', userId)
      .lte('expires_at', nowIso);
    throwIfError('deleteExpiredExportLinks', error);
  }

  async function createExportLink({ tokenHash, userId, month, expiresAt }) {
    const { error } = await supabase
      .from('export_links')
      .insert({ token_hash: tokenHash, user_id: userId, month, expires_at: expiresAt });
    throwIfError('createExportLink', error);
  }

  // update แบบมีเงื่อนไขในคำสั่งเดียว กันลิงก์เดียวถูกใช้สองครั้งพร้อมกัน
  async function claimExportLink(tokenHash, nowIso) {
    const { data, error } = await supabase
      .from('export_links')
      .update({ used_at: nowIso })
      .eq('token_hash', tokenHash)
      .is('used_at', null)
      .gt('expires_at', nowIso)
      .select('user_id, month');
    throwIfError('claimExportLink', error);
    return data.length > 0 ? { userId: data[0].user_id, month: data[0].month } : null;
  }

  return {
    createExportLink,
    deleteExpiredExportLinks,
    claimExportLink,
  };
}

module.exports = { createExportsRepository };

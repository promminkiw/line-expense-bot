const { throwIfError } = require('../errors');

function createPendingRepository(supabase) {
  async function getPendingClarification(userId) {
    const { data, error } = await supabase
      .from('pending_clarifications')
      .select('messages, updated_at')
      .eq('user_id', userId)
      .maybeSingle();
    throwIfError('getPendingClarification', error);
    return data ? { messages: data.messages, updatedAt: data.updated_at } : null;
  }

  async function savePendingClarification(userId, messages) {
    // ส่ง updated_at เองทุกครั้ง เพราะค่า default ใช้ตอน insert เท่านั้น ไม่ใช้ตอน upsert ทับแถวเดิม
    const { error } = await supabase
      .from('pending_clarifications')
      .upsert(
        { user_id: userId, messages, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      );
    throwIfError('savePendingClarification', error);
  }

  async function clearPendingClarification(userId) {
    const { error } = await supabase.from('pending_clarifications').delete().eq('user_id', userId);
    throwIfError('clearPendingClarification', error);
  }

  async function savePendingSlip(userId, webhookEventId, items) {
    const { data, error } = await supabase
      .from('pending_slips')
      .insert({ user_id: userId, line_event_id: webhookEventId, items })
      .select('id')
      .single();
    throwIfError('savePendingSlip', error);
    return data.id;
  }

  // delete พร้อมคืนแถวในคำสั่งเดียว กันกดบันทึกซ้ำสองครั้งพร้อมกัน
  async function claimPendingSlip(userId, slipId, sinceIso) {
    const { data, error } = await supabase
      .from('pending_slips')
      .delete()
      .eq('id', slipId)
      .eq('user_id', userId)
      .gte('created_at', sinceIso)
      .select('line_event_id, items')
      .maybeSingle();
    throwIfError('claimPendingSlip', error);
    return data ? { webhookEventId: data.line_event_id, items: data.items } : null;
  }

  async function deleteExpiredPendingSlips(userId, beforeIso) {
    const { error } = await supabase
      .from('pending_slips')
      .delete()
      .eq('user_id', userId)
      .lte('created_at', beforeIso);
    throwIfError('deleteExpiredPendingSlips', error);
  }

  // งานกวาดทั้งระบบ ไม่กรอง user (ใช้ service role)
  async function deleteAllExpiredPendingSlips(beforeIso) {
    const { error } = await supabase.from('pending_slips').delete().lte('created_at', beforeIso);
    throwIfError('deleteAllExpiredPendingSlips', error);
  }

  return {
    getPendingClarification,
    savePendingClarification,
    clearPendingClarification,
    savePendingSlip,
    claimPendingSlip,
    deleteExpiredPendingSlips,
    deleteAllExpiredPendingSlips,
  };
}

module.exports = { createPendingRepository };

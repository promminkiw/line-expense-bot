const { throwIfError, UNIQUE_VIOLATION, FOREIGN_KEY_VIOLATION } = require('../errors');

function createFriendsRepository(supabase) {
  async function getFriendCode(userId) {
    const { data, error } = await supabase.from('users').select('friend_code').eq('id', userId).maybeSingle();
    throwIfError('getFriendCode', error);
    return data ? data.friend_code : null;
  }

  // รหัสชนกับของคนอื่นคืน taken ให้ผู้เรียกสุ่มใหม่ แทนการ throw
  // onlyIfEmpty กันหน้าที่เปิดพร้อมกันเขียนทับรหัสแรกที่อีกหน้าแสดงไปแล้ว
  async function setFriendCode(userId, code, { onlyIfEmpty = false } = {}) {
    let query = supabase.from('users').update({ friend_code: code }, { count: 'exact' }).eq('id', userId);
    if (onlyIfEmpty) {
      query = query.is('friend_code', null);
    }
    const { count, error } = await query;
    if (error && error.code === UNIQUE_VIOLATION) {
      return 'taken';
    }
    throwIfError('setFriendCode', error);
    return count > 0 ? 'set' : 'unchanged';
  }

  async function findUserByFriendCode(code) {
    const { data, error } = await supabase
      .from('users')
      .select('id, display_name')
      .eq('friend_code', code)
      .maybeSingle();
    throwIfError('findUserByFriendCode', error);
    return data ? { id: data.id, displayName: data.display_name } : null;
  }

  async function listFriends(userId) {
    const { data, error } = await supabase
      .from('friendships')
      .select('friend_id, friend:users!friendships_friend_id_fkey(display_name)')
      .eq('user_id', userId);
    throwIfError('listFriends', error);
    return data.map((row) => ({ id: row.friend_id, displayName: row.friend ? row.friend.display_name : null }));
  }

  // สองแถวอยู่ในคำสั่งเดียว จึงเกิดพร้อมกันหรือไม่เกิดเลย
  async function addFriendship(userId, friendId) {
    const rows = [
      { user_id: userId, friend_id: friendId },
      { user_id: friendId, friend_id: userId },
    ];
    // เรียงตาม user_id ให้การเพิ่มพร้อมกันสองฝั่งล็อกแถวลำดับเดียวกัน จะได้ไม่ deadlock
    rows.sort((a, b) => (a.user_id < b.user_id ? -1 : 1));
    const { error } = await supabase.from('friendships').upsert(
      rows,
      { onConflict: 'user_id,friend_id', ignoreDuplicates: true }
    );
    // อีกฝั่งถูกลบไประหว่างค้นหากับเพิ่ม ให้ผู้เรียกตอบว่าไม่พบแทน error ของระบบ
    if (error && error.code === FOREIGN_KEY_VIOLATION) {
      return false;
    }
    throwIfError('addFriendship', error);
    return true;
  }

  // ผู้เรียกต้องตรวจว่า friendId เป็น UUID ก่อน เพราะค่าถูกต่อเข้าไปในตัวกรอง or
  async function removeFriendship(userId, friendId) {
    const { count, error } = await supabase
      .from('friendships')
      .delete({ count: 'exact' })
      .or(`and(user_id.eq.${userId},friend_id.eq.${friendId}),and(user_id.eq.${friendId},friend_id.eq.${userId})`);
    throwIfError('removeFriendship', error);
    return count > 0;
  }

  return {
    getFriendCode,
    setFriendCode,
    findUserByFriendCode,
    listFriends,
    addFriendship,
    removeFriendship,
  };
}

module.exports = { createFriendsRepository };

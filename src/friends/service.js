const { generateFriendCode, normalizeFriendCode } = require('./code');

const FALLBACK_DISPLAY_NAME = 'ผู้ใช้ LINE';
// โอกาสชนต่ำมาก ลองหลายครั้งเผื่อไว้ก่อนยอมแพ้
const MAX_CODE_ATTEMPTS = 5;

function toFriend(user) {
  return { id: user.id, displayName: user.displayName || FALLBACK_DISPLAY_NAME };
}

function createFriendService({ repository, generateCode = generateFriendCode }) {
  async function assignCode(userId, { onlyIfEmpty }) {
    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
      const code = generateCode();
      const result = await repository.setFriendCode(userId, code, { onlyIfEmpty });
      if (result === 'set') {
        return code;
      }
      if (result === 'unchanged') {
        // อีกหน้าตั้งรหัสแรกไปก่อนแล้ว ใช้รหัสนั้นแทนการเขียนทับ
        if (onlyIfEmpty) return repository.getFriendCode(userId);
        throw new Error('User not found');
      }
    }
    throw new Error('Could not assign a unique friend code');
  }

  function regenerateCode(userId) {
    return assignCode(userId, { onlyIfEmpty: false });
  }

  async function getOverview(userId) {
    const [existing, friends] = await Promise.all([repository.getFriendCode(userId), repository.listFriends(userId)]);
    const code = existing || (await assignCode(userId, { onlyIfEmpty: true }));
    const sorted = friends.map(toFriend).sort((a, b) => a.displayName.localeCompare(b.displayName, 'th'));
    return { code, friends: sorted };
  }

  // คืนเป็นสถานะให้ router แปลงเป็น HTTP status เอง
  async function lookup(userId, rawCode) {
    const code = normalizeFriendCode(rawCode);
    if (!code) {
      return { status: 'invalid' };
    }
    const user = await repository.findUserByFriendCode(code);
    if (!user) {
      return { status: 'not_found' };
    }
    if (user.id === userId) {
      return { status: 'self' };
    }
    return { status: 'ok', friend: toFriend(user) };
  }

  async function addByCode(userId, rawCode) {
    const result = await lookup(userId, rawCode);
    if (result.status === 'ok' && !(await repository.addFriendship(userId, result.friend.id))) {
      return { status: 'not_found' };
    }
    return result;
  }

  function remove(userId, friendId) {
    return repository.removeFriendship(userId, friendId);
  }

  return { getOverview, lookup, addByCode, remove, regenerateCode };
}

module.exports = { createFriendService, FALLBACK_DISPLAY_NAME };

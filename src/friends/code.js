const { randomInt } = require('node:crypto');

// ตัด I O 0 1 ออกเพราะอ่านสลับกันง่ายตอนพิมพ์ตาม
const FRIEND_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const FRIEND_CODE_LENGTH = 8;
const FRIEND_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{8}$/;
// คัดลอกรหัสจากแชตหรือโน้ตมักได้ขีดยาวหรือเครื่องหมายลบมาแทนขีดสั้น
const DASHES_AND_SPACES = /[\s\-\u2010-\u2015\u2212]/g;

function generateFriendCode(pick = (max) => randomInt(max)) {
  let code = '';
  for (let index = 0; index < FRIEND_CODE_LENGTH; index += 1) {
    code += FRIEND_CODE_ALPHABET[pick(FRIEND_CODE_ALPHABET.length)];
  }
  return code;
}

// ผู้ใช้อาจพิมพ์ตัวเล็ก เว้นวรรค หรือขีดคั่นแบบที่หน้าเว็บแสดงมา
function normalizeFriendCode(input) {
  if (typeof input !== 'string') {
    return null;
  }
  const code = input.replace(DASHES_AND_SPACES, '').toUpperCase();
  return FRIEND_CODE_PATTERN.test(code) ? code : null;
}

module.exports = { generateFriendCode, normalizeFriendCode, FRIEND_CODE_PATTERN, FRIEND_CODE_ALPHABET };

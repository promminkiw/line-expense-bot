import { loginRequiredMessage } from '../format.mjs';
import { t } from '../i18n/translate.mjs';
import { getLang } from '../i18n/current.mjs';

// ตรงกับ FRIEND_CODE_PATTERN ฝั่ง server ตรวจซ้ำที่นี่เพื่อบอกผู้ใช้ได้ทันทีโดยไม่ต้องยิง request
const FRIEND_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{8}$/;
// ตรงกับฝั่ง server: ตัดขีดยาวที่ติดมาตอนคัดลอกรหัสด้วย
const DASHES_AND_SPACES = /[\s\-\u2010-\u2015\u2212]/g;

// ค่าไทยตั้งต้นคงไว้ให้ผู้ใช้เดิมของ export นี้ หน้าเว็บเรียก t ตามภาษาที่เปิดอยู่
export const INVALID_CODE_MESSAGE = t('th', 'web.friends.error.invalidCode');
export const OWN_CODE_MESSAGE = t('th', 'web.friends.error.ownCode');

// ตรงกับ FALLBACK_DISPLAY_NAME ใน src/friends/service.js server ส่งชื่อไทยนี้มาแทนเพื่อนที่ไม่มีชื่อ LINE
const SERVER_FALLBACK_NAME = 'ผู้ใช้ LINE';

// ชื่อเพื่อนเป็นข้อมูลของผู้ใช้ แปลเฉพาะชื่อสำรองที่ server ใส่ให้
export function displayFriendName(name, lang = getLang()) {
  return name === SERVER_FALLBACK_NAME ? t(lang, 'web.friends.fallbackName') : name;
}

export function normalizeFriendCodeInput(text) {
  if (typeof text !== 'string') return null;
  const code = text.replace(DASHES_AND_SPACES, '').toUpperCase();
  return FRIEND_CODE_PATTERN.test(code) ? code : null;
}

export function formatFriendCode(code) {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

export function buildInviteUrl(liffId, code) {
  return `https://liff.line.me/${liffId}?friend=${encodeURIComponent(code)}`;
}

// ข้อความนี้ส่งถึงเพื่อนที่อาจยังไม่รู้จักบอท จึงเป็นข้อความกลางๆ ไม่ใช้บุคลิกเฮีย (ข้อยกเว้นตาม SPEC)
export function buildInviteMessage(url, lang = getLang()) {
  return t(lang, 'web.friends.invite', { url });
}

function friendErrorKey(status, action, error) {
  if (action === 'add') {
    if (status === 400) return error === 'Own code' ? 'web.friends.error.ownCode' : 'web.friends.error.invalidCode';
    if (status === 404) return 'web.friends.error.notFound';
    return status === 429 ? 'web.friends.error.tooManyTries' : 'web.friends.error.addFailed';
  }
  if (action === 'remove') return 'web.friends.error.removeFailed';
  if (action === 'renew') return status === 429 ? 'web.friends.error.renewTooFast' : 'web.friends.error.renewFailed';
  return 'web.friends.error.loadFailed';
}

export function describeFriendError(status, action, error, lang = getLang()) {
  if (status === 401) return loginRequiredMessage(lang);
  return t(lang, friendErrorKey(status, action, error));
}

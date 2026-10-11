import { describe, it, expect } from 'vitest';
import {
  normalizeFriendCodeInput,
  formatFriendCode,
  buildInviteUrl,
  buildInviteMessage,
  describeFriendError,
  INVALID_CODE_MESSAGE,
  OWN_CODE_MESSAGE,
} from './friends-format.mjs';
import { LOGIN_REQUIRED_MESSAGE } from './format.mjs';
import { normalizeFriendCode as serverNormalize } from '../../src/friends/code.js';

describe('normalizeFriendCodeInput', () => {
  it('accepts lower case, spaces and the dash used on screen', () => {
    expect(normalizeFriendCodeInput(' abcd-2345 ')).toBe('ABCD2345');
  });

  it('rejects anything that is not 8 allowed characters', () => {
    for (const input of ['ABCD234', 'ABCD2340', 'ABCDI234', '', null]) {
      expect(normalizeFriendCodeInput(input)).toBeNull();
    }
  });

  // browser ตรวจก่อนส่ง ถ้าตรวจต่างจาก server ผู้ใช้จะเห็นข้อความผิดหรือส่ง request ที่ไม่มีทางผ่าน
  it.each([' abcd-2345 ', 'ABCD\u20132345', 'ABCD\u20142345', 'ab cd 23 45', 'XABCD2345', 'ABCD2340', 'ABCDI234', '', null, 12345678])(
    'agrees with the server for %s',
    (input) => {
      expect(normalizeFriendCodeInput(input)).toBe(serverNormalize(input));
    }
  );
});

describe('invite link', () => {
  it('shows the code in two groups of four', () => {
    expect(formatFriendCode('ABCD2345')).toBe('ABCD-2345');
  });

  it('builds the LIFF link with the code and a message that contains it', () => {
    const url = buildInviteUrl('liff-123', 'ABCD2345');

    expect(url).toBe('https://liff.line.me/liff-123?friend=ABCD2345');
    expect(buildInviteMessage(url)).toContain(url);
  });
});

describe('describeFriendError', () => {
  it('asks to reopen from LINE on 401 for every action', () => {
    for (const action of ['load', 'add', 'remove', 'renew']) {
      expect(describeFriendError(401, action)).toBe(LOGIN_REQUIRED_MESSAGE);
    }
  });

  it('explains each add failure', () => {
    expect(describeFriendError(400, 'add')).toBe(INVALID_CODE_MESSAGE);
    expect(describeFriendError(404, 'add')).toBe('ไม่พบรหัสเพื่อนนี้ อาจพิมพ์ผิดหรือเพื่อนเปลี่ยนรหัสแล้ว');
    expect(describeFriendError(429, 'add')).toBe('ลองหลายครั้งเกินไป รอสักครู่แล้วลองใหม่');
    expect(describeFriendError(500, 'add')).toBe('เพิ่มเพื่อนไม่สำเร็จ ลองใหม่อีกครั้ง');
  });

  // รหัสเก่าของตัวเองจากอีกเครื่องผ่านการตรวจรูปแบบใน browser แต่ server ตอบ Own code
  it('says it is your own code when the server says so', () => {
    expect(describeFriendError(400, 'add', 'Own code')).toBe(OWN_CODE_MESSAGE);
    expect(describeFriendError(400, 'add', 'Invalid code')).toBe(INVALID_CODE_MESSAGE);
  });

  it('asks to wait when renewing the code too often', () => {
    expect(describeFriendError(429, 'renew')).toBe('เปลี่ยนรหัสบ่อยเกินไป รอสักครู่แล้วลองใหม่');
  });

  it('encodes the code in the invite link', () => {
    expect(buildInviteUrl('liff-1', 'AB&C')).toBe('https://liff.line.me/liff-1?friend=AB%26C');
    expect(buildInviteUrl('liff-1', 'ABCD2345')).toBe('https://liff.line.me/liff-1?friend=ABCD2345');
  });

  it('has a message for load, remove and renew failures', () => {
    expect(describeFriendError(500, 'load')).toBe('โหลดรายชื่อเพื่อนไม่สำเร็จ');
    expect(describeFriendError(500, 'remove')).toBe('ลบเพื่อนไม่สำเร็จ ลองใหม่อีกครั้ง');
    expect(describeFriendError(0, 'renew')).toBe('เปลี่ยนรหัสไม่สำเร็จ ลองใหม่อีกครั้ง');
  });
});

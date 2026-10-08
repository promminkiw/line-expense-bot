import { describe, it, expect } from 'vitest';
import {
  normalizeFriendCodeInput,
  formatFriendCode,
  buildInviteUrl,
  buildInviteMessage,
  describeFriendError,
  INVALID_CODE_MESSAGE,
} from './friends-format.mjs';
import { LOGIN_REQUIRED_MESSAGE } from './format.mjs';

describe('normalizeFriendCodeInput', () => {
  it('accepts lower case, spaces and the dash used on screen', () => {
    expect(normalizeFriendCodeInput(' abcd-2345 ')).toBe('ABCD2345');
  });

  it('rejects anything that is not 8 allowed characters', () => {
    for (const input of ['ABCD234', 'ABCD2340', 'ABCDI234', '', null]) {
      expect(normalizeFriendCodeInput(input)).toBeNull();
    }
  });
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

  it('has a message for load, remove and renew failures', () => {
    expect(describeFriendError(500, 'load')).toBe('โหลดรายชื่อเพื่อนไม่สำเร็จ');
    expect(describeFriendError(500, 'remove')).toBe('ลบเพื่อนไม่สำเร็จ ลองใหม่อีกครั้ง');
    expect(describeFriendError(0, 'renew')).toBe('เปลี่ยนรหัสไม่สำเร็จ ลองใหม่อีกครั้ง');
  });
});

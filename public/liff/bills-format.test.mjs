import { describe, it, expect } from 'vitest';
import {
  toSatang,
  splitEvenly,
  buildEqualShares,
  sumShortfall,
  outstandingAmount,
  MEMBER_STATUS_LABELS,
  describeBillError,
  describeBillAnswer,
  buildBillUrl,
  describeReceiptError,
} from './bills-format.mjs';
import { LOGIN_REQUIRED_MESSAGE } from './format.mjs';
import { toSatang as serverToSatang, splitEvenly as serverSplitEvenly } from '../../src/bills/validate.js';

describe('split helpers', () => {
  it('match the server rounding', () => {
    expect(toSatang(333.33)).toBe(33333);
    expect(toSatang(1.005)).toBeNull();
    expect(splitEvenly(100000, 3)).toEqual({ base: 33333, remainder: 1 });
  });

  it('builds equal shares with the leftover satang on the owner', () => {
    expect(buildEqualShares(1000, 2)).toEqual({ ownerShare: 333.34, memberShare: 333.33 });
    expect(buildEqualShares(900, 2)).toEqual({ ownerShare: 300, memberShare: 300 });
    expect(buildEqualShares(0, 2)).toBeNull();
    expect(buildEqualShares(1000, 0)).toBeNull();
  });

  it('says how far the shares are from the total', () => {
    expect(sumShortfall(1000, 300, [300, 300])).toBe(100);
    expect(sumShortfall(1000, 400, [300, 300.01])).toBe(-0.01);
    expect(sumShortfall(1000, 400, [300, 300])).toBe(0);
  });

  it('counts what friends still owe, skipping declined and paid members', () => {
    const bill = {
      status: 'open',
      members: [
        { share: 300, status: 'confirmed', paid: false },
        { share: 200, status: 'pending', paid: false },
        { share: 100, status: 'declined', paid: false },
        { share: 50, status: 'confirmed', paid: true },
      ],
    };

    expect(outstandingAmount(bill)).toBe(500);
    expect(outstandingAmount({ ...bill, status: 'cancelled' })).toBe(300);
  });
});

describe('labels and messages', () => {
  it('labels member statuses in Thai', () => {
    expect(MEMBER_STATUS_LABELS).toEqual({ pending: 'รอตอบ', confirmed: 'ยืนยันแล้ว', declined: 'ปฏิเสธ' });
  });

  it('explains failures per action', () => {
    expect(describeBillError(401, 'create')).toBe(LOGIN_REQUIRED_MESSAGE);
    expect(describeBillError(400, 'create', 'Not friends')).toBe('มีคนที่ไม่ได้เป็นเพื่อนกันแล้ว โหลดรายชื่อใหม่แล้วลองอีกครั้ง');
    expect(describeBillError(400, 'create', 'Shares do not add up')).toBe('ยอดของทุกคนรวมกันไม่เท่ากับยอดบิล');
    expect(describeBillError(400, 'create', 'Invalid title')).toBe('ข้อมูลบิลไม่ถูกต้อง ตรวจชื่อบิล ยอด และวันที่อีกครั้ง');
    expect(describeBillError(429, 'create')).toBe('สร้างบิลบ่อยเกินไป รอสักครู่แล้วลองใหม่');
    expect(describeBillError(500, 'create')).toBe('สร้างบิลไม่สำเร็จ ลองใหม่อีกครั้ง');
    expect(describeBillError(500, 'load')).toBe('โหลดบิลไม่สำเร็จ');
    expect(describeBillError(404, 'respond')).toBe('ไม่พบบิลนี้แล้ว');
    expect(describeBillError(500, 'respond')).toBe('ตอบบิลไม่สำเร็จ ลองใหม่อีกครั้ง');
    expect(describeBillError(500, 'cancel')).toBe('ยกเลิกบิลไม่สำเร็จ ลองใหม่อีกครั้ง');
    expect(describeBillError(500, 'paid')).toBe('บันทึกการคืนเงินไม่สำเร็จ ลองใหม่อีกครั้ง');
  });

  it('describes an earlier answer or a cancelled bill, and nothing for a fresh answer', () => {
    expect(describeBillAnswer('confirmed')).toBeNull();
    expect(describeBillAnswer('declined')).toBeNull();
    expect(describeBillAnswer('cancelled')).toBe('บิลนี้ถูกยกเลิกแล้ว');
    expect(describeBillAnswer('already_confirmed')).toBe('คุณยืนยันบิลนี้ไปแล้ว');
    expect(describeBillAnswer('already_declined')).toBe('คุณปฏิเสธบิลนี้ไปแล้ว');
  });

  it('builds the link to a bill on the web page', () => {
    expect(buildBillUrl('liff-1', 'b-1')).toBe('https://liff.line.me/liff-1?bill=b-1');
  });
});

describe('matches the server split math', () => {
  it.each([333.33, 1.005, 0.1 + 0.2, 1000 / 3, 10000000, 0, -1, NaN, '10'])('toSatang(%s)', (amount) => {
    expect(toSatang(amount)).toEqual(serverToSatang(amount));
  });

  it.each([[100000, 3], [90000, 3], [1, 2], [1000000000, 7]])('splitEvenly(%s, %s)', (total, count) => {
    expect(splitEvenly(total, count)).toEqual(serverSplitEvenly(total, count));
  });
});

describe('describeReceiptError', () => {
  it('says what to do for each way reading a receipt can fail', () => {
    expect(describeReceiptError(422)).toBe('อ่านยอดจากรูปนี้ไม่ได้ ลองรูปที่ชัดขึ้น หรือพิมพ์ยอดเอง');
    expect(describeReceiptError(415)).toBe('ไฟล์นี้ไม่ใช่รูปที่อ่านได้ (รองรับ JPEG, PNG, GIF, WebP)');
    expect(describeReceiptError(413)).toBe('รูปใหญ่เกินไป (ไม่เกิน 10 MB)');
    expect(describeReceiptError(429)).toBe('อ่านรูปบ่อยเกินไป รอสักครู่แล้วลองใหม่');
    expect(describeReceiptError(401)).toBe(LOGIN_REQUIRED_MESSAGE);
    expect(describeReceiptError(500)).toBe('อ่านรูปไม่สำเร็จ ลองใหม่อีกครั้ง หรือพิมพ์ยอดเอง');
    expect(describeReceiptError(0)).toBe('อ่านรูปไม่สำเร็จ ลองใหม่อีกครั้ง หรือพิมพ์ยอดเอง');
  });
});

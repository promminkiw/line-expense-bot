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
  BILL_LIST_LIMIT,
  isOwnedBillFinished,
  isIncomingBillFinished,
  paidProgress,
  ownedBillSummary,
  incomingBillState,
  countAwaitingAnswer,
  pickInitialBillsView,
  calendarParts,
  needsShareLink,
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
  it.each([333.33, 1.005, 1.0000000001, 0.1 + 0.2, 1000 / 3, 10000000, 9999999.99, 0, -0, -1, NaN, '10'])('toSatang(%s)', (amount) => {
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

describe('bill list helpers', () => {
  const member = (over) => ({ userId: 'f', displayName: 'บี', share: 100, status: 'confirmed', paid: false, notified: true, ...over });
  const owned = (over) => ({ status: 'open', members: [member()], ...over });
  const incoming = (over) => ({ status: 'open', myStatus: 'pending', paid: false, ...over });

  it('matches the list limit of the server', async () => {
    const source = await import('node:fs').then((fs) => fs.readFileSync(new URL('../../src/db/repository.js', import.meta.url), 'utf8'));
    expect(source).toContain(`const BILL_LIST_LIMIT = ${BILL_LIST_LIMIT};`);
  });

  it('treats an owned bill as finished once cancelled or nobody owes anything', () => {
    expect(isOwnedBillFinished(owned())).toBe(false);
    expect(isOwnedBillFinished(owned({ status: 'cancelled', members: [member({ status: 'pending' })] }))).toBe(true);
    expect(isOwnedBillFinished(owned({ members: [member({ paid: true }), member({ status: 'declined' })] }))).toBe(true);
    // ผู้ใช้กำหนดให้บิลที่ยกเลิกถือว่าจบ แม้เพื่อนที่ยืนยันแล้วยังไม่คืน
    expect(isOwnedBillFinished(owned({ status: 'cancelled' }))).toBe(true);
  });

  it('treats an incoming bill as finished once cancelled, declined or paid back', () => {
    expect(isIncomingBillFinished(incoming())).toBe(false);
    expect(isIncomingBillFinished(incoming({ myStatus: 'confirmed' }))).toBe(false);
    expect(isIncomingBillFinished(incoming({ myStatus: 'confirmed', paid: true }))).toBe(true);
    expect(isIncomingBillFinished(incoming({ myStatus: 'declined' }))).toBe(true);
    expect(isIncomingBillFinished(incoming({ status: 'cancelled' }))).toBe(true);
  });

  it('counts paid back friends among those who have to pay', () => {
    const bill = owned({ members: [member({ paid: true }), member(), member({ status: 'declined' }), member({ status: 'pending' })] });
    expect(paidProgress(bill)).toEqual({ paid: 1, count: 3 });
    expect(paidProgress({ ...bill, status: 'cancelled' })).toEqual({ paid: 1, count: 2 });
  });

  it('sums up an owned bill in one line', () => {
    expect(ownedBillSummary(owned({ members: [member({ paid: true }), member()] }))).toBe('ค้างรับ · คืนแล้ว 1/2 คน');
    expect(ownedBillSummary(owned({ status: 'cancelled' }))).toBe('ยกเลิกแล้ว');
    expect(ownedBillSummary(owned({ members: [member({ paid: true })] }))).toBe('คืนครบแล้ว');
    expect(ownedBillSummary(owned({ members: [member({ status: 'declined' })] }))).toBe('เพื่อนปฏิเสธทั้งหมด');
  });

  it('names the state of an incoming bill', () => {
    expect(incomingBillState(incoming())).toBe('รอคุณตอบ');
    expect(incomingBillState(incoming({ myStatus: 'confirmed' }))).toBe('ยังไม่คืน');
    expect(incomingBillState(incoming({ myStatus: 'confirmed', paid: true }))).toBe('คืนแล้ว');
    expect(incomingBillState(incoming({ myStatus: 'declined' }))).toBe('ปฏิเสธแล้ว');
    expect(incomingBillState(incoming({ status: 'cancelled', myStatus: 'confirmed' }))).toBe('ยกเลิกแล้ว');
  });

  it('counts only open bills still waiting for an answer', () => {
    expect(countAwaitingAnswer([incoming(), incoming({ status: 'cancelled' }), incoming({ myStatus: 'confirmed' })])).toBe(1);
  });

  it('opens the friends page first only when a bill waits for an answer', () => {
    expect(pickInitialBillsView({ incoming: [incoming()], owned: [owned()] })).toBe('incoming');
    expect(pickInitialBillsView({ incoming: [incoming({ myStatus: 'confirmed' })], owned: [owned()] })).toBe('owned');
    // ไม่เคยสร้างบิลเลย เปิดหน้าว่างไม่มีประโยชน์
    expect(pickInitialBillsView({ incoming: [incoming({ myStatus: 'confirmed' })], owned: [] })).toBe('incoming');
    expect(pickInitialBillsView({ incoming: [], owned: [] })).toBe('owned');
  });

  it('splits a date into the month and day of the calendar box', () => {
    expect(calendarParts('2026-10-08')).toEqual({ month: 'ต.ค.', day: '8' });
  });

  it('offers the bill link only on an open bill with a friend the push missed', () => {
    expect(needsShareLink(owned({ members: [member({ status: 'pending', notified: false })] }))).toBe(true);
    expect(needsShareLink(owned({ members: [member({ status: 'confirmed', notified: false })] }))).toBe(false);
    expect(needsShareLink(owned({ status: 'cancelled', members: [member({ status: 'pending', notified: false })] }))).toBe(false);
  });
});

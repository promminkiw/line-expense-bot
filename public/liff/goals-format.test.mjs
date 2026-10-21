import { describe, it, expect } from 'vitest';
import { goalPercent, goalRow, goalsSummary, goalLabel, splitGoals, contributionRows, describeGoalError } from './goals-format.mjs';
import { LOGIN_REQUIRED_MESSAGE } from './format.mjs';

const GOAL = { id: 'g-1', name: 'เที่ยวญี่ปุ่น', targetAmount: 50000, targetDate: '2026-12-31', closed: false, saved: 6000, contributionCount: 2 };

describe('goalPercent', () => {
  it.each([
    [6000, 50000, 12],
    [0, 1000, 0],
    [999.99, 1000, 99],
    [1000, 1000, 100],
    [12000, 10000, 120],
    [0.1, 0.3, 33],
  ])('%s of %s is %s percent', (saved, target, expected) => {
    expect(goalPercent(saved, target)).toBe(expected);
  });
});

describe('goalRow', () => {
  it('describes the progress, the bar width and the wished date', () => {
    expect(goalRow(GOAL)).toEqual({
      ...GOAL,
      percent: 12,
      width: 12,
      reached: false,
      text: 'ออมแล้ว 6,000 บาท จาก 50,000 บาท (12%)',
      amountText: '6,000 บาท จาก 50,000 บาท',
      dateText: 'ถึงเป้า 31 ธ.ค. 2569',
    });
  });

  it('caps the bar at 100, marks a reached goal and has no date line without a date', () => {
    const row = goalRow({ ...GOAL, targetAmount: 10000, saved: 12000, targetDate: null });

    expect([row.percent, row.width, row.reached, row.dateText]).toEqual([120, 100, true, '']);
  });

  it('says there is no date for an unfinished goal without one', () => {
    expect(goalRow({ ...GOAL, targetDate: null }).dateText).toBe('ไม่กำหนดวัน');
  });

  it('keeps the date of a reached goal that has one', () => {
    expect(goalRow({ ...GOAL, saved: 50000 }).dateText).toBe('ถึงเป้า 31 ธ.ค. 2569');
  });
});

describe('goalsSummary', () => {
  it('totals only the open goals and rounds the percent down', () => {
    const goals = [GOAL, { ...GOAL, id: 'g-2', targetAmount: 10000, saved: 3000 }, { ...GOAL, id: 'g-3', closed: true, saved: 99999 }];

    expect(goalsSummary(goals)).toEqual({
      count: 2,
      saved: 9000,
      target: 60000,
      remaining: 51000,
      percent: 15,
      width: 15,
      savedValue: '9,000',
      countText: 'ออมแล้วรวม 2 เป้า',
      percentText: '15% ของเป้ารวม 60,000 บาท',
      remainingText: 'เหลืออีก 51,000 บาท',
    });
  });

  it('never shows a negative remainder when the savings pass the total', () => {
    const summary = goalsSummary([{ ...GOAL, targetAmount: 10000, saved: 12000 }]);

    expect([summary.remaining, summary.percent, summary.width, summary.remainingText]).toEqual([0, 120, 100, 'เหลืออีก 0 บาท']);
  });

  it('adds up in satang so decimals do not drift', () => {
    const summary = goalsSummary([
      { ...GOAL, id: 'a', targetAmount: 0.3, saved: 0.1 },
      { ...GOAL, id: 'b', targetAmount: 0.3, saved: 0.2 },
    ]);

    expect([summary.saved, summary.target, summary.remaining, summary.percent]).toEqual([0.3, 0.6, 0.3, 50]);
  });

  it('is null when no goal is open', () => {
    expect(goalsSummary([])).toBeNull();
    expect(goalsSummary([{ ...GOAL, closed: true }])).toBeNull();
  });
});

describe('goalLabel', () => {
  it('reads the name, the amounts and the percent', () => {
    expect(goalLabel(goalRow(GOAL))).toBe('เที่ยวญี่ปุ่น ออมแล้ว 6,000 บาท จาก 50,000 บาท (12%)');
  });
});

describe('splitGoals', () => {
  it('separates open and closed goals keeping their order', () => {
    const { open, closed } = splitGoals([GOAL, { ...GOAL, id: 'g-3', closed: true }, { ...GOAL, id: 'g-2' }]);

    expect(open.map((row) => row.id)).toEqual(['g-1', 'g-2']);
    expect(closed.map((row) => row.id)).toEqual(['g-3']);
  });
});

describe('contributionRows', () => {
  it('shows the date and amount and names both in the delete label', () => {
    expect(contributionRows([{ id: 'gc-1', amount: 1000, occurredOn: '2026-10-14' }])).toEqual([
      { id: 'gc-1', text: '14 ต.ค. 2569 · 1,000 บาท', label: 'ลบรายการออม 1,000 บาท วันที่ 14 ต.ค. 2569' },
    ]);
  });
});

describe('describeGoalError', () => {
  it.each([
    [401, undefined, LOGIN_REQUIRED_MESSAGE],
    [404, 'Not found', 'ไม่พบเป้าหรือรายการนี้แล้ว ลองเปิดหน้าใหม่'],
    [409, 'Duplicate name', 'มีเป้าชื่อนี้อยู่แล้ว'],
    [409, 'Too many goals', 'มีเป้าที่เปิดอยู่ได้ไม่เกิน 20 เป้า ปิดเป้าที่ไม่ใช้ก่อน'],
    [409, 'Goal closed', 'เป้านี้ปิดแล้ว เปิดเป้าอีกครั้งก่อนออมเพิ่ม'],
    [400, 'Invalid name', 'ชื่อเป้าต้องยาว 1-30 ตัวอักษร'],
    [400, 'Invalid amount', 'จำนวนเงินต้องมากกว่า 0 และไม่เกิน 10,000,000 บาท (ทศนิยมไม่เกิน 2 ตำแหน่ง)'],
    [400, 'Invalid date', 'วันที่ไม่ถูกต้อง'],
    [500, 'Internal error', 'บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง'],
    [0, undefined, 'บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง'],
  ])('explains %s %s', (status, error, expected) => {
    expect(describeGoalError(status, error)).toBe(expected);
  });
});

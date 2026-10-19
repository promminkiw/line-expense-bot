import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { parseSavingCommand, hasOpenGoal, findOpenGoal, formatSavingReply, formatGoalNotFoundReply, formatGoalNameMissingReply } = require('./chat.js');

const GOALS = [
  { id: 'g-1', name: 'เที่ยวญี่ปุ่น', targetAmount: 50000, closed: false },
  { id: 'g-2', name: 'Japan Trip', targetAmount: 1000, closed: false },
  { id: 'g-3', name: 'มือถือ', targetAmount: 30000, closed: true },
];

describe('parseSavingCommand', () => {
  it.each([
    ['ออม เที่ยวญี่ปุ่น 1000', { name: 'เที่ยวญี่ปุ่น', amount: 1000 }],
    ['ออมเที่ยวญี่ปุ่น 1,500.50 บาท', { name: 'เที่ยวญี่ปุ่น', amount: 1500.5 }],
    ['  ออม iPhone 15 30000  ', { name: 'iPhone 15', amount: 30000 }],
    ['ออม ทริป 0', { name: 'ทริป', amount: null }],
    ['ออม ทริป 20,000,000', { name: 'ทริป', amount: null }],
    // รูปแบบตรงกับคำสั่งออม บอทจึงต้องดู hasOpenGoal ก่อนจับ ไม่งั้นคนที่ไม่มีเป้าจะจดรายการนี้ไม่ได้
    ['ออมสิน 1000', { name: 'สิน', amount: 1000 }],
    // ไม่มีชื่อเป้า บอทต้องถามชื่อแทนที่จะจดเป็นรายจ่าย
    ['ออม 1000', { name: '', amount: 1000 }],
    ['ออม 1,000 บาท', { name: '', amount: 1000 }],
    ['ออม 0', { name: '', amount: null }],
  ])('reads %s', (text, expected) => {
    expect(parseSavingCommand(text)).toEqual(expected);
  });

  it.each(['กินข้าว 60', 'ออม', 'ออมเงิน', 'ออม ทริป 10.555', 'สรุปเดือนนี้'])('leaves %s to the other paths', (text) => {
    expect(parseSavingCommand(text)).toBeNull();
  });
});

describe('hasOpenGoal', () => {
  it('is true only when at least one goal is open', () => {
    expect(hasOpenGoal(GOALS)).toBe(true);
    expect(hasOpenGoal([GOALS[2]])).toBe(false);
    expect(hasOpenGoal([])).toBe(false);
  });
});

describe('findOpenGoal', () => {
  it('matches the name ignoring letter case and outer spaces', () => {
    expect(findOpenGoal(GOALS, ' japan trip ').id).toBe('g-2');
    expect(findOpenGoal(GOALS, 'เที่ยวญี่ปุ่น').id).toBe('g-1');
  });

  it('skips closed goals and unknown names', () => {
    expect(findOpenGoal(GOALS, 'มือถือ')).toBeNull();
    expect(findOpenGoal(GOALS, 'คอนโด')).toBeNull();
  });
});

describe('formatSavingReply', () => {
  it('shows the amount, the saved total and the percent rounded down', () => {
    expect(formatSavingReply({ name: 'เที่ยวญี่ปุ่น', amount: 1000, saved: 6000.5, target: 50000 })).toBe(
      'ออมเข้าเป้า เที่ยวญี่ปุ่น 1,000 บาทแล้ว\nยอดสะสม 6,000.5 / 50,000 บาท (12%)'
    );
  });

  it('says the goal is reached at 100 percent or more', () => {
    expect(formatSavingReply({ name: 'มือถือ', amount: 500, saved: 30500, target: 30000 })).toBe(
      'ออมเข้าเป้า มือถือ 500 บาทแล้ว\nยอดสะสม 30,500 / 30,000 บาท (101%)\nถึงเป้าแล้ว ปิดเป้าได้ในหน้าเว็บ แท็บ ออม'
    );
  });
});

describe('formatGoalNotFoundReply', () => {
  it('lists only the open goals with an example', () => {
    expect(formatGoalNotFoundReply('คอนโด', GOALS)).toBe(
      'ไม่พบเป้า "คอนโด"\nเป้าที่เปิดอยู่: เที่ยวญี่ปุ่น, Japan Trip\nพิมพ์ เช่น ออม เที่ยวญี่ปุ่น 1000'
    );
  });

  // ผู้ใช้พิมพ์อะไรมาก็ได้ ชื่อยาวเกินชื่อเป้าที่ยาวที่สุดจึงตัดไม่ให้ข้อความตอบยาวเกิน
  it('cuts a typed name longer than 30 characters', () => {
    expect(formatGoalNotFoundReply('ก'.repeat(40), GOALS).split('\n')[0]).toBe(`ไม่พบเป้า "${'ก'.repeat(30)}…"`);
  });
});

describe('formatGoalNameMissingReply', () => {
  it('asks for the goal name and lists the open goals', () => {
    expect(formatGoalNameMissingReply(GOALS)).toBe('ใส่ชื่อเป้าด้วย เช่น ออม เที่ยวญี่ปุ่น 1000\nเป้าที่เปิดอยู่: เที่ยวญี่ปุ่น, Japan Trip');
  });
});


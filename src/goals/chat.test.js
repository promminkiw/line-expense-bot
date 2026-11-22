import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  parseSavingCommand,
  hasOpenGoal,
  findOpenGoal,
  formatSavingReply,
  formatGoalNotFoundReply,
  formatGoalNameMissingReply,
  SAVING_AMOUNT_REPLY,
  savingAmountReply,
  goalGoneReply,
} = require('./chat.js');

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

  it.each([['1,500', 1500], ['1,500.50', 1500.5], ['1,000,000', 1000000]])('reads thousands commas in %s', (amount, expected) => {
    expect(parseSavingCommand(`ออม ทริป ${amount}`)).toEqual({ name: 'ทริป', amount: expected });
    expect(parseSavingCommand(`ออม ${amount}`)).toEqual({ name: '', amount: expected });
  });

  // คอมมาที่ไม่ใช่ตัวคั่นหลักพันต้องไม่ถูกอ่านเป็นยอด ไม่งั้น 60,50 กลายเป็น 6050
  it.each(['60,50', '1,5', '1,,5', ',500', '1,500,', '1,50,000'])('rejects the amount %s without reading it as a number', (amount) => {
    expect(parseSavingCommand(`ออม ทริป ${amount}`)).toEqual({ name: 'ทริป', amount: null });
    expect(parseSavingCommand(`ออม ${amount}`)).toEqual({ name: '', amount: null });
  });

  it.each(['กินข้าว 60', 'ออม', 'ออมเงิน', 'ออม ทริป 10.555', 'สรุปเดือนนี้'])('leaves %s to the other paths', (text) => {
    expect(parseSavingCommand(text)).toBeNull();
  });

  // regex เดิม backtrack แบบ O(n²) ข้อความที่มีช่องว่างยาวใช้เวลาเกือบวินาที
  it('reads long whitespace-heavy text in linear time', () => {
    const text = `ออม a${' '.repeat(20000)}!`;
    const started = performance.now();
    expect(parseSavingCommand(text)).toBeNull();
    expect(performance.now() - started).toBeLessThan(100);
  });

  it.each([
    ['ออม ทริป\n1000', { name: 'ทริป', amount: 1000 }],
    ['ออม\nทริป 1000', { name: 'ทริป', amount: 1000 }],
    ['ออม ทริป 1000บาท', { name: 'ทริป', amount: 1000 }],
    ['ออม ทริป\nยาว 1000', null],
    ['ออม ทริป 1000 บาทบาท', null],
    ['ออม ทริป บาท', null],
  ])('keeps the old line-break and baht handling for %j', (text, expected) => {
    expect(parseSavingCommand(text)).toEqual(expected);
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
      'เฮียจดออมเข้าเป้า เที่ยวญี่ปุ่น 1,000 บาทแล้ว\nยอดสะสม 6,000.5 / 50,000 บาท (12%)'
    );
  });

  it('says the goal is reached at 100 percent or more', () => {
    expect(formatSavingReply({ name: 'มือถือ', amount: 500, saved: 30500, target: 30000 })).toBe(
      'เฮียจดออมเข้าเป้า มือถือ 500 บาทแล้ว\nยอดสะสม 30,500 / 30,000 บาท (101%)\nถึงเป้าแล้ว ปิดเป้าได้ในหน้าเว็บ แท็บ ออม'
    );
  });
});

describe('formatGoalNotFoundReply', () => {
  it('lists only the open goals with an example', () => {
    expect(formatGoalNotFoundReply('คอนโด', GOALS)).toBe(
      'เฮียไม่พบเป้า "คอนโด"\nเป้าที่เปิดอยู่: เที่ยวญี่ปุ่น, Japan Trip\nพิมพ์ เช่น ออม เที่ยวญี่ปุ่น 1000'
    );
  });

  // ผู้ใช้พิมพ์อะไรมาก็ได้ ชื่อยาวเกินชื่อเป้าที่ยาวที่สุดจึงตัดไม่ให้ข้อความตอบยาวเกิน
  it('cuts a typed name longer than 30 characters', () => {
    expect(formatGoalNotFoundReply('ก'.repeat(40), GOALS).split('\n')[0]).toBe(`เฮียไม่พบเป้า "${'ก'.repeat(30)}…"`);
  });
});

describe('formatGoalNameMissingReply', () => {
  it('asks for the goal name and lists the open goals', () => {
    expect(formatGoalNameMissingReply(GOALS)).toBe('ใส่ชื่อเป้าให้เฮียด้วย เช่น ออม เที่ยวญี่ปุ่น 1000\nเป้าที่เปิดอยู่: เที่ยวญี่ปุ่น, Japan Trip');
  });
});

describe('SAVING_AMOUNT_REPLY', () => {
  it('keeps the range and tells how to write the amount', () => {
    expect(SAVING_AMOUNT_REPLY).toBe('จำนวนเงินออมต้องมากกว่า 0 และไม่เกิน 10,000,000 บาท\nเขียนยอดแบบ 1,500 หรือ 60.50');
  });
});

describe('English saving command', () => {
  it.each([
    ['save Japan Trip 1000', { name: 'Japan Trip', amount: 1000 }],
    ['  Save เที่ยวญี่ปุ่น 1,500.50 บาท ', { name: 'เที่ยวญี่ปุ่น', amount: 1500.5 }],
    ['SAVE trip 0', { name: 'trip', amount: null }],
    ['save 1000', { name: '', amount: 1000 }],
    ['save 1,000 บาท', { name: '', amount: 1000 }],
  ])('reads %j', (text, expected) => {
    expect(parseSavingCommand(text)).toEqual(expected);
  });

  // ต้องมีช่องว่างหลัง save ไม่งั้นข้อความอย่าง savings 500 จะกลายเป็นคำสั่งออม
  it.each(['savings 500', 'saved 500', 'save', 'save trip', 'saveTrip 500'])('ignores %j', (text) => {
    expect(parseSavingCommand(text)).toBeNull();
  });

  it('stays fast on long runs of spaces', () => {
    const started = Date.now();
    parseSavingCommand(`save ${' '.repeat(50000)}x`);
    expect(Date.now() - started).toBeLessThan(500);
  });
});

describe('saving replies in English', () => {
  it('formats the saved reply in English', () => {
    expect(formatSavingReply({ name: 'Trip', amount: 500, saved: 1000, target: 1000 }, 'en')).toBe(
      'Saved ฿500 toward Trip.\nSaved so far: ฿1,000 / ฿1,000 (100%)\nGoal reached! You can close it in the Savings tab of the web app.'
    );
  });

  it('lists the open goals with an English example', () => {
    expect(formatGoalNotFoundReply('Condo', GOALS, 'en')).toBe(
      'I can\'t find the goal "Condo".\nOpen goals: เที่ยวญี่ปุ่น, Japan Trip\nType something like: save เที่ยวญี่ปุ่น 1000'
    );
    expect(formatGoalNameMissingReply(GOALS, 'en')).toBe(
      'Tell me the goal name too, like: save เที่ยวญี่ปุ่น 1000\nOpen goals: เที่ยวญี่ปุ่น, Japan Trip'
    );
  });

  it('has English amount and goal-gone replies', () => {
    expect(savingAmountReply('en')).toBe('The saving amount must be more than 0 and no more than ฿10,000,000.\nWrite it like 1,500 or 60.50.');
    expect(goalGoneReply('th')).toBe('เฮียไม่พบเป้านี้แล้ว อาจถูกปิดไปแล้ว ดูเป้าที่เปิดอยู่ในหน้าเว็บ แท็บ ออม');
    expect(goalGoneReply('en')).toBe("I can't find this goal anymore. It may have been closed. Check your open goals in the Savings tab of the web app.");
  });
});

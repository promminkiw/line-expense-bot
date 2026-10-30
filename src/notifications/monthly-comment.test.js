import { describe, it, expect } from 'vitest';
import { pickMonthlyComment, buildEmptyMonthText } from './monthly-comment.js';

function summary({ income, expense, top = [] }) {
  return { incomeTotal: income, expenseTotal: expense, net: Math.round((income - expense) * 100) / 100, topExpenses: top, otherExpenseTotal: 0 };
}

describe('pickMonthlyComment', () => {
  it('asks for income when the month has none', () => {
    expect(pickMonthlyComment(summary({ income: 0, expense: 500, top: [{ category: 'อาหาร', total: 500 }] }), 'ตุลาคม')).toBe(
      'เดือนตุลาคมยังไม่มีรายรับเลย ถ้ามีเงินเข้าอย่าลืมจดด้วยนะ ยอดคงเหลือจะได้ตรง',
    );
  });

  it('names the biggest category when spending beat income', () => {
    const value = summary({ income: 10000, expense: 12000, top: [{ category: 'ช้อปปิ้ง', total: 6000 }, { category: 'อาหาร', total: 6000 }] });

    expect(pickMonthlyComment(value, 'ตุลาคม')).toBe('เดือนตุลาคมจ่ายเกินรับไป 2,000 บาท ตัวหนักสุดคือช้อปปิ้ง (50%) เดือนหน้าลองคุมหมวดนี้ดูนะ');
  });

  it('praises a month with no spending', () => {
    expect(pickMonthlyComment(summary({ income: 25000, expense: 0 }), 'ตุลาคม')).toBe('เดือนตุลาคมไม่มีรายจ่ายเลย เก็บได้เต็มๆ 25,000 บาท');
  });

  it('suggests a budget when one category takes 40% or more', () => {
    const value = summary({ income: 25000, expense: 10000, top: [{ category: 'อาหาร', total: 4000 }] });

    expect(pickMonthlyComment(value, 'ตุลาคม')).toBe('เก็บได้ 15,000 บาท แต่อาหารกินไป 40% ของรายจ่ายทั้งเดือน ลองตั้งงบหมวดนี้ดูไหม');
  });

  it('praises saving 20% or more of income', () => {
    const value = summary({ income: 25000, expense: 18460, top: [{ category: 'อาหาร', total: 6200 }] });

    expect(pickMonthlyComment(value, 'ตุลาคม')).toBe('เก็บได้ 6,540 บาท (26% ของรายรับ) เยี่ยมเลย ทำแบบนี้ต่อไปนะ');
  });

  it('nudges toward 20% otherwise, rounding the rate down', () => {
    const value = summary({ income: 25000, expense: 20100, top: [{ category: 'อาหาร', total: 6200 }] });

    expect(pickMonthlyComment(value, 'ตุลาคม')).toBe('เก็บได้ 4,900 บาท (19% ของรายรับ) เดือนหน้าลองเก็บให้ถึง 20% ดูนะ');
  });

  // 0.57 * 100 ใน JavaScript ได้ 56.99... ถ้าหารก่อนคูณจะปัดลงเหลือ 56
  it('does not lose a percent to floating point', () => {
    const value = summary({ income: 100, expense: 43, top: [{ category: 'อาหาร', total: 15 }, { category: 'เดินทาง', total: 14 }, { category: 'ช้อปปิ้ง', total: 14 }] });

    expect(pickMonthlyComment(value, 'ตุลาคม')).toBe('เก็บได้ 57 บาท (57% ของรายรับ) เยี่ยมเลย ทำแบบนี้ต่อไปนะ');
  });

  it('floors exactly 20% correctly with satang amounts', () => {
    const value = summary({ income: 1280.15, expense: 1024.12, top: [{ category: 'อาหาร', total: 400 }, { category: 'เดินทาง', total: 350 }, { category: 'ช้อปปิ้ง', total: 274.12 }] });

    expect(pickMonthlyComment(value, 'ตุลาคม')).toBe('เก็บได้ 256.03 บาท (20% ของรายรับ) เยี่ยมเลย ทำแบบนี้ต่อไปนะ');
  });

  it('keeps 57% for decimal amounts', () => {
    const value = summary({ income: 1, expense: 0.43, top: [{ category: 'อาหาร', total: 0.15 }, { category: 'เดินทาง', total: 0.14 }, { category: 'ช้อปปิ้ง', total: 0.14 }] });

    expect(pickMonthlyComment(value, 'ตุลาคม')).toBe('เก็บได้ 0.57 บาท (57% ของรายรับ) เยี่ยมเลย ทำแบบนี้ต่อไปนะ');
  });

  it('nudges when income and expense cancel out exactly', () => {
    const value = summary({ income: 500, expense: 500, top: [{ category: 'อาหาร', total: 150 }, { category: 'เดินทาง', total: 150 }, { category: 'ช้อปปิ้ง', total: 200 - 100 }] });

    expect(pickMonthlyComment(value, 'ตุลาคม')).toBe('เก็บได้ 0 บาท (0% ของรายรับ) เดือนหน้าลองเก็บให้ถึง 20% ดูนะ');
  });
});

describe('buildEmptyMonthText', () => {
  it('invites the user back for the new month', () => {
    expect(buildEmptyMonthText({ monthName: 'ตุลาคม', nextMonthName: 'พฤศจิกายน' })).toBe(
      'เดือนตุลาคมยังไม่ได้จดรายการเลยนะ เดือนพฤศจิกายนเริ่มใหม่กัน พิมพ์ เช่น "กาแฟ 60" ส่งมาได้เลย',
    );
  });
});

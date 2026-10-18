import { describe, it, expect } from 'vitest';
import { describeCategoryError, describeCategoryUsage } from './categories-format.mjs';
import { LOGIN_REQUIRED_MESSAGE } from './format.mjs';
import { MAX_VISIBLE_CATEGORIES, MAX_CATEGORY_NAME_LENGTH } from '../../src/parser/categories.js';

describe('describeCategoryError', () => {
  it.each([
    [401, undefined, LOGIN_REQUIRED_MESSAGE],
    [409, 'Duplicate name', 'มีหมวดชื่อนี้อยู่แล้ว'],
    [409, 'Too many categories', 'มีหมวดที่ใช้อยู่ได้ไม่เกิน 30 หมวดต่อประเภท ซ่อนหมวดที่ไม่ใช้ก่อน'],
    [400, 'Invalid name', 'ชื่อหมวดต้องยาว 1-30 ตัวอักษร และห้ามมีเครื่องหมายจุลภาค (,)'],
    [400, 'Reserved name', 'ชื่อนี้ใช้กับหมวดของระบบแล้ว ลองชื่ออื่น'],
    [400, 'System category', 'หมวดของระบบแก้ไม่ได้'],
    [400, 'Invalid icon', 'เลือกไอคอนจากรายการที่มีให้'],
    [404, 'Not found', 'ไม่พบหมวดนี้แล้ว ลองเปิดหน้าใหม่'],
    [500, undefined, 'บันทึกหมวดไม่สำเร็จ ลองใหม่อีกครั้ง'],
    [0, undefined, 'บันทึกหมวดไม่สำเร็จ ลองใหม่อีกครั้ง'],
  ])('status %s %s -> %s', (status, error, message) => {
    expect(describeCategoryError(status, error)).toBe(message);
  });
});

// ข้อความในหน้าเว็บเขียนเลขไว้ตรงๆ ถ้าเปลี่ยนเพดานฝั่ง server ต้องแก้ข้อความตามด้วย
describe('category limits in the messages', () => {
  it('match the limits the server enforces', () => {
    expect(describeCategoryError(409, 'Too many categories')).toContain(`ไม่เกิน ${MAX_VISIBLE_CATEGORIES} หมวด`);
    expect(describeCategoryError(400, 'Invalid name')).toContain(`1-${MAX_CATEGORY_NAME_LENGTH} ตัวอักษร`);
  });
});

describe('describeCategoryUsage', () => {
  const cat = { name: 'ค่าแมว', type: 'expense' };

  it('lists only what will move and warns that the budget goes away for an expense category', () => {
    expect(describeCategoryUsage(cat, { transactions: 3, recurring: 1, bills: 0 })).toBe(
      'ลบหมวด ค่าแมว? รายการ 3 รายการ และรายการประจำ 1 รายการ จะย้ายไปหมวด อื่นๆ และงบของหมวดนี้จะหายไป'
    );
    expect(describeCategoryUsage(cat, { transactions: 2, recurring: 1, bills: 4 })).toBe(
      'ลบหมวด ค่าแมว? รายการ 2 รายการ, รายการประจำ 1 รายการ และบิล 4 ใบ จะย้ายไปหมวด อื่นๆ และงบของหมวดนี้จะหายไป'
    );
  });

  it('says so when the category holds nothing, and leaves the budget note off income', () => {
    expect(describeCategoryUsage(cat, { transactions: 0, recurring: 0, bills: 0 })).toBe('ลบหมวด ค่าแมว? หมวดนี้ยังไม่มีรายการ และงบของหมวดนี้จะหายไป');
    expect(describeCategoryUsage({ name: 'โบนัส', type: 'income' }, { transactions: 1, recurring: 0, bills: 0 })).toBe(
      'ลบหมวด โบนัส? รายการ 1 รายการ จะย้ายไปหมวด อื่นๆ'
    );
  });
});

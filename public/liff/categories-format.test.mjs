import { describe, it, expect } from 'vitest';
import { describeCategoryError } from './categories-format.mjs';
import { LOGIN_REQUIRED_MESSAGE } from './format.mjs';

describe('describeCategoryError', () => {
  it.each([
    [401, undefined, LOGIN_REQUIRED_MESSAGE],
    [409, 'Duplicate name', 'มีหมวดชื่อนี้อยู่แล้ว'],
    [409, 'Too many categories', 'มีหมวดที่ใช้อยู่ได้ไม่เกิน 30 หมวดต่อประเภท ซ่อนหมวดที่ไม่ใช้ก่อน'],
    [400, 'Invalid name', 'ชื่อหมวดต้องยาว 1-30 ตัวอักษร และห้ามมีเครื่องหมายจุลภาค (,)'],
    [400, 'Reserved name', 'ชื่อนี้ใช้กับหมวดของระบบแล้ว ลองชื่ออื่น'],
    [400, 'System category', 'หมวดของระบบแก้ไม่ได้'],
    [404, 'Not found', 'ไม่พบหมวดนี้แล้ว ลองเปิดหน้าใหม่'],
    [500, undefined, 'บันทึกหมวดไม่สำเร็จ ลองใหม่อีกครั้ง'],
    [0, undefined, 'บันทึกหมวดไม่สำเร็จ ลองใหม่อีกครั้ง'],
  ])('status %s %s -> %s', (status, error, message) => {
    expect(describeCategoryError(status, error)).toBe(message);
  });
});

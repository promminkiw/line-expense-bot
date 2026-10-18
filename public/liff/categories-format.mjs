import { LOGIN_REQUIRED_MESSAGE } from './format.mjs';

const MESSAGES = new Map([
  ['409:Duplicate name', 'มีหมวดชื่อนี้อยู่แล้ว'],
  ['409:Too many categories', 'มีหมวดที่ใช้อยู่ได้ไม่เกิน 30 หมวดต่อประเภท ซ่อนหมวดที่ไม่ใช้ก่อน'],
  ['400:Invalid name', 'ชื่อหมวดต้องยาว 1-30 ตัวอักษร และห้ามมีเครื่องหมายจุลภาค (,)'],
  ['400:Reserved name', 'ชื่อนี้ใช้กับหมวดของระบบแล้ว ลองชื่ออื่น'],
  ['400:System category', 'หมวดของระบบแก้ไม่ได้'],
  ['400:Invalid icon', 'เลือกไอคอนจากรายการที่มีให้'],
]);

export function describeCategoryError(status, error) {
  if (status === 401) return LOGIN_REQUIRED_MESSAGE;
  if (status === 404) return 'ไม่พบหมวดนี้แล้ว ลองเปิดหน้าใหม่';
  return MESSAGES.get(`${status}:${error}`) ?? 'บันทึกหมวดไม่สำเร็จ ลองใหม่อีกครั้ง';
}

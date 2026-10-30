import { currentMonth } from './format.mjs';

// จำเดือนปัจจุบันตอนเปิดหน้า แล้วบอกเดือนใหม่ครั้งเดียวเมื่อข้ามเดือน ถ้ายังสลับไม่ได้จะลองใหม่ตอน check ครั้งถัดไป
export function createMonthRollover({ now = () => new Date(), canSwitch, onRollover }) {
  let known = currentMonth(now());
  return {
    check() {
      const month = currentMonth(now());
      if (month === known || !canSwitch()) return false;
      known = month;
      onRollover(month);
      return true;
    },
  };
}

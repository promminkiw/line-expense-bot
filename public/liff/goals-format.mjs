import { formatBaht, formatFullThaiDate, LOGIN_REQUIRED_MESSAGE } from './format.mjs';

// คิดเป็นสตางค์และปัดลง ให้ตรงกับเปอร์เซ็นต์ที่บอทตอบในแชต
export function goalPercent(saved, target) {
  return Math.floor((Math.round(saved * 100) * 100) / Math.round(target * 100));
}

export function goalRow(goal) {
  const percent = goalPercent(goal.saved, goal.targetAmount);
  return {
    ...goal,
    percent,
    width: Math.min(percent, 100),
    reached: percent >= 100,
    text: `ออมแล้ว ${formatBaht(goal.saved)} จาก ${formatBaht(goal.targetAmount)} (${percent}%)`,
    dateText: goal.targetDate ? `อยากถึงเป้า ${formatFullThaiDate(goal.targetDate)}` : '',
  };
}

export function splitGoals(goals) {
  const rows = goals.map(goalRow);
  return { open: rows.filter((row) => !row.closed), closed: rows.filter((row) => row.closed) };
}

export function contributionRows(contributions) {
  return contributions.map((item) => {
    const date = formatFullThaiDate(item.occurredOn);
    const amount = formatBaht(item.amount);
    return { id: item.id, text: `${date} · ${amount}`, label: `ลบรายการออม ${amount} วันที่ ${date}` };
  });
}

const MESSAGES = new Map([
  ['409:Duplicate name', 'มีเป้าชื่อนี้อยู่แล้ว'],
  ['409:Too many goals', 'มีเป้าที่เปิดอยู่ได้ไม่เกิน 20 เป้า ปิดเป้าที่ไม่ใช้ก่อน'],
  ['409:Goal closed', 'เป้านี้ปิดแล้ว เปิดเป้าอีกครั้งก่อนออมเพิ่ม'],
  ['400:Invalid name', 'ชื่อเป้าต้องยาว 1-30 ตัวอักษร'],
  ['400:Invalid amount', 'จำนวนเงินต้องมากกว่า 0 และไม่เกิน 10,000,000 บาท (ทศนิยมไม่เกิน 2 ตำแหน่ง)'],
  ['400:Invalid date', 'วันที่ไม่ถูกต้อง'],
]);

export function describeGoalError(status, error) {
  if (status === 401) return LOGIN_REQUIRED_MESSAGE;
  if (status === 404) return 'ไม่พบเป้าหรือรายการนี้แล้ว ลองเปิดหน้าใหม่';
  return MESSAGES.get(`${status}:${error}`) ?? 'บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง';
}

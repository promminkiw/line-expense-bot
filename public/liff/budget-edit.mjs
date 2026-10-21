import { describeDiff, levelOfPercent } from './budgets-format.mjs';

export const MIN_BUDGET = 0.01;
export const MAX_BUDGET = 10000000;
export const BUDGET_STEP = 500;

const toSatang = (value) => Math.round(value * 100);

export function parseBudgetAmount(text) {
  const cleaned = String(text).replace(/[,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return value >= MIN_BUDGET && value <= MAX_BUDGET ? value : null;
}

export function stepBudget(current, direction, step = BUDGET_STEP) {
  const base = current ?? 0;
  if (direction > 0) return Math.min((toSatang(base) + toSatang(step)) / 100, MAX_BUDGET);
  const next = (toSatang(base) - toSatang(step)) / 100;
  // ลดแล้วต่ำกว่างบต่ำสุดให้คงค่าเดิม ไม่ให้ช่องกลายเป็น 0 หรือติดลบ
  return next >= MIN_BUDGET ? next : current;
}

function snapshot(budget, spent) {
  if (budget === null) return null;
  const percent = Math.floor((toSatang(spent) * 100) / toSatang(budget));
  return { percent, level: levelOfPercent(percent), diffText: describeDiff({ budget, spent }) };
}

export function previewBudget(row, amount) {
  return { before: snapshot(row.budget, row.spent), after: amount === null ? null : snapshot(amount, row.spent) };
}

const roundUp = (value, unit) => Math.ceil(value / unit) * unit;
// คิดเป็นสตางค์ก่อน กัน 3000*1.1 ได้ 3300.0000000000005 แล้วปัดขึ้นเกิน
const withPercent = (value, percent) => Math.round(value * (100 + percent)) / 100;

export function quickChips(row) {
  const candidates = row.budget === null
    ? [
      ['เท่าที่ใช้จริง', Math.ceil(row.spent)],
      ['ปัดขึ้น', roundUp(row.spent, 100)],
      ['ปัดขึ้น', roundUp(row.spent, 1000)],
    ]
    : [
      ['เท่าที่ใช้จริง', Math.ceil(row.spent)],
      ['เพิ่ม 10%', roundUp(withPercent(row.budget, 10), 50)],
      ['เพิ่ม 20%', roundUp(withPercent(row.budget, 20), 50)],
    ];
  const seen = new Set();
  return candidates
    .filter(([, value]) => value >= MIN_BUDGET && value <= MAX_BUDGET && value !== row.budget)
    .filter(([, value]) => !seen.has(value) && seen.add(value))
    .map(([label, value]) => ({ label, value }));
}

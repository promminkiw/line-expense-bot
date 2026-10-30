import { formatNumber, groupBudgetRows, levelOfPercent } from './budgets-format.mjs';
import { stepBudget } from './budget-edit.mjs';

const toSatang = (value) => Math.round(value * 100);
const percentOf = (budget, spent) => Math.floor((toSatang(spent) * 100) / toSatang(budget));

export function createDraft(budgets, { first = 'risk' } = {}) {
  const groups = groupBudgetRows(budgets);
  const ordered = first === 'unset'
    ? [...groups.unset, ...groups.risk, ...groups.calm]
    : [...groups.risk, ...groups.calm, ...groups.unset];
  return ordered.map((row) => ({ categoryId: row.categoryId, category: row.category, spent: row.spent, original: row.budget, next: row.budget }));
}

export function isDirty(entry) {
  return entry.next !== entry.original;
}

export function stepDraft(draft, categoryId, direction) {
  return draft.map((entry) => (entry.categoryId === categoryId ? { ...entry, next: stepBudget(entry.next, direction) } : entry));
}

export function entryView(entry) {
  const oldPercent = entry.original === null ? null : percentOf(entry.original, entry.spent);
  const newPercent = entry.next === null ? null : percentOf(entry.next, entry.spent);
  const dirty = isDirty(entry);
  let wasText = '';
  if (dirty) wasText = entry.original === null ? 'ใหม่' : `เดิม ${formatNumber(entry.original)}`;
  return {
    dirty,
    oldPercent,
    newPercent,
    oldLevel: oldPercent === null ? null : levelOfPercent(oldPercent),
    newLevel: newPercent === null ? null : levelOfPercent(newPercent),
    valueText: entry.next === null ? 'ไม่ตั้งงบ' : formatNumber(entry.next),
    wasText,
  };
}

export function draftSummary(draft) {
  const sum = (key) => draft.reduce((total, entry) => total + (entry[key] === null ? 0 : toSatang(entry[key])), 0);
  const originalTotal = sum('original');
  const nextTotal = sum('next');
  return { dirtyCount: draft.filter(isDirty).length, delta: (nextTotal - originalTotal) / 100, newTotal: nextTotal / 100 };
}

// บันทึกทีละหมวดแบบเรียงลำดับ เพื่อให้หมวดที่พลาดระบุได้ชัดและไม่ชนกัน
export async function saveDraft(draft, { month, setBudget, only = null }) {
  const results = [];
  for (const entry of draft) {
    if (!isDirty(entry) || (only && !only.includes(entry.categoryId))) continue;
    const base = { categoryId: entry.categoryId, category: entry.category, from: entry.original, to: entry.next };
    try {
      await setBudget(entry.categoryId, { month, amount: entry.next });
      results.push({ ...base, ok: true });
    } catch (err) {
      results.push({ ...base, ok: false, status: err?.status });
    }
  }
  return results;
}

export function applyResults(draft, results) {
  const saved = new Set(results.filter((result) => result.ok).map((result) => result.categoryId));
  return draft.map((entry) => (saved.has(entry.categoryId) ? { ...entry, original: entry.next } : entry));
}

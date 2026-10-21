import { budgetRows } from './format.mjs';

// คิดเป็นสตางค์ทั้งหมด กันเศษทศนิยมลอยตอนบวกลบ
const toSatang = (value) => Math.round(value * 100);
const round1 = (value) => Math.round(value * 10) / 10;

export function formatNumber(value) {
  return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

export function levelOfPercent(percent) {
  if (percent >= 100) return 'over';
  return percent >= 80 ? 'warn' : 'ok';
}

// ใช้มากสุดก่อน เท่ากันดูยอดใช้
const byUsage = (a, b) => b.percent - a.percent || b.spent - a.spent;

export function groupBudgetRows(budgets) {
  const rows = budgetRows(budgets);
  const budgeted = rows.filter((row) => row.budget !== null);
  return {
    risk: budgeted.filter((row) => row.level !== 'ok').sort(byUsage),
    calm: budgeted.filter((row) => row.level === 'ok').sort(byUsage),
    unset: rows.filter((row) => row.budget === null).sort((a, b) => b.spent - a.spent),
  };
}

export function summarizeBudgets(budgets) {
  const budgeted = budgetRows(budgets).filter((row) => row.budget !== null);
  const counts = { over: 0, warn: 0, ok: 0 };
  for (const row of budgeted) counts[row.level] += 1;
  if (budgeted.length === 0) {
    return { hasBudgets: false, totalBudget: 0, totalSpent: 0, left: 0, percent: 0, level: 'ok', counts };
  }
  const budgetSatang = budgeted.reduce((sum, row) => sum + toSatang(row.budget), 0);
  const spentSatang = budgeted.reduce((sum, row) => sum + toSatang(row.spent), 0);
  const percent = Math.floor((spentSatang * 100) / budgetSatang);
  return {
    hasBudgets: true,
    totalBudget: budgetSatang / 100,
    totalSpent: spentSatang / 100,
    left: (budgetSatang - spentSatang) / 100,
    percent,
    level: levelOfPercent(percent),
    counts,
  };
}

export function describeHero(summary) {
  const restText = summary.left >= 0 ? `เหลือ ${formatNumber(summary.left)} บาท` : `เกินงบรวม ${formatNumber(-summary.left)} บาท`;
  return { percentText: `${summary.percent}%`, restText, level: summary.level };
}

export function describeDiff(row) {
  const diff = (toSatang(row.budget) - toSatang(row.spent)) / 100;
  if (diff < 0) return `เกิน ${formatNumber(-diff)}`;
  return diff === 0 ? 'เต็มพอดี' : `เหลือ ${formatNumber(diff)}`;
}

// ส่วนสีแดงเหนือเส้น 100% ตัดที่ 30% ไม่ให้ตัวเลขบนแท่งหลุดกรอบ
export function barGeometry(row, { h100, overCapPercent = 30 }) {
  const fillH = (Math.min(row.percent, 100) * h100) / 100;
  const overH = (Math.min(Math.max(row.percent - 100, 0), overCapPercent) * h100) / 100;
  return {
    fillH: round1(fillH),
    overH: round1(overH),
    barH: round1(h100 + overH),
    labelBottom: round1(h100 + overH + 4),
  };
}

export function pageBudgetRows(rows, page, pageSize = 6) {
  const pageCount = Math.max(Math.ceil(rows.length / pageSize), 1);
  const safePage = Math.min(Math.max(page, 0), pageCount - 1);
  return { items: rows.slice(safePage * pageSize, (safePage + 1) * pageSize), page: safePage, pageCount };
}

export function filterBudgetRows(rows, query) {
  const needle = query.trim().toLowerCase();
  if (!needle) return rows;
  return rows.filter((row) => row.category.toLowerCase().includes(needle));
}

export function sortBudgetRows(rows, mode) {
  const copy = [...rows];
  if (mode === 'name') return copy.sort((a, b) => a.category.localeCompare(b.category, 'th'));
  // หมวดที่ไม่ตั้งงบไม่มีเปอร์เซ็นต์ จึงไปท้ายสุด
  return copy.sort((a, b) => (b.percent ?? -1) - (a.percent ?? -1) || b.spent - a.spent);
}

export function sectionsForTab(tab, rows) {
  let sections;
  if (tab === 'risk') {
    sections = [
      { title: 'เต็มหรือเกินงบ', rows: rows.filter((row) => row.level === 'over') },
      { title: 'ใกล้เต็ม', rows: rows.filter((row) => row.level === 'warn') },
    ];
  } else if (tab === 'calm') {
    sections = [
      { title: 'ใช้ 50-79% ของงบ', rows: rows.filter((row) => row.percent >= 50) },
      { title: 'ใช้ต่ำกว่า 50%', rows: rows.filter((row) => row.percent < 50) },
    ];
  } else {
    sections = [{ title: null, rows }];
  }
  return sections.filter((section) => section.rows.length > 0);
}

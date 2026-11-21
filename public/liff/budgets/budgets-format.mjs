import { budgetRows, formatBaht } from '../format.mjs';
import { t } from '../i18n/translate.mjs';
import { getLang } from '../i18n/current.mjs';
import { categoryDisplayName } from '../categories/categories-format.mjs';

// คิดเป็นสตางค์ทั้งหมด กันเศษทศนิยมลอยตอนบวกลบ
const toSatang = (value) => Math.round(value * 100);
const round1 = (value) => Math.round(value * 10) / 10;

export function formatNumber(value) {
  return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

// งบมีเฉพาะหมวดรายจ่าย row.category เป็นชื่อใน DB จึงแปลเฉพาะตอนแสดง
export function budgetCategoryName(category, lang = getLang()) {
  return categoryDisplayName(lang, { type: 'expense', name: category });
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

export function describeHero(summary, lang = getLang()) {
  const restText = summary.left >= 0
    ? t(lang, 'web.budgets.hero.left', { amount: formatBaht(summary.left, lang) })
    : t(lang, 'web.budgets.hero.over', { amount: formatBaht(-summary.left, lang) });
  return { percentText: `${summary.percent}%`, restText, level: summary.level };
}

export function describeDiff(row, lang = getLang()) {
  const diff = (toSatang(row.budget) - toSatang(row.spent)) / 100;
  if (diff < 0) return t(lang, 'web.budgets.diff.over', { amount: formatNumber(-diff) });
  return diff === 0 ? t(lang, 'web.budgets.diff.full') : t(lang, 'web.budgets.diff.left', { amount: formatNumber(diff) });
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

// ค้นได้ทั้งชื่อที่แสดงและชื่อใน DB ผู้ใช้อังกฤษพิมพ์ food หรือ อาหาร ก็เจอ
export function filterBudgetRows(rows, query, lang = getLang()) {
  const needle = query.trim().toLowerCase();
  if (!needle) return rows;
  return rows.filter((row) => `${row.category} ${budgetCategoryName(row.category, lang)}`.toLowerCase().includes(needle));
}

// เรียงตามชื่อที่ผู้ใช้เห็นในภาษานั้น ไม่ใช่ชื่อไทยใน DB
export function sortBudgetRows(rows, mode, lang = getLang()) {
  const copy = [...rows];
  const shown = (row) => budgetCategoryName(row.category, lang);
  if (mode === 'name') return copy.sort((a, b) => shown(a).localeCompare(shown(b), lang));
  // หมวดที่ไม่ตั้งงบไม่มีเปอร์เซ็นต์ จึงไปท้ายสุด
  return copy.sort((a, b) => (b.percent ?? -1) - (a.percent ?? -1) || b.spent - a.spent);
}

export function sectionsForTab(tab, rows, lang = getLang()) {
  let sections;
  if (tab === 'risk') {
    sections = [
      { title: t(lang, 'web.budgets.section.over'), rows: rows.filter((row) => row.level === 'over') },
      { title: t(lang, 'web.budgets.section.warn'), rows: rows.filter((row) => row.level === 'warn') },
    ];
  } else if (tab === 'calm') {
    sections = [
      { title: t(lang, 'web.budgets.section.calmHigh'), rows: rows.filter((row) => row.percent >= 50) },
      { title: t(lang, 'web.budgets.section.calmLow'), rows: rows.filter((row) => row.percent < 50) },
    ];
  } else {
    sections = [{ title: null, rows }];
  }
  return sections.filter((section) => section.rows.length > 0);
}

import { createSvgIcon } from './icons.mjs';
import { setSuccessStatus } from './success-mark.mjs';
import { describeDiff, filterBudgetRows, formatNumber, groupBudgetRows, sectionsForTab, sortBudgetRows } from './budgets-format.mjs';

const TABS = [
  { id: 'risk', label: 'ต้องดูแล' },
  { id: 'calm', label: 'ปกติ' },
  { id: 'unset', label: 'ไม่มีงบ' },
];
const MARKS = { over: 'icon-close', warn: 'icon-alert', ok: 'icon-check' };

function node(doc, tag, className, text) {
  const el = doc.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

export function createBudgetsAllPanel({ doc, els, badgeFor, onEdit, getMonthLabel, onBulk }) {
  let groups = { risk: [], calm: [], unset: [] };
  let focusId = null;
  const state = { tab: 'risk', query: '', sort: 'usage' };

  function renderRow(row, tab) {
    const item = node(doc, tab === 'unset' ? 'div' : 'button', 'budget-all-row');
    if (tab !== 'unset') item.type = 'button';
    item.dataset.categoryId = row.categoryId;
    const icon = node(doc, 'span', 'budget-all-icon');
    icon.append(badgeFor(row.category, 'expense'));
    if (tab !== 'unset') {
      const dot = node(doc, 'span', `budget-all-dot level-${row.level}`);
      dot.append(createSvgIcon(doc, MARKS[row.level]));
      icon.append(dot);
    }
    const text = node(doc, 'span', 'budget-all-text');
    text.append(node(doc, 'span', 'budget-all-name', row.category));
    text.append(node(doc, 'span', 'budget-all-sub', tab === 'unset'
      ? `ใช้ไปเดือนนี้ ${formatNumber(row.spent)} บาท`
      : `ใช้ ${formatNumber(row.spent)} จาก ${formatNumber(row.budget)}`));
    item.append(icon, text);
    if (tab === 'unset') {
      const set = node(doc, 'button', 'budget-all-set', 'ตั้งงบ');
      set.type = 'button';
      set.setAttribute('aria-label', `ตั้งงบ ${row.category}`);
      set.addEventListener('click', () => onEdit(row));
      item.append(set);
    } else {
      const figure = node(doc, 'span', `budget-all-figure level-${row.level}`);
      figure.append(node(doc, 'span', 'budget-all-pct', `${row.percent}%`), node(doc, 'span', 'budget-all-diff', describeDiff(row)));
      item.append(figure, createSvgIcon(doc, 'icon-chevron'));
      item.setAttribute('aria-label', `${row.category} ใช้ไป ${row.percent}% ของงบ ${describeDiff(row)}`);
      item.addEventListener('click', () => onEdit(row));
    }
    if (focusId === row.categoryId) (item.matches('button') ? item : item.querySelector('button')).focus();
    return item;
  }

  function draw() {
    const filtered = {};
    for (const tab of TABS) filtered[tab.id] = sortBudgetRows(filterBudgetRows(groups[tab.id], state.query), state.sort);
    for (const button of els.tabs.querySelectorAll('button[data-tab]')) {
      const tab = TABS.find((entry) => entry.id === button.dataset.tab);
      button.textContent = `${tab.label} ${filtered[tab.id].length}`;
      button.setAttribute('aria-pressed', String(button.dataset.tab === state.tab));
    }
    const total = TABS.reduce((sum, tab) => sum + filtered[tab.id].length, 0);
    const shownRows = filtered[state.tab];
    const trimmed = state.query.trim();
    els.clear.hidden = state.query === '';
    const notFound = total === 0 && trimmed !== '';
    els.empty.hidden = !notFound;
    els.emptyTitle.textContent = `ไม่พบหมวด "${trimmed}"`;
    els.list.hidden = notFound;
    els.tabEmpty.hidden = notFound || shownRows.length > 0;
    const hasAnyRows = TABS.some((tab) => groups[tab.id].length > 0);
    els.bulk.hidden = !hasAnyRows || notFound;
    els.bulk.textContent = state.tab === 'unset' ? 'ตั้งงบหลายหมวดพร้อมกัน' : 'แก้งบหลายหมวดพร้อมกัน';
    els.count.textContent = `${getMonthLabel()} · แสดง ${shownRows.length} จาก ${groups[state.tab].length} หมวด`;
    els.list.replaceChildren();
    if (notFound) return;
    for (const section of sectionsForTab(state.tab, shownRows)) {
      if (section.title) {
        const level = section.rows[0].level === 'over' ? 'over' : section.rows[0].level === 'warn' ? 'warn' : 'ok';
        els.list.append(node(doc, 'div', `budget-all-head level-${level}`, `${section.title} ${section.rows.length} หมวด`));
      }
      for (const row of section.rows) els.list.append(renderRow(row, state.tab));
    }
  }

  function setBudgets(budgets, { focusCategoryId = null } = {}) {
    groups = groupBudgetRows(budgets);
    focusId = focusCategoryId;
    draw();
    focusId = null;
  }

  function show({ tab = 'risk' } = {}) {
    state.tab = tab;
    state.query = '';
    els.search.value = '';
    els.status.textContent = '';
    draw();
  }

  els.tabs.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-tab]');
    if (!button) return;
    state.tab = button.dataset.tab;
    draw();
  });
  els.search.addEventListener('input', () => {
    state.query = els.search.value;
    draw();
  });
  const clear = () => {
    state.query = '';
    els.search.value = '';
    draw();
  };
  els.clear.addEventListener('click', clear);
  els.emptyClear.addEventListener('click', clear);
  els.sort.addEventListener('change', () => {
    state.sort = els.sort.value;
    draw();
  });

  els.bulk.addEventListener('click', () => onBulk({ first: state.tab === 'unset' ? 'unset' : 'risk' }));

  return {
    setBudgets,
    show,
    setStatus: (text) => { els.status.textContent = text; },
    setSuccess: (text) => setSuccessStatus(els.status, text),
  };
}

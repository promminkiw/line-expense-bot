import { createSvgIcon } from '../ui/icons.mjs';
import { setSuccessStatus } from '../ui/success-mark.mjs';
import { budgetCategoryName, describeDiff, filterBudgetRows, formatNumber, groupBudgetRows, sectionsForTab, sortBudgetRows } from './budgets-format.mjs';
import { formatBaht } from '../format.mjs';
import { t } from '../i18n/translate.mjs';
import { getLang } from '../i18n/current.mjs';

const TABS = ['risk', 'calm', 'unset'];
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

  function renderRow(row, tab, lang) {
    const name = budgetCategoryName(row.category, lang);
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
    text.append(node(doc, 'span', 'budget-all-name', name));
    text.append(node(doc, 'span', 'budget-all-sub', tab === 'unset'
      ? t(lang, 'web.budgets.spentThisMonth', { amount: formatBaht(row.spent, lang) })
      : t(lang, 'web.budgets.all.usage', { spent: formatNumber(row.spent), budget: formatNumber(row.budget) })));
    item.append(icon, text);
    if (tab === 'unset') {
      const set = node(doc, 'button', 'budget-all-set', t(lang, 'web.budgets.set'));
      set.type = 'button';
      set.setAttribute('aria-label', t(lang, 'web.budgets.setFor', { name }));
      set.addEventListener('click', () => onEdit(row));
      item.append(set);
    } else {
      const diff = describeDiff(row, lang);
      const figure = node(doc, 'span', `budget-all-figure level-${row.level}`);
      figure.append(node(doc, 'span', 'budget-all-pct', `${row.percent}%`), node(doc, 'span', 'budget-all-diff', diff));
      item.append(figure, createSvgIcon(doc, 'icon-chevron'));
      item.setAttribute('aria-label', t(lang, 'web.budgets.all.rowLabel', { name, percent: row.percent, diff }));
      item.addEventListener('click', () => onEdit(row));
    }
    if (focusId === row.categoryId) (item.matches('button') ? item : item.querySelector('button')).focus();
    return item;
  }

  function draw() {
    const lang = getLang();
    const filtered = {};
    for (const tab of TABS) filtered[tab] = sortBudgetRows(filterBudgetRows(groups[tab], state.query, lang), state.sort, lang);
    for (const button of els.tabs.querySelectorAll('button[data-tab]')) {
      const tab = button.dataset.tab;
      button.textContent = t(lang, 'web.budgets.groupCount', { label: t(lang, `web.budgets.group.${tab}`), count: filtered[tab].length });
      button.setAttribute('aria-pressed', String(button.dataset.tab === state.tab));
    }
    const total = TABS.reduce((sum, tab) => sum + filtered[tab].length, 0);
    const shownRows = filtered[state.tab];
    const trimmed = state.query.trim();
    els.clear.hidden = state.query === '';
    const notFound = total === 0 && trimmed !== '';
    els.empty.hidden = !notFound;
    els.emptyTitle.textContent = t(lang, 'web.budgets.all.notFound', { query: trimmed });
    els.list.hidden = notFound;
    els.tabEmpty.hidden = notFound || shownRows.length > 0;
    const hasAnyRows = TABS.some((tab) => groups[tab].length > 0);
    els.bulk.hidden = !hasAnyRows || notFound;
    els.bulk.textContent = t(lang, state.tab === 'unset' ? 'web.budgets.all.bulkSet' : 'web.budgets.all.bulkEdit');
    els.count.textContent = t(lang, 'web.budgets.all.count', { month: getMonthLabel(), shown: shownRows.length, total: groups[state.tab].length });
    els.list.replaceChildren();
    if (notFound) return;
    for (const section of sectionsForTab(state.tab, shownRows, lang)) {
      if (section.title) {
        const level = section.rows[0].level === 'over' ? 'over' : section.rows[0].level === 'warn' ? 'warn' : 'ok';
        els.list.append(node(doc, 'div', `budget-all-head level-${level}`, t(lang, 'web.budgets.all.sectionHead', { title: section.title, count: section.rows.length })));
      }
      for (const row of section.rows) els.list.append(renderRow(row, state.tab, lang));
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

import { barGeometry, describeDiff, describeHero, groupBudgetRows, pageBudgetRows, summarizeBudgets } from './budgets-format.mjs';

// ความสูงแท่งที่ 100% ของงบ ต้องเท่ากับค่าเริ่มต้นของ --budget-h100 ใน style.css
export const BUDGET_H100 = 130;
const RISK_PAGE_SIZE = 6;
const CALM_PREVIEW_LIMIT = 8;
const MANY_THRESHOLD = 14;
const EMPTY_SUGGESTION_LIMIT = 5;

function node(doc, tag, className, text) {
  const el = doc.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

function button(doc, className, text) {
  const el = node(doc, 'button', className, text);
  el.type = 'button';
  return el;
}

export function createBudgetsPanel({ doc, els, onEdit, onOpenAll }) {
  let groups = { risk: [], calm: [], unset: [] };
  let riskPage = 0;
  let focusId = null;

  function renderHero(summary) {
    const hero = describeHero(summary);
    els.heroPercent.textContent = hero.percentText;
    els.heroPercent.className = `budget-hero-percent level-${hero.level}`;
    els.heroRest.textContent = hero.restText;
  }

  function renderMany(budgetedCount) {
    const total = budgetedCount + groups.unset.length;
    els.many.hidden = total <= MANY_THRESHOLD;
    if (els.many.hidden) return;
    els.manySearch.textContent = `ค้นหาหมวดจาก ${total} หมวด`;
    els.manyChips.replaceChildren();
    const chips = [
      ['ต้องดูแล', groups.risk.length, 'risk'],
      ['ปกติ', groups.calm.length, 'calm'],
      ['ไม่มีงบ', groups.unset.length, 'unset'],
    ];
    for (const [label, count, tab] of chips) {
      const chip = button(doc, 'budget-many-chip', `${label} ${count}`);
      chip.addEventListener('click', () => onOpenAll({ tab }));
      els.manyChips.append(chip);
    }
  }

  function renderRisk() {
    const { risk } = groups;
    els.risk.hidden = risk.length === 0;
    if (risk.length === 0) return;
    els.riskTitle.textContent = `ต้องดูแล ${risk.length} หมวด`;
    const { items, page, pageCount } = pageBudgetRows(risk, riskPage, RISK_PAGE_SIZE);
    riskPage = page;
    els.riskPlot.style.setProperty('--budget-h100', `${BUDGET_H100}px`);
    els.riskBars.replaceChildren();
    els.riskNames.replaceChildren();
    for (const row of items) {
      const geometry = barGeometry(row, { h100: BUDGET_H100 });
      const col = button(doc, 'budget-col');
      col.dataset.categoryId = row.categoryId;
      col.setAttribute('aria-label', `${row.category} ${row.percent}% ของงบ ${describeDiff(row)}`);
      const bar = node(doc, 'span', 'budget-bar');
      bar.style.height = `${geometry.barH}px`;
      const fill = node(doc, 'span', `budget-bar-fill level-${row.level}`);
      fill.style.height = `${geometry.fillH}px`;
      const over = node(doc, 'span', 'budget-bar-over');
      over.style.height = `${geometry.overH}px`;
      bar.append(node(doc, 'span', 'budget-bar-track'), fill, over);
      const pct = node(doc, 'span', `budget-col-pct level-${row.level}`, `${row.percent}%`);
      pct.style.bottom = `${geometry.labelBottom}px`;
      col.append(bar, pct);
      col.addEventListener('click', () => onEdit(row));
      els.riskBars.append(col);
      const name = node(doc, 'div', 'budget-col-name');
      name.append(node(doc, 'div', 'budget-col-name-text', row.category), node(doc, 'div', `budget-col-diff level-${row.level}`, describeDiff(row)));
      els.riskNames.append(name);
      // render ใหม่ทำให้ปุ่มเดิมหาย จึงคืน focus ให้แท่งของหมวดที่เพิ่งแก้
      if (focusId === row.categoryId) col.focus();
    }
    els.riskPager.hidden = pageCount <= 1;
    els.riskPageLabel.textContent = `หน้า ${page + 1} จาก ${pageCount}`;
    els.riskPrev.disabled = page === 0;
    els.riskNext.disabled = page === pageCount - 1;
    els.riskDots.replaceChildren();
    for (let index = 0; index < pageCount; index += 1) {
      els.riskDots.append(node(doc, 'span', index === page ? 'budget-dot active' : 'budget-dot'));
    }
  }

  function renderCalm(budgetedCount) {
    const { calm } = groups;
    els.calm.hidden = calm.length === 0;
    els.calmHead.hidden = calm.length === 0;
    els.calmList.hidden = calm.length === 0;
    els.calmTitle.textContent = `ปกติ ${calm.length} หมวด`;
    els.calmNote.textContent = calm.length > CALM_PREVIEW_LIMIT ? `แสดง ${CALM_PREVIEW_LIMIT} หมวดที่ใช้มากสุด` : 'ใช้ไม่ถึง 80%';
    els.calmList.replaceChildren();
    for (const row of calm.slice(0, CALM_PREVIEW_LIMIT)) {
      const item = button(doc, 'budget-calm-item');
      item.dataset.categoryId = row.categoryId;
      const line = node(doc, 'span', 'budget-calm-line');
      line.append(node(doc, 'span', 'budget-calm-name', row.category), node(doc, 'span', 'budget-calm-pct', `${row.percent}%`));
      const track = node(doc, 'span', 'budget-calm-track');
      const fill = node(doc, 'span', 'budget-calm-fill');
      fill.style.width = `${Math.max(row.percent, 2)}%`;
      track.append(fill);
      item.append(line, track);
      item.addEventListener('click', () => onEdit(row));
      els.calmList.append(item);
      // คืน focus ให้แถวปกติที่เพิ่งแก้ เหมือนแท่งในส่วนต้องดูแล
      if (focusId === row.categoryId) item.focus();
    }
    els.calmAll.textContent = `ดูทั้งหมด ${budgetedCount} หมวด ›`;
    // ปุ่มอยู่การ์ดต้องดูแลถ้ามี ไม่งั้นอยู่การ์ดปกติ เพื่อไม่ให้แยกเป็นการ์ดลอย
    (groups.risk.length > 0 ? els.risk : els.calm).append(els.calmAll);
  }

  function renderUnset() {
    const { unset } = groups;
    els.unset.hidden = unset.length === 0;
    if (unset.length === 0) return;
    els.unsetText.textContent = `ยังไม่ตั้งงบ ${unset.length} หมวด`;
  }

  function renderEmpty() {
    const suggestions = groups.unset.filter((row) => row.spent > 0).slice(0, EMPTY_SUGGESTION_LIMIT);
    els.emptyHint.textContent = suggestions.length > 0
      ? 'ตั้งสักหมวด เฮียจะเตือนตอนใกล้เต็ม เริ่มจากหมวดที่ใช้บ่อยด้านล่างได้เลย'
      : 'ตั้งสักหมวด เฮียจะเตือนตอนใกล้เต็ม ลองจดรายจ่ายในแชตก่อน แล้วกลับมาตั้งงบ';
    els.emptyList.replaceChildren();
    for (const row of suggestions) {
      const item = node(doc, 'li', 'budget-empty-item');
      const name = node(doc, 'span', 'budget-empty-name', row.category);
      name.append(node(doc, 'span', 'budget-empty-spent', `ใช้ไปเดือนนี้ ${row.spent.toLocaleString('en-US', { maximumFractionDigits: 2 })} บาท`));
      const set = button(doc, 'budget-empty-set', 'ตั้งงบ');
      set.setAttribute('aria-label', `ตั้งงบ ${row.category}`);
      set.addEventListener('click', () => onEdit(row));
      item.append(name, set);
      els.emptyList.append(item);
    }
  }

  function render(budgets, { focusCategoryId = null } = {}) {
    const summary = summarizeBudgets(budgets);
    groups = groupBudgetRows(budgets);
    focusId = focusCategoryId;
    els.section.hidden = !summary.hasBudgets;
    els.empty.hidden = summary.hasBudgets;
    if (!summary.hasBudgets) {
      renderEmpty();
      return;
    }
    const budgetedCount = summary.counts.over + summary.counts.warn + summary.counts.ok;
    renderHero(summary);
    renderMany(budgetedCount);
    renderRisk();
    renderCalm(budgetedCount);
    renderUnset();
    focusId = null;
  }

  // ถ้าไม่มีหมวดที่ต้องดูแล เปิดแท็บปกติแทน ไม่งั้นผู้ใช้เจอแท็บว่าง
  const firstTab = () => (groups.risk.length > 0 ? 'risk' : 'calm');

  els.riskPrev.addEventListener('click', () => {
    riskPage -= 1;
    renderRisk();
  });
  els.riskNext.addEventListener('click', () => {
    riskPage += 1;
    renderRisk();
  });
  els.manySearch.addEventListener('click', () => onOpenAll({ tab: firstTab(), focusSearch: true }));
  els.calmAll.addEventListener('click', () => onOpenAll({ tab: firstTab() }));
  els.unsetOpen.addEventListener('click', () => onOpenAll({ tab: 'unset' }));

  return { render };
}

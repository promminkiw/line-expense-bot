import { createSvgIcon } from '../ui/icons.mjs';
import { applyResults, createDraft, draftSummary, entryView, saveDraft, stepDraft } from './budget-bulk.mjs';
import { formatNumber } from './budgets-format.mjs';
import { stepBudget } from './budget-edit.mjs';

function node(doc, tag, className, text) {
  const el = doc.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

export function createBudgetBulkPanel({ doc, els, setBudget, onSaved, onDone }) {
  let draft = [];
  let month = null;
  let busy = false;
  // เก็บผลล่าสุดของแต่ละหมวด เพื่อให้ dialog รวมผลของรอบแรกกับรอบลองใหม่
  let outcomes = new Map();

  function renderRow(entry) {
    const view = entryView(entry);
    const item = node(doc, 'div', view.dirty ? 'budget-bulk-row dirty' : 'budget-bulk-row');
    item.dataset.categoryId = entry.categoryId;
    const text = node(doc, 'div', 'budget-bulk-text');
    const line = node(doc, 'div', 'budget-bulk-line');
    if (view.oldPercent === null) {
      line.append(node(doc, 'span', view.dirty ? 'budget-bulk-old struck' : 'budget-bulk-old muted', 'ยังไม่ตั้งงบ'));
    } else {
      line.append(node(doc, 'span', `budget-bulk-old level-${view.oldLevel}${view.dirty ? ' struck' : ''}`, `${view.oldPercent}%`));
    }
    if (view.dirty && view.newPercent !== null) {
      line.append(node(doc, 'span', 'budget-bulk-arrow', '→'), node(doc, 'span', `budget-bulk-new level-${view.newLevel}`, `${view.newPercent}%`));
    }
    text.append(node(doc, 'div', 'budget-bulk-name', entry.category), line);

    const stepper = node(doc, 'div', 'budget-bulk-stepper');
    const minus = node(doc, 'button', 'budget-bulk-minus', '−');
    minus.type = 'button';
    minus.setAttribute('aria-label', `ลดงบ ${entry.category} 500 บาท`);
    minus.disabled = busy || stepBudget(entry.next, -1) === entry.next;
    const plus = node(doc, 'button', 'budget-bulk-plus', '+');
    plus.type = 'button';
    plus.setAttribute('aria-label', `เพิ่มงบ ${entry.category} 500 บาท`);
    plus.disabled = busy;
    const amount = node(doc, 'div', 'budget-bulk-amount');
    amount.append(node(doc, 'span', 'budget-bulk-value', view.valueText), node(doc, 'span', 'budget-bulk-was', view.wasText));
    stepper.append(minus, amount, plus);
    item.append(text, stepper);

    const change = (direction, selector) => {
      draft = stepDraft(draft, entry.categoryId, direction);
      const next = renderRow(draft.find((candidate) => candidate.categoryId === entry.categoryId));
      item.replaceWith(next);
      renderSummary();
      const target = next.querySelector(selector);
      if (!target.disabled) target.focus();
    };
    minus.addEventListener('click', () => change(-1, '.budget-bulk-minus'));
    plus.addEventListener('click', () => change(1, '.budget-bulk-plus'));
    return item;
  }

  function renderSummary() {
    const summary = draftSummary(draft);
    if (summary.dirtyCount === 0) {
      els.count.textContent = 'ยังไม่ได้แก้อะไร';
      els.delta.textContent = '';
      els.total.textContent = '';
    } else {
      els.count.textContent = `แก้ ${summary.dirtyCount} หมวด · รวมงบ`;
      els.delta.textContent = `${summary.delta >= 0 ? '+' : '-'}${formatNumber(Math.abs(summary.delta))}`;
      els.total.textContent = `เป็น ${formatNumber(summary.newTotal)}`;
    }
    els.save.disabled = busy || summary.dirtyCount === 0;
  }

  function renderList() {
    els.list.replaceChildren(...draft.map(renderRow));
    renderSummary();
  }

  function setBusy(next) {
    busy = next;
    els.cancel.disabled = next;
    els.resultRetry.disabled = next;
    els.resultClose.disabled = next;
    renderList();
  }

  function showResult() {
    const results = [...outcomes.values()];
    const okCount = results.filter((result) => result.ok).length;
    els.resultTitle.textContent = `บันทึกได้ ${okCount} จาก ${results.length} หมวด`;
    els.resultSub.textContent = okCount > 0 ? `${okCount} หมวดที่สำเร็จบันทึกแล้ว ไม่ต้องกดซ้ำ` : 'ยังไม่มีหมวดไหนบันทึกสำเร็จ';
    els.resultList.replaceChildren();
    for (const result of results) {
      const item = node(doc, 'div', result.ok ? 'budget-bulk-result-item' : 'budget-bulk-result-item failed');
      const mark = node(doc, 'span', 'budget-bulk-result-mark');
      mark.append(createSvgIcon(doc, result.ok ? 'icon-check' : 'icon-close'));
      const text = node(doc, 'span', 'budget-bulk-result-text');
      text.append(node(doc, 'span', 'budget-bulk-result-name', result.category), node(doc, 'span', 'budget-bulk-result-say', result.ok ? 'บันทึกแล้ว' : 'บันทึกไม่สำเร็จ'));
      const from = result.from === null ? 'ไม่มีงบ' : formatNumber(result.from);
      item.append(mark, text, node(doc, 'span', 'budget-bulk-result-change', `${from} → ${formatNumber(result.to)}`));
      els.resultList.append(item);
    }
    els.resultRetry.hidden = okCount === results.length;
    if (!els.result.open) els.result.showModal();
  }

  async function save(only = null) {
    if (busy) return;
    // รอบที่ผู้ใช้กดเองเริ่มนับผลใหม่ ไม่งั้นความล้มเหลวเก่าที่ผู้ใช้แก้กลับแล้วจะทำให้ dialog ค้าง
    if (only === null) outcomes = new Map();
    setBusy(true);
    const results = await saveDraft(draft, { month, setBudget, only });
    draft = applyResults(draft, results);
    for (const result of results) outcomes.set(result.categoryId, result);
    setBusy(false);
    if (results.some((result) => result.ok)) await onSaved();
    const failed = [...outcomes.values()].filter((result) => !result.ok);
    if (failed.length === 0) {
      const savedCount = outcomes.size;
      if (els.result.open) els.result.close();
      onDone({ savedCount });
      return;
    }
    showResult();
  }

  function show({ budgets, month: nextMonth, first = 'risk' }) {
    draft = createDraft(budgets, { first });
    month = nextMonth;
    outcomes = new Map();
    busy = false;
    els.cancel.disabled = false;
    renderList();
  }

  els.save.addEventListener('click', () => save());
  els.resultRetry.addEventListener('click', () => save([...outcomes.values()].filter((result) => !result.ok).map((result) => result.categoryId)));
  els.resultClose.addEventListener('click', () => els.result.close());
  // กัน Esc ปิดผลลัพธ์ระหว่างลองบันทึกใหม่ ไม่งั้นผลรอบนี้จะไม่มีที่แสดง
  els.result.addEventListener('cancel', (event) => {
    if (busy) event.preventDefault();
  });

  return { show };
}

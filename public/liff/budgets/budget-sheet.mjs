import { barGeometry, formatNumber } from './budgets-format.mjs';
import { BUDGET_STEP, parseBudgetAmount, previewBudget, quickChips, stepBudget } from './budget-edit.mjs';
import { describeBudgetFailure, formatMonthLabel } from '../format.mjs';
import { revealError } from '../ui/reveal.mjs';

const PREVIEW_H100 = 80;
const GENERIC_FAILURE_TITLE = 'บันทึกงบไม่สำเร็จ';
const INVALID_TITLE = 'จำนวนเงินไม่ถูกต้อง';
const SAVE_LABEL = 'บันทึก';
const NEW_LABEL = 'ตั้งงบ';
const RETRY_LABEL = 'ลองบันทึกอีกครั้ง';

function node(doc, tag, className, text) {
  const el = doc.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

export function createBudgetSheet({ doc, els, badgeFor, getMonth, onSubmit, onSaved }) {
  let row = null;
  let month = null;
  let busy = false;

  const idleLabel = () => (row && row.budget === null ? NEW_LABEL : SAVE_LABEL);

  function side(target, caption, data, emptyText) {
    target.replaceChildren();
    const mini = node(doc, 'span', data ? 'budget-mini' : 'budget-mini budget-mini-none');
    if (data) {
      const geometry = barGeometry({ percent: data.percent }, { h100: PREVIEW_H100 });
      mini.style.height = `${geometry.barH}px`;
      const fill = node(doc, 'span', `budget-bar-fill level-${data.level}`);
      fill.style.height = `${geometry.fillH}px`;
      const over = node(doc, 'span', 'budget-bar-over');
      over.style.height = `${geometry.overH}px`;
      mini.append(node(doc, 'span', 'budget-bar-track'), fill, over);
    }
    const text = node(doc, 'span', data ? `level-${data.level}` : '');
    text.append(node(doc, 'span', 'budget-preview-caption', caption));
    if (data) {
      text.append(node(doc, 'span', 'budget-preview-value', `${data.percent}%`), node(doc, 'span', 'budget-preview-diff', data.diffText));
    } else {
      text.append(node(doc, 'span', 'budget-preview-none', emptyText));
    }
    target.append(mini, text);
  }

  function currentAmount() {
    return parseBudgetAmount(els.amount.value);
  }

  function clearError() {
    els.error.hidden = true;
    els.amount.removeAttribute('aria-invalid');
    els.submit.textContent = idleLabel();
  }

  function sync() {
    const amount = currentAmount();
    const preview = previewBudget(row, amount);
    side(els.previewBefore, 'ตอนนี้', preview.before, 'ไม่มีงบ');
    side(els.previewAfter, amount === null ? '' : `ถ้างบ ${formatNumber(amount)}`, preview.after, 'ใส่จำนวนเงิน');
    els.minus.disabled = busy || amount === null || stepBudget(amount, -1) === amount;
    els.plus.disabled = busy;
  }

  function setBusy(next) {
    busy = next;
    els.submit.disabled = next;
    els.remove.disabled = next;
    els.close.disabled = next;
    els.amount.disabled = next;
    els.busy.hidden = !next;
    for (const chip of els.chips.querySelectorAll('button')) chip.disabled = next;
    sync();
  }

  function showError(title, text) {
    els.errorTitle.textContent = title;
    els.errorText.textContent = text;
    els.error.hidden = false;
    els.amount.setAttribute('aria-invalid', 'true');
    els.submit.textContent = RETRY_LABEL;
    revealError(els.error);
  }

  function setAmount(value) {
    els.amount.value = value === null ? '' : formatNumber(value);
    clearError();
    sync();
  }

  function renderChips() {
    els.chips.replaceChildren();
    for (const chip of quickChips(row)) {
      const button = node(doc, 'button');
      button.type = 'button';
      // เว้นวรรคหลังป้ายเพื่อให้ screen reader อ่านแยกจากตัวเลข
      button.append(doc.createTextNode(`${chip.label} `), node(doc, 'b', '', formatNumber(chip.value)));
      button.addEventListener('click', () => setAmount(chip.value));
      els.chips.append(button);
    }
  }

  async function run(amount) {
    if (busy) return;
    setBusy(true);
    clearError();
    let result;
    try {
      result = await onSubmit({ row, amount, month });
    } finally {
      setBusy(false);
    }
    if (result.ok) {
      // ปิดก่อนโหลดงบใหม่ ไม่งั้น modal ที่ยังเปิดทำให้คืน focus ให้แท่งที่ render ใหม่ไม่ได้
      els.dialog.close();
      await onSaved({ row });
      return;
    }
    if (amount === null) {
      showError('เลิกตั้งงบไม่สำเร็จ', describeBudgetFailure(result.status));
      // ปุ่มหลักยังเป็นบันทึกค่าในช่อง ไม่ใช่ลองเลิกตั้งงบซ้ำ จึงไม่เปลี่ยนเป็น "ลองบันทึกอีกครั้ง"
      els.submit.textContent = idleLabel();
      return;
    }
    const generic = ![400, 401, 404].includes(result.status);
    const text = generic
      ? `ตัวเลข ${formatNumber(amount)} ยังอยู่ในช่อง ลองบันทึกอีกครั้งได้เลย`
      : describeBudgetFailure(result.status);
    showError(GENERIC_FAILURE_TITLE, text);
  }

  function open(nextRow) {
    row = nextRow;
    month = getMonth();
    const isNew = row.budget === null;
    els.title.textContent = isNew ? `ตั้งงบ ${row.category}` : row.category;
    els.sub.textContent = isNew
      ? `ยังไม่เคยตั้งงบ · ใช้ไปเดือนนี้ ${formatNumber(row.spent)} บาท`
      : `ใช้ไปเดือนนี้ ${formatNumber(row.spent)} บาท · งบเดิม ${formatNumber(row.budget)}`;
    els.badge.replaceChildren(badgeFor(row.category, 'expense'));
    const label = formatMonthLabel(month);
    els.scope.textContent = isNew
      ? `มีผลตั้งแต่เดือน ${label} เป็นต้นไป · เฮียจะเตือนเมื่อใช้ถึง 80%`
      : `มีผลตั้งแต่เดือน ${label} เป็นต้นไป`;
    els.remove.hidden = isNew;
    els.busy.hidden = true;
    els.error.hidden = true;
    els.amount.removeAttribute('aria-invalid');
    els.amount.value = isNew ? '' : formatNumber(row.budget);
    els.submit.textContent = idleLabel();
    busy = false;
    els.submit.disabled = false;
    els.remove.disabled = false;
    els.close.disabled = false;
    els.amount.disabled = false;
    renderChips();
    sync();
    els.dialog.showModal();
  }

  els.form.addEventListener('submit', (event) => {
    event.preventDefault();
    const amount = currentAmount();
    if (amount === null) {
      showError(INVALID_TITLE, describeBudgetFailure(400));
      return;
    }
    run(amount);
  });
  els.amount.addEventListener('input', () => {
    clearError();
    sync();
  });
  els.plus.addEventListener('click', () => setAmount(stepBudget(currentAmount(), 1, BUDGET_STEP)));
  els.minus.addEventListener('click', () => setAmount(stepBudget(currentAmount(), -1, BUDGET_STEP)));
  els.close.addEventListener('click', () => els.dialog.close());
  els.remove.addEventListener('click', () => {
    els.confirmTitle.textContent = `เลิกตั้งงบ ${row.category} ใช่ไหม`;
    els.confirmBody.replaceChildren(
      node(doc, 'p', '', `งบ ${formatNumber(row.budget)} บาท จะถูกลบตั้งแต่เดือน ${formatMonthLabel(month)} เป็นต้นไป`),
      node(doc, 'p', '', 'เดือนก่อนหน้าไม่เปลี่ยน และรายการที่จดไว้ไม่หาย เฮียจะไม่เตือนหมวดนี้อีก'),
    );
    els.confirm.showModal();
  });
  els.confirmCancel.addEventListener('click', () => els.confirm.close());
  els.confirmOk.addEventListener('click', () => {
    els.confirm.close();
    run(null);
  });
  // กัน Esc ปิดแผ่นระหว่างรอ request ไม่งั้นผลลัพธ์จะไม่มีที่แสดง
  els.dialog.addEventListener('cancel', (event) => {
    if (busy) event.preventDefault();
  });
  // Esc ครั้งที่สอง browser บางตัวปิด dialog แม้ preventDefault แล้ว จึงเปิดกลับ
  els.dialog.addEventListener('close', () => {
    if (busy) els.dialog.showModal();
  });

  return { open, close: () => els.dialog.close() };
}

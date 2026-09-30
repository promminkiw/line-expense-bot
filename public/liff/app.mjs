import { createApi, ApiError } from './api.mjs';
import {
  formatBaht,
  formatThaiDate,
  currentMonth,
  groupByDate,
  totals,
  groupCategoryOptions,
} from './format.mjs';

const TYPE_LABELS = { expense: 'รายจ่าย', income: 'รายรับ' };

const els = {
  month: document.getElementById('month'),
  totals: document.getElementById('totals'),
  status: document.getElementById('status'),
  list: document.getElementById('list'),
  editor: document.getElementById('editor'),
  form: document.getElementById('edit-form'),
  amount: document.getElementById('edit-amount'),
  category: document.getElementById('edit-category'),
  date: document.getElementById('edit-date'),
  note: document.getElementById('edit-note'),
  error: document.getElementById('edit-error'),
  deleteButton: document.getElementById('delete-button'),
  cancelButton: document.getElementById('cancel-button'),
};

let api;
let categories = [];
let editing = null;
let confirmDelete = false;

function setStatus(text) {
  els.status.textContent = text;
  els.status.hidden = !text;
}

function showLoadError(err) {
  setStatus(
    err instanceof ApiError && err.status === 401
      ? 'กรุณาเปิดหน้านี้จากแอป LINE อีกครั้ง'
      : 'โหลดข้อมูลไม่สำเร็จ ลองใหม่อีกครั้ง'
  );
}

function fillCategoryOptions() {
  const groups = groupCategoryOptions(categories);
  els.category.replaceChildren();
  for (const type of ['expense', 'income']) {
    const group = document.createElement('optgroup');
    group.label = TYPE_LABELS[type];
    for (const category of groups[type]) {
      const option = document.createElement('option');
      option.value = category.id;
      option.textContent = category.name;
      group.append(option);
    }
    els.category.append(group);
  }
}

// ใช้ textContent ทุกจุดเพราะโน้ตมาจากข้อความที่ผู้ใช้พิมพ์
function renderRow(item) {
  const row = document.createElement('li');
  row.className = `row ${item.type}`;
  const label = document.createElement('span');
  label.textContent = item.note ? `${item.categoryName} · ${item.note}` : item.categoryName;
  const amount = document.createElement('span');
  amount.className = 'amount';
  amount.textContent = `${item.type === 'income' ? '+' : '-'}${formatBaht(item.amount)}`;
  row.append(label, amount);
  row.addEventListener('click', () => openEditor(item));
  return row;
}

function render(transactions) {
  const sum = totals(transactions);
  els.totals.textContent = `รายรับ ${formatBaht(sum.income)} · รายจ่าย ${formatBaht(sum.expense)}`;
  els.totals.hidden = false;
  els.list.replaceChildren();
  if (transactions.length === 0) {
    setStatus('ยังไม่มีรายการในเดือนนี้');
    return;
  }
  setStatus('');
  for (const group of groupByDate(transactions)) {
    const heading = document.createElement('li');
    heading.className = 'day';
    heading.textContent = formatThaiDate(group.date);
    els.list.append(heading);
    for (const item of group.items) {
      els.list.append(renderRow(item));
    }
  }
}

async function loadMonth() {
  setStatus('กำลังโหลด...');
  const { transactions } = await api.listTransactions(els.month.value);
  render(transactions);
}

function openEditor(item) {
  editing = item;
  confirmDelete = false;
  els.deleteButton.textContent = 'ลบ';
  els.amount.value = String(item.amount);
  els.category.value = item.categoryId;
  els.date.value = item.occurredOn;
  els.note.value = item.note || '';
  els.error.hidden = true;
  els.editor.showModal();
}

async function runEdit(action) {
  try {
    await action();
    els.editor.close();
    await loadMonth();
  } catch (err) {
    els.error.textContent =
      err instanceof ApiError && err.status === 400
        ? 'ข้อมูลไม่ถูกต้อง ตรวจจำนวนเงิน หมวด และวันที่อีกครั้ง'
        : 'บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง';
    els.error.hidden = false;
  }
}

els.form.addEventListener('submit', (event) => {
  event.preventDefault();
  runEdit(() =>
    api.updateTransaction(editing.id, {
      amount: Number(els.amount.value),
      categoryId: els.category.value,
      occurredOn: els.date.value,
      note: els.note.value,
    })
  );
});

// กดสองครั้งเพื่อลบ กันการลบโดยไม่ตั้งใจโดยไม่ต้องใช้ confirm ของเบราว์เซอร์
els.deleteButton.addEventListener('click', () => {
  if (!confirmDelete) {
    confirmDelete = true;
    els.deleteButton.textContent = 'ยืนยันลบ';
    return;
  }
  runEdit(() => api.deleteTransaction(editing.id));
});

els.cancelButton.addEventListener('click', () => els.editor.close());
els.month.addEventListener('change', () => loadMonth().catch(showLoadError));

async function boot() {
  try {
    const config = await (await fetch('/api/config')).json();
    await liff.init({ liffId: config.liffId });
    if (!liff.isLoggedIn()) {
      liff.login();
      return;
    }
    api = createApi({ fetchImpl: (...args) => fetch(...args), getIdToken: () => liff.getIDToken() });
    els.month.value = currentMonth(new Date());
    ({ categories } = await api.listCategories());
    fillCategoryOptions();
    await loadMonth();
  } catch (err) {
    showLoadError(err);
  }
}

boot();

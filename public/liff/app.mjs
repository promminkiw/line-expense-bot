import { createApi, ApiError, REQUEST_TIMEOUT_MS, NGROK_SKIP_WARNING_HEADERS } from './api.mjs';
import {
  formatBaht,
  formatThaiDate,
  currentMonth,
  groupByDate,
  totals,
  groupCategoryOptions,
  describeEditFailure,
  LOGIN_REQUIRED_MESSAGE,
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
  saveButton: document.querySelector('#edit-form button[type="submit"]'),
  cancelButton: document.getElementById('cancel-button'),
};

let api;
let categories = [];
let editing = null;
let confirmDelete = false;
let busy = false;

function setStatus(text) {
  els.status.textContent = text;
  els.status.hidden = !text;
}

function showLoadError(err) {
  setStatus(
    err instanceof ApiError && err.status === 401
      ? LOGIN_REQUIRED_MESSAGE
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
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'row-button';
  const label = document.createElement('span');
  label.textContent = item.note ? `${item.categoryName} · ${item.note}` : item.categoryName;
  const amount = document.createElement('span');
  amount.className = 'amount';
  amount.textContent = `${item.type === 'income' ? '+' : '-'}${formatBaht(item.amount)}`;
  button.append(label, amount);
  button.addEventListener('click', () => openEditor(item));
  row.append(button);
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

// ไม่ throw เพื่อให้ทุกจุดเรียกใช้แล้วข้อผิดพลาดขึ้นที่ status เสมอ
// reload หลังแก้/ลบไม่ล้างรายการ เพื่อไม่ให้หน้าเด้งกลับไปบนสุด
async function loadMonth({ reset = false } = {}) {
  const month = els.month.value;
  if (reset) {
    els.list.replaceChildren();
    els.totals.hidden = true;
    setStatus('กำลังโหลด...');
  }
  try {
    const { transactions } = await api.listTransactions(month);
    // ทิ้งผลของเดือนเก่าเมื่อผู้ใช้เปลี่ยนเดือนไปแล้ว
    if (month === els.month.value) render(transactions);
  } catch (err) {
    if (month === els.month.value) showLoadError(err);
  }
}

async function ensureCategories() {
  if (categories.length === 0) {
    try {
      ({ categories } = await api.listCategories());
      fillCategoryOptions();
    } catch {
      // ปล่อยให้ categories ว่าง แล้วผู้เรียกแสดงข้อความผิดพลาด
    }
  }
  return categories.length > 0;
}

async function openEditor(item) {
  editing = item;
  confirmDelete = false;
  els.deleteButton.textContent = 'ลบ';
  els.amount.value = String(item.amount);
  els.date.value = item.occurredOn;
  els.note.value = item.note || '';
  els.error.hidden = true;
  els.saveButton.disabled = categories.length === 0;
  els.editor.showModal();
  if (!(await ensureCategories())) {
    els.error.textContent = 'โหลดหมวดไม่สำเร็จ ลองใหม่อีกครั้ง';
    els.error.hidden = false;
    return;
  }
  els.category.value = item.categoryId;
  els.saveButton.disabled = busy;
}

function setBusy(isBusy, kind) {
  busy = isBusy;
  els.saveButton.disabled = isBusy || categories.length === 0;
  els.deleteButton.disabled = isBusy;
  els.cancelButton.disabled = isBusy;
  els.error.textContent = isBusy ? (kind === 'delete' ? 'กำลังลบ...' : 'กำลังบันทึก...') : '';
  els.error.hidden = !isBusy;
}

async function runEdit(action, kind) {
  if (busy) return;
  setBusy(true, kind);
  let failure = null;
  try {
    await action();
  } catch (err) {
    failure = describeEditFailure(err instanceof ApiError ? err.status : undefined, kind);
  } finally {
    setBusy(false);
  }
  if (!failure) {
    els.editor.close();
    await loadMonth();
    return;
  }
  if (failure.closeAndReload) {
    els.editor.close();
    await loadMonth();
    setStatus(failure.message);
    return;
  }
  els.error.textContent = failure.message;
  els.error.hidden = false;
}

els.form.addEventListener('submit', (event) => {
  event.preventDefault();
  runEdit(() =>
    api.updateTransaction(editing.id, {
      amount: Number(els.amount.value),
      categoryId: els.category.value,
      occurredOn: els.date.value,
      note: els.note.value,
    }),
    'save'
  );
});

// กดสองครั้งเพื่อลบ กันการลบโดยไม่ตั้งใจโดยไม่ต้องใช้ confirm ของเบราว์เซอร์
els.deleteButton.addEventListener('click', () => {
  if (!confirmDelete) {
    confirmDelete = true;
    els.deleteButton.textContent = 'ยืนยันลบ';
    return;
  }
  runEdit(() => api.deleteTransaction(editing.id), 'delete');
});

els.cancelButton.addEventListener('click', () => els.editor.close());
// กัน Esc ปิด dialog ระหว่างรอ request ไม่งั้นผลลัพธ์จะไม่มีที่แสดง
els.editor.addEventListener('cancel', (event) => {
  if (busy) event.preventDefault();
});
els.month.addEventListener('change', () => loadMonth({ reset: true }));

async function boot() {
  try {
    const config = await (
      await fetch('/api/config', {
        headers: NGROK_SKIP_WARNING_HEADERS,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
    ).json();
    await liff.init({ liffId: config.liffId });
    if (!liff.isLoggedIn()) {
      liff.login();
      return;
    }
    api = createApi({ fetchImpl: (...args) => fetch(...args), getIdToken: () => liff.getIDToken() });
    els.month.value = currentMonth(new Date());
    ({ categories } = await api.listCategories());
    fillCategoryOptions();
    await loadMonth({ reset: true });
  } catch (err) {
    showLoadError(err);
  }
}

boot();

import { createApi, ApiError, REQUEST_TIMEOUT_MS, NGROK_SKIP_WARNING_HEADERS } from './api.mjs';
import {
  formatBaht,
  formatSignedBaht,
  describeDeleteTarget,
  formatThaiDate,
  currentMonth,
  groupByDate,
  summaryTotals,
  chartRows,
  hasChartData,
  describeExportFailure,
  groupCategoryOptions,
  describeEditFailure,
  budgetRows,
  createLatestGuard,
  formatMonthLabel,
  describeBudgetFailure,
  recurringRows,
  describeRecurringFailure,
  shouldCloseRecurringEditor,
  LOGIN_REQUIRED_MESSAGE,
} from './format.mjs';
import { createBannerSetter } from './banner.mjs';
import { DEFAULT_TAB, createTabController } from './tabs.mjs';

const TYPE_LABELS = { expense: 'รายจ่าย', income: 'รายรับ' };

const els = {
  month: document.getElementById('month'),
  totals: document.getElementById('totals'),
  truncated: document.getElementById('truncated'),
  exportButton: document.getElementById('export-button'),
  exportStatus: document.getElementById('export-status'),
  chart: document.getElementById('chart'),
  chartRows: document.getElementById('chart-rows'),
  chartEmpty: document.getElementById('chart-empty'),
  tabs: document.querySelectorAll('#chart .tabs button'),
  status: document.getElementById('status'),
  banner: document.getElementById('banner'),
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
  confirm: document.getElementById('confirm-delete'),
  confirmTitle: document.getElementById('confirm-title'),
  confirmCategory: document.getElementById('confirm-category'),
  confirmAmount: document.getElementById('confirm-amount'),
  confirmDate: document.getElementById('confirm-date'),
  confirmNote: document.getElementById('confirm-note'),
  confirmCancel: document.getElementById('confirm-cancel'),
  confirmOk: document.getElementById('confirm-ok'),
  budgets: document.getElementById('budgets'),
  budgetRows: document.getElementById('budget-rows'),
  budgetsLoading: document.getElementById('budgets-loading'),
  budgetsError: document.getElementById('budgets-error'),
  budgetsErrorText: document.getElementById('budgets-error-text'),
  budgetsRetry: document.getElementById('budgets-retry'),
  budgetEditor: document.getElementById('budget-editor'),
  budgetForm: document.getElementById('budget-form'),
  budgetTitle: document.getElementById('budget-title'),
  budgetScope: document.getElementById('budget-scope'),
  budgetAmount: document.getElementById('budget-amount'),
  budgetBusy: document.getElementById('budget-busy'),
  budgetError: document.getElementById('budget-error'),
  budgetRemove: document.getElementById('budget-remove'),
  budgetCancel: document.getElementById('budget-cancel'),
  budgetSave: document.querySelector('#budget-form button[type="submit"]'),
  recurring: document.getElementById('recurring'),
  recurringRows: document.getElementById('recurring-rows'),
  recurringLoading: document.getElementById('recurring-loading'),
  recurringEmpty: document.getElementById('recurring-empty'),
  recurringError: document.getElementById('recurring-error'),
  recurringErrorText: document.getElementById('recurring-error-text'),
  recurringRetry: document.getElementById('recurring-retry'),
  recurringAdd: document.getElementById('recurring-add'),
  recurringEditor: document.getElementById('recurring-editor'),
  recurringForm: document.getElementById('recurring-form'),
  recurringEditorTitle: document.getElementById('recurring-editor-title'),
  recurringCategory: document.getElementById('recurring-category'),
  recurringAmount: document.getElementById('recurring-amount'),
  recurringDay: document.getElementById('recurring-day'),
  recurringNote: document.getElementById('recurring-note'),
  recurringActive: document.getElementById('recurring-active'),
  recurringBusy: document.getElementById('recurring-busy'),
  recurringEditorError: document.getElementById('recurring-editor-error'),
  recurringDelete: document.getElementById('recurring-delete'),
  recurringCancel: document.getElementById('recurring-cancel'),
  recurringConfirm: document.getElementById('recurring-confirm-delete'),
  recurringConfirmCategory: document.getElementById('recurring-confirm-category'),
  recurringConfirmText: document.getElementById('recurring-confirm-text'),
  recurringConfirmCancel: document.getElementById('recurring-confirm-cancel'),
  recurringConfirmOk: document.getElementById('recurring-confirm-ok'),
  recurringSave: document.querySelector('#recurring-form button[type="submit"]'),
};

let api;
let categories = [];
let editing = null;
let busy = false;
let chartType = 'expense';
let lastSummary = [];
let exporting = false;
let editingBudget = null;
let budgetBusy = false;
let editingRecurring = null;
let recurringBusy = false;
// โหลดที่ถูกทิ้งอาจพก focus มา เก็บไว้ให้โหลดล่าสุดที่ render จริงใช้
let pendingRecurringFocus = null;
const budgetsGuard = createLatestGuard();
const recurringGuard = createLatestGuard();

function setStatus(text) {
  els.status.textContent = text;
  els.status.hidden = !text;
}

const setBanner = createBannerSetter(els.banner);

function showLoadError(err) {
  // ล้างสถานะโหลดค้างในแท็บรายการ ข้อความ error ไปอยู่ที่ banner ที่เห็นทุกแท็บ
  setStatus('');
  setBanner(
    err instanceof ApiError && err.status === 401
      ? LOGIN_REQUIRED_MESSAGE
      : 'โหลดข้อมูลไม่สำเร็จ ลองใหม่อีกครั้ง'
  );
}

function fillCategoryOptions() {
  const groups = groupCategoryOptions(categories);
  for (const select of [els.category, els.recurringCategory]) {
    select.replaceChildren();
    for (const type of ['expense', 'income']) {
      const group = document.createElement('optgroup');
      group.label = TYPE_LABELS[type];
      for (const category of groups[type]) {
        const option = document.createElement('option');
        option.value = category.id;
        option.textContent = category.name;
        group.append(option);
      }
      select.append(group);
    }
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
  amount.textContent = formatSignedBaht(item);
  button.append(label, amount);
  button.addEventListener('click', () => openEditor(item));
  row.append(button);
  return row;
}

function renderChart() {
  for (const tab of els.tabs) {
    tab.setAttribute('aria-pressed', String(tab.dataset.type === chartType));
  }
  els.chartRows.replaceChildren();
  // เดือนที่ไม่มีรายการเลยมีข้อความว่างใต้รายการอยู่แล้ว ไม่ต้องแสดงซ้ำในกราฟ
  if (!hasChartData(lastSummary)) {
    els.chart.hidden = true;
    return;
  }
  const rows = chartRows(lastSummary, chartType);
  els.chart.hidden = false;
  if (rows.length === 0) {
    els.chartEmpty.textContent = chartType === 'expense' ? 'ยังไม่มีรายจ่ายในเดือนนี้' : 'ยังไม่มีรายรับในเดือนนี้';
    els.chartEmpty.hidden = false;
    return;
  }
  els.chartEmpty.hidden = true;
  for (const row of rows) {
    const item = document.createElement('li');
    item.className = `chart-row ${chartType}`;
    const label = document.createElement('span');
    label.className = 'chart-label';
    label.textContent = row.category;
    const value = document.createElement('span');
    value.className = 'chart-value';
    value.textContent = `${formatBaht(row.total)} · ${row.shareText}`;
    const track = document.createElement('div');
    track.className = 'chart-track';
    const fill = document.createElement('div');
    fill.className = 'chart-fill';
    fill.style.width = `${row.width}%`;
    track.append(fill);
    item.append(label, value, track);
    els.chartRows.append(item);
  }
}

function render({ transactions, summary, truncated }) {
  const sum = summaryTotals(summary);
  els.totals.textContent = `รายรับ ${formatBaht(sum.income)} · รายจ่าย ${formatBaht(sum.expense)}`;
  els.totals.hidden = false;
  els.truncated.hidden = !truncated;
  lastSummary = summary;
  renderChart();
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

function renderBudgets(budgets, focusCategoryId = null) {
  els.budgetRows.replaceChildren();
  els.budgetsLoading.hidden = true;
  els.budgetsError.hidden = true;
  els.budgets.hidden = false;
  for (const row of budgetRows(budgets)) {
    const item = document.createElement('li');
    item.className = `budget-row ${row.level}`;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'budget-button';
    const label = document.createElement('span');
    label.className = 'budget-label';
    label.textContent = row.category;
    const action = document.createElement('span');
    action.className = 'budget-edit';
    action.textContent = row.budget === null ? 'ตั้งงบ' : 'แก้งบ';
    const value = document.createElement('span');
    value.className = 'budget-value';
    value.textContent = row.text;
    button.append(label, action, value);
    if (row.budget !== null) {
      // ใช้ span เพราะใน button ใส่ div ไม่ได้
      const track = document.createElement('span');
      track.className = 'budget-track';
      const fill = document.createElement('span');
      fill.className = 'budget-fill';
      fill.style.width = `${row.width}%`;
      track.append(fill);
      button.append(track);
    }
    button.addEventListener('click', () => openBudgetEditor(row));
    item.append(button);
    els.budgetRows.append(item);
    // render ใหม่ทำให้ปุ่มเดิมหาย จึงคืน focus ให้ปุ่มของหมวดที่เพิ่งแก้
    if (focusCategoryId === row.categoryId) button.focus();
  }
}

function showBudgetsError(err) {
  els.budgetRows.replaceChildren();
  els.budgetsLoading.hidden = true;
  els.budgets.hidden = false;
  const loginRequired = err instanceof ApiError && err.status === 401;
  els.budgetsErrorText.textContent = loginRequired ? LOGIN_REQUIRED_MESSAGE : 'โหลดงบไม่สำเร็จ';
  // เข้าสู่ระบบใหม่ไม่ได้แก้ด้วยการลองโหลดซ้ำ
  els.budgetsRetry.hidden = loginRequired;
  els.budgetsError.hidden = false;
}

// งบโหลดแยกจากรายการ ถ้างบพังรายการยังแสดงได้ และไม่ throw เหมือน loadMonth
async function loadBudgets({ focusCategoryId = null } = {}) {
  const month = els.month.value;
  const requestId = budgetsGuard.start();
  // เดือนเดียวกันที่ถูกโหลดซ้อนกัน ผลที่ช้ากว่าและเก่ากว่าต้องไม่มาทับ
  const isCurrent = () => month === els.month.value && budgetsGuard.isCurrent(requestId);
  try {
    const { budgets } = await api.listBudgets(month);
    if (isCurrent()) renderBudgets(budgets, focusCategoryId);
  } catch (err) {
    if (isCurrent()) showBudgetsError(err);
  }
}

// ไม่ throw เพื่อให้ทุกจุดเรียกใช้แล้วข้อผิดพลาดขึ้นที่ status เสมอ
// reload หลังแก้/ลบไม่ล้างรายการ เพื่อไม่ให้หน้าเด้งกลับไปบนสุด
async function loadMonth({ reset = false } = {}) {
  const month = els.month.value;
  if (reset) {
    setBanner('');
    els.list.replaceChildren();
    els.totals.hidden = true;
    els.truncated.hidden = true;
    els.chart.hidden = true;
    // เปิดส่วนงบพร้อมข้อความโหลดไว้ก่อน รายการด้านล่างจะได้ไม่กระโดดตอนงบมาช้า
    els.budgetRows.replaceChildren();
    els.budgetsError.hidden = true;
    els.budgetsLoading.hidden = false;
    els.budgets.hidden = false;
    els.exportStatus.textContent = '';
    setStatus('กำลังโหลด...');
  }
  // โหลดงบพร้อมกันเพราะยอดใช้ในงบเปลี่ยนตามรายการที่แก้/ลบด้วย
  const budgetsLoaded = loadBudgets();
  try {
    const data = await api.listTransactions(month);
    // ทิ้งผลของเดือนเก่าเมื่อผู้ใช้เปลี่ยนเดือนไปแล้ว
    if (month === els.month.value) render(data);
  } catch (err) {
    if (month === els.month.value) showLoadError(err);
  }
  await budgetsLoaded;
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
  els.amount.value = String(item.amount);
  els.date.value = item.occurredOn;
  els.note.value = item.note || '';
  els.error.hidden = true;
  els.saveButton.disabled = categories.length === 0;
  els.editor.showModal();
  const loaded = await ensureCategories();
  // ผู้ใช้อาจปิดหรือเปิดแถวอื่นระหว่างรอ จึงห้ามแตะ editor ของ open ที่เก่าแล้ว
  if (editing !== item || !els.editor.open) return;
  if (!loaded) {
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
  els.confirmCancel.disabled = isBusy;
  els.confirmOk.disabled = isBusy;
  els.confirmOk.textContent = isBusy && kind === 'delete' ? 'กำลังลบ...' : 'ลบ';
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
  els.confirm.close();
  if (!failure) {
    els.editor.close();
    await loadMonth();
    return;
  }
  if (failure.closeAndReload) {
    els.editor.close();
    await loadMonth();
    setBanner(failure.message);
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

// ใช้ dialog ของเราเองแทน confirm ของเบราว์เซอร์ เพื่อแสดงรายละเอียดรายการที่จะลบ
els.deleteButton.addEventListener('click', () => {
  const target = describeDeleteTarget(editing);
  els.confirmTitle.textContent = target.title;
  els.confirmCategory.textContent = target.category;
  els.confirmAmount.textContent = target.amount;
  els.confirmDate.textContent = target.date;
  els.confirmNote.textContent = target.note;
  els.confirmNote.hidden = !target.note;
  els.confirm.showModal();
});

els.confirmCancel.addEventListener('click', () => els.confirm.close());
els.confirmOk.addEventListener('click', () => runEdit(() => api.deleteTransaction(editing.id), 'delete'));
els.confirm.addEventListener('cancel', (event) => {
  if (busy) event.preventDefault();
});

els.cancelButton.addEventListener('click', () => els.editor.close());
// กัน Esc ปิด dialog ระหว่างรอ request ไม่งั้นผลลัพธ์จะไม่มีที่แสดง
els.editor.addEventListener('cancel', (event) => {
  if (busy) event.preventDefault();
});
els.month.addEventListener('change', () => loadMonth({ reset: true }));

for (const tab of els.tabs) {
  tab.addEventListener('click', () => {
    chartType = tab.dataset.type;
    renderChart();
  });
}

els.exportButton.addEventListener('click', async () => {
  if (exporting || !api) return;
  const month = els.month.value;
  if (!month) {
    els.exportStatus.textContent = 'เลือกเดือนก่อนกด Export CSV';
    return;
  }
  exporting = true;
  els.exportButton.disabled = true;
  els.exportStatus.textContent = 'กำลังเตรียมไฟล์...';
  // เปลี่ยนเดือนระหว่างรอแล้ว loadMonth ล้างสถานะไปแล้ว อย่าเขียนสถานะของเดือนเก่าทับ
  const setExportStatus = (text) => {
    if (month === els.month.value) els.exportStatus.textContent = text;
  };
  try {
    const { path } = await api.createExport(month);
    // browser ในแอป LINE ดาวน์โหลดไฟล์ไม่ได้ จึงเปิดลิงก์ใน browser ภายนอก
    liff.openWindow({ url: new URL(path, window.location.origin).href, external: true });
    setExportStatus('ส่งลิงก์ไปเปิดใน browser แล้ว ถ้าไม่เห็นหน้าดาวน์โหลด กด Export CSV ใหม่ (ลิงก์ใช้ได้ครั้งเดียวภายใน 5 นาที)');
  } catch (err) {
    setExportStatus(describeExportFailure(err instanceof ApiError ? err.status : undefined));
  } finally {
    exporting = false;
    els.exportButton.disabled = false;
  }
});

function openBudgetEditor(row) {
  if (!els.month.value) return;
  editingBudget = { categoryId: row.categoryId, month: els.month.value };
  els.budgetTitle.textContent = `งบ ${row.category}`;
  els.budgetScope.textContent = `มีผลตั้งแต่เดือน ${formatMonthLabel(editingBudget.month)} เป็นต้นไป`;
  els.budgetAmount.value = row.budget === null ? '' : String(row.budget);
  els.budgetRemove.hidden = row.budget === null;
  els.budgetBusy.hidden = true;
  els.budgetError.hidden = true;
  els.budgetEditor.showModal();
}

function setBudgetBusy(isBusy) {
  budgetBusy = isBusy;
  els.budgetSave.disabled = isBusy;
  els.budgetRemove.disabled = isBusy;
  els.budgetCancel.disabled = isBusy;
  els.budgetBusy.hidden = !isBusy;
  // ข้อความ error อยู่ใน role=alert แยกจากข้อความกำลังบันทึก
  els.budgetError.hidden = true;
}

async function saveBudget(amount) {
  if (budgetBusy) return;
  const target = editingBudget;
  setBudgetBusy(true);
  let failure = null;
  try {
    await api.setBudget(target.categoryId, { month: target.month, amount });
  } catch (err) {
    failure = describeBudgetFailure(err instanceof ApiError ? err.status : undefined);
  } finally {
    setBudgetBusy(false);
  }
  if (failure) {
    els.budgetError.textContent = failure;
    els.budgetError.hidden = false;
    return;
  }
  els.budgetEditor.close();
  await loadBudgets({ focusCategoryId: target.categoryId });
}

els.budgetForm.addEventListener('submit', (event) => {
  event.preventDefault();
  saveBudget(Number(els.budgetAmount.value));
});
els.budgetRemove.addEventListener('click', () => saveBudget(null));
els.budgetCancel.addEventListener('click', () => els.budgetEditor.close());
// กัน Esc ปิด dialog ระหว่างรอ request ไม่งั้นผลลัพธ์จะไม่มีที่แสดง
els.budgetEditor.addEventListener('cancel', (event) => {
  if (budgetBusy) event.preventDefault();
});
// Esc ครั้งที่สอง browser บางตัวปิด dialog แม้ preventDefault แล้ว จึงเปิดกลับ
els.budgetEditor.addEventListener('close', () => {
  if (budgetBusy) els.budgetEditor.showModal();
});
els.budgetsRetry.addEventListener('click', () => {
  els.budgetsError.hidden = true;
  els.budgetsLoading.hidden = false;
  loadBudgets();
});

function renderRecurring(rules, focusRuleId = null) {
  els.recurringRows.replaceChildren();
  els.recurringLoading.hidden = true;
  els.recurringError.hidden = true;
  els.recurringAdd.disabled = false;
  els.recurring.hidden = false;
  els.recurringEmpty.hidden = rules.length > 0;
  for (const row of recurringRows(rules, categories)) {
    const item = document.createElement('li');
    item.className = `recurring-row${row.active ? '' : ' paused'}`;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'recurring-button';
    const title = document.createElement('span');
    title.className = 'recurring-title';
    title.textContent = row.title;
    const text = document.createElement('span');
    text.className = 'recurring-text';
    text.textContent = row.text;
    button.append(title, text);
    button.addEventListener('click', () => openRecurringEditor(row));
    item.append(button);
    els.recurringRows.append(item);
    if (focusRuleId === row.id) button.focus();
  }
}

function showRecurringError(err) {
  els.recurringRows.replaceChildren();
  els.recurringLoading.hidden = true;
  els.recurringEmpty.hidden = true;
  els.recurringAdd.disabled = false;
  els.recurring.hidden = false;
  const loginRequired = err instanceof ApiError && err.status === 401;
  els.recurringErrorText.textContent = loginRequired ? LOGIN_REQUIRED_MESSAGE : 'โหลดรายการประจำไม่สำเร็จ';
  els.recurringRetry.hidden = loginRequired;
  els.recurringError.hidden = false;
}

// รายการประจำไม่ผูกกับเดือน โหลดแยกจากรายการและงบ และไม่ throw
async function loadRecurring({ focusRuleId = null, focusAdd = false } = {}) {
  const requestId = recurringGuard.start();
  if (focusRuleId || focusAdd) pendingRecurringFocus = { focusRuleId, focusAdd };
  try {
    const { rules } = await api.listRecurring();
    // โหลดซ้อนกัน ผลที่ช้ากว่าและเก่ากว่าต้องไม่มาทับ
    if (!recurringGuard.isCurrent(requestId)) return;
    const focus = pendingRecurringFocus ?? { focusRuleId: null, focusAdd: false };
    pendingRecurringFocus = null;
    renderRecurring(rules, focus.focusRuleId);
    if (focus.focusAdd) els.recurringAdd.focus();
  } catch (err) {
    if (recurringGuard.isCurrent(requestId)) {
      // error render ไม่มีแถวให้ focus ต้องล้าง ไม่ให้ค้างไปโหลดถัดไป
      pendingRecurringFocus = null;
      showRecurringError(err);
    }
  }
}

function openRecurringEditor(row = null) {
  editingRecurring = row;
  els.recurringEditorTitle.textContent = row ? 'แก้รายการประจำ' : 'เพิ่มรายการประจำ';
  if (row) {
    els.recurringCategory.value = row.categoryId;
  } else if (els.recurringCategory.options.length > 0) {
    els.recurringCategory.selectedIndex = 0;
  }
  els.recurringAmount.value = row ? String(row.amount) : '';
  els.recurringDay.value = row ? String(row.dayOfMonth) : '';
  els.recurringNote.value = row ? row.note : '';
  els.recurringActive.checked = row ? row.active : true;
  els.recurringDelete.hidden = !row;
  els.recurringBusy.hidden = true;
  els.recurringEditorError.hidden = true;
  els.recurringEditor.showModal();
}

function setRecurringBusy(isBusy, kind) {
  recurringBusy = isBusy;
  els.recurringSave.disabled = isBusy;
  els.recurringDelete.disabled = isBusy;
  els.recurringCancel.disabled = isBusy;
  els.recurringConfirmCancel.disabled = isBusy;
  els.recurringConfirmOk.disabled = isBusy;
  els.recurringConfirmOk.textContent = isBusy && kind === 'delete' ? 'กำลังลบ...' : 'ลบ';
  els.recurringBusy.hidden = !isBusy;
  els.recurringEditorError.hidden = true;
}

async function runRecurringAction(action, kind, focusRuleId = null) {
  if (recurringBusy) return;
  setRecurringBusy(true, kind);
  let failure = null;
  let failureStatus;
  try {
    await action();
  } catch (err) {
    failureStatus = err instanceof ApiError ? err.status : undefined;
    failure = describeRecurringFailure(failureStatus, kind);
  } finally {
    setRecurringBusy(false);
  }
  // ปิด dialog ยืนยันก่อน เพื่อให้ error แสดงในฟอร์มที่อยู่ข้างหลังได้
  els.recurringConfirm.close();
  // กฎถูกลบไปแล้ว: ปิดฟอร์ม โหลดใหม่ แล้วแจ้งที่สถานะหน้า เหมือนตัวแก้รายการ
  if (failure && shouldCloseRecurringEditor(failureStatus)) {
    els.recurringEditor.close();
    await loadRecurring();
    setBanner(failure);
    return;
  }
  if (failure) {
    els.recurringEditorError.textContent = failure;
    els.recurringEditorError.hidden = false;
    return;
  }
  els.recurringEditor.close();
  await loadRecurring({ focusRuleId, focusAdd: !focusRuleId });
}

els.recurringAdd.addEventListener('click', () => openRecurringEditor(null));
els.recurringForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const body = {
    categoryId: els.recurringCategory.value,
    amount: Number(els.recurringAmount.value),
    dayOfMonth: Number(els.recurringDay.value),
    note: els.recurringNote.value,
    active: els.recurringActive.checked,
  };
  const target = editingRecurring;
  runRecurringAction(() => (target ? api.updateRecurring(target.id, body) : api.createRecurring(body)), 'save', target ? target.id : null);
});
// ถามยืนยันก่อนลบ เพื่อกันกดพลาด
els.recurringDelete.addEventListener('click', () => {
  els.recurringConfirmCategory.textContent = editingRecurring.title;
  els.recurringConfirmText.textContent = editingRecurring.text;
  els.recurringConfirm.showModal();
});
els.recurringConfirmCancel.addEventListener('click', () => els.recurringConfirm.close());
els.recurringConfirmOk.addEventListener('click', () => {
  const target = editingRecurring;
  runRecurringAction(() => api.deleteRecurring(target.id), 'delete');
});
els.recurringConfirm.addEventListener('cancel', (event) => {
  if (recurringBusy) event.preventDefault();
});
els.recurringCancel.addEventListener('click', () => els.recurringEditor.close());
els.recurringEditor.addEventListener('cancel', (event) => {
  if (recurringBusy) event.preventDefault();
});
els.recurringEditor.addEventListener('close', () => {
  if (recurringBusy) els.recurringEditor.showModal();
});
els.recurringRetry.addEventListener('click', () => {
  els.recurringError.hidden = true;
  els.recurringLoading.hidden = false;
  loadRecurring();
});

const tabController = createTabController({
  doc: document,
  nav: document.getElementById('bottom-nav'),
  titleEl: document.getElementById('page-title'),
  monthEl: els.month,
  panelFor: (id) => document.getElementById(`panel-${id}`),
  onChange: () => {
    setBanner('');
    window.scrollTo(0, 0);
  },
});
tabController.select(DEFAULT_TAB);

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
    els.exportButton.disabled = false;
    els.month.value = currentMonth(new Date());
    ({ categories } = await api.listCategories());
    fillCategoryOptions();
    // เปิดส่วนรายการประจำพร้อมข้อความโหลดไว้ก่อน จะได้ไม่เด้งเข้ามาทีหลัง
    els.recurringEmpty.hidden = true;
    els.recurringError.hidden = true;
    els.recurringLoading.hidden = false;
    els.recurring.hidden = false;
    await Promise.all([loadMonth({ reset: true }), loadRecurring()]);
  } catch (err) {
    showLoadError(err);
  }
}

boot();

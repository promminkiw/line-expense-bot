import { createApi, ApiError, REQUEST_TIMEOUT_MS, NGROK_SKIP_WARNING_HEADERS } from './api.mjs';
import {
  formatBaht,
  formatSignedBaht,
  describeDeleteTarget,
  formatThaiDate,
  currentMonth,
  groupByDate,
  formatDayNet,
  summaryTotals,
  chartRows,
  hasChartData,
  describeExportFailure,
  groupCategoryOptions,
  describeEditFailure,
  budgetRows,
  createLatestGuard,
  profileView,
  formatMonthLabel,
  describeBudgetFailure,
  recurringRows,
  describeRecurringFailure,
  shouldCloseRecurringEditor,
  filterTransactions,
  trendBars,
  describeExpenseComparison,
  isFilterActive,
  describeFilterResult,
  LOGIN_REQUIRED_MESSAGE,
} from './format.mjs';
import { createFriendsPanel } from './friends-panel.mjs';
import { createBannerSetter } from './banner.mjs';
import { DEFAULT_TAB, createTabController } from './tabs.mjs';
import { categoryStyle, createCategoryBadge } from './categories.mjs';
import { parseEditLink, parseFriendLink } from './deep-link.mjs';
import { createSwipeTracker } from './swipe.mjs';
import { createSkeletonRows, createSkeletonBlocks, createLoadingIndicator } from './skeleton.mjs';
import { animateNumber, replayClass, playBars } from './motion.mjs';
import { createEmptyState } from './empty-state.mjs';

const TYPE_LABELS = { expense: 'รายจ่าย', income: 'รายรับ' };

const els = {
  month: document.getElementById('month'),
  totals: document.getElementById('totals'),
  statIncome: document.getElementById('stat-income'),
  statExpense: document.getElementById('stat-expense'),
  statBalance: document.getElementById('stat-balance'),
  summaryEmpty: document.getElementById('summary-empty'),
  panelSummary: document.getElementById('panel-summary'),
  panelBudgets: document.getElementById('panel-budgets'),
  truncated: document.getElementById('truncated'),
  exportButton: document.getElementById('export-button'),
  exportStatus: document.getElementById('export-status'),
  chart: document.getElementById('chart'),
  chartRows: document.getElementById('chart-rows'),
  chartEmpty: document.getElementById('chart-empty'),
  tabs: document.querySelectorAll('#chart .tabs button'),
  status: document.getElementById('status'),
  banner: document.getElementById('banner'),
  bannerRetry: document.getElementById('banner-retry'),
  list: document.getElementById('list'),
  filters: document.getElementById('filters'),
  search: document.getElementById('search'),
  filterType: document.getElementById('filter-type'),
  filterCategory: document.getElementById('filter-category'),
  filterClear: document.getElementById('filter-clear'),
  filterStatus: document.getElementById('filter-status'),
  editor: document.getElementById('editor'),
  form: document.getElementById('edit-form'),
  amount: document.getElementById('edit-amount'),
  category: document.getElementById('edit-category'),
  date: document.getElementById('edit-date'),
  note: document.getElementById('edit-note'),
  error: document.getElementById('edit-error'),
  busy: document.getElementById('edit-busy'),
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
  budgetsSkeleton: document.getElementById('budgets-skeleton'),
  summarySkeleton: document.getElementById('summary-skeleton'),
  listHeadSkeleton: document.getElementById('list-head-skeleton'),
  budgetsError: document.getElementById('budgets-error'),
  budgetsErrorText: document.getElementById('budgets-error-text'),
  budgetsRetry: document.getElementById('budgets-retry'),
  trendBars: document.getElementById('trend-bars'),
  trendEmpty: document.getElementById('trend-empty'),
  trendComparison: document.getElementById('trend-comparison'),
  trendLegend: document.getElementById('trend-legend'),
  trendLoading: document.getElementById('trend-loading'),
  trendSkeleton: document.getElementById('trend-skeleton'),
  trendError: document.getElementById('trend-error'),
  trendErrorText: document.getElementById('trend-error-text'),
  trendRetry: document.getElementById('trend-retry'),
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
  recurringSkeleton: document.getElementById('recurring-skeleton'),
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
  profileCard: document.getElementById('profile-card'),
  profileAvatar: document.getElementById('profile-avatar'),
  profileName: document.getElementById('profile-name'),
  profileSince: document.getElementById('profile-since'),
  profileBalance: document.getElementById('profile-balance'),
  profileIncome: document.getElementById('profile-income'),
  profileExpense: document.getElementById('profile-expense'),
  profileCount: document.getElementById('profile-count'),
  profileLoading: document.getElementById('profile-loading'),
  profileSkeleton: document.getElementById('profile-skeleton'),
  profileError: document.getElementById('profile-error'),
  profileErrorText: document.getElementById('profile-error-text'),
  profileRetry: document.getElementById('profile-retry'),
  profileClose: document.getElementById('profile-close'),
  profileStaleNotice: document.getElementById('profile-stale'),
};

let api;
let categories = [];
let editing = null;
let busy = false;
let chartType = 'expense';
let lastSummary = [];
let lastTransactions = [];
let lastTruncated = false;
let exporting = false;
let editingBudget = null;
let budgetBusy = false;
let editingRecurring = null;
let recurringBusy = false;
// โหลดที่ถูกทิ้งอาจพก focus มา เก็บไว้ให้โหลดล่าสุดที่ render จริงใช้
let pendingRecurringFocus = null;
const budgetsGuard = createLatestGuard();
const recurringGuard = createLatestGuard();
const budgetsLoading = createLoadingIndicator({ doc: document, textEl: els.budgetsLoading, skeletonEl: els.budgetsSkeleton, count: 4, variant: 'budget' });
const recurringLoading = createLoadingIndicator({ doc: document, textEl: els.recurringLoading, skeletonEl: els.recurringSkeleton, count: 3, variant: 'recurring' });
const trendGuard = createLatestGuard();
const trendLoading = createLoadingIndicator({ doc: document, textEl: els.trendLoading, skeletonEl: els.trendSkeleton, variants: ['trend'] });
const profileGuard = createLatestGuard();
const profileLoading = createLoadingIndicator({ doc: document, textEl: els.profileLoading, skeletonEl: els.profileSkeleton, variants: ['profile-head', 'balance', 'stats', 'tips'] });
let profileRendered = false;
let profileLoginRequired = false;
// ยอดอาจเก่ากว่าข้อมูลจริง (แก้/ลบรายการแล้ว หรือโหลดซ้ำพัง) ต้องโหลดใหม่เมื่อเข้าแท็บ
let profileStale = false;
let profileInFlight = false;

// LIFF ID มาจาก /api/config ตอน boot ใช้สร้างลิงก์ชวนเพื่อน
let liffId = null;
const friendsPanel = createFriendsPanel({
  doc: document,
  els: {
    section: document.getElementById('friends'),
    loadingText: document.getElementById('friends-loading'),
    skeleton: document.getElementById('friends-skeleton'),
    addSubmit: document.getElementById('friend-add-submit'),
    error: document.getElementById('friends-error'),
    errorText: document.getElementById('friends-error-text'),
    retry: document.getElementById('friends-retry'),
    body: document.getElementById('friends-body'),
    code: document.getElementById('friend-code'),
    share: document.getElementById('friend-share'),
    qrToggle: document.getElementById('friend-qr-toggle'),
    qr: document.getElementById('friend-qr'),
    renew: document.getElementById('friend-code-renew'),
    status: document.getElementById('friend-status'),
    form: document.getElementById('friend-add-form'),
    input: document.getElementById('friend-code-input'),
    addError: document.getElementById('friend-add-error'),
    rows: document.getElementById('friend-rows'),
    empty: document.getElementById('friends-empty'),
    dialog: document.getElementById('friend-dialog'),
    dialogTitle: document.getElementById('friend-dialog-title'),
    dialogText: document.getElementById('friend-dialog-text'),
    dialogError: document.getElementById('friend-dialog-error'),
    dialogOk: document.getElementById('friend-dialog-ok'),
    dialogCancel: document.getElementById('friend-dialog-cancel'),
  },
  getApi: () => api,
  liff,
  getLiffId: () => liffId,
  clipboard: navigator.clipboard,
});
els.summarySkeleton.replaceChildren(createSkeletonBlocks(document, ['chart']));
els.listHeadSkeleton.replaceChildren(createSkeletonBlocks(document, ['totals', 'filters']));
els.summaryEmpty.append(createEmptyState(document, 'summary'));
els.recurringEmpty.append(createEmptyState(document, 'recurring'));

// เก็บค่าเดิมและตัวยกเลิกของแต่ละช่อง เพื่อนับต่อจากค่าเดิมและไม่ให้แอนิเมชันซ้อนกัน
const shownAmounts = new Map();
function showAmount(el, value) {
  const previous = shownAmounts.get(el);
  if (previous) previous.cancel();
  const from = previous ? previous.value : 0;
  const cancel = animateNumber({
    win: window,
    from,
    to: value,
    onFrame: (current) => {
      el.textContent = formatBaht(Math.round(current * 100) / 100);
    },
  });
  shownAmounts.set(el, { value, cancel });
}

function setStatus(text, { loading = false } = {}) {
  els.status.textContent = text;
  els.status.hidden = !text;
  // ข้อความโหลดยังอยู่ให้ screen reader แต่ทางสายตาใช้ skeleton แทน
  els.status.classList.toggle('sr-only', loading);
}

const setBannerText = createBannerSetter(els.banner);

function setBanner(text, { retryable = false } = {}) {
  setBannerText(text);
  els.bannerRetry.hidden = !text || !retryable;
}

// error โหลดข้อมูลค้างไว้ข้ามการสลับแท็บ เพราะแท็บอื่นไม่มีที่แสดงข้อความของตัวเอง
let loadError = null;

function showLoadError(err) {
  const loginRequired = err instanceof ApiError && err.status === 401;
  loadError = {
    text: loginRequired ? LOGIN_REQUIRED_MESSAGE : 'โหลดข้อมูลไม่สำเร็จ ลองใหม่อีกครั้ง',
    // เข้าสู่ระบบใหม่ไม่ได้แก้ด้วยการลองโหลดซ้ำ
    retryable: !loginRequired,
  };
  // ล้างเฉพาะ skeleton ที่ค้าง ไม่ล้างรายการจริงและแถบกรองตอน reload ล้มเหลว
  if (els.list.querySelector('.skeleton')) {
    els.list.replaceChildren();
    els.filters.hidden = true;
  }
  els.listHeadSkeleton.hidden = true;
  els.summarySkeleton.hidden = true;
  // ล้างสถานะโหลดค้างในแท็บรายการ ข้อความ error ไปอยู่ที่ banner ที่เห็นทุกแท็บ
  setStatus('');
  setBanner(loadError.text, { retryable: loadError.retryable });
}

function showStickyLoadError() {
  setBanner(loadError ? loadError.text : '', { retryable: loadError ? loadError.retryable : false });
}

function fillGroupedSelect(select, groups, placeholderOption = null) {
  const selected = select.value;
  select.replaceChildren();
  if (placeholderOption) select.append(placeholderOption);
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
  return selected;
}

function fillCategoryOptions() {
  const groups = groupCategoryOptions(categories);
  fillGroupedSelect(els.category, groups);
  fillGroupedSelect(els.recurringCategory, groups);
  const selected = fillGroupedSelect(els.filterCategory, groups, new Option('ทุกหมวด', ''));
  // คืนค่าที่เลือกไว้เฉพาะเมื่อยังมีตัวเลือกนั้น ไม่งั้น select จะว่าง
  els.filterCategory.value = selected;
  if (els.filterCategory.value !== selected) els.filterCategory.value = '';
}

const SWIPE_REVEAL_WIDTH = 88;
// เมาส์ยิง click ตามหลังการลากเสร็จ จึงเมินคลิกที่มาติดกับการปัด (นิ้วบนมือถือไม่ยิง click หลังลาก)
const CLICK_AFTER_DRAG_MS = 300;
const LINKED_TRANSACTION_MISSING = 'ไม่พบรายการนี้ อาจถูกลบหรือยกเลิกไปแล้ว';
let openSwipeRow = null;
// แถวที่จะรับ focus หลังโหลดรายการใหม่ (ปุ่มของแถวเดิมถูกถอดไปตอน reload)
let pendingListFocus = null;
let lastDragEndAt = 0;
let swipeDeleting = false;

function setRowOpen(row, open) {
  if (open) {
    if (openSwipeRow && openSwipeRow !== row) setRowOpen(openSwipeRow, false);
    openSwipeRow = row;
  } else if (openSwipeRow === row) {
    openSwipeRow = null;
  }
  row.classList.remove('dragging');
  row.classList.toggle('swiped', open);
  row.style.setProperty('--swipe', `${open ? SWIPE_REVEAL_WIDTH : 0}px`);
}

function attachSwipe(row) {
  const swipe = createSwipeTracker({ revealWidth: SWIPE_REVEAL_WIDTH });
  let tracking = false;
  let captured = false;
  row.addEventListener('pointerdown', (event) => {
    if (event.button > 0 || event.isPrimary === false) return;
    tracking = true;
    captured = false;
    swipe.start(event.clientX, event.clientY, row === openSwipeRow ? SWIPE_REVEAL_WIDTH : 0);
  });
  row.addEventListener('pointermove', (event) => {
    if (!tracking) return;
    const state = swipe.move(event.clientX, event.clientY);
    if (!state.dragging) return;
    if (!captured) {
      captured = true;
      // ให้เมาส์ที่ลากออกนอกแถวยังส่ง pointerup กลับมา
      try {
        row.setPointerCapture(event.pointerId);
      } catch {
        // เบราว์เซอร์ที่ไม่รองรับ (หรือ jsdom) ข้ามได้
      }
    }
    row.classList.add('dragging');
    row.style.setProperty('--swipe', `${state.offset}px`);
  });
  const finish = () => {
    if (!tracking) return;
    tracking = false;
    const result = swipe.end();
    if (result.dragged) lastDragEndAt = Date.now();
    setRowOpen(row, result.open);
  };
  row.addEventListener('pointerup', finish);
  row.addEventListener('pointercancel', finish);
}

// ปุ่มลบที่เผยจากการปัดลบทันที (ปัด + กดปุ่ม คือสองขั้นที่ผู้ใช้เลือกแทน modal ยืนยัน)
async function deleteBySwipe(item, button) {
  if (swipeDeleting) return;
  swipeDeleting = true;
  button.disabled = true;
  const tab = tabController.current;
  const focusId = neighbourRowId(item.id);
  let failure = null;
  try {
    await api.deleteTransaction(item.id);
  } catch (err) {
    failure = describeEditFailure(err instanceof ApiError ? err.status : undefined, 'delete');
  } finally {
    swipeDeleting = false;
  }
  if (!failure || failure.closeAndReload) {
    pendingListFocus = { id: focusId };
    await loadMonth();
    pendingListFocus = null;
    profileStale = true;
    loadProfile();
  } else {
    button.disabled = false;
  }
  // ผู้ใช้ย้ายไปแท็บอื่นระหว่างรอแล้ว ข้อความนี้เป็นเรื่องของแท็บรายการ จึงไม่ขึ้นในแท็บใหม่
  if (failure && tabController.current === tab) setBanner(failure.message);
}

// แถวที่อยู่ติดกันที่ยังเห็นอยู่ ใช้รับ focus หลังลบ (ถัดไปก่อน ไม่มีก็แถวก่อนหน้า)
function neighbourRowId(id) {
  const rows = [...els.list.querySelectorAll('.row')];
  const index = rows.findIndex((row) => row.dataset.id === id);
  const neighbour = index === -1 ? null : rows[index + 1] || rows[index - 1];
  return neighbour ? neighbour.dataset.id : null;
}

function applyPendingListFocus() {
  if (!pendingListFocus) return;
  const { id } = pendingListFocus;
  pendingListFocus = null;
  const row = id ? [...els.list.querySelectorAll('.row')].find((candidate) => candidate.dataset.id === id) : null;
  // ไม่มีแถวให้โฟกัสแล้ว (เดือนว่างหรือลบแถวสุดท้าย) ให้อยู่ที่ตัวเลือกเดือน
  (row ? row.querySelector('.row-button') : els.month).focus();
}

// ใช้ textContent ทุกจุดเพราะโน้ตมาจากข้อความที่ผู้ใช้พิมพ์
function renderRow(item) {
  const row = document.createElement('li');
  row.dataset.id = item.id;
  row.className = `row ${item.type} ${categoryStyle(item.categoryName).className}`;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'row-button';
  const text = document.createElement('span');
  text.className = 'row-text';
  const title = document.createElement('span');
  title.className = 'row-title';
  title.textContent = item.categoryName;
  text.append(title);
  if (item.note) {
    const note = document.createElement('span');
    note.className = 'row-note';
    note.textContent = item.note;
    text.append(note);
  }
  const amount = document.createElement('span');
  amount.className = 'amount';
  amount.textContent = formatSignedBaht(item);
  button.append(createCategoryBadge(document, item.categoryName), text, amount);
  button.addEventListener('click', () => {
    if (Date.now() - lastDragEndAt < CLICK_AFTER_DRAG_MS) return;
    // แถวที่เผยปุ่มลบอยู่ แตะเนื้อหาให้ปิดก่อน ไม่เปิดตัวแก้ไข
    if (row === openSwipeRow) {
      setRowOpen(row, false);
      return;
    }
    openEditor(item);
  });
  const deleteButton = document.createElement('button');
  deleteButton.type = 'button';
  deleteButton.className = 'row-delete';
  deleteButton.setAttribute('aria-label', `ลบรายการ ${item.categoryName}`);
  deleteButton.textContent = 'ลบ';
  deleteButton.addEventListener('click', () => deleteBySwipe(item, deleteButton));
  row.append(deleteButton, button);
  attachSwipe(row);
  return row;
}

// animate = true เฉพาะตอนโหลดเดือนใหม่ ส่วน render ซ้ำหลังแก้ไขต้องอัปเดตเงียบๆ ไม่ให้แท่งกระพริบ
function renderChart({ animate = false } = {}) {
  for (const tab of els.tabs) {
    tab.setAttribute('aria-pressed', String(tab.dataset.type === chartType));
  }
  els.chartRows.replaceChildren();
  if (!hasChartData(lastSummary)) {
    els.chart.hidden = true;
    els.summaryEmpty.hidden = false;
    return;
  }
  els.summaryEmpty.hidden = true;
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
    label.className = 'chart-label chart-label-wrap';
    const labelText = document.createElement('span');
    labelText.textContent = row.category;
    label.append(createCategoryBadge(document, row.category), labelText);
    const value = document.createElement('span');
    value.className = 'chart-value';
    value.textContent = `${formatBaht(row.total)} · ${row.shareText}`;
    const track = document.createElement('div');
    track.className = 'chart-track';
    const fill = document.createElement('div');
    fill.className = 'chart-fill';
    fill.style.width = `${row.width}%`;
    fill.dataset.width = String(row.width);
    track.append(fill);
    item.append(label, value, track);
    els.chartRows.append(item);
  }
  if (animate && !els.panelSummary.hidden) playBars(window, els.chartRows);
}

function render({ transactions, summary, truncated }, { animate = false } = {}) {
  if (loadError) {
    loadError = null;
    setBanner('');
  }
  els.listHeadSkeleton.hidden = true;
  els.summarySkeleton.hidden = true;
  const sum = summaryTotals(summary);
  showAmount(els.statIncome, sum.income);
  showAmount(els.statExpense, sum.expense);
  showAmount(els.statBalance, Math.round((sum.income - sum.expense) * 100) / 100);
  els.totals.hidden = false;
  els.truncated.hidden = !truncated;
  lastSummary = summary;
  renderChart({ animate });
  els.list.replaceChildren();
  // เข้าฉากแถวเฉพาะตอนโหลดเดือนใหม่ render หลังแก้ไขต้องไม่เล่นซ้ำ
  if (animate) replayClass(els.list, 'enter');
  else els.list.classList.remove('enter');
  lastTransactions = transactions;
  lastTruncated = truncated;
  renderList();
}

function currentFilter() {
  return { query: els.search.value, categoryId: els.filterCategory.value, type: els.filterType.value };
}

// ไม่แตะ class enter: การกรองต้องไม่เล่นแอนิเมชันเข้าฉากแถวซ้ำ
function renderList() {
  // ระหว่างโหลดหรือโหลดพลาด ห้ามล้าง skeleton ด้วยสถานะว่างปลอม
  if (els.filters.hidden && els.list.querySelector('.skeleton')) return;
  const filter = currentFilter();
  const active = isFilterActive(filter);
  const shown = filterTransactions(lastTransactions, filter);
  els.list.replaceChildren();
  openSwipeRow = null;
  // ซ่อนตัวกรองเมื่อเดือนว่างและไม่ได้กรองอยู่ ไม่งั้นผู้ใช้ติดค้างโดยล้างตัวกรองไม่ได้
  els.filters.hidden = lastTransactions.length === 0 && !active;
  els.filterClear.hidden = !active;
  const filterText = active ? describeFilterResult(shown.length, lastTransactions.length, lastTruncated) : '';
  // เขียนเฉพาะเมื่อข้อความเปลี่ยน ไม่ให้ screen reader อ่านซ้ำทุกตัวอักษร
  if (els.filterStatus.textContent !== filterText) els.filterStatus.textContent = filterText;
  if (lastTransactions.length === 0) {
    // ให้ screen reader ได้ยินว่าเดือนว่าง ส่วนทางสายตาใช้ empty state แทน
    setStatus('ยังไม่มีรายการในเดือนนี้', { loading: true });
    els.list.append(createEmptyState(document, 'list', 'li'));
    applyPendingListFocus();
    return;
  }
  if (shown.length === 0) {
    // ตัวกรองบอก "พบ 0 จาก N" ใน filter-status อยู่แล้ว จึงไม่ประกาศซ้ำ
    setStatus('');
    els.list.append(createEmptyState(document, 'search', 'li'));
    applyPendingListFocus();
    return;
  }
  setStatus('');
  let rowIndex = 0;
  for (const group of groupByDate(shown)) {
    const heading = document.createElement('li');
    heading.className = 'day';
    const date = document.createElement('span');
    date.className = 'day-date';
    date.textContent = formatThaiDate(group.date);
    const net = document.createElement('span');
    net.className = 'day-net';
    net.textContent = formatDayNet(group.items);
    heading.append(date, net);
    els.list.append(heading);
    for (const item of group.items) {
      const rowEl = renderRow(item);
      rowEl.style.setProperty('--i', String(Math.min(rowIndex, 10)));
      rowIndex += 1;
      els.list.append(rowEl);
    }
  }
  applyPendingListFocus();
}

function renderBudgets(budgets, focusCategoryId = null, { animate = false } = {}) {
  els.budgetRows.replaceChildren();
  budgetsLoading.set(false);
  els.budgetsError.hidden = true;
  els.budgets.hidden = false;
  for (const row of budgetRows(budgets)) {
    const item = document.createElement('li');
    item.className = `budget-row ${row.level}`;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'budget-button';
    const label = document.createElement('span');
    label.className = 'budget-label budget-label-wrap';
    const labelText = document.createElement('span');
    labelText.textContent = row.category;
    label.append(createCategoryBadge(document, row.category), labelText);
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
      fill.dataset.width = String(row.width);
      track.append(fill);
      button.append(track);
    }
    button.addEventListener('click', () => openBudgetEditor(row));
    item.append(button);
    els.budgetRows.append(item);
    // render ใหม่ทำให้ปุ่มเดิมหาย จึงคืน focus ให้ปุ่มของหมวดที่เพิ่งแก้
    if (focusCategoryId === row.categoryId) button.focus();
  }
  if (animate && !els.panelBudgets.hidden) playBars(window, els.budgetRows);
}

function showBudgetsError(err) {
  els.budgetRows.replaceChildren();
  budgetsLoading.set(false);
  els.budgets.hidden = false;
  const loginRequired = err instanceof ApiError && err.status === 401;
  els.budgetsErrorText.textContent = loginRequired ? LOGIN_REQUIRED_MESSAGE : 'โหลดงบไม่สำเร็จ';
  // เข้าสู่ระบบใหม่ไม่ได้แก้ด้วยการลองโหลดซ้ำ
  els.budgetsRetry.hidden = loginRequired;
  els.budgetsError.hidden = false;
}

// แท่งวาดที่ความสูงสุดท้ายไว้เลย แล้วเล่นแอนิเมชันเฉพาะตอน animate และแท็บสรุปมองเห็นอยู่
function renderTrend(months, currentMonthKey, { animate = false } = {}) {
  trendLoading.set(false);
  els.trendError.hidden = true;
  els.trendBars.replaceChildren();
  for (const bar of trendBars(months)) {
    const item = document.createElement('li');
    item.className = `trend-col${bar.month === currentMonthKey ? ' current' : ''}`;
    const pair = document.createElement('div');
    pair.className = 'trend-pair';
    pair.setAttribute('aria-hidden', 'true');
    for (const [kind, height] of [['income', bar.incomeHeight], ['expense', bar.expenseHeight]]) {
      const column = document.createElement('span');
      column.className = `trend-bar ${kind}`;
      column.style.height = `${height}%`;
      column.dataset.width = String(height);
      column.dataset.property = 'height';
      pair.append(column);
    }
    const label = document.createElement('span');
    label.className = 'trend-label';
    label.setAttribute('aria-hidden', 'true');
    label.textContent = bar.label;
    const description = document.createElement('span');
    description.className = 'sr-only';
    description.textContent = bar.description;
    item.append(pair, label, description);
    els.trendBars.append(item);
  }
  // ทั้ง 6 เดือนเป็นศูนย์ ไม่มีอะไรให้วาด บอกผู้ใช้แทนการโชว์แกนว่าง
  const hasData = months.some((month) => month.income > 0 || month.expense > 0);
  els.trendEmpty.hidden = hasData;
  els.trendBars.hidden = !hasData;
  els.trendLegend.hidden = !hasData;
  const comparison = hasData ? describeExpenseComparison(months) : { text: '', level: '' };
  els.trendComparison.textContent = comparison.text;
  els.trendComparison.className = `trend-comparison ${comparison.level}`;
  els.trendComparison.hidden = !comparison.text;
  if (animate && hasData && !els.panelSummary.hidden) playBars(window, els.trendBars);
}

function showTrendError(err) {
  trendLoading.set(false);
  els.trendEmpty.hidden = true;
  els.trendBars.hidden = true;
  els.trendLegend.hidden = true;
  els.trendComparison.hidden = true;
  const loginRequired = err instanceof ApiError && err.status === 401;
  els.trendErrorText.textContent = loginRequired ? LOGIN_REQUIRED_MESSAGE : 'โหลดกราฟแนวโน้มไม่สำเร็จ';
  els.trendRetry.hidden = loginRequired;
  els.trendError.hidden = false;
}

// กราฟแนวโน้มโหลดแยกจากรายการ ถ้าพังส่วนอื่นยังใช้ได้ และไม่ throw
async function loadTrend({ animate = false } = {}) {
  const month = els.month.value;
  const requestId = trendGuard.start();
  const isCurrent = () => month === els.month.value && trendGuard.isCurrent(requestId);
  try {
    const { months } = await api.getTrend(month);
    if (isCurrent()) renderTrend(months, month, { animate });
  } catch (err) {
    if (isCurrent()) showTrendError(err);
  }
}

function renderProfile(profile) {
  const view = profileView(profile);
  profileRendered = true;
  profileLoginRequired = false;
  profileStale = false;
  els.profileStaleNotice.hidden = true;
  profileLoading.set(false);
  els.profileError.hidden = true;
  els.profileAvatar.textContent = view.initial;
  els.profileName.textContent = view.name;
  els.profileSince.textContent = view.sinceText;
  showAmount(els.profileBalance, view.balance);
  els.profileBalance.classList.toggle('negative', view.negative);
  els.profileIncome.textContent = view.incomeText;
  els.profileExpense.textContent = view.expenseText;
  els.profileCount.textContent = view.countText;
  els.profileCard.hidden = false;
}

function showProfileError(err) {
  // โหลดซ้ำที่พังไม่ควรทับการ์ดที่แสดงอยู่แล้ว
  if (profileRendered) {
    profileStale = true;
    els.profileStaleNotice.hidden = false;
    return;
  }
  profileLoading.set(false);
  const loginRequired = err instanceof ApiError && err.status === 401;
  profileLoginRequired = loginRequired;
  els.profileErrorText.textContent = loginRequired ? LOGIN_REQUIRED_MESSAGE : 'โหลดโปรไฟล์ไม่สำเร็จ';
  els.profileRetry.hidden = loginRequired;
  els.profileError.hidden = false;
}

// ยอดสะสมไม่ผูกกับเดือน โหลดแยกและไม่ throw
async function loadProfile() {
  const requestId = profileGuard.start();
  profileInFlight = true;
  try {
    const profile = await api.getProfile();
    if (profileGuard.isCurrent(requestId)) renderProfile(profile);
  } catch (err) {
    if (profileGuard.isCurrent(requestId)) showProfileError(err);
  } finally {
    if (profileGuard.isCurrent(requestId)) profileInFlight = false;
  }
}

// เข้าแท็บโปรไฟล์แล้วยอดเก่าหรือยังไม่เคยโหลดสำเร็จ ให้โหลดใหม่
function refreshProfileOnEntry() {
  // ต้องเข้าสู่ระบบใหม่ ขอซ้ำทุกครั้งที่เข้าแท็บก็ได้ 401 เหมือนเดิม
  if (!api || profileInFlight || profileLoginRequired || (profileRendered && !profileStale)) return;
  if (!profileRendered) {
    els.profileError.hidden = true;
    profileLoading.set(true);
  }
  loadProfile();
}

// งบโหลดแยกจากรายการ ถ้างบพังรายการยังแสดงได้ และไม่ throw เหมือน loadMonth
async function loadBudgets({ focusCategoryId = null, animate = false } = {}) {
  const month = els.month.value;
  const requestId = budgetsGuard.start();
  // เดือนเดียวกันที่ถูกโหลดซ้อนกัน ผลที่ช้ากว่าและเก่ากว่าต้องไม่มาทับ
  const isCurrent = () => month === els.month.value && budgetsGuard.isCurrent(requestId);
  try {
    const { budgets } = await api.listBudgets(month);
    if (isCurrent()) renderBudgets(budgets, focusCategoryId, { animate });
  } catch (err) {
    if (isCurrent()) showBudgetsError(err);
  }
}

// ไม่ throw เพื่อให้ทุกจุดเรียกใช้แล้วข้อผิดพลาดขึ้นที่ banner เสมอ
// reload หลังแก้/ลบไม่ล้างรายการ เพื่อไม่ให้หน้าเด้งกลับไปบนสุด
async function loadMonth({ reset = false } = {}) {
  const month = els.month.value;
  if (reset) {
    loadError = null;
    setBanner('');
    els.list.replaceChildren(createSkeletonRows(document, 6, 'row'));
    els.listHeadSkeleton.hidden = false;
    els.totals.hidden = true;
    els.truncated.hidden = true;
    els.filters.hidden = true;
    lastTransactions = [];
    lastTruncated = false;
    els.chart.hidden = true;
    els.summaryEmpty.hidden = true;
    els.summarySkeleton.hidden = false;
    // เปิดส่วนงบพร้อมข้อความโหลดไว้ก่อน รายการด้านล่างจะได้ไม่กระโดดตอนงบมาช้า
    els.budgetRows.replaceChildren();
    els.budgetsError.hidden = true;
    budgetsLoading.set(true);
    els.budgets.hidden = false;
    els.trendEmpty.hidden = true;
    els.trendBars.hidden = true;
    els.trendLegend.hidden = true;
    els.trendComparison.hidden = true;
    els.trendError.hidden = true;
    trendLoading.set(true);
    els.exportStatus.textContent = '';
    setStatus('กำลังโหลด...', { loading: true });
  }
  // โหลดงบพร้อมกันเพราะยอดใช้ในงบเปลี่ยนตามรายการที่แก้/ลบด้วย
  const budgetsLoaded = loadBudgets({ animate: reset });
  const trendLoaded = loadTrend({ animate: reset });
  try {
    const data = await api.listTransactions(month);
    // ทิ้งผลของเดือนเก่าเมื่อผู้ใช้เปลี่ยนเดือนไปแล้ว
    if (month === els.month.value) render(data, { animate: reset });
  } catch (err) {
    if (month === els.month.value) showLoadError(err);
  }
  await budgetsLoaded;
  await trendLoaded;
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
  els.busy.textContent = isBusy ? (kind === 'delete' ? 'กำลังลบ...' : 'กำลังบันทึก...') : '';
  els.busy.hidden = !isBusy;
  // เริ่มงานใหม่ล้างข้อความผิดพลาดเก่า ส่วนตอนจบให้ผู้เรียกตั้งข้อความผิดพลาดเอง
  if (isBusy) {
    els.error.textContent = '';
    els.error.hidden = true;
  }
}

async function runEdit(action, kind) {
  if (busy) return;
  // แก้แล้วกลับไปที่แถวเดิม ลบแล้วไปแถวข้างเคียง
  const focusId = kind === 'delete' ? neighbourRowId(editing.id) : editing.id;
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
    pendingListFocus = { id: focusId };
    await loadMonth();
    pendingListFocus = null;
    profileStale = true;
    loadProfile();
    return;
  }
  if (failure.closeAndReload) {
    els.editor.close();
    pendingListFocus = { id: focusId };
    await loadMonth();
    pendingListFocus = null;
    profileStale = true;
    loadProfile();
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

// ถอด enter ก่อนกรอง ไม่งั้นแถวที่สร้างใหม่จะเล่นแอนิเมชันเข้าฉากตาม CSS แล้วกระพริบตอนพิมพ์
function refilter() {
  els.list.classList.remove('enter');
  renderList();
}
for (const control of [els.search, els.filterType, els.filterCategory]) {
  control.addEventListener('input', refilter);
}
els.filterClear.addEventListener('click', () => {
  els.search.value = '';
  els.filterType.value = '';
  els.filterCategory.value = '';
  refilter();
  els.search.focus();
});

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
  budgetsLoading.set(true);
  loadBudgets();
});
els.trendRetry.addEventListener('click', () => {
  els.trendError.hidden = true;
  trendLoading.set(true);
  loadTrend({ animate: true });
});
els.profileRetry.addEventListener('click', () => {
  els.profileError.hidden = true;
  profileLoading.set(true);
  loadProfile();
});
// closeWindow ใช้ได้เฉพาะในแอป LINE
els.profileClose.addEventListener('click', () => {
  if (liff.isInClient()) liff.closeWindow();
});

function renderRecurring(rules, focusRuleId = null) {
  els.recurringRows.replaceChildren();
  recurringLoading.set(false);
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
    title.className = 'recurring-title recurring-head';
    const titleText = document.createElement('span');
    titleText.textContent = row.title;
    title.append(createCategoryBadge(document, row.title), titleText);
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
  recurringLoading.set(false);
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
els.bannerRetry.addEventListener('click', async () => {
  if (!api) {
    window.location.reload();
    return;
  }
  if (initialLoadDone) {
    loadMonth({ reset: true });
    return;
  }
  // boot ล้มก่อนโหลดหมวดและรายการประจำเสร็จ โหลดแค่เดือนจะทิ้งแท็บอื่นว่าง จึงเริ่มโหลดทุกอย่างใหม่
  loadError = null;
  setBanner('');
  try {
    await loadAll();
  } catch (err) {
    showLoadError(err);
  }
});
els.recurringRetry.addEventListener('click', () => {
  els.recurringError.hidden = true;
  recurringLoading.set(true);
  loadRecurring();
});

const tabController = createTabController({
  doc: document,
  nav: document.getElementById('bottom-nav'),
  titleEl: document.getElementById('page-title'),
  monthEl: els.month,
  panelFor: (id) => document.getElementById(`panel-${id}`),
  onChange: (id) => {
    // ข้อความชั่วคราวหายเมื่อสลับแท็บ แต่ error โหลดข้อมูลต้องยังเห็นอยู่
    showStickyLoadError();
    window.scrollTo(0, 0);
    if (id === 'list') replayClass(els.list, 'enter');
    if (id === 'summary') {
      playBars(window, els.chartRows);
      playBars(window, els.trendBars);
    }
    if (id === 'budgets') playBars(window, els.budgetRows);
    if (id === 'profile') {
      refreshProfileOnEntry();
      friendsPanel.ensureLoaded();
    }
  },
});
tabController.select(DEFAULT_TAB);

// ลิงก์จากการ์ดในแชต: โหลดเดือนของรายการแล้วเปิดตัวแก้ไข ถ้าโหลดพังให้ banner เดิมบอกเอง
function openLinkedTransaction(link) {
  if (loadError) return;
  const item = lastTransactions.find((transaction) => transaction.id === link.id);
  if (item) {
    openEditor(item);
  } else {
    setBanner(LINKED_TRANSACTION_MISSING);
  }
}

let initialLoadDone = false;

// โหลดทุกอย่างที่หน้าต้องใช้ตอนเปิด ถ้าล้มกลางทาง ปุ่มลองใหม่ของ banner เรียกซ้ำจากต้น
async function loadAll() {
  ({ categories } = await api.listCategories());
  fillCategoryOptions();
  // เปิดส่วนรายการประจำพร้อมข้อความโหลดไว้ก่อน จะได้ไม่เด้งเข้ามาทีหลัง
  els.recurringEmpty.hidden = true;
  els.recurringError.hidden = true;
  recurringLoading.set(true);
  els.recurring.hidden = false;
  els.profileError.hidden = true;
  profileLoading.set(true);
  await Promise.all([loadMonth({ reset: true }), loadRecurring(), loadProfile()]);
  initialLoadDone = true;
}

async function boot() {
  try {
    const config = await (
      await fetch('/api/config', {
        headers: NGROK_SKIP_WARNING_HEADERS,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
    ).json();
    await liff.init({ liffId: config.liffId });
    liffId = config.liffId;
    els.profileClose.hidden = !liff.isInClient();
    if (!liff.isLoggedIn()) {
      liff.login();
      return;
    }
    api = createApi({ fetchImpl: (...args) => fetch(...args), getIdToken: () => liff.getIDToken() });
    els.exportButton.disabled = false;
    // อ่านลิงก์หลัง login สำเร็จ ไม่งั้นการเด้งไป login จะทำพารามิเตอร์หาย
    const link = parseEditLink(window.location.search);
    const friendCode = parseFriendLink(window.location.search);
    if (link || friendCode) window.history.replaceState(null, '', window.location.pathname);
    els.month.value = link && link.date ? link.date.slice(0, 7) : currentMonth(new Date());
    // เริ่มก่อน loadAll เพื่อให้ลิงก์ชวนไม่หายเมื่อโหลดข้อมูลหลักไม่สำเร็จ (openAdd ไม่ throw)
    if (friendCode) {
      tabController.select('profile');
      friendsPanel.openAdd(friendCode);
    }
    await loadAll();
    // เปิดแท็บโปรไฟล์ก่อน boot เสร็จ ตอนนั้นยังไม่มี api จึงต้องโหลดเพื่อนตอนนี้
    if (tabController.current === 'profile') friendsPanel.ensureLoaded();
    if (link) openLinkedTransaction(link);
  } catch (err) {
    showLoadError(err);
  }
}

boot();

import { ApiError } from './api.mjs';
import { buildEqualShares, sumShortfall, toSatang, describeBillError, describeReceiptError } from './bills-format.mjs';
import { formatBaht } from './format.mjs';

const DEFAULT_CATEGORY = 'อาหาร';
const FRIENDS_LOAD_FAILED = 'โหลดรายชื่อเพื่อนไม่สำเร็จ';
const CREATE_RESULT_UNKNOWN = 'ไม่ทราบผล ตรวจรายการบิลก่อนสร้างใหม่';
const NO_EXPENSE_CATEGORY = 'ไม่มีหมวดรายจ่ายให้เลือก';
const CATEGORIES_LOAD_FAILED = 'โหลดหมวดไม่สำเร็จ ลองใหม่อีกครั้ง';
const RECEIPT_READING = 'กำลังอ่านยอดจากรูป...';

function todayIso() {
  // วันตามเวลาไทยเหมือนวันที่ที่บอทใช้บันทึก
  return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function createBillForm({ doc, els, getApi, getCategories, ensureCategories, onCreated, onUncertain, onOpenFriends }) {
  let friends = [];
  let friendsState = 'loading';
  let categoriesState = 'loading';
  let submitting = false;
  let readingReceipt = false;
  // เพิ่มทุกครั้งที่เปิดฟอร์ม ผลของคำขอรอบเก่าจะได้ไม่ไปทับฟอร์มรอบใหม่
  let openToken = 0;

  const amountOf = (input) => (input.value === '' ? NaN : Number(input.value));
  const picked = () => [...els.members.querySelectorAll('.bill-form-member')].filter((row) => row.querySelector('input[type="checkbox"]').checked);

  function fillCategories() {
    const expense = getCategories().filter((category) => category.type === 'expense');
    els.category.replaceChildren(
      ...expense.map((category) => {
        const option = doc.createElement('option');
        option.value = category.id;
        option.textContent = category.name;
        option.selected = category.name === DEFAULT_CATEGORY;
        return option;
      })
    );
  }

  function snapshotPicks() {
    return new Map(picked().map((row) => [row.dataset.id, row.querySelector('input[type="number"]').value]));
  }

  function renderFriends(previous = new Map()) {
    els.members.replaceChildren(
      ...friends.map((friend, index) => {
        const row = doc.createElement('li');
        row.className = 'bill-form-member';
        row.dataset.id = friend.id;
        const box = doc.createElement('input');
        box.type = 'checkbox';
        box.id = `bill-form-friend-${index}`;
        box.addEventListener('change', () => {
          splitEven();
          validate();
        });
        const name = doc.createElement('label');
        name.className = 'bill-form-name';
        name.htmlFor = box.id;
        name.textContent = friend.displayName;
        const share = doc.createElement('input');
        share.type = 'number';
        share.inputMode = 'decimal';
        share.step = '0.01';
        share.min = '0.01';
        share.setAttribute('aria-label', `ส่วนของ ${friend.displayName} (บาท)`);
        share.disabled = true;
        share.addEventListener('input', validate);
        if (previous.has(friend.id)) {
          box.checked = true;
          share.disabled = false;
          share.value = previous.get(friend.id);
        }
        row.append(box, name, share);
        return row;
      })
    );
  }

  function showFriendsState() {
    const noFriends = friendsState === 'ready' && friends.length === 0;
    els.friendsLoading.hidden = friendsState !== 'loading';
    els.friendsError.hidden = friendsState !== 'failed';
    els.noFriends.hidden = !noFriends;
    els.goProfile.hidden = !noFriends;
    els.splitControls.hidden = noFriends;
  }

  async function loadFriends() {
    const token = openToken;
    const previous = snapshotPicks();
    friendsState = 'loading';
    showFriendsState();
    validate();
    try {
      ({ friends } = await getApi().getFriends());
      friendsState = 'ready';
    } catch (err) {
      if (token !== openToken) return;
      friendsState = 'failed';
      els.friendsErrorText.textContent = err instanceof ApiError && err.status === 401 ? describeBillError(401, 'load') : FRIENDS_LOAD_FAILED;
    }
    if (token !== openToken) return;
    // เพื่อนที่ไม่อยู่ในรายชื่อใหม่แล้วจะหลุดจากที่เลือกไว้เอง
    if (friendsState === 'ready') renderFriends(previous);
    showFriendsState();
    validate();
  }

  function showCategoriesState() {
    els.categoriesError.hidden = categoriesState !== 'failed';
    els.categoriesErrorText.textContent = CATEGORIES_LOAD_FAILED;
  }

  async function loadCategories() {
    const token = openToken;
    // เติมเฉพาะตอนที่ยังไม่มีตัวเลือก ไม่ให้ทับหมวดที่ผู้ใช้เลือกไปแล้ว
    const hadOptions = els.category.options.length > 0;
    if (categoriesState === 'failed') {
      categoriesState = 'loading';
      showCategoriesState();
      validate();
    }
    const loaded = await ensureCategories();
    if (token !== openToken) return;
    if (loaded && !hadOptions) fillCategories();
    categoriesState = loaded ? 'ready' : 'failed';
    showCategoriesState();
    validate();
  }

  // ยอดเปลี่ยนหรือเลือกคนเพิ่มแล้วเริ่มจากหารเท่าใหม่ทุกครั้ง แก้รายคนทีหลังได้
  function splitEven() {
    const rows = [...els.members.querySelectorAll('.bill-form-member')];
    const chosen = picked();
    for (const row of rows) {
      const share = row.querySelector('input[type="number"]');
      share.disabled = !chosen.includes(row);
      if (share.disabled) share.value = '';
    }
    const even = buildEqualShares(amountOf(els.total), chosen.length);
    if (!even) return;
    els.ownerShare.value = String(even.ownerShare);
    for (const row of chosen) row.querySelector('input[type="number"]').value = String(even.memberShare);
  }

  function validate() {
    let message = '';
    const total = amountOf(els.total);
    const chosen = picked();
    const missingCategory = els.category.value === '';
    const noCategory = categoriesState === 'ready' && missingCategory;
    if (noCategory) {
      message = NO_EXPENSE_CATEGORY;
    } else if (!els.title.value.trim() || !toSatang(total)) {
      message = '';
    } else if (chosen.length === 0) {
      message = els.splitControls.hidden ? '' : 'เลือกเพื่อนอย่างน้อย 1 คน';
    } else {
      const shares = chosen.map((row) => amountOf(row.querySelector('input[type="number"]')));
      const ownerShare = amountOf(els.ownerShare);
      const shortfall = sumShortfall(total, ownerShare, shares);
      // sumShortfall นับช่องว่างเป็น 0 จึงต้องกันช่องว่างก่อน
      if (toSatang(ownerShare) === null) message = 'ใส่ส่วนของฉัน';
      else if (shares.some((share) => !toSatang(share))) message = 'ใส่ยอดของเพื่อนทุกคนที่เลือก';
      else if (shortfall > 0) message = `ยอดรวมของทุกคนยังขาดอีก ${formatBaht(shortfall)}`;
      else if (shortfall < 0) message = `ยอดรวมของทุกคนเกินยอดบิล ${formatBaht(-shortfall)}`;
    }
    els.error.textContent = message;
    els.cancel.disabled = submitting;
    els.submit.disabled =
      submitting || readingReceipt || friendsState !== 'ready' || missingCategory || Boolean(message) || !els.title.value.trim() || !toSatang(total) || chosen.length === 0;
  }

  function showReceiptState(text) {
    els.receiptButton.disabled = readingReceipt;
    els.receiptStatus.textContent = text;
  }

  // รูปใช้แค่อ่านยอดแล้วทิ้ง ไม่ได้เก็บไว้กับบิล
  async function readReceipt() {
    const [file] = els.receiptInput.files;
    // ล้างค่าให้เลือกรูปเดิมซ้ำแล้วยังได้ change
    els.receiptInput.value = '';
    if (!file) return;
    const token = openToken;
    readingReceipt = true;
    showReceiptState(RECEIPT_READING);
    validate();
    let message;
    try {
      const { amount } = await getApi().readReceipt(file);
      if (token !== openToken) return;
      els.total.value = String(amount);
      splitEven();
      message = `อ่านยอดได้ ${formatBaht(amount)} ตรวจให้ตรงกับใบเสร็จก่อนหารบิล`;
    } catch (err) {
      if (token !== openToken) return;
      message = describeReceiptError(err instanceof ApiError ? err.status : 0);
    }
    readingReceipt = false;
    showReceiptState(message);
    validate();
  }

  async function open() {
    openToken += 1;
    els.form.reset();
    els.error.textContent = '';
    readingReceipt = false;
    showReceiptState('');
    els.date.value = todayIso();
    fillCategories();
    categoriesState = getCategories().length > 0 ? 'ready' : 'loading';
    showCategoriesState();
    friends = [];
    renderFriends();
    friendsState = 'loading';
    showFriendsState();
    validate();
    els.dialog.showModal();
    await Promise.all([loadFriends(), loadCategories()]);
  }

  async function submit() {
    validate();
    if (els.submit.disabled) return;
    const token = openToken;
    submitting = true;
    validate();
    els.submit.textContent = 'กำลังสร้าง...';
    const body = {
      title: els.title.value.trim(),
      total: amountOf(els.total),
      occurredOn: els.date.value,
      categoryId: els.category.value,
      ownerShare: amountOf(els.ownerShare),
      members: picked().map((row) => ({ userId: row.dataset.id, share: amountOf(row.querySelector('input[type="number"]')) })),
    };
    let result = null;
    let failure = '';
    try {
      result = await getApi().createBill(body);
    } catch (err) {
      const status = err instanceof ApiError ? err.status : 0;
      failure = describeBillError(status, 'create', err.error);
      if (status === 0 || status >= 500) {
        // ไม่มีคำตอบหรือ server พังกลางทาง บิลอาจถูกสร้างไปแล้ว จึงโหลดรายการให้ผู้ใช้ตรวจ
        failure = CREATE_RESULT_UNKNOWN;
        await onUncertain();
      } else if (status === 400 && err.error === 'Not friends') {
        await loadFriends();
      }
    }
    submitting = false;
    els.submit.textContent = 'หารบิล';
    validate();
    if (result) {
      els.dialog.close();
      await onCreated(result, body);
      return;
    }
    // validate ล้างข้อความ จึงใส่ error ของ server กลับหลังคำนวณปุ่มแล้ว
    if (failure && token === openToken) els.error.textContent = failure;
  }

  els.total.addEventListener('input', () => {
    splitEven();
    validate();
  });
  els.title.addEventListener('input', validate);
  els.receiptButton.addEventListener('click', () => els.receiptInput.click());
  els.receiptInput.addEventListener('change', readReceipt);
  els.ownerShare.addEventListener('input', validate);
  els.even.addEventListener('click', () => {
    splitEven();
    validate();
  });
  els.friendsRetry.addEventListener('click', loadFriends);
  els.categoriesRetry.addEventListener('click', loadCategories);
  els.goProfile.addEventListener('click', () => {
    els.dialog.close();
    onOpenFriends();
  });
  els.cancel.addEventListener('click', () => els.dialog.close());
  els.dialog.addEventListener('cancel', (event) => {
    if (submitting) event.preventDefault();
  });
  els.form.addEventListener('submit', (event) => {
    event.preventDefault();
    submit();
  });

  return { open };
}

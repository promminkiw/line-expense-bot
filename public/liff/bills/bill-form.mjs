import { ApiError } from '../api.mjs';
import { buildEqualShares, sumShortfall, toSatang, describeBillError, describeReceiptError } from './bills-format.mjs';
import { formatBaht, currentDate, hasOnlyThousandsCommas } from '../format.mjs';
import { t } from '../i18n/translate.mjs';
import { getLang } from '../i18n/current.mjs';
import { categoryDisplayName } from '../categories/categories-format.mjs';
import { displayFriendName } from '../friends/friends-format.mjs';

// ชื่อหมวดใน DB ไม่ใช่ชื่อที่แสดง จึงเทียบได้ทุกภาษา
const DEFAULT_CATEGORY = 'อาหาร';
// เพดานเดียวกับ server
const MAX_TITLE_LENGTH = 60;
const MAX_MEMBERS = 20;
const MAX_TOTAL_SATANG = 10000000 * 100;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const statusOf = (err) => (err instanceof ApiError ? err.status : 0);

// ช่องยอดรวมเป็น text ให้พิมพ์ 1,000 ได้ ช่อง number ของ browser ล้างค่าที่มีจุลภาคทิ้งเงียบๆ
function readTotal(text) {
  const compact = text.replace(/\s/g, '');
  const cleaned = compact.replaceAll(',', '');
  if (cleaned === '') return { empty: true, amount: Number.NaN };
  const isNumber = hasOnlyThousandsCommas(compact) && /^\d+(\.\d+)?$/.test(cleaned);
  return { empty: false, amount: isNumber ? Number(cleaned) : Number.NaN };
}

function totalProblemKey({ empty, amount }) {
  if (empty) return 'web.bills.form.needTotal';
  if (Number.isNaN(amount)) return 'web.bills.form.totalNotNumber';
  const satang = toSatang(amount);
  if (satang === null) return 'web.bills.form.totalDecimals';
  if (satang === 0) return 'web.bills.form.needTotal';
  if (satang > MAX_TOTAL_SATANG) return 'web.bills.form.totalTooLarge';
  return null;
}

function describeTotal(total) {
  const key = totalProblemKey(total);
  return key ? t(getLang(), key) : '';
}

export function createBillForm({ doc, els, getApi, getCategories, ensureCategories, onCreated, onUncertain, onOpenFriends }) {
  let friends = [];
  let friendsState = 'loading';
  let categoriesState = 'loading';
  let submitting = false;
  let readingReceipt = false;
  // ยังไม่บอกว่าช่องไหนขาดจนกว่าผู้ใช้จะเริ่มกรอก ฟอร์มที่เพิ่งเปิดจะได้ไม่ขึ้น error
  let touched = false;
  // เพิ่มทุกครั้งที่เปิดฟอร์ม ผลของคำขอรอบเก่าจะได้ไม่ไปทับฟอร์มรอบใหม่
  let openToken = 0;
  // ค่าที่กรอกไว้ก่อนออกไปเพิ่มเพื่อน เปิดฟอร์มรอบถัดไปจะได้ไม่ต้องกรอกใหม่ ใช้ได้ครั้งเดียว
  let draft = null;

  const amountOf = (input) => (input.value === '' ? Number.NaN : Number(input.value));
  const picked = () => [...els.members.querySelectorAll('.bill-form-member')].filter((row) => row.querySelector('input[type="checkbox"]').checked);

  function fillCategories() {
    const expense = getCategories().filter((category) => category.type === 'expense' && !category.hidden);
    els.category.replaceChildren(
      ...expense.map((category) => {
        const option = doc.createElement('option');
        option.value = category.id;
        option.textContent = categoryDisplayName(getLang(), category);
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
        name.textContent = displayFriendName(friend.displayName);
        const share = doc.createElement('input');
        share.type = 'number';
        share.inputMode = 'decimal';
        share.step = '0.01';
        share.min = '0.01';
        share.setAttribute('aria-label', t(getLang(), 'web.bills.form.friendShare', { name: displayFriendName(friend.displayName) }));
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
    let loaded;
    try {
      ({ friends: loaded } = await getApi().getFriends());
    } catch (err) {
      if (token !== openToken) return;
      friendsState = 'failed';
      els.friendsErrorText.textContent = statusOf(err) === 401 ? describeBillError(401, 'load') : t(getLang(), 'web.friends.error.loadFailed');
    }
    // ตรวจ token ก่อนเขียน state ไม่งั้นรายชื่อของการเปิดฟอร์มรอบเก่าจะทับรอบใหม่
    if (token !== openToken) return;
    if (loaded) {
      friends = loaded;
      friendsState = 'ready';
    }
    // เพื่อนที่ไม่อยู่ในรายชื่อใหม่แล้วจะหลุดจากที่เลือกไว้เอง
    if (friendsState === 'ready') renderFriends(previous);
    showFriendsState();
    validate();
  }

  function showCategoriesState() {
    els.categoriesError.hidden = categoriesState !== 'failed';
    els.categoriesErrorText.textContent = t(getLang(), 'web.editor.categoriesFailed');
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
    const even = buildEqualShares(readTotal(els.total.value).amount, chosen.length);
    if (!even) return;
    els.ownerShare.value = String(even.ownerShare);
    for (const row of chosen) row.querySelector('input[type="number"]').value = String(even.memberShare);
  }

  function describeMissing() {
    const title = els.title.value.trim();
    const lang = getLang();
    if (!title) return { message: t(lang, 'web.bills.form.needTitle'), field: null };
    if (Array.from(title).length > MAX_TITLE_LENGTH) return { message: t(lang, 'web.bills.form.titleTooLong', { max: MAX_TITLE_LENGTH }), field: null };
    const totalMessage = describeTotal(readTotal(els.total.value));
    if (totalMessage) return { message: totalMessage, field: els.total.value.trim() ? els.total : null };
    if (!DATE_PATTERN.test(els.date.value)) return { message: t(lang, 'web.bills.form.needDate'), field: null };
    return null;
  }

  function validate() {
    const lang = getLang();
    let message = '';
    let invalidField = null;
    const total = readTotal(els.total.value).amount;
    const chosen = picked();
    const missingCategory = els.category.value === '';
    const noCategory = categoriesState === 'ready' && missingCategory;
    const missing = describeMissing();
    if (noCategory) {
      message = t(lang, 'web.bills.form.noCategory');
    } else if (missing) {
      // ช่องว่างบอกเมื่อเริ่มกรอกแล้ว ส่วนค่าที่กรอกผิดบอกทันที
      if (touched || missing.field) message = missing.message;
      invalidField = missing.field;
    } else if (chosen.length === 0) {
      message = els.splitControls.hidden ? '' : t(lang, 'web.bills.form.needFriend');
    } else if (chosen.length > MAX_MEMBERS) {
      message = t(lang, 'web.bills.form.tooManyFriends', { max: MAX_MEMBERS });
    } else {
      const shares = chosen.map((row) => amountOf(row.querySelector('input[type="number"]')));
      const ownerShare = amountOf(els.ownerShare);
      const shortfall = sumShortfall(total, ownerShare, shares);
      // sumShortfall นับช่องว่างเป็น 0 จึงต้องกันช่องว่างก่อน
      if (toSatang(ownerShare) === null) message = t(lang, 'web.bills.form.needOwnerShare');
      else if (shares.some((share) => !toSatang(share))) message = t(lang, 'web.bills.form.needFriendShares');
      else if (shortfall > 0) message = t(lang, 'web.bills.form.short', { amount: formatBaht(shortfall, lang) });
      else if (shortfall < 0) message = t(lang, 'web.bills.form.over', { amount: formatBaht(-shortfall, lang) });
    }
    els.error.textContent = message;
    if (invalidField) els.total.setAttribute('aria-invalid', 'true');
    else els.total.removeAttribute('aria-invalid');
    els.cancel.disabled = submitting;
    els.submit.disabled =
      submitting || readingReceipt || friendsState !== 'ready' || missingCategory || Boolean(message) || Boolean(missing) || chosen.length === 0;
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
    showReceiptState(t(getLang(), 'web.bills.form.receiptReading'));
    validate();
    let message;
    try {
      const { amount } = await getApi().readReceipt(file);
      if (token !== openToken) return;
      els.total.value = String(amount);
      splitEven();
      message = t(getLang(), 'web.bills.form.receiptRead', { amount: formatBaht(amount) });
    } catch (err) {
      if (token !== openToken) return;
      message = describeReceiptError(statusOf(err));
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
    touched = false;
    showReceiptState('');
    els.date.value = currentDate(new Date());
    fillCategories();
    if (draft) {
      els.title.value = draft.title;
      els.total.value = draft.total;
      els.date.value = draft.date;
      // หมวดที่ถูกซ่อนระหว่างนั้นไม่อยู่ในตัวเลือกแล้ว จึงคงหมวดตั้งต้นไว้
      if ([...els.category.options].some((option) => option.value === draft.categoryId)) els.category.value = draft.categoryId;
      draft = null;
    }
    categoriesState = getCategories().length > 0 ? 'ready' : 'loading';
    showCategoriesState();
    friends = [];
    renderFriends();
    friendsState = 'loading';
    showFriendsState();
    validate();
    els.dialog.showModal();
    // โฟกัสหัวข้อแทนช่องชื่อ คีย์บอร์ดมือถือจะได้ไม่เด้งขึ้นมาบังฟอร์มทันที
    els.heading.focus();
    await Promise.all([loadFriends(), loadCategories()]);
  }

  async function submit() {
    validate();
    if (els.submit.disabled) return;
    const token = openToken;
    submitting = true;
    validate();
    els.submit.textContent = t(getLang(), 'web.bills.form.submitting');
    const body = {
      title: els.title.value.trim(),
      total: readTotal(els.total.value).amount,
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
      const status = statusOf(err);
      failure = describeBillError(status, 'create', err.error);
      if (status === 0 || status >= 500) {
        // ไม่มีคำตอบหรือ server พังกลางทาง บิลอาจถูกสร้างไปแล้ว จึงโหลดรายการให้ผู้ใช้ตรวจ
        failure = t(getLang(), 'web.bills.form.resultUnknown');
        await onUncertain();
      } else if (status === 400 && err.error === 'Not friends') {
        await loadFriends();
      }
    }
    submitting = false;
    els.submit.textContent = t(getLang(), 'web.bills.form.submit');
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
  // event ที่มาจากช่องใดก็ได้ในฟอร์มแปลว่าผู้ใช้เริ่มกรอกแล้ว ฟังที่ฟอร์มก่อนช่องย่อยจะทำงาน
  els.form.addEventListener('input', () => (touched = true), { capture: true });
  els.form.addEventListener('change', () => (touched = true), { capture: true });
  els.title.addEventListener('input', validate);
  els.date.addEventListener('input', validate);
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
    draft = { title: els.title.value, total: els.total.value, date: els.date.value, categoryId: els.category.value };
    els.dialog.close();
    onOpenFriends();
  });
  els.cancel.addEventListener('click', () => els.dialog.close());
  els.dialog.addEventListener('cancel', (event) => {
    if (submitting) event.preventDefault();
  });
  els.form.addEventListener('submit', (event) => {
    event.preventDefault();
    void submit();
  });

  return { open };
}

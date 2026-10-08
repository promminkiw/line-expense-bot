import { ApiError } from './api.mjs';
import { buildEqualShares, sumShortfall, toSatang, describeBillError } from './bills-format.mjs';
import { formatBaht } from './format.mjs';

const DEFAULT_CATEGORY = 'อาหาร';

function todayIso() {
  // วันตามเวลาไทยเหมือนวันที่ที่บอทใช้บันทึก
  return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function createBillForm({ doc, els, getApi, getCategories, onCreated }) {
  let friends = [];
  let submitting = false;

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

  function renderFriends() {
    els.noFriends.hidden = friends.length > 0;
    els.members.replaceChildren(
      ...friends.map((friend) => {
        const row = doc.createElement('li');
        row.className = 'bill-form-member';
        row.dataset.id = friend.id;
        const box = doc.createElement('input');
        box.type = 'checkbox';
        box.setAttribute('aria-label', `หารกับ ${friend.displayName}`);
        box.addEventListener('change', () => {
          splitEven();
          validate();
        });
        const name = doc.createElement('span');
        name.className = 'bill-form-name';
        name.textContent = friend.displayName;
        const share = doc.createElement('input');
        share.type = 'number';
        share.inputMode = 'decimal';
        share.step = '0.01';
        share.min = '0.01';
        share.setAttribute('aria-label', `ส่วนของ ${friend.displayName} (บาท)`);
        share.disabled = true;
        share.addEventListener('input', validate);
        row.append(box, name, share);
        return row;
      })
    );
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
    if (!els.title.value.trim() || !toSatang(total)) {
      message = '';
    } else if (chosen.length === 0) {
      message = 'เลือกเพื่อนอย่างน้อย 1 คน';
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
    els.submit.disabled = submitting || Boolean(message) || !els.title.value.trim() || !toSatang(total) || chosen.length === 0;
  }

  async function open() {
    els.form.reset();
    els.error.textContent = '';
    els.date.value = todayIso();
    fillCategories();
    friends = [];
    renderFriends();
    els.noFriends.hidden = true;
    validate();
    els.dialog.showModal();
    try {
      ({ friends } = await getApi().getFriends());
    } catch (err) {
      els.error.textContent = describeBillError(err instanceof ApiError ? err.status : 0, 'load');
      return;
    }
    renderFriends();
    validate();
  }

  async function submit() {
    validate();
    if (els.submit.disabled) return;
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
    let failure = '';
    try {
      const result = await getApi().createBill(body);
      els.dialog.close();
      await onCreated(result);
    } catch (err) {
      const status = err instanceof ApiError ? err.status : 0;
      failure = describeBillError(status, 'create', err.error);
    } finally {
      submitting = false;
      els.submit.textContent = 'หารบิล';
      validate();
      // validate ล้างข้อความ จึงใส่ error ของ server กลับหลังคำนวณปุ่มแล้ว
      if (failure) els.error.textContent = failure;
    }
  }

  els.total.addEventListener('input', () => {
    splitEven();
    validate();
  });
  els.title.addEventListener('input', validate);
  els.ownerShare.addEventListener('input', validate);
  els.even.addEventListener('click', () => {
    splitEven();
    validate();
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

import { ApiError } from './api.mjs';
import { describeWalletError, sortWallets, walletRowView } from './wallets-format.mjs';

const statusOf = (err) => (err instanceof ApiError ? err.status : 0);
const errorOf = (err) => (err instanceof ApiError ? err.error : undefined);

// ส่วนกระเป๋าในแท็บโปรไฟล์: ยอดแยกกระเป๋า เพิ่ม เปลี่ยนชื่อ และซ่อน (ลบไม่ได้ในเฟสนี้)
export function createWalletsPanel({ doc, els, getApi, onChanged }) {
  let wallets = [];
  let loaded = false;
  let busy = false;
  let renaming = null;
  // โหลดซ้อนกันได้ (เข้าแท็บพร้อมแก้รายการ) ผลที่เก่ากว่าต้องไม่ทับผลล่าสุด
  let latestLoad = 0;

  function renderRow(wallet) {
    const view = walletRowView(wallet);
    const row = doc.createElement('li');
    row.className = 'wallet-row';
    row.dataset.walletId = wallet.id;
    const name = doc.createElement('span');
    name.className = 'wallet-name';
    name.textContent = view.name;
    if (view.label) {
      const label = doc.createElement('span');
      label.className = 'wallet-label';
      label.textContent = view.label;
      name.append(label);
    }
    const balance = doc.createElement('span');
    balance.className = 'wallet-balance';
    balance.classList.toggle('negative', view.negative);
    balance.textContent = view.balanceText;
    const detail = doc.createElement('span');
    detail.className = 'wallet-detail';
    detail.textContent = view.detailText;
    row.append(name, balance, detail);
    if (view.canEdit) {
      const actions = doc.createElement('div');
      actions.className = 'wallet-actions';
      const rename = doc.createElement('button');
      rename.type = 'button';
      rename.className = 'wallet-rename';
      rename.textContent = 'เปลี่ยนชื่อ';
      rename.setAttribute('aria-label', `เปลี่ยนชื่อกระเป๋า ${wallet.name}`);
      rename.addEventListener('click', () => openRename(wallet));
      const toggle = doc.createElement('button');
      toggle.type = 'button';
      toggle.className = 'wallet-toggle';
      toggle.textContent = view.hideLabel;
      toggle.setAttribute('aria-label', `${view.hideLabel}กระเป๋า ${wallet.name}`);
      toggle.addEventListener('click', () => toggleHidden(wallet, toggle));
      actions.append(rename, toggle);
      row.append(actions);
    }
    return row;
  }

  function showLoadError(err) {
    els.loadingText.hidden = true;
    const status = statusOf(err);
    // โหลดซ้ำพังยังเห็นยอดเดิม จึงบอกว่ายอดอาจไม่ล่าสุดแทนการล้างรายการ
    els.errorText.textContent =
      status === 401
        ? describeWalletError(401)
        : loaded
          ? 'อัปเดตยอดกระเป๋าไม่สำเร็จ ยอดที่เห็นอาจไม่ตรงกับล่าสุด'
          : 'โหลดกระเป๋าไม่สำเร็จ';
    // 401 ต้องเปิดจาก LINE ใหม่ กดลองใหม่ก็ได้ผลเดิม
    els.retry.hidden = status === 401;
    els.error.hidden = false;
  }

  // ไม่ throw เพื่อให้ loadAll และการสลับแท็บไม่ล้มเพราะกระเป๋า
  async function load() {
    const api = getApi();
    if (!api) return;
    const loadId = ++latestLoad;
    els.section.hidden = false;
    els.error.hidden = true;
    if (!loaded) els.loadingText.hidden = false;
    try {
      const result = await api.listWallets();
      if (loadId !== latestLoad) return;
      wallets = result.wallets;
      loaded = true;
      els.loadingText.hidden = true;
      els.rows.replaceChildren(...sortWallets(wallets).map(renderRow));
      onChanged(wallets);
    } catch (err) {
      if (loadId === latestLoad) showLoadError(err);
    }
  }

  async function add(event) {
    event.preventDefault();
    if (busy) return;
    const name = els.addInput.value.trim();
    els.status.textContent = '';
    if (!name) {
      els.addError.textContent = 'ใส่ชื่อกระเป๋าก่อน';
      return;
    }
    busy = true;
    els.addSubmit.disabled = true;
    els.addError.textContent = '';
    try {
      await getApi().createWallet({ name });
      els.addInput.value = '';
      els.status.textContent = `เพิ่มกระเป๋า ${name} แล้ว`;
      await load();
    } catch (err) {
      els.addError.textContent = describeWalletError(statusOf(err), errorOf(err));
    } finally {
      busy = false;
      els.addSubmit.disabled = false;
    }
  }

  function openRename(wallet) {
    renaming = wallet;
    els.dialogName.value = wallet.name;
    els.dialogError.hidden = true;
    els.dialogError.textContent = '';
    els.dialog.showModal();
  }

  async function saveRename(event) {
    event.preventDefault();
    if (busy || !renaming) return;
    const name = els.dialogName.value.trim();
    busy = true;
    els.dialogSave.disabled = true;
    els.dialogCancel.disabled = true;
    try {
      await getApi().updateWallet(renaming.id, { name });
      renaming = null;
      els.dialog.close();
      els.status.textContent = `เปลี่ยนชื่อเป็น ${name} แล้ว`;
      await load();
    } catch (err) {
      els.dialogError.textContent = describeWalletError(statusOf(err), errorOf(err));
      els.dialogError.hidden = false;
    } finally {
      busy = false;
      els.dialogSave.disabled = false;
      els.dialogCancel.disabled = false;
    }
  }

  async function toggleHidden(wallet, button) {
    if (busy) return;
    busy = true;
    button.disabled = true;
    els.status.textContent = '';
    try {
      await getApi().updateWallet(wallet.id, { hidden: !wallet.hidden });
      els.status.textContent = wallet.hidden ? `เลิกซ่อนกระเป๋า ${wallet.name} แล้ว` : `ซ่อนกระเป๋า ${wallet.name} แล้ว`;
      await load();
    } catch (err) {
      els.status.textContent = describeWalletError(statusOf(err), errorOf(err));
      button.disabled = false;
    } finally {
      busy = false;
    }
  }

  els.addForm.addEventListener('submit', add);
  els.dialogForm.addEventListener('submit', saveRename);
  els.dialogCancel.addEventListener('click', () => els.dialog.close());
  // กัน Esc ปิด dialog ระหว่างรอ request ไม่งั้นผลลัพธ์จะไม่มีที่แสดง
  els.dialog.addEventListener('cancel', (event) => {
    if (busy) event.preventDefault();
  });
  els.retry.addEventListener('click', () => load());

  return { load, getWallets: () => wallets };
}

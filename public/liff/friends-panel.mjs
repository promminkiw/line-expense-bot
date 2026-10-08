import { qrcode } from './vendor/qrcode.mjs';
import { ApiError } from './api.mjs';
import {
  normalizeFriendCodeInput,
  formatFriendCode,
  buildInviteUrl,
  buildInviteMessage,
  describeFriendError,
  INVALID_CODE_MESSAGE,
  OWN_CODE_MESSAGE,
} from './friends-format.mjs';

const statusOf = (err) => (err instanceof ApiError ? err.status : 0);

// ส่วนเพื่อนในแท็บโปรไฟล์: โหลดเมื่อเข้าแท็บครั้งแรกเท่านั้น ไม่ให้หน้าแรกยิง request เพิ่ม
export function createFriendsPanel({ doc, els, getApi, liff, getLiffId, clipboard }) {
  let code = null;
  let loaded = false;
  let loading = null;
  let dialogAction = null;

  const inviteUrl = () => buildInviteUrl(getLiffId(), code);

  function drawQr() {
    const qr = qrcode(0, 'M');
    qr.addData(inviteUrl());
    qr.make();
    // svg มาจาก library และเนื้อหาเป็นลิงก์ที่เราสร้างเอง ไม่มีข้อความจากผู้ใช้
    els.qr.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
  }

  function showCode(next) {
    code = next;
    els.code.textContent = formatFriendCode(code);
    if (!els.qr.hidden) drawQr();
  }

  function renderRow(friend) {
    const item = doc.createElement('li');
    item.className = 'friend-row';
    const name = doc.createElement('span');
    name.className = 'friend-name';
    name.textContent = friend.displayName;
    const remove = doc.createElement('button');
    remove.type = 'button';
    remove.className = 'friend-remove';
    remove.textContent = 'ลบ';
    remove.setAttribute('aria-label', `ลบ ${friend.displayName} ออกจากเพื่อน`);
    remove.addEventListener('click', () => askRemove(friend));
    item.append(name, remove);
    return item;
  }

  function render(overview) {
    showCode(overview.code);
    els.rows.replaceChildren(...overview.friends.map(renderRow));
    els.empty.hidden = overview.friends.length > 0;
    els.loadingText.hidden = true;
    els.error.hidden = true;
    els.body.hidden = false;
  }

  function showLoadError(err) {
    els.loadingText.hidden = true;
    els.body.hidden = true;
    els.errorText.textContent = describeFriendError(statusOf(err), 'load');
    els.error.hidden = false;
  }

  function load() {
    const api = getApi();
    if (!api) return Promise.resolve();
    els.section.hidden = false;
    els.error.hidden = true;
    if (!loaded) els.loadingText.hidden = false;
    loading = api
      .getFriends()
      .then((overview) => {
        loaded = true;
        render(overview);
      }, showLoadError)
      .finally(() => {
        loading = null;
      });
    return loading;
  }

  function ensureLoaded() {
    if (loading) return loading;
    if (loaded) return Promise.resolve();
    return load();
  }

  // run คืนข้อความ error ที่จะแสดงใน dialog หรือ null เมื่อสำเร็จ
  function openDialog({ title, text, okLabel, danger = false, run }) {
    els.dialogTitle.textContent = title;
    els.dialogText.textContent = text;
    els.dialogOk.textContent = okLabel;
    els.dialogOk.className = danger ? 'danger-solid' : 'primary';
    els.dialogError.textContent = '';
    els.dialogOk.disabled = false;
    dialogAction = run;
    els.dialog.showModal();
  }

  async function openAdd(rawCode) {
    els.addError.textContent = '';
    els.status.textContent = '';
    const normalized = normalizeFriendCodeInput(rawCode);
    if (!normalized) {
      els.addError.textContent = INVALID_CODE_MESSAGE;
      return;
    }
    if (!getApi()) return;
    await ensureLoaded();
    if (normalized === code) {
      els.addError.textContent = OWN_CODE_MESSAGE;
      return;
    }
    let friend;
    try {
      ({ friend } = await getApi().lookupFriend(normalized));
    } catch (err) {
      els.addError.textContent = describeFriendError(statusOf(err), 'add');
      return;
    }
    openDialog({
      title: 'เพิ่มเพื่อน',
      text: `เพิ่ม ${friend.displayName} เป็นเพื่อน?`,
      okLabel: 'เพิ่มเพื่อน',
      run: async () => {
        try {
          await getApi().addFriend(normalized);
        } catch (err) {
          return describeFriendError(statusOf(err), 'add');
        }
        els.input.value = '';
        els.status.textContent = `เพิ่ม ${friend.displayName} เป็นเพื่อนแล้ว`;
        await load();
        return null;
      },
    });
  }

  function askRemove(friend) {
    els.status.textContent = '';
    openDialog({
      title: 'ลบเพื่อน',
      text: `ลบ ${friend.displayName} ออกจากเพื่อน? เพิ่มกลับได้ด้วยรหัสเพื่อน`,
      okLabel: 'ลบ',
      danger: true,
      run: async () => {
        try {
          await getApi().removeFriend(friend.id);
        } catch (err) {
          // ถูกลบไปแล้วจากอีกฝั่ง ถือว่าสำเร็จแล้วโหลดรายชื่อใหม่
          if (statusOf(err) !== 404) return describeFriendError(statusOf(err), 'remove');
        }
        await load();
        return null;
      },
    });
  }

  function askRenew() {
    els.status.textContent = '';
    openDialog({
      title: 'เปลี่ยนรหัสเพื่อน',
      text: 'ลิงก์และ QR เดิมจะใช้ไม่ได้ เพื่อนที่เพิ่มไว้แล้วยังอยู่ครบ',
      okLabel: 'เปลี่ยนรหัส',
      run: async () => {
        try {
          showCode((await getApi().regenerateFriendCode()).code);
        } catch (err) {
          return describeFriendError(statusOf(err), 'renew');
        }
        els.status.textContent = 'เปลี่ยนรหัสแล้ว ลิงก์และ QR เดิมใช้ไม่ได้แล้ว';
        return null;
      },
    });
  }

  async function share() {
    els.status.textContent = '';
    const url = inviteUrl();
    if (typeof liff.isApiAvailable === 'function' && liff.isApiAvailable('shareTargetPicker')) {
      try {
        const result = await liff.shareTargetPicker([{ type: 'text', text: buildInviteMessage(url) }]);
        // ผู้ใช้ปิดหน้าเลือกแชตเองได้ผลเป็นค่าว่าง ไม่ต้องแจ้งอะไร
        if (result) els.status.textContent = 'ส่งลิงก์แล้ว';
        return;
      } catch {
        // เปิดหน้าเลือกแชตไม่ได้ ใช้การคัดลอกลิงก์แทน
      }
    }
    try {
      await clipboard.writeText(url);
      els.status.textContent = 'คัดลอกลิงก์แล้ว ส่งให้เพื่อนได้เลย';
    } catch {
      els.status.textContent = `ส่งลิงก์นี้ให้เพื่อน: ${url}`;
    }
  }

  els.dialogOk.addEventListener('click', async () => {
    if (!dialogAction || els.dialogOk.disabled) return;
    els.dialogOk.disabled = true;
    const message = await dialogAction();
    els.dialogOk.disabled = false;
    if (message) {
      els.dialogError.textContent = message;
      return;
    }
    els.dialog.close();
  });
  els.dialogCancel.addEventListener('click', () => els.dialog.close());
  els.dialog.addEventListener('close', () => {
    dialogAction = null;
  });
  els.retry.addEventListener('click', () => load());
  els.share.addEventListener('click', () => share());
  els.renew.addEventListener('click', () => askRenew());
  els.qrToggle.addEventListener('click', () => {
    const show = els.qr.hidden;
    if (show) drawQr();
    els.qr.hidden = !show;
    els.qrToggle.setAttribute('aria-expanded', String(show));
    els.qrToggle.textContent = show ? 'ซ่อน QR' : 'แสดง QR';
  });
  els.form.addEventListener('submit', (event) => {
    event.preventDefault();
    openAdd(els.input.value);
  });

  return { ensureLoaded, openAdd };
}

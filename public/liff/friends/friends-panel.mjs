import { qrcode } from '../vendor/qrcode.mjs';
import { ApiError } from '../api.mjs';
import { createLoadingIndicator } from '../ui/skeleton.mjs';
import { t } from '../i18n/translate.mjs';
import { getLang } from '../i18n/current.mjs';
import {
  normalizeFriendCodeInput,
  formatFriendCode,
  buildInviteUrl,
  buildInviteMessage,
  describeFriendError,
  displayFriendName,
} from './friends-format.mjs';

const statusOf = (err) => (err instanceof ApiError ? err.status : 0);
const tr = (key, params) => t(getLang(), key, params);

// ส่วนเพื่อนในแท็บโปรไฟล์: โหลดเมื่อเข้าแท็บครั้งแรกเท่านั้น ไม่ให้หน้าแรกยิง request เพิ่ม
export function createFriendsPanel({ doc, els, getApi, liff, getLiffId, clipboard }) {
  let code = null;
  let loaded = false;
  let loading = null;
  let dialogAction = null;
  let dialogBusy = false;
  let dialogFailureMessage = null;
  let dialogDone = null;
  let lookingUp = false;
  let sharing = false;
  // เก็บรหัสจากลิงก์ชวนไว้เมื่อโหลดรายชื่อไม่สำเร็จ จะได้ทำต่อหลังกดลองใหม่
  let pendingInviteCode = null;
  let loadErrorStatus = 0;
  const loadingIndicator = createLoadingIndicator({
    doc,
    textEl: els.loadingText,
    skeletonEl: els.skeleton,
    variants: ['friends-card', 'friends-row'],
  });

  let lastOverview = null;
  const inviteUrl = () => buildInviteUrl(getLiffId(), code);

  function drawQr() {
    const qr = qrcode(0, 'M');
    qr.addData(inviteUrl());
    qr.make();
    // svg มาจาก library และเนื้อหาเป็นลิงก์ที่เราสร้างเอง ไม่มีข้อความจากผู้ใช้
    els.qr.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true, alt: tr('web.friends.qrAlt') });
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
    name.textContent = displayFriendName(friend.displayName);
    const remove = doc.createElement('button');
    remove.type = 'button';
    remove.className = 'friend-remove';
    remove.textContent = tr('web.friends.remove');
    remove.setAttribute('aria-label', tr('web.friends.removeLabel', { name: displayFriendName(friend.displayName) }));
    remove.addEventListener('click', () => askRemove(friend));
    item.append(name, remove);
    return item;
  }

  // ปุ่มนี้เปลี่ยนคำตามสถานะ QR จึงตั้งจาก JS แทน data-i18n ไม่งั้นแปลหน้าใหม่จะคืนเป็น แสดง QR ทั้งที่ QR เปิดอยู่
  function labelQrToggle() {
    els.qrToggle.textContent = tr(els.qr.hidden ? 'web.friends.showQr' : 'web.friends.hideQr');
  }

  function render(overview) {
    // เก็บไว้ให้ relabel วาดรายชื่อใหม่ได้โดยไม่ยิง request
    lastOverview = overview;
    showCode(overview.code);
    els.rows.replaceChildren(...overview.friends.map(renderRow));
    els.empty.hidden = overview.friends.length > 0;
    loadingIndicator.set(false);
    els.error.hidden = true;
    els.body.hidden = false;
  }

  // ภาษาจาก server มาถึงหลังวาดรายชื่อแล้ว ข้อความที่ JS เขียนไว้ยังเป็นภาษาเดิม
  function relabel() {
    labelQrToggle();
    if (!lookingUp) els.addSubmit.textContent = tr('web.friends.search');
    if (lastOverview) els.rows.replaceChildren(...lastOverview.friends.map(renderRow));
    if (!els.qr.hidden) drawQr();
  }

  function showLoadErrorText() {
    // 401 ต้องบอกให้เปิดจาก LINE ใหม่ ข้อความว่าเก็บลิงก์ไว้ให้จึงใช้เฉพาะกรณีอื่น
    const keepsInvite = pendingInviteCode && loadErrorStatus !== 401;
    els.errorText.textContent = keepsInvite ? tr('web.friends.error.inviteKept') : describeFriendError(loadErrorStatus, 'load');
  }

  function showLoadError(err) {
    loadingIndicator.set(false);
    // โหลดซ้ำหลังเพิ่ม/ลบแล้วพัง ยังแสดงรายชื่อเดิมและข้อความสำเร็จไว้
    if (!loaded) els.body.hidden = true;
    loadErrorStatus = statusOf(err);
    showLoadErrorText();
    // 401 ต้องเปิดจาก LINE ใหม่ กดลองใหม่ก็ได้ผลเดิม
    els.retry.hidden = loadErrorStatus === 401;
    els.error.hidden = false;
  }

  function load() {
    const api = getApi();
    if (!api) return Promise.resolve();
    els.section.hidden = false;
    els.error.hidden = true;
    if (!loaded) loadingIndicator.set(true);
    loading = api
      .getFriends()
      .then((overview) => {
        loaded = true;
        render(overview);
        resumePendingInvite();
      }, showLoadError)
      .finally(() => {
        loading = null;
      });
    return loading;
  }

  function resumePendingInvite() {
    const resumed = pendingInviteCode;
    pendingInviteCode = null;
    if (resumed) void openAdd(resumed);
  }

  function ensureLoaded() {
    if (loading) return loading;
    if (loaded) return Promise.resolve();
    return load();
  }

  function refresh() {
    return loading || load();
  }

  function showAddError(message, rawCode) {
    els.addError.textContent = message;
    // มาจากลิงก์ชวนแล้วพัง ใส่รหัสไว้ในช่องให้กดค้นหาซ้ำได้
    if (rawCode && !els.input.value.trim()) els.input.value = formatFriendCode(rawCode);
    if (typeof els.addError.scrollIntoView === 'function') els.addError.scrollIntoView({ block: 'nearest' });
  }

  function setDialogBusy(busy) {
    dialogBusy = busy;
    els.dialogOk.disabled = busy;
    els.dialogCancel.disabled = busy;
    els.dialogBusy.hidden = !busy;
  }

  // run คืนข้อความ error ที่จะแสดงใน dialog หรือ null เมื่อสำเร็จ
  // คืน false เมื่อมี dialog เปิดอยู่แล้ว ไม่เปิดทับ dialog ที่กำลังทำงาน
  function openDialog({ title, text, okLabel, danger = false, failureMessage, run, onDone = null }) {
    if (els.dialog.open) return false;
    els.dialogTitle.textContent = title;
    els.dialogText.textContent = text;
    els.dialogOk.textContent = okLabel;
    els.dialogOk.className = danger ? 'danger-solid' : 'primary';
    els.dialogError.textContent = '';
    setDialogBusy(false);
    dialogAction = run;
    dialogFailureMessage = failureMessage;
    dialogDone = onDone;
    els.dialog.showModal();
    return true;
  }

  function setLookingUp(busy) {
    lookingUp = busy;
    els.addSubmit.disabled = busy;
    els.addSubmit.textContent = tr(busy ? 'web.friends.searching' : 'web.friends.search');
    if (busy) els.form.setAttribute('aria-busy', 'true');
    else els.form.removeAttribute('aria-busy');
  }

  async function openAdd(rawCode) {
    // กดค้นหาซ้ำระหว่างรอ จะยิง lookup สองครั้งและเปิด dialog ซ้อน
    if (lookingUp) return;
    els.addError.textContent = '';
    els.status.textContent = '';
    const normalized = normalizeFriendCodeInput(rawCode);
    if (!normalized) {
      showAddError(tr('web.friends.error.invalidCode'));
      return;
    }
    if (!getApi()) return;
    setLookingUp(true);
    let friend;
    try {
      await ensureLoaded();
      // ยังไม่รู้รหัสของตัวเอง จึงเทียบว่าเป็นรหัสตัวเองไม่ได้ ไม่ค้นหาต่อ
      if (!loaded) {
        pendingInviteCode = normalized;
        showLoadErrorText();
        return;
      }
      if (normalized === code) {
        showAddError(tr('web.friends.error.ownCode'));
        return;
      }
      ({ friend } = await getApi().lookupFriend(normalized));
    } catch (err) {
      showAddError(describeFriendError(statusOf(err), 'add', err.error), normalized);
      return;
    } finally {
      setLookingUp(false);
    }
    const name = displayFriendName(friend.displayName);
    const opened = openDialog({
      title: tr('web.friends.addTitle'),
      text: tr('web.friends.addText', { name }),
      okLabel: tr('web.friends.addTitle'),
      failureMessage: describeFriendError(0, 'add'),
      run: async () => {
        try {
          await getApi().addFriend(normalized);
        } catch (err) {
          return describeFriendError(statusOf(err), 'add', err.error);
        }
        els.input.value = '';
        els.status.textContent = tr('web.friends.added', { name });
        await load();
        return null;
      },
    });
    if (!opened) showAddError(tr('web.friends.dialogBusy'), normalized);
  }

  function askRemove(friend) {
    els.status.textContent = '';
    openDialog({
      title: tr('web.friends.removeTitle'),
      text: tr('web.friends.removeText', { name: displayFriendName(friend.displayName) }),
      okLabel: tr('web.friends.remove'),
      failureMessage: describeFriendError(0, 'remove'),
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
      // ปุ่มลบของแถวนั้นหายไปแล้ว ย้ายโฟกัสไปหัวข้อแทนการหลุดไปที่ body
      onDone: () => els.title.focus(),
    });
  }

  function askRenew() {
    els.status.textContent = '';
    openDialog({
      title: tr('web.friends.renewTitle'),
      text: tr('web.friends.renewText'),
      okLabel: tr('web.friends.renew'),
      failureMessage: describeFriendError(0, 'renew'),
      run: async () => {
        try {
          showCode((await getApi().regenerateFriendCode()).code);
        } catch (err) {
          return describeFriendError(statusOf(err), 'renew');
        }
        els.status.textContent = tr('web.friends.renewed');
        return null;
      },
    });
  }

  async function share() {
    // กดรัวระหว่างหน้าเลือกแชตเปิดอยู่จะเปิดซ้อนหรือคัดลอกซ้ำ
    if (sharing) return;
    sharing = true;
    els.share.disabled = true;
    try {
      await shareOnce();
    } finally {
      sharing = false;
      els.share.disabled = false;
    }
  }

  async function shareOnce() {
    els.status.textContent = '';
    const url = inviteUrl();
    if (typeof liff.isApiAvailable === 'function' && liff.isApiAvailable('shareTargetPicker')) {
      try {
        const result = await liff.shareTargetPicker([{ type: 'text', text: buildInviteMessage(url) }]);
        // ผู้ใช้ปิดหน้าเลือกแชตเองได้ผลเป็นค่าว่าง ไม่ต้องแจ้งอะไร
        if (result) els.status.textContent = tr('web.friends.linkSent');
        return;
      } catch {
        // เปิดหน้าเลือกแชตไม่ได้ ใช้การคัดลอกลิงก์แทน
      }
    }
    try {
      await clipboard.writeText(url);
      els.status.textContent = tr('web.friends.linkCopied');
    } catch {
      els.status.textContent = tr('web.friends.linkManual', { url });
    }
  }

  els.dialogOk.addEventListener('click', async () => {
    if (!dialogAction || dialogBusy) return;
    setDialogBusy(true);
    let message;
    try {
      message = await dialogAction();
    } catch {
      // action พังนอก try ของมันเอง (เช่น render) ต้องคืนปุ่มให้กดได้และบอกผู้ใช้
      message = dialogFailureMessage;
    } finally {
      setDialogBusy(false);
    }
    if (message) {
      els.dialogError.textContent = message;
      return;
    }
    const done = dialogDone;
    els.dialog.close();
    if (done) done();
  });
  els.dialogCancel.addEventListener('click', () => els.dialog.close());
  // กัน Esc ปิด dialog ระหว่างรอ request ไม่งั้นผลลัพธ์จะไม่มีที่แสดง
  els.dialog.addEventListener('cancel', (event) => {
    if (dialogBusy) event.preventDefault();
  });
  els.dialog.addEventListener('close', () => {
    // Esc ครั้งที่สอง browser บางตัวปิด dialog แม้ preventDefault แล้ว จึงเปิดกลับ
    if (dialogBusy) {
      els.dialog.showModal();
      return;
    }
    dialogAction = null;
    dialogDone = null;
  });
  els.retry.addEventListener('click', () => {
    if (!loading) load();
  });
  els.share.addEventListener('click', () => share());
  els.renew.addEventListener('click', () => askRenew());
  els.qrToggle.addEventListener('click', () => {
    const show = els.qr.hidden;
    if (show) drawQr();
    els.qr.hidden = !show;
    els.qrToggle.setAttribute('aria-expanded', String(show));
    labelQrToggle();
  });
  els.form.addEventListener('submit', (event) => {
    event.preventDefault();
    void openAdd(els.input.value);
  });

  labelQrToggle();

  return { ensureLoaded, refresh, openAdd, relabel };
}

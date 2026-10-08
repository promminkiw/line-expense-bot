import { ApiError } from './api.mjs';
import { formatBaht, formatThaiDate } from './format.mjs';
import { createLoadingIndicator } from './skeleton.mjs';
import { MEMBER_STATUS_LABELS, outstandingAmount, describeBillError, describeBillAnswer, buildBillUrl } from './bills-format.mjs';

const statusOf = (err) => (err instanceof ApiError ? err.status : 0);

// แท็บหารบิลโหลดเมื่อเข้าแท็บครั้งแรก และโหลดใหม่หลังทุกการกระทำ เพราะสถานะของเพื่อนเปลี่ยนจากฝั่งอื่นได้
export function createBillsPanel({ doc, els, getApi, liff, getLiffId, clipboard }) {
  let data = null;
  let loading = null;
  let dialogAction = null;
  let dialogBusy = false;
  const loadingIndicator = createLoadingIndicator({
    doc,
    textEl: els.loadingText,
    skeletonEl: els.skeleton,
    variants: ['bill-card', 'bill-card'],
  });

  function el(tag, className, text) {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  // สถานะอยู่บนสุดของแท็บ ผลของการ์ดด้านล่างต้องเลื่อนให้เห็น
  function setStatus(text) {
    els.status.textContent = text;
    if (text && typeof els.status.scrollIntoView === 'function') els.status.scrollIntoView({ block: 'nearest' });
  }

  function button(className, text, onClick) {
    const node = el('button', className, text);
    node.type = 'button';
    node.addEventListener('click', onClick);
    return node;
  }

  function renderIncoming(bill) {
    const item = el('li', 'bill-card');
    item.dataset.id = bill.id;
    const head = el('div', 'bill-head');
    head.append(el('span', 'bill-title', bill.title));
    if (bill.status === 'cancelled') head.append(el('span', 'bill-badge', 'ยกเลิกแล้ว'));
    else if (bill.myStatus !== 'pending') head.append(el('span', 'bill-badge', MEMBER_STATUS_LABELS[bill.myStatus]));
    item.append(head, el('p', 'bill-meta', `${bill.ownerName} · ${formatThaiDate(bill.occurredOn)}`));
    item.append(el('p', 'bill-share', `ส่วนของคุณ ${formatBaht(bill.myShare)}`));
    if (bill.status === 'open' && bill.myStatus === 'pending') {
      const actions = el('div', 'bill-actions');
      actions.append(
        button('bill-confirm', 'ยืนยัน', () => respond(bill, 'confirm', actions)),
        button('bill-decline', 'ปฏิเสธ', () => askDecline(bill, actions))
      );
      item.append(actions);
    }
    return item;
  }

  function renderMember(bill, member) {
    const row = el('li', 'bill-member');
    row.append(
      el('span', 'bill-member-name', member.displayName),
      el('span', 'bill-member-status', MEMBER_STATUS_LABELS[member.status]),
      el('span', 'bill-member-share', formatBaht(member.share))
    );
    if (member.status !== 'declined') {
      const label = el('label', 'bill-member-paid');
      const box = doc.createElement('input');
      box.type = 'checkbox';
      box.checked = member.paid;
      box.addEventListener('change', () => setPaid(bill, member, box));
      label.append(box, doc.createTextNode('คืนแล้ว'));
      row.append(label);
    }
    if (!member.notified && member.status === 'pending' && bill.status === 'open') {
      row.append(el('p', 'bill-member-note', 'แจ้งเตือนไม่ถึง (ยังไม่ได้เพิ่มบอท)'));
      row.append(button('bill-share-link', 'ส่งลิงก์บิล', () => shareBill(bill)));
    }
    return row;
  }

  function renderOwned(bill) {
    const item = el('li', 'bill-card');
    item.dataset.id = bill.id;
    const head = el('div', 'bill-head');
    head.append(el('span', 'bill-title', bill.title));
    if (bill.status === 'cancelled') head.append(el('span', 'bill-badge', 'ยกเลิกแล้ว'));
    item.append(head, el('p', 'bill-meta', `${formatThaiDate(bill.occurredOn)} · ${bill.categoryName} · รวม ${formatBaht(bill.total)}`));
    item.append(el('p', 'bill-outstanding', `ค้างรับ ${formatBaht(outstandingAmount(bill))}`));
    const members = el('ul', 'bill-members');
    members.append(...bill.members.map((member) => renderMember(bill, member)));
    item.append(members);
    if (bill.status === 'open') {
      const actions = el('div', 'bill-actions');
      actions.append(button('bill-cancel', 'ยกเลิกบิล', () => askCancel(bill)));
      item.append(actions);
    }
    return item;
  }

  function render() {
    els.incoming.replaceChildren(...data.incoming.map(renderIncoming));
    els.owned.replaceChildren(...data.owned.map(renderOwned));
    els.incomingEmpty.hidden = data.incoming.length > 0;
    els.ownedEmpty.hidden = data.owned.length > 0;
    loadingIndicator.set(false);
    els.error.hidden = true;
    els.body.hidden = false;
  }

  function load({ afterAction = false } = {}) {
    const api = getApi();
    if (!api) return Promise.resolve();
    els.error.hidden = true;
    if (!data) loadingIndicator.set(true);
    loading = api
      .listBills()
      .then(
        (result) => {
          data = result;
          render();
        },
        (err) => {
          loadingIndicator.set(false);
          // โหลดใหม่ที่พังไม่ลบรายการที่แสดงอยู่ แค่บอกผ่านบรรทัดสถานะ
          if (data) {
            // หลังกระทำสำเร็จต้องไม่ทับข้อความผลลัพธ์ ให้ต่อท้ายแทน
            const loadFailed = describeBillError(statusOf(err), 'load');
            setStatus(afterAction && els.status.textContent ? `${els.status.textContent} (${loadFailed})` : loadFailed);
            return;
          }
          els.body.hidden = true;
          els.errorText.textContent = describeBillError(statusOf(err), 'load');
          els.error.hidden = false;
        }
      )
      .finally(() => {
        loading = null;
      });
    return loading;
  }

  function ensureLoaded() {
    if (loading) return loading;
    if (data) return Promise.resolve();
    return load();
  }

  function setActionsDisabled(actions, disabled) {
    if (!actions) return;
    for (const node of actions.querySelectorAll('button')) node.disabled = disabled;
  }

  // แก้การ์ดในหน่วยความจำทันที เผื่อโหลดใหม่ไม่สำเร็จ ปุ่มจะได้ไม่ค้างอยู่
  function applyAnswerLocally(bill, resultStatus) {
    data = {
      ...data,
      incoming: data.incoming.map((item) => {
        if (item.id !== bill.id) return item;
        return resultStatus === 'cancelled' ? { ...item, status: 'cancelled' } : { ...item, myStatus: resultStatus };
      }),
    };
    render();
  }

  async function respond(bill, answer, actions) {
    els.status.textContent = '';
    setActionsDisabled(actions, true);
    let result;
    try {
      result = await (answer === 'confirm' ? getApi().confirmBill(bill.id) : getApi().declineBill(bill.id));
    } catch (err) {
      setStatus(describeBillError(statusOf(err), 'respond'));
      setActionsDisabled(actions, false);
      // บิลหายหรือเปลี่ยนไปแล้ว การ์ดเก่าไม่มีทางกดสำเร็จ จึงโหลดใหม่ (ขาดเน็ตไม่ต้อง)
      if (statusOf(err) !== 0) await load({ afterAction: true });
      return false;
    }
    const resultStatus = result && result.status;
    const requested = answer === 'confirm' ? 'confirmed' : 'declined';
    const mismatch = describeBillAnswer(answer, resultStatus);
    if (mismatch) setStatus(mismatch);
    else setStatus(answer === 'confirm' ? 'ยืนยันแล้ว บันทึกเป็นรายจ่ายของคุณ' : 'ปฏิเสธบิลแล้ว');
    applyAnswerLocally(bill, resultStatus || requested);
    await load({ afterAction: true });
    return true;
  }

  async function setPaid(bill, member, box) {
    els.status.textContent = '';
    box.disabled = true;
    try {
      await getApi().setBillPaid(bill.id, member.userId, box.checked);
      // สร้างข้อมูลใหม่แทนการแก้ object เดิม เพื่อไม่ให้ response ที่ถือร่วมกันเปลี่ยนตาม
      const paid = box.checked;
      data = {
        ...data,
        owned: data.owned.map((owned) =>
          owned.id === bill.id
            ? { ...owned, members: owned.members.map((m) => (m.userId === member.userId ? { ...m, paid } : m)) }
            : owned
        ),
      };
      render();
    } catch (err) {
      box.checked = member.paid;
      box.disabled = false;
      setStatus(describeBillError(statusOf(err), 'paid'));
      if (statusOf(err) !== 0) await load({ afterAction: true });
    }
  }

  async function shareBill(bill) {
    els.status.textContent = '';
    const url = buildBillUrl(getLiffId(), bill.id);
    if (typeof liff.isApiAvailable === 'function' && liff.isApiAvailable('shareTargetPicker')) {
      try {
        const result = await liff.shareTargetPicker([{ type: 'text', text: `ยืนยันส่วนแบ่งบิล ${bill.title} ได้ที่ลิงก์นี้ ${url}` }]);
        if (result) setStatus('ส่งลิงก์บิลแล้ว');
        return;
      } catch {
        // เปิดหน้าเลือกแชตไม่ได้ ใช้การคัดลอกลิงก์แทน
      }
    }
    try {
      await clipboard.writeText(url);
      setStatus('คัดลอกลิงก์บิลแล้ว ส่งให้เพื่อนได้เลย');
    } catch {
      setStatus(`ส่งลิงก์นี้ให้เพื่อน: ${url}`);
    }
  }

  function setDialogBusy(busy) {
    dialogBusy = busy;
    els.dialogOk.disabled = busy;
    els.dialogCancel.disabled = busy;
    els.dialogBusy.hidden = !busy;
  }

  // run คืนข้อความ error ที่จะแสดงใน dialog หรือ null เมื่อสำเร็จ
  function openDialog({ title, text, okLabel, run }) {
    els.dialogTitle.textContent = title;
    els.dialogText.textContent = text;
    els.dialogOk.textContent = okLabel;
    els.dialogError.textContent = '';
    setDialogBusy(false);
    dialogAction = run;
    els.dialog.showModal();
  }

  function askDecline(bill, actions) {
    openDialog({
      title: 'ปฏิเสธบิล',
      text: `ปฏิเสธบิล ${bill.title} ของ ${bill.ownerName}?`,
      okLabel: 'ปฏิเสธ',
      run: async () => ((await respond(bill, 'decline', actions)) ? null : els.status.textContent),
    });
  }

  function askCancel(bill) {
    openDialog({
      title: 'ยกเลิกบิล',
      text: `ยกเลิกบิล ${bill.title}? เพื่อนที่ยังไม่ตอบจะยืนยันไม่ได้ ส่วนที่บันทึกไปแล้วยังอยู่`,
      okLabel: 'ยกเลิกบิล',
      run: async () => {
        try {
          await getApi().cancelBill(bill.id);
        } catch (err) {
          const message = describeBillError(statusOf(err), 'cancel');
          if (statusOf(err) !== 0) await load({ afterAction: true });
          return message;
        }
        setStatus('ยกเลิกบิลแล้ว');
        await load({ afterAction: true });
        return null;
      },
    });
  }

  async function focusBill(id) {
    await ensureLoaded();
    // โหลดไม่สำเร็จมีกล่อง error บอกอยู่แล้ว ไม่ต้องอ้างว่าไม่พบบิล
    if (!data) return;
    const card = [...doc.querySelectorAll('#panel-bills .bill-card')].find((node) => node.dataset.id === id);
    if (!card) {
      setStatus('ไม่พบบิลนี้ อาจถูกยกเลิกแล้ว');
      return;
    }
    card.tabIndex = -1;
    if (typeof card.scrollIntoView === 'function') card.scrollIntoView({ block: 'center' });
    card.focus();
  }

  els.dialogOk.addEventListener('click', async () => {
    if (!dialogAction || dialogBusy) return;
    setDialogBusy(true);
    let message;
    try {
      message = await dialogAction();
    } catch {
      message = 'ทำรายการไม่สำเร็จ ลองใหม่อีกครั้ง';
    } finally {
      setDialogBusy(false);
    }
    if (message) {
      els.dialogError.textContent = message;
      return;
    }
    els.dialog.close();
  });
  els.dialogCancel.addEventListener('click', () => els.dialog.close());
  els.dialog.addEventListener('cancel', (event) => {
    if (dialogBusy) event.preventDefault();
  });
  els.dialog.addEventListener('close', () => {
    dialogAction = null;
  });
  els.retry.addEventListener('click', () => load());

  return { ensureLoaded, reload: load, focusBill };
}

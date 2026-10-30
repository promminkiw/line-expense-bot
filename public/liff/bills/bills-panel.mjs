import { ApiError } from '../api.mjs';
import { formatBaht } from '../format.mjs';
import { createLoadingIndicator } from '../ui/skeleton.mjs';
import { createSvgIcon } from '../ui/icons.mjs';
import { setSuccessStatus } from '../ui/success-mark.mjs';
import {
  MEMBER_STATUS_LABELS,
  BILL_LIST_LIMIT,
  outstandingAmount,
  describeBillError,
  describeBillAnswer,
  buildBillUrl,
  isOwnedBillFinished,
  isIncomingBillFinished,
  ownedBillSummary,
  incomingBillState,
  countAwaitingAnswer,
  pickInitialBillsView,
  calendarParts,
  needsShareLink,
  needsExpenseCleanup,
} from './bills-format.mjs';

const statusOf = (err) => (err instanceof ApiError ? err.status : 0);

// โหลดเมื่อเข้าแท็บครั้งแรก และหลังตอบหรือยกเลิกบิล เพราะสถานะของเพื่อนเปลี่ยนจากฝั่งอื่นได้ ส่วนติ๊กคืนแล้วแก้ในหน่วยความจำ
export function createBillsPanel({ doc, els, getApi, liff, getLiffId, clipboard }) {
  let data = null;
  let loading = null;
  let dialogAction = null;
  let dialogBusy = false;
  // บิลที่กำลังส่งคำตอบ render ใหม่ระหว่างนั้นต้องไม่เปิดปุ่มของบิลนี้กลับมา
  const sending = new Set();
  // การ์ดที่กางไว้ต้องกางอยู่หลัง render ใหม่ เช่นหลังติ๊กคืนแล้ว
  const expanded = new Set();
  // เลือกหน้าครั้งเดียวตอนโหลดแรก โหลดใหม่หลังกระทำต้องไม่สลับหน้าเอง
  let view = null;
  const loadingIndicator = createLoadingIndicator({
    doc,
    textEl: els.loadingText,
    skeletonEl: els.skeleton,
    variants: ['bill-switch', 'bill-card'],
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

  function setSuccess(text) {
    setSuccessStatus(els.status, text);
    if (text && typeof els.status.scrollIntoView === 'function') els.status.scrollIntoView({ block: 'nearest' });
  }

  function button(className, text, onClick, label) {
    const node = el('button', className, text);
    node.type = 'button';
    if (label) node.setAttribute('aria-label', label);
    node.addEventListener('click', onClick);
    return node;
  }

  function findCard(id) {
    return [...doc.querySelectorAll('#panel-bills .bill-card')].find((node) => node.dataset.id === id) || null;
  }

  // render แทนที่การ์ดทั้งหมด โฟกัสจะหลุดไปที่ body จึงย้ายกลับมาที่การ์ดเดิม
  // ถ้าการ์ดย้ายไปอยู่ในส่วนบิลที่จบแล้วที่พับไว้ ให้โฟกัสหัวของส่วนนั้นแทน
  function focusTarget(node) {
    if (!node) return;
    const folded = node.closest('details:not([open])');
    if (folded) {
      folded.querySelector('summary').focus();
      return;
    }
    node.focus();
  }

  function focusCard(card) {
    if (!card) return;
    card.tabIndex = -1;
    focusTarget(card);
  }

  // แก้ DOM ตรงๆ แทน render ใหม่ เพื่อให้โฟกัสอยู่ที่ปุ่มที่แตะ
  function setExpanded(id, open) {
    if (open) expanded.add(id);
    else expanded.delete(id);
    const card = findCard(id);
    if (!card) return;
    card.querySelector('.bill-row').setAttribute('aria-expanded', String(open));
    card.querySelector('.bill-detail').hidden = !open;
  }

  function renderCard(bill, { finished, awaiting, summary, amount }) {
    const item = el('li', `bill-card${finished ? ' is-finished' : ''}${awaiting ? ' is-awaiting' : ''}`);
    item.dataset.id = bill.id;
    const detailId = `bill-detail-${bill.id}`;
    const row = el('button', 'bill-row');
    row.type = 'button';
    row.setAttribute('aria-expanded', String(expanded.has(bill.id)));
    row.setAttribute('aria-controls', detailId);
    const { month, day } = calendarParts(bill.occurredOn);
    const cal = el('span', 'bill-cal');
    cal.append(el('small', null, month), el('b', null, day));
    const text = el('span', 'bill-text');
    text.append(el('span', 'bill-title', bill.title), el('span', 'bill-summary', summary));
    row.append(cal, text, el('span', 'bill-amount', formatBaht(amount)), createSvgIcon(doc, 'icon-chevron', 'icon bill-chevron'));
    row.addEventListener('click', () => setExpanded(bill.id, !expanded.has(bill.id)));
    const detail = el('div', 'bill-detail');
    detail.id = detailId;
    detail.hidden = !expanded.has(bill.id);
    item.append(row, detail);
    return { item, detail };
  }

  function renderIncoming(bill) {
    const awaiting = bill.status === 'open' && bill.myStatus === 'pending';
    const { item, detail } = renderCard(bill, {
      finished: isIncomingBillFinished(bill),
      awaiting,
      summary: `${bill.ownerName} · ${incomingBillState(bill)}`,
      amount: bill.myShare,
    });
    // server ไม่ส่งชื่อหมวดที่เจ้าของบิลตั้งเองมาให้เพื่อน
    const total = `รวม ${formatBaht(bill.total)}`;
    detail.append(el('p', 'bill-meta', bill.categoryName ? `${bill.categoryName} · ${total}` : total));
    // อยู่นอกส่วนที่พับ ผู้ใช้ต้องเห็นเองว่าต้องไปลบรายจ่าย
    if (needsExpenseCleanup(bill)) {
      item.append(el('p', 'bill-note', 'บิลถูกยกเลิก แต่รายจ่ายส่วนของคุณยังบันทึกอยู่ ลบเองได้ในหน้าเว็บหลัก'));
    }
    // ปุ่มตอบอยู่นอกส่วนที่พับ ตอบได้โดยไม่ต้องกาง ปุ่มปฏิเสธอยู่ซ้ายตามที่ผู้ใช้เลือก
    if (awaiting) {
      const actions = el('div', 'bill-actions');
      actions.append(
        button('bill-decline', 'ปฏิเสธ', () => askDecline(bill, actions), `ปฏิเสธบิล ${bill.title}`),
        button('bill-confirm', 'ยืนยัน', () => answerFromCard(bill, actions), `ยืนยันบิล ${bill.title}`)
      );
      setActionsDisabled(actions, sending.has(bill.id));
      item.append(actions);
    }
    return item;
  }

  function renderMember(bill, member) {
    const row = el('li', 'bill-member');
    row.dataset.userId = member.userId;
    row.append(
      el('span', 'bill-member-name', member.displayName),
      el('span', 'bill-member-status', MEMBER_STATUS_LABELS[member.status]),
      el('span', 'bill-member-share', formatBaht(member.share))
    );
    // คนที่ยังไม่ตอบบิลที่ยกเลิกแล้วไม่มีส่วนที่ต้องคืน
    if (member.status === 'confirmed' || (member.status === 'pending' && bill.status === 'open')) {
      const label = el('label', 'bill-member-paid');
      const box = doc.createElement('input');
      box.type = 'checkbox';
      box.checked = member.paid;
      box.setAttribute('aria-label', `${member.displayName} คืนแล้ว`);
      box.addEventListener('change', () => setPaid(bill, member, box));
      label.append(box, doc.createTextNode('คืนแล้ว'));
      row.append(label);
    }
    // push พังได้หลายสาเหตุ ไม่ใช่แค่เพื่อนยังไม่เพิ่มบอท ปุ่มส่งลิงก์มีปุ่มเดียวต่อบิลในแถวปุ่ม
    if (!member.notified && member.status === 'pending' && bill.status === 'open') {
      row.append(el('p', 'bill-member-note', 'แจ้งเตือนไม่ถึง ส่งลิงก์บิลให้เพื่อนแทน'));
    }
    return row;
  }

  function renderOwned(bill) {
    const finished = isOwnedBillFinished(bill);
    const { item, detail } = renderCard(bill, {
      finished,
      awaiting: false,
      summary: ownedBillSummary(bill),
      amount: finished ? bill.total : outstandingAmount(bill),
    });
    detail.append(el('p', 'bill-meta', `${bill.categoryName} · รวม ${formatBaht(bill.total)}`));
    const members = el('ul', 'bill-members');
    members.append(...bill.members.map((member) => renderMember(bill, member)));
    detail.append(members);
    if (bill.status === 'open') {
      const actions = el('div', 'bill-actions');
      actions.append(button('bill-cancel', 'ยกเลิกบิล', () => askCancel(bill), `ยกเลิกบิล ${bill.title}`));
      if (needsShareLink(bill)) actions.append(button('bill-share-link', 'ส่งลิงก์บิล', () => shareBill(bill), `ส่งลิงก์บิล ${bill.title}`));
      detail.append(actions);
    }
    return item;
  }

  function renderSection(bills, { list, empty, done, doneCount, doneList, limit, isFinished, renderOne, noneText, allDoneText }) {
    const active = bills.filter((bill) => !isFinished(bill));
    const finished = bills.filter(isFinished);
    list.replaceChildren(...active.map(renderOne));
    doneList.replaceChildren(...finished.map(renderOne));
    doneCount.textContent = String(finished.length);
    done.hidden = finished.length === 0;
    empty.textContent = bills.length === 0 ? noneText : allDoneText;
    empty.hidden = active.length > 0;
    limit.textContent = `แสดง ${BILL_LIST_LIMIT} บิลล่าสุด`;
    limit.hidden = bills.length < BILL_LIST_LIMIT;
  }

  function applyView() {
    els.incomingSection.hidden = view !== 'incoming';
    els.ownedSection.hidden = view !== 'owned';
    els.showIncoming.setAttribute('aria-pressed', String(view === 'incoming'));
    els.showOwned.setAttribute('aria-pressed', String(view === 'owned'));
  }

  function setView(next) {
    view = next;
    applyView();
  }

  function renderAwaiting() {
    const count = countAwaitingAnswer(data.incoming);
    els.awaiting.textContent = String(count);
    els.awaiting.hidden = count === 0;
    // ป้ายตัวเลขอย่างเดียวไม่บอกความหมายกับ screen reader
    if (count > 0) els.showIncoming.setAttribute('aria-label', `เพื่อนส่งมา รอคุณตอบ ${count} บิล`);
    else els.showIncoming.removeAttribute('aria-label');
  }

  function render() {
    renderSection(data.incoming, {
      list: els.incoming,
      empty: els.incomingEmpty,
      done: els.incomingDone,
      doneCount: els.incomingDoneCount,
      doneList: els.incomingDoneList,
      limit: els.incomingLimit,
      isFinished: isIncomingBillFinished,
      renderOne: renderIncoming,
      noneText: 'ยังไม่มีบิลที่เพื่อนส่งมา',
      allDoneText: 'ไม่มีบิลที่ต้องตอบหรือต้องคืน',
    });
    renderSection(data.owned, {
      list: els.owned,
      empty: els.ownedEmpty,
      done: els.ownedDone,
      doneCount: els.ownedDoneCount,
      doneList: els.ownedDoneList,
      limit: els.ownedLimit,
      isFinished: isOwnedBillFinished,
      renderOne: renderOwned,
      noneText: 'ยังไม่มีบิลที่คุณสร้าง',
      allDoneText: 'ไม่มีบิลที่เพื่อนยังค้าง',
    });
    renderAwaiting();
    if (!view) view = pickInitialBillsView(data);
    applyView();
    loadingIndicator.set(false);
    els.error.hidden = true;
    els.body.hidden = false;
  }

  function load({ afterAction = false } = {}) {
    const api = getApi();
    if (!api) return Promise.resolve();
    els.error.hidden = true;
    if (!data) loadingIndicator.set(true);
    els.retry.disabled = true;
    const request = api
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
        // โหลดซ้อนกันได้ (เช่นตอบสองการ์ดติดกัน) รอบที่จบก่อนต้องไม่ล้าง handle ของรอบใหม่
        if (loading === request) loading = null;
        els.retry.disabled = false;
      });
    loading = request;
    return request;
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
        // คำตอบเดิมคือสถานะเดียวกัน ต่างแค่ครั้งนี้ไม่ได้บันทึกใหม่
        return resultStatus === 'cancelled' ? { ...item, status: 'cancelled' } : { ...item, myStatus: resultStatus.replace(/^already_/, '') };
      }),
    };
    render();
  }

  // คืนข้อความ error เมื่อไม่สำเร็จ ให้ผู้เรียกเลือกว่าจะแสดงที่บรรทัดสถานะหรือใน dialog
  async function respond(bill, answer, actions) {
    els.status.textContent = '';
    sending.add(bill.id);
    setActionsDisabled(actions, true);
    let result;
    try {
      result = await (answer === 'confirm' ? getApi().confirmBill(bill.id) : getApi().declineBill(bill.id));
    } catch (err) {
      sending.delete(bill.id);
      setActionsDisabled(actions, false);
      // บิลหายหรือเปลี่ยนไปแล้ว การ์ดเก่าไม่มีทางกดสำเร็จ จึงโหลดใหม่ (ขาดเน็ตไม่ต้อง)
      if (statusOf(err) !== 0) await load({ afterAction: true });
      return describeBillError(statusOf(err), 'respond');
    }
    sending.delete(bill.id);
    const resultStatus = (result && result.status) || (answer === 'confirm' ? 'confirmed' : 'declined');
    const earlier = describeBillAnswer(resultStatus);
    // ใช้คำเดียวกับที่บอทตอบในแชต
    // เครื่องหมายถูกเฉพาะตอนเพิ่งยืนยันสำเร็จ ส่วนข้อความตอบซ้ำหรือปฏิเสธเป็นข้อความธรรมดา
    if (earlier) setStatus(earlier);
    else if (answer === 'confirm') setSuccess('ยืนยันแล้ว บันทึกเป็นรายจ่ายของคุณ');
    else setStatus('ปฏิเสธบิลนี้แล้ว');
    applyAnswerLocally(bill, resultStatus);
    focusCard(findCard(bill.id));
    await load({ afterAction: true });
    focusCard(findCard(bill.id));
    return null;
  }

  async function answerFromCard(bill, actions) {
    const message = await respond(bill, 'confirm', actions);
    if (message) setStatus(message);
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
      const card = findCard(bill.id);
      const row = card && [...card.querySelectorAll('.bill-member')].find((node) => node.dataset.userId === member.userId);
      const nextBox = row && row.querySelector('.bill-member-paid input');
      // คืนครบแล้วบิลย้ายไปส่วนที่พับไว้ focusTarget จะไปที่หัวของส่วนนั้นแทน
      focusTarget(nextBox);
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
        if (result) setSuccess('ส่งลิงก์บิลแล้ว');
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
  function openDialog({ title, text, okLabel, cancelLabel = 'ยกเลิก', run }) {
    els.dialogTitle.textContent = title;
    els.dialogText.textContent = text;
    els.dialogOk.textContent = okLabel;
    els.dialogCancel.textContent = cancelLabel;
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
      run: () => respond(bill, 'decline', actions),
    });
  }

  function askCancel(bill) {
    const ownerPart = bill.ownerShare > 0 ? ' รายจ่ายส่วนของคุณจะถูกลบ' : '';
    openDialog({
      title: 'ยกเลิกบิล',
      text: `ยกเลิกบิล ${bill.title}? เพื่อนที่ยังไม่ตอบจะยืนยันไม่ได้${ownerPart} ส่วนที่เพื่อนยืนยันแล้วยังอยู่`,
      okLabel: 'ยกเลิกบิล',
      // ปุ่มปิดเขียนว่า ยกเลิก จะสับสนกับปุ่ม ยกเลิกบิล
      cancelLabel: 'กลับ',
      run: async () => {
        try {
          await getApi().cancelBill(bill.id);
        } catch (err) {
          const message = describeBillError(statusOf(err), 'cancel');
          if (statusOf(err) !== 0) await load({ afterAction: true });
          return message;
        }
        setStatus('ยกเลิกบิลแล้ว');
        // server ลบรายจ่ายส่วนของเจ้าของไปพร้อมการยกเลิก
        await load({ afterAction: true });
        return null;
      },
    });
  }

  async function focusBill(id) {
    await ensureLoaded();
    // โหลดไม่สำเร็จมีกล่อง error บอกอยู่แล้ว ไม่ต้องอ้างว่าไม่พบบิล
    if (!data) return;
    const card = findCard(id);
    if (!card) {
      // บิลที่ยกเลิกแล้วยังอยู่ในรายการ ที่หาไม่เจอคือบิลเก่าเกินรายการหรือไม่ได้ส่งถึงผู้ใช้คนนี้
      setStatus('ไม่พบบิลนี้ในรายการ อาจเป็นบิลเก่าหรือไม่ได้ส่งถึงคุณ');
      return;
    }
    // บิลจากลิงก์ต้องเห็นได้ทันที จึงสลับหน้า กางส่วนที่จบแล้ว และกางการ์ด
    setView(els.ownedSection.contains(card) ? 'owned' : 'incoming');
    const folded = card.closest('details');
    if (folded) folded.open = true;
    setExpanded(id, true);
    if (typeof card.scrollIntoView === 'function') card.scrollIntoView({ block: 'center' });
    focusCard(card);
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
  els.showIncoming.addEventListener('click', () => setView('incoming'));
  els.showOwned.addEventListener('click', () => setView('owned'));

  return { ensureLoaded, reload: load, focusBill, showStatus: setStatus };
}

import { ApiError } from './api.mjs';
import { createLoadingIndicator } from './skeleton.mjs';
import { LOGIN_REQUIRED_MESSAGE, currentDate, formatBaht } from './format.mjs';
import { splitGoals, goalRow, contributionRows, describeGoalError } from './goals-format.mjs';

const statusOf = (err) => (err instanceof ApiError ? err.status : 0);
const errorOf = (err) => (err instanceof ApiError ? err.error : undefined);
const ROW_ACTION_LABEL = 'ออมเพิ่ม';

// แท็บออม: โหลดตอนเข้าแท็บเท่านั้น และโหลดใหม่ทุกครั้งเพราะผู้ใช้อาจออมผ่านแชตระหว่างนั้น
export function createGoalsPanel({ doc, els, getApi }) {
  let goals = [];
  let loaded = false;
  let loading = null;
  let editorBusy = false;
  let editorOpen = false;
  // เป้าที่กำลังแก้ ถ้าเป็น null แปลว่ากำลังสร้างเป้าใหม่
  let editing = null;
  let detailOpen = false;
  let detailBusy = false;
  // จำ id แทนตัวเป้า เพราะหลังโหลดใหม่ต้องใช้ยอดล่าสุดของเป้าเดิม
  let viewing = null;
  const loadingIndicator = createLoadingIndicator({ doc, textEl: els.loadingText, skeletonEl: els.skeleton, count: 3, variant: 'budget' });

  function onRowClick(row) {
    openDetail(row);
  }

  function renderRow(row) {
    const item = doc.createElement('li');
    item.className = row.reached ? 'goal-row reached' : 'goal-row';
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'budget-button';
    button.dataset.goalId = row.id;
    const name = doc.createElement('span');
    name.className = 'budget-label';
    name.textContent = row.name;
    const action = doc.createElement('span');
    action.className = 'budget-edit';
    action.textContent = ROW_ACTION_LABEL;
    const value = doc.createElement('span');
    value.className = 'budget-value';
    value.textContent = row.text;
    // ใช้ span เพราะใน button ใส่ div ไม่ได้
    const track = doc.createElement('span');
    track.className = 'budget-track';
    const fill = doc.createElement('span');
    fill.className = 'budget-fill';
    fill.style.width = `${row.width}%`;
    fill.dataset.width = String(row.width);
    track.append(fill);
    button.append(name, action, value, track);
    if (row.dateText) {
      const date = doc.createElement('span');
      date.className = 'goal-date';
      date.textContent = row.dateText;
      button.append(date);
    }
    button.addEventListener('click', () => onRowClick(row));
    item.append(button);
    return item;
  }

  function render() {
    const { open, closed } = splitGoals(goals);
    els.rows.replaceChildren(...open.map(renderRow));
    els.empty.hidden = open.length > 0;
    els.closed.hidden = closed.length === 0;
    els.closedCount.textContent = `ปิดแล้ว ${closed.length} เป้า`;
    els.closedRows.replaceChildren(...closed.map(renderRow));
    loadingIndicator.set(false);
    els.error.hidden = true;
    els.body.hidden = false;
  }

  function showLoadError(err) {
    loadingIndicator.set(false);
    // โหลดซ้ำหลังบันทึกแล้วพัง ยังแสดงรายการเดิมไว้
    if (!loaded) els.body.hidden = true;
    const loginRequired = statusOf(err) === 401;
    els.errorText.textContent = loginRequired ? LOGIN_REQUIRED_MESSAGE : 'โหลดเป้าออมไม่สำเร็จ';
    // เข้าสู่ระบบใหม่ไม่ได้แก้ด้วยการลองโหลดซ้ำ
    els.retry.hidden = loginRequired;
    els.error.hidden = false;
  }

  function load() {
    const api = getApi();
    if (!api) return Promise.resolve();
    els.error.hidden = true;
    if (!loaded) loadingIndicator.set(true);
    loading = api
      .listGoals()
      .then((result) => {
        goals = result.goals;
        loaded = true;
        els.add.disabled = false;
        render();
      }, showLoadError)
      .finally(() => {
        loading = null;
      });
    return loading;
  }

  function refresh() {
    return loading || load();
  }

  function setEditorBusy(next) {
    editorBusy = next;
    for (const el of [els.editorSave, els.editorClose, els.editorName, els.editorTarget, els.editorDate, els.editorClosed]) {
      el.disabled = next;
    }
    els.editorBusy.hidden = !next;
  }

  function setEditorError(text) {
    els.editorError.textContent = text;
    els.editorError.hidden = !text;
  }

  function openEditor(goal) {
    editing = goal;
    editorOpen = true;
    els.editorTitle.textContent = goal ? 'แก้เป้า' : 'สร้างเป้าใหม่';
    els.editorName.value = goal ? goal.name : '';
    els.editorTarget.value = goal ? String(goal.targetAmount) : '';
    els.editorDate.value = goal && goal.targetDate ? goal.targetDate : '';
    els.editorClosed.checked = goal ? goal.closed : false;
    els.editorClosedRow.hidden = !goal;
    setEditorError('');
    els.editor.showModal();
    // แก้เป้าเดิมไม่ควรเด้งคีย์บอร์ดทันที จึงโฟกัสหัวข้อ เว้นแต่สร้างเป้าใหม่
    (goal ? els.editorTitle : els.editorName).focus();
  }

  function closeEditor() {
    editorOpen = false;
    editing = null;
    els.editor.close();
  }

  function readEditor() {
    return {
      name: els.editorName.value.trim(),
      targetAmount: Number(els.editorTarget.value),
      targetDate: els.editorDate.value || null,
    };
  }

  function changesFor(goal, input) {
    const changes = {};
    if (input.name !== goal.name) changes.name = input.name;
    if (input.targetAmount !== goal.targetAmount) changes.targetAmount = input.targetAmount;
    if (input.targetDate !== goal.targetDate) changes.targetDate = input.targetDate;
    if (els.editorClosed.checked !== goal.closed) changes.closed = els.editorClosed.checked;
    return changes;
  }

  function savedMessage(goal, body, name) {
    if (!goal) return `สร้างเป้า ${name} แล้ว`;
    if (body.closed === true) return `ปิดเป้า ${name} แล้ว`;
    if (body.closed === false) return `เปิดเป้า ${name} อีกครั้งแล้ว`;
    return `บันทึกเป้า ${name} แล้ว`;
  }

  async function submitEditor() {
    const goal = editing;
    const input = readEditor();
    const body = goal ? changesFor(goal, input) : input;
    if (goal && Object.keys(body).length === 0) {
      closeEditor();
      return;
    }
    setEditorError('');
    setEditorBusy(true);
    try {
      if (goal) await getApi().updateGoal(goal.id, body);
      else await getApi().createGoal(body);
    } catch (err) {
      setEditorError(describeGoalError(statusOf(err), errorOf(err)));
      return;
    } finally {
      setEditorBusy(false);
    }
    els.status.textContent = savedMessage(goal, body, input.name);
    closeEditor();
    await load();
    els.title.focus();
  }

  function currentGoal() {
    return goals.find((goal) => goal.id === viewing) ?? null;
  }

  function setDetailBusy(next) {
    detailBusy = next;
    for (const el of [els.detailAmount, els.detailDate, els.detailSave, els.detailClose, els.detailEdit]) el.disabled = next;
    for (const button of els.history.querySelectorAll('button')) button.disabled = next;
    els.detailBusy.hidden = !next;
  }

  function setDetailError(text) {
    els.detailError.textContent = text;
    els.detailError.hidden = !text;
  }

  function renderDetailHead() {
    const goal = currentGoal();
    if (!goal) return;
    const row = goalRow(goal);
    els.detailTitle.textContent = row.name;
    els.detailProgress.textContent = row.text;
    els.detailForm.hidden = row.closed;
    els.detailClosedNote.hidden = !row.closed;
  }

  function renderHistoryRow(row) {
    const item = doc.createElement('li');
    item.className = 'friend-row';
    const text = doc.createElement('span');
    text.textContent = row.text;
    const remove = doc.createElement('button');
    remove.type = 'button';
    remove.className = 'friend-remove';
    remove.textContent = 'ลบ';
    remove.setAttribute('aria-label', row.label);
    remove.addEventListener('click', () => removeContribution(row.id));
    item.append(text, remove);
    return item;
  }

  function renderHistory(contributions) {
    const rows = contributionRows(contributions);
    els.history.replaceChildren(...rows.map(renderHistoryRow));
    els.historyEmpty.hidden = rows.length > 0;
    const goal = currentGoal();
    els.historyLimit.hidden = !goal || goal.contributionCount <= rows.length;
  }

  async function loadHistory() {
    const id = viewing;
    els.historyLoading.hidden = false;
    els.historyError.hidden = true;
    try {
      const result = await getApi().listGoalContributions(id);
      if (viewing === id) renderHistory(result.contributions);
    } catch (err) {
      if (viewing !== id) return;
      els.historyError.textContent = statusOf(err) === 401 ? LOGIN_REQUIRED_MESSAGE : 'โหลดประวัติการออมไม่สำเร็จ';
      els.historyError.hidden = false;
    } finally {
      if (viewing === id) els.historyLoading.hidden = true;
    }
  }

  function openDetail(goal) {
    viewing = goal.id;
    detailOpen = true;
    els.detailAmount.value = '';
    els.detailDate.value = currentDate(new Date());
    els.detailStatus.textContent = '';
    setDetailError('');
    els.history.replaceChildren();
    els.historyEmpty.hidden = true;
    els.historyLimit.hidden = true;
    renderDetailHead();
    els.detail.showModal();
    els.detailTitle.focus();
    loadHistory();
  }

  function closeDetail() {
    detailOpen = false;
    viewing = null;
    els.detail.close();
  }

  // หลังบันทึกโหลดทั้งรายการเป้าและประวัติใหม่ เพื่อให้ยอดมาจาก SQL เสมอ
  async function runDetail(request, message) {
    setDetailError('');
    els.detailStatus.textContent = '';
    setDetailBusy(true);
    try {
      await request();
    } catch (err) {
      setDetailError(describeGoalError(statusOf(err), errorOf(err)));
      return false;
    } finally {
      setDetailBusy(false);
    }
    els.detailStatus.textContent = message;
    await load();
    renderDetailHead();
    await loadHistory();
    return true;
  }

  async function addContribution() {
    const amount = Number(els.detailAmount.value);
    const occurredOn = els.detailDate.value;
    const saved = await runDetail(() => getApi().addGoalContribution(viewing, { amount, occurredOn }), `ออมเพิ่ม ${formatBaht(amount)} แล้ว`);
    if (saved) els.detailAmount.value = '';
  }

  function removeContribution(id) {
    if (detailBusy) return;
    runDetail(() => getApi().deleteGoalContribution(viewing, id), 'ลบรายการออมแล้ว');
  }

  els.add.addEventListener('click', () => openEditor(null));
  els.retry.addEventListener('click', () => {
    if (!loading) load();
  });
  els.editorForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (editorBusy || !editorOpen) return;
    await submitEditor();
  });
  els.editorClose.addEventListener('click', () => {
    if (!editorBusy) closeEditor();
  });
  // กัน Esc ปิด dialog ระหว่างรอ request ไม่งั้นข้อผิดพลาดที่ตามมาจะไม่มีที่แสดง
  els.editor.addEventListener('cancel', (event) => {
    if (editorBusy) event.preventDefault();
  });
  els.editor.addEventListener('close', () => {
    // browser บางตัวปิด dialog แม้ preventDefault แล้ว จึงเปิดกลับ
    if (editorBusy) {
      els.editor.showModal();
      return;
    }
    editorOpen = false;
    editing = null;
  });

  els.detailForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (detailBusy || !detailOpen) return;
    await addContribution();
  });
  els.detailClose.addEventListener('click', () => {
    if (!detailBusy) closeDetail();
  });
  els.detailEdit.addEventListener('click', () => {
    const goal = currentGoal();
    if (detailBusy || !goal) return;
    closeDetail();
    openEditor(goal);
  });
  // กัน Esc ปิด dialog ระหว่างรอ request ไม่งั้นข้อผิดพลาดที่ตามมาจะไม่มีที่แสดง
  els.detail.addEventListener('cancel', (event) => {
    if (detailBusy) event.preventDefault();
  });
  els.detail.addEventListener('close', () => {
    // browser บางตัวปิด dialog แม้ preventDefault แล้ว จึงเปิดกลับ
    if (detailBusy) {
      els.detail.showModal();
      return;
    }
    detailOpen = false;
    viewing = null;
  });

  return { refresh };
}

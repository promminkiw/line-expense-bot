import { ApiError } from './api.mjs';
import { createCategoryBadge } from './categories.mjs';
import { describeCategoryError } from './categories-format.mjs';

const statusOf = (err) => (err instanceof ApiError ? err.status : 0);
const errorOf = (err) => (err instanceof ApiError ? err.error : undefined);

// ส่วนจัดการหมวดในแท็บโปรไฟล์ ใช้หมวดชุดเดียวกับทั้งหน้า แก้แล้วส่งชุดใหม่ให้ app อัปเดตตัวเลือกหมวดทุกที่
export function createCategoriesPanel({ doc, els, getApi, getCategories, onChanged }) {
  let busy = false;
  let renaming = null;

  function setBusy(next) {
    busy = next;
    els.addSubmit.disabled = next;
    els.dialogSave.disabled = next;
    els.dialogCancel.disabled = next;
    for (const button of els.section.querySelectorAll('.category-actions button')) button.disabled = next;
  }

  function setStatus(text) {
    els.status.textContent = text;
  }

  // render สร้างแถวใหม่ทั้งหมด โฟกัสเดิมหายไป จึงต้องคืนโฟกัสให้ปุ่มของแถวเดิม
  function focusRowButton(categoryId, action) {
    els.section.querySelector(`[data-category-id="${categoryId}"] [data-action="${action}"]`)?.focus();
  }

  function actionButton(label, ariaLabel, action, onClick) {
    const button = doc.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.dataset.action = action;
    button.setAttribute('aria-label', ariaLabel);
    button.disabled = busy;
    button.addEventListener('click', onClick);
    return button;
  }

  function renderRow(category) {
    const item = doc.createElement('li');
    item.className = 'category-row';
    item.dataset.categoryId = category.id;
    const name = doc.createElement('span');
    name.className = 'category-row-name';
    name.append(createCategoryBadge(doc, category.name), doc.createTextNode(category.name));
    item.append(name);
    if (category.hidden) {
      const tag = doc.createElement('span');
      tag.className = 'category-hidden-tag';
      tag.textContent = 'ซ่อนอยู่';
      item.append(tag);
    }
    if (category.system) {
      const note = doc.createElement('span');
      note.className = 'category-system-note';
      note.textContent = 'หมวดของระบบ';
      item.append(note);
      return item;
    }
    const toggleLabel = category.hidden ? 'เลิกซ่อน' : 'ซ่อน';
    const actions = doc.createElement('div');
    actions.className = 'category-actions';
    actions.append(
      actionButton('เปลี่ยนชื่อ', `เปลี่ยนชื่อหมวด ${category.name}`, 'rename', () => openRename(category)),
      actionButton(toggleLabel, `${toggleLabel}หมวด ${category.name}`, 'toggle-hidden', () => toggleHidden(category))
    );
    item.append(actions);
    return item;
  }

  function render() {
    const categories = getCategories();
    els.section.hidden = categories.length === 0;
    els.expenseRows.replaceChildren(...categories.filter((category) => category.type === 'expense').map(renderRow));
    els.incomeRows.replaceChildren(...categories.filter((category) => category.type === 'income').map(renderRow));
  }

  async function update(category, changes, showError) {
    setBusy(true);
    try {
      const { category: updated } = await getApi().updateCategory(category.id, changes);
      onChanged(getCategories().map((item) => (item.id === updated.id ? updated : item)));
      return updated;
    } catch (err) {
      showError(describeCategoryError(statusOf(err), errorOf(err)));
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function toggleHidden(category) {
    if (busy) return;
    setStatus('');
    els.toggleError.textContent = '';
    const updated = await update(category, { hidden: !category.hidden }, (message) => {
      els.toggleError.textContent = message;
    });
    if (updated) setStatus(updated.hidden ? `ซ่อนหมวด ${updated.name} แล้ว` : `เลิกซ่อนหมวด ${updated.name} แล้ว`);
    focusRowButton(category.id, 'toggle-hidden');
  }

  function openRename(category) {
    renaming = category;
    els.dialogName.value = category.name;
    els.dialogError.textContent = '';
    els.dialog.showModal();
    els.dialogName.focus();
  }

  els.dialogForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy || !renaming) return;
    els.dialogError.textContent = '';
    const updated = await update(renaming, { name: els.dialogName.value.trim() }, (message) => {
      els.dialogError.textContent = message;
    });
    if (!updated) return;
    const renamedId = renaming.id;
    renaming = null;
    els.dialog.close();
    setStatus(`เปลี่ยนชื่อหมวดเป็น ${updated.name} แล้ว`);
    focusRowButton(renamedId, 'rename');
  });

  els.dialogCancel.addEventListener('click', () => els.dialog.close());
  // กัน Esc ปิด dialog ระหว่างรอ request ไม่งั้นข้อผิดพลาดที่ตามมาจะไม่มีที่แสดง
  els.dialog.addEventListener('cancel', (event) => {
    if (busy) event.preventDefault();
  });
  els.dialog.addEventListener('close', () => {
    // browser บางตัวปิด dialog แม้ preventDefault แล้ว จึงเปิดกลับ
    if (busy) {
      els.dialog.showModal();
      return;
    }
    renaming = null;
  });

  els.addForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy) return;
    els.addError.textContent = '';
    setStatus('');
    setBusy(true);
    try {
      const { category } = await getApi().createCategory({ type: els.addType.value, name: els.addName.value.trim() });
      els.addName.value = '';
      onChanged([...getCategories(), category]);
      setStatus(`เพิ่มหมวด ${category.name} แล้ว`);
    } catch (err) {
      els.addError.textContent = describeCategoryError(statusOf(err), errorOf(err));
    } finally {
      setBusy(false);
    }
  });

  return { render };
}

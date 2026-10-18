import { ApiError } from './api.mjs';
import { createCategoryBadge, effectiveIconKey } from './categories.mjs';
import { CATEGORY_ICONS } from './category-icons.mjs';
import { describeCategoryError } from './categories-format.mjs';
import { createSvgIcon } from './icons.mjs';

const statusOf = (err) => (err instanceof ApiError ? err.status : 0);
const errorOf = (err) => (err instanceof ApiError ? err.error : undefined);
const TYPE_LABELS = { expense: 'รายจ่าย', income: 'รายรับ' };
const DEFAULT_NEW_ICON = 'other';

// หน้าหมวดของฉัน แตะการ์ดเพื่อแก้ใน sheet แก้แล้วส่งชุดใหม่ให้ app อัปเดตตัวเลือกหมวดทุกที่
export function createCategoriesPanel({ doc, els, getApi, getCategories, onChanged }) {
  let busy = false;
  let type = 'expense';
  let showHidden = false;
  let sheetOpen = false;
  // หมวดที่กำลังแก้ ถ้าเป็น null แปลว่ากำลังเพิ่มหมวดใหม่
  let editing = null;
  let pickedIcon = DEFAULT_NEW_ICON;
  // การ์ดถูกสร้างใหม่ทุกครั้งที่ render จึงจำ selector ไว้คืนโฟกัสแทนการจำ element
  let returnFocus = null;

  function setBusy(next) {
    busy = next;
    els.sheetSave.disabled = next;
    els.sheetCancel.disabled = next;
    els.sheetClose.disabled = next;
    els.sheetName.disabled = next;
    els.sheetHidden.disabled = next;
    els.sheetBusy.hidden = !next;
    for (const button of els.sheetIcons.querySelectorAll('button')) button.disabled = next;
  }

  function setStatus(text) {
    els.status.textContent = text;
  }

  function focusSelector(selector) {
    if (selector) els.page.querySelector(selector)?.focus();
  }

  function tileSelector(category) {
    return `.category-tile[data-category-id="${category.id}"]`;
  }

  function appendTileContent(target, category) {
    const name = doc.createElement('span');
    name.className = 'category-tile-name';
    name.textContent = category.name;
    target.append(createCategoryBadge(doc, category.name, { icon: category.icon, type: category.type }), name);
  }

  function renderTile(category) {
    const item = doc.createElement('li');
    if (category.system) {
      const tile = doc.createElement('div');
      tile.className = 'category-tile system';
      appendTileContent(tile, category);
      const note = doc.createElement('span');
      note.className = 'sr-only';
      note.textContent = 'หมวดของระบบ แก้ไม่ได้';
      tile.append(createSvgIcon(doc, 'icon-lock', 'icon category-lock'), note);
      item.append(tile);
      return item;
    }
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'category-tile';
    button.dataset.categoryId = category.id;
    button.setAttribute('aria-label', `แก้หมวด ${category.name}`);
    appendTileContent(button, category);
    button.addEventListener('click', () => openSheet(category));
    item.append(button);
    return item;
  }

  function renderAddTile() {
    const item = doc.createElement('li');
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'category-tile add';
    button.dataset.action = 'add';
    const badge = doc.createElement('span');
    badge.className = 'category-add-badge';
    badge.append(createSvgIcon(doc, 'icon-plus'));
    const label = doc.createElement('span');
    label.className = 'category-tile-name';
    label.textContent = 'เพิ่มหมวด';
    button.append(badge, label);
    button.addEventListener('click', () => openSheet(null));
    item.append(button);
    return item;
  }

  function render() {
    const categories = getCategories();
    for (const [segmentType, button] of [
      ['expense', els.segExpense],
      ['income', els.segIncome],
    ]) {
      const count = categories.filter((category) => category.type === segmentType && !category.hidden).length;
      button.textContent = `${TYPE_LABELS[segmentType]} · ${count}`;
      button.setAttribute('aria-pressed', String(segmentType === type));
    }
    const ofType = categories.filter((category) => category.type === type);
    const hidden = ofType.filter((category) => category.hidden);
    els.tiles.replaceChildren(...ofType.filter((category) => !category.hidden).map(renderTile), renderAddTile());
    els.hiddenToggle.hidden = hidden.length === 0;
    els.hiddenText.textContent = `ซ่อนอยู่ ${hidden.length} หมวด`;
    els.hiddenToggle.setAttribute('aria-expanded', String(showHidden && hidden.length > 0));
    els.hiddenTiles.hidden = !showHidden || hidden.length === 0;
    els.hiddenTiles.replaceChildren(...hidden.map(renderTile));
  }

  function selectType(next) {
    if (next === type) return;
    type = next;
    showHidden = false;
    setStatus('');
    render();
  }

  function renderPreview() {
    const name = editing ? editing.name : '';
    const previewType = editing ? editing.type : type;
    els.sheetPreview.replaceChildren(createCategoryBadge(doc, name, { icon: pickedIcon, type: previewType }));
  }

  function pickIcon(key) {
    pickedIcon = key;
    for (const button of els.sheetIcons.querySelectorAll('button[data-icon]')) {
      button.setAttribute('aria-pressed', String(button.dataset.icon === key));
    }
    renderPreview();
  }

  function renderIconChoices() {
    els.sheetIcons.replaceChildren(
      ...CATEGORY_ICONS.map(({ key, label }) => {
        const button = doc.createElement('button');
        button.type = 'button';
        button.dataset.icon = key;
        button.setAttribute('aria-label', label);
        button.setAttribute('aria-pressed', String(key === pickedIcon));
        button.append(createSvgIcon(doc, `cat-${key}`));
        button.addEventListener('click', () => pickIcon(key));
        return button;
      })
    );
  }

  function openSheet(category) {
    editing = category;
    sheetOpen = true;
    returnFocus = category ? tileSelector(category) : '[data-action="add"]';
    pickedIcon = category ? effectiveIconKey(category) : DEFAULT_NEW_ICON;
    els.sheetTitle.textContent = category ? 'แก้หมวด' : `เพิ่มหมวด${TYPE_LABELS[type]}`;
    els.sheetName.value = category ? category.name : '';
    els.sheetHidden.checked = category ? category.hidden : false;
    els.sheetHiddenRow.hidden = !category;
    els.sheetError.textContent = '';
    renderIconChoices();
    renderPreview();
    els.sheet.showModal();
    // แก้ไอคอนอย่างเดียวไม่ควรเด้งคีย์บอร์ดมาบังตาราง จึงโฟกัสหัวข้อ เว้นแต่เพิ่มหมวดใหม่
    (category ? els.sheetTitle : els.sheetName).focus();
  }

  // ปิดเองแล้วคืนโฟกัสทันที เพราะ event close ไม่ได้ยิงในทุก browser
  function closeSheet(focusAfter) {
    sheetOpen = false;
    editing = null;
    returnFocus = null;
    els.sheet.close();
    focusSelector(focusAfter);
  }

  async function send(request) {
    setBusy(true);
    try {
      return await request();
    } catch (err) {
      els.sheetError.textContent = describeCategoryError(statusOf(err), errorOf(err));
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function submitAdd(name) {
    const result = await send(() => getApi().createCategory({ type, name, icon: pickedIcon }));
    if (!result) return;
    const created = result.category;
    // หมวดใหม่ยังไม่มีรายการ จึงไม่ต้องโหลดรายการ งบ และรายการประจำใหม่
    onChanged([...getCategories(), created], { refresh: false });
    setStatus(`เพิ่มหมวด ${created.name} แล้ว`);
    closeSheet(tileSelector(created));
  }

  function changesFor(category, name) {
    const changes = {};
    if (name !== category.name) changes.name = name;
    if (pickedIcon !== effectiveIconKey(category)) changes.icon = pickedIcon;
    if (els.sheetHidden.checked !== category.hidden) changes.hidden = els.sheetHidden.checked;
    return changes;
  }

  function savedMessage(updated, changes) {
    if (changes.hidden === true) return `ซ่อนหมวด ${updated.name} แล้ว`;
    if (changes.hidden === false) return `เลิกซ่อนหมวด ${updated.name} แล้ว`;
    return `บันทึกหมวด ${updated.name} แล้ว`;
  }

  async function submitEdit(name) {
    const category = editing;
    const changes = changesFor(category, name);
    if (Object.keys(changes).length === 0) {
      closeSheet(tileSelector(category));
      return;
    }
    const result = await send(() => getApi().updateCategory(category.id, changes));
    if (!result) return;
    const updated = result.category;
    onChanged(
      getCategories().map((item) => (item.id === updated.id ? updated : item)),
      { refresh: true }
    );
    setStatus(savedMessage(updated, changes));
    // หมวดที่เพิ่งซ่อนอาจอยู่ในส่วนที่พับไว้ จึงให้โฟกัสปุ่มเปิดส่วนนั้นแทน
    closeSheet(updated.hidden && !showHidden ? '#category-hidden-toggle' : tileSelector(updated));
  }

  els.sheetForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy || !sheetOpen) return;
    els.sheetError.textContent = '';
    const name = els.sheetName.value.trim();
    if (editing) await submitEdit(name);
    else await submitAdd(name);
  });

  els.sheetCancel.addEventListener('click', () => closeSheet(returnFocus));
  els.sheetClose.addEventListener('click', () => closeSheet(returnFocus));
  // กัน Esc ปิด sheet ระหว่างรอ request ไม่งั้นข้อผิดพลาดที่ตามมาจะไม่มีที่แสดง
  els.sheet.addEventListener('cancel', (event) => {
    if (busy) event.preventDefault();
  });
  els.sheet.addEventListener('close', () => {
    // browser บางตัวปิด dialog แม้ preventDefault แล้ว จึงเปิดกลับ
    if (busy) {
      els.sheet.showModal();
      return;
    }
    // ปิดด้วย Esc ไม่ผ่าน closeSheet จึงล้างสถานะและคืนโฟกัสที่นี่
    if (sheetOpen) {
      const target = returnFocus;
      sheetOpen = false;
      editing = null;
      returnFocus = null;
      focusSelector(target);
    }
  });

  els.segExpense.addEventListener('click', () => selectType('expense'));
  els.segIncome.addEventListener('click', () => selectType('income'));
  els.hiddenToggle.addEventListener('click', () => {
    showHidden = !showHidden;
    render();
  });

  return { render };
}

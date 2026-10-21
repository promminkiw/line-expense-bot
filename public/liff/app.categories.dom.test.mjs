// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { CATEGORIES, settle, makeFetch, boot, byId, routeFetch, clickTab, cleanupGlobals } from './dom-harness.mjs';

afterEach(cleanupGlobals);

describe('LIFF categories page', () => {
  const MANAGED = [
    { id: 'c-food', name: 'อาหาร', type: 'expense', hidden: false, system: false, icon: null },
    { id: 'c-trip', name: 'เดินทาง', type: 'expense', hidden: true, system: false, icon: null },
    { id: 'c-cat', name: 'ค่าแมว', type: 'expense', hidden: false, system: false, icon: 'pet' },
    { id: 'c-other', name: 'อื่นๆ', type: 'expense', hidden: false, system: true, icon: null },
    { id: 'c-salary', name: 'เงินเดือน', type: 'income', hidden: false, system: false, icon: null },
  ];

  // หยุด boot ที่ liff.init เพื่อให้ route ใช้กับการโหลดหมวดครั้งแรกด้วย และเก็บ body ที่ส่งไว้ตรวจ
  async function openPage(route = () => undefined) {
    const liff = await boot({ holdInit: true });
    const calls = [];
    const bodies = [];
    const fallback = makeFetch({});
    vi.stubGlobal('fetch', async (url, options = {}) => {
      const path = new URL(url, 'http://localhost').pathname;
      const method = options.method ?? 'GET';
      calls.push(`${method} ${path}`);
      if (options.body) bodies.push({ call: `${method} ${path}`, body: JSON.parse(options.body) });
      const routed = route(method, path);
      const override = routed !== undefined ? routed : method === 'GET' && path === '/api/categories' ? { categories: MANAGED } : undefined;
      return override === undefined ? fallback(url, options) : makeFetch({ [path]: override })(url, options);
    });
    liff.releaseInit();
    await settle();
    clickTab('budgets');
    byId('categories-open').click();
    return { calls, bodies };
  }

  const tileNames = (id = 'category-tiles') => [...byId(id).querySelectorAll('.category-tile-name')].map((el) => el.textContent);
  const tileOf = (id) => document.querySelector(`.category-tile[data-category-id="${id}"]`);
  const optionsOf = (id) => [...byId(id).options].map((option) => option.textContent);
  const submitSheet = () => byId('category-sheet-form').dispatchEvent(new Event('submit', { cancelable: true }));
  const isOpen = () => byId('category-sheet').hasAttribute('open');

  it('opens from the bottom of the budgets tab as a page without the bottom nav', async () => {
    await openPage();

    expect(byId('panel-categories').hidden).toBe(false);
    expect(byId('panel-budgets').hidden).toBe(true);
    expect(byId('bottom-nav').hidden).toBe(true);
    expect(byId('page-title').textContent).toBe('หมวดของฉัน');
    expect(byId('month').hidden).toBe(true);
    expect(byId('page-back').hidden).toBe(false);
    expect(document.activeElement).toBe(byId('page-back'));
  });

  it('goes back to the budgets tab', async () => {
    await openPage();

    byId('page-back').click();

    expect(byId('panel-categories').hidden).toBe(true);
    expect(byId('panel-budgets').hidden).toBe(false);
    expect(byId('bottom-nav').hidden).toBe(false);
    expect(byId('page-back').hidden).toBe(true);
    expect(byId('page-title').textContent).toBe('จัดการงบประมาณ');
    expect(byId('month').hidden).toBe(false);
    expect(document.activeElement).toBe(byId('categories-open'));
  });

  it('marks the app as a sub page while open and keeps the back label for the budgets tab', async () => {
    await openPage();

    expect(byId('app').classList.contains('sub-page')).toBe(true);
    expect(byId('page-back').getAttribute('aria-label')).toBe('กลับไปจัดการงบ');

    byId('page-back').click();

    expect(byId('app').classList.contains('sub-page')).toBe(false);
  });

  it('shows the visible tiles of the selected type, a locked system tile and the add tile last', async () => {
    await openPage();

    expect(byId('category-seg-expense').textContent).toBe('รายจ่าย · 3');
    expect(byId('category-seg-income').textContent).toBe('รายรับ · 1');
    expect(byId('category-seg-expense').getAttribute('aria-pressed')).toBe('true');
    expect(tileNames()).toEqual(['อาหาร', 'ค่าแมว', 'อื่นๆ', 'เพิ่มหมวด']);
    const system = [...byId('category-tiles').querySelectorAll('.category-tile.system')];
    expect(system).toHaveLength(1);
    expect(system[0].tagName).toBe('DIV');
    expect(system[0].querySelector('.category-lock')).not.toBeNull();
    expect(tileOf('c-cat').querySelector('.cat-badge use').getAttribute('href')).toBe('#cat-pet');
    expect(tileOf('c-cat').querySelector('.cat-badge').classList.contains('cat-tone-expense')).toBe(true);
    expect(byId('category-tiles').lastElementChild.querySelector('[data-action="add"]')).not.toBeNull();
  });

  it('switches to the income tiles', async () => {
    await openPage();

    byId('category-seg-income').click();

    expect(byId('category-seg-income').getAttribute('aria-pressed')).toBe('true');
    expect(tileNames()).toEqual(['เงินเดือน', 'เพิ่มหมวด']);
    expect(tileOf('c-salary').querySelector('.cat-badge').classList.contains('cat-tone-income')).toBe(true);
    expect(byId('category-hidden-toggle').hidden).toBe(true);
  });

  it('expands the hidden categories', async () => {
    await openPage();

    expect(byId('category-hidden-text').textContent).toBe('ซ่อนอยู่ 1 หมวด');
    expect(byId('category-hidden-tiles').hidden).toBe(true);
    byId('category-hidden-toggle').click();

    expect(byId('category-hidden-toggle').getAttribute('aria-expanded')).toBe('true');
    expect(byId('category-hidden-tiles').hidden).toBe(false);
    expect(tileNames('category-hidden-tiles')).toEqual(['เดินทาง']);
  });

  it('deletes a category after showing what will move', async () => {
    const { calls } = await openPage((method, path) => {
      if (method === 'GET' && path === '/api/categories/c-cat/usage') return { usage: { transactions: 2, recurring: 0, bills: 0 } };
      // makeFetch ตอบ null เป็น 404 จึงใช้ {} แทน 204
      if (method === 'DELETE' && path === '/api/categories/c-cat') return {};
      return undefined;
    });
    const listBefore = calls.filter((call) => call === 'GET /api/transactions').length;

    tileOf('c-cat').click();
    expect(byId('category-sheet-delete-row').hidden).toBe(false);
    byId('category-sheet-delete').click();
    await settle();

    expect(byId('category-sheet-confirm').hidden).toBe(false);
    expect(byId('category-sheet-confirm-text').textContent).toBe(
      'ลบหมวด ค่าแมว? รายการ 2 รายการ จะย้ายไปหมวด อื่นๆ และงบของหมวดนี้จะหายไป'
    );
    expect(document.activeElement).toBe(byId('category-sheet-confirm-cancel'));
    byId('category-sheet-confirm-ok').click();
    await settle();

    expect(calls).toContain('DELETE /api/categories/c-cat');
    expect(isOpen()).toBe(false);
    expect(tileNames()).toEqual(['อาหาร', 'อื่นๆ', 'เพิ่มหมวด']);
    expect(byId('category-status').textContent).toBe('ลบหมวด ค่าแมว แล้ว');
    // รายการที่ย้ายไป อื่นๆ ต้องแสดงชื่อหมวดใหม่ จึงโหลดใหม่
    expect(calls.filter((call) => call === 'GET /api/transactions').length).toBe(listBefore + 1);
    expect(document.activeElement).toBe(document.querySelector('[data-action="add"]'));
  });

  it('keeps the category when the user backs out of the delete', async () => {
    const { calls } = await openPage((method, path) =>
      method === 'GET' && path === '/api/categories/c-cat/usage' ? { usage: { transactions: 0, recurring: 0, bills: 0 } } : undefined
    );

    tileOf('c-cat').click();
    byId('category-sheet-delete').click();
    await settle();
    byId('category-sheet-confirm-cancel').click();

    expect(byId('category-sheet-confirm').hidden).toBe(true);
    expect(isOpen()).toBe(true);
    expect(document.activeElement).toBe(byId('category-sheet-delete'));
    expect(calls.some((call) => call.startsWith('DELETE'))).toBe(false);
  });

  it('has no delete button when adding and shows the reason when the delete fails', async () => {
    await openPage((method, path) => {
      if (method === 'GET' && path === '/api/categories/c-cat/usage') return { usage: { transactions: 0, recurring: 0, bills: 0 } };
      return undefined;
    });

    document.querySelector('[data-action="add"]').click();
    expect(byId('category-sheet-delete-row').hidden).toBe(true);
    byId('category-sheet-cancel').click();

    const original = globalThis.fetch;
    vi.stubGlobal('fetch', async (url, options = {}) =>
      options.method === 'DELETE' ? new Response(JSON.stringify({ error: 'Not found' }), { status: 404 }) : original(url, options)
    );
    tileOf('c-cat').click();
    byId('category-sheet-delete').click();
    await settle();
    byId('category-sheet-confirm-ok').click();
    await settle();

    expect(isOpen()).toBe(true);
    expect(byId('category-sheet-error').textContent).toBe('ไม่พบหมวดนี้แล้ว ลองเปิดหน้าใหม่');
    expect(tileOf('c-cat')).not.toBeNull();
  });

  it('changes the icon of a category and sends only the icon', async () => {
    const { bodies } = await openPage((method, path) =>
      method === 'PATCH' && path === '/api/categories/c-food' ? { category: { ...MANAGED[0], icon: 'coffee' } } : undefined
    );

    tileOf('c-food').click();
    expect(isOpen()).toBe(true);
    expect(byId('category-sheet-title').textContent).toBe('แก้หมวด');
    expect(byId('category-sheet-name').value).toBe('อาหาร');
    expect(byId('category-sheet-hidden-row').hidden).toBe(false);
    expect(byId('category-sheet-icons').querySelector('[aria-pressed="true"]').dataset.icon).toBe('food');
    expect(byId('category-sheet-icons').querySelectorAll('button')).toHaveLength(36);

    byId('category-sheet-icons').querySelector('[data-icon="coffee"]').click();
    expect(byId('category-sheet-preview').querySelector('use').getAttribute('href')).toBe('#cat-coffee');
    submitSheet();
    await settle();

    expect(bodies).toContainEqual({ call: 'PATCH /api/categories/c-food', body: { icon: 'coffee' } });
    expect(isOpen()).toBe(false);
    expect(tileOf('c-food').querySelector('.cat-badge use').getAttribute('href')).toBe('#cat-coffee');
    expect(byId('category-status').textContent).toBe('บันทึกหมวด อาหาร แล้ว');
    expect(document.activeElement).toBe(tileOf('c-food'));
  });

  it('closes without a request when nothing changed', async () => {
    const { calls } = await openPage();

    tileOf('c-cat').click();
    submitSheet();
    await settle();

    expect(calls.filter((call) => call.startsWith('PATCH'))).toEqual([]);
    expect(isOpen()).toBe(false);
  });

  it('adds a category of the selected type with the picked icon and reloads only the budgets', async () => {
    const created = { id: 'c-new', name: 'กาแฟ', type: 'expense', hidden: false, system: false, icon: 'coffee' };
    const { calls, bodies } = await openPage((method, path) => (method === 'POST' && path === '/api/categories' ? { category: created } : undefined));
    const count = (call) => calls.filter((item) => item === call).length;
    const listBefore = count('GET /api/transactions');
    const budgetsBefore = count('GET /api/budgets');
    const recurringBefore = count('GET /api/recurring');

    document.querySelector('[data-action="add"]').click();
    expect(byId('category-sheet-title').textContent).toBe('เพิ่มหมวดรายจ่าย');
    expect(byId('category-sheet-hidden-row').hidden).toBe(true);
    expect(byId('category-sheet-icons').querySelector('[aria-pressed="true"]').dataset.icon).toBe('other');
    byId('category-sheet-name').value = '  กาแฟ ';
    byId('category-sheet-icons').querySelector('[data-icon="coffee"]').click();
    submitSheet();
    await settle();

    expect(bodies).toContainEqual({ call: 'POST /api/categories', body: { type: 'expense', name: 'กาแฟ', icon: 'coffee' } });
    expect(tileNames()).toEqual(['อาหาร', 'ค่าแมว', 'อื่นๆ', 'กาแฟ', 'เพิ่มหมวด']);
    expect(optionsOf('edit-category')).toContain('กาแฟ');
    expect(count('GET /api/transactions')).toBe(listBefore);
    expect(count('GET /api/recurring')).toBe(recurringBefore);
    // หน้างบแสดงหมวดรายจ่ายทุกหมวดแม้ยังไม่ตั้งงบ หมวดใหม่จึงต้องโหลดงบใหม่
    expect(count('GET /api/budgets')).toBe(budgetsBefore + 1);
    expect(document.activeElement).toBe(tileOf('c-new'));
  });

  it('does not reload the budgets after adding an income category', async () => {
    const created = { id: 'c-bonus', name: 'โบนัส', type: 'income', hidden: false, system: false, icon: null };
    const { calls } = await openPage((method, path) => (method === 'POST' && path === '/api/categories' ? { category: created } : undefined));
    const budgetsBefore = calls.filter((call) => call === 'GET /api/budgets').length;

    byId('category-seg-income').click();
    document.querySelector('[data-action="add"]').click();
    byId('category-sheet-name').value = 'โบนัส';
    submitSheet();
    await settle();

    expect(tileNames()).toContain('โบนัส');
    expect(calls.filter((call) => call === 'GET /api/budgets').length).toBe(budgetsBefore);
  });

  it('hides a category from the sheet and moves focus to the hidden toggle', async () => {
    const { bodies } = await openPage((method, path) =>
      method === 'PATCH' && path === '/api/categories/c-food' ? { category: { ...MANAGED[0], hidden: true } } : undefined
    );

    tileOf('c-food').click();
    byId('category-sheet-hidden').checked = true;
    submitSheet();
    await settle();

    expect(bodies).toContainEqual({ call: 'PATCH /api/categories/c-food', body: { hidden: true } });
    expect(tileNames()).toEqual(['ค่าแมว', 'อื่นๆ', 'เพิ่มหมวด']);
    expect(byId('category-hidden-text').textContent).toBe('ซ่อนอยู่ 2 หมวด');
    expect(byId('category-status').textContent).toBe('ซ่อนหมวด อาหาร แล้ว');
    expect(optionsOf('edit-category')).not.toContain('อาหาร');
    expect(document.activeElement).toBe(byId('category-hidden-toggle'));
  });

  it('refreshes the list and recurring rules after an edit', async () => {
    const { calls } = await openPage((method, path) =>
      method === 'PATCH' && path === '/api/categories/c-food' ? { category: { ...MANAGED[0], name: 'ข้าว' } } : undefined
    );
    const count = (path) => calls.filter((call) => call === `GET ${path}`).length;
    const listBefore = count('/api/transactions');
    const recurringBefore = count('/api/recurring');

    tileOf('c-food').click();
    byId('category-sheet-name').value = 'ข้าว';
    submitSheet();
    await settle();

    expect(count('/api/transactions')).toBe(listBefore + 1);
    expect(count('/api/recurring')).toBe(recurringBefore + 1);
  });

  it('keeps the sheet open with the reason when saving fails', async () => {
    await openPage((method, path) => (method === 'PATCH' && path === '/api/categories/c-food' ? { status: 409, error: 'Duplicate name' } : undefined));

    tileOf('c-food').click();
    byId('category-sheet-name').value = 'ค่าแมว';
    submitSheet();
    await settle();

    expect(isOpen()).toBe(true);
    expect(byId('category-sheet-error').textContent).toBe('มีหมวดชื่อนี้อยู่แล้ว');
  });

  it('keeps the sheet open while the save is in flight', async () => {
    await openPage();
    let release;
    const gate = new Promise((resolve) => (release = resolve));
    const original = globalThis.fetch;
    vi.stubGlobal('fetch', async (url, options = {}) => {
      if (options.method === 'PATCH') await gate;
      return original(url, options);
    });

    tileOf('c-food').click();
    byId('category-sheet-name').value = 'ข้าว';
    submitSheet();
    await settle();

    expect(byId('category-sheet-cancel').disabled).toBe(true);
    expect(byId('category-sheet-close').disabled).toBe(true);
    const escape = new Event('cancel', { cancelable: true });
    byId('category-sheet').dispatchEvent(escape);
    expect(escape.defaultPrevented).toBe(true);
    expect(isOpen()).toBe(true);
    release();
    await settle();
  });

  it('focuses the title, not the name, when editing', async () => {
    await openPage();

    tileOf('c-food').click();

    expect(document.activeElement).toBe(byId('category-sheet-title'));
  });

  it('focuses the name when adding', async () => {
    await openPage();

    document.querySelector('[data-action="add"]').click();

    expect(document.activeElement).toBe(byId('category-sheet-name'));
  });

  it('returns focus to the tile that opened the sheet after cancel or close', async () => {
    await openPage();

    tileOf('c-food').click();
    byId('category-sheet-cancel').click();
    expect(isOpen()).toBe(false);
    expect(document.activeElement).toBe(tileOf('c-food'));

    document.querySelector('[data-action="add"]').click();
    byId('category-sheet-close').click();
    expect(isOpen()).toBe(false);
    expect(document.activeElement).toBe(document.querySelector('[data-action="add"]'));
  });

  it('shows a saving status and locks the form while in flight', async () => {
    await openPage();
    let release;
    const gate = new Promise((resolve) => (release = resolve));
    const original = globalThis.fetch;
    vi.stubGlobal('fetch', async (url, options = {}) => {
      if (options.method === 'PATCH') await gate;
      return original(url, options);
    });

    tileOf('c-food').click();
    expect(byId('category-sheet-busy').hidden).toBe(true);
    byId('category-sheet-name').value = 'ข้าว';
    submitSheet();
    await settle();

    expect(byId('category-sheet-busy').hidden).toBe(false);
    expect(byId('category-sheet-busy').textContent).toBe('กำลังบันทึก...');
    expect(byId('category-sheet-name').disabled).toBe(true);
    expect(byId('category-sheet-hidden').disabled).toBe(true);
    expect([...byId('category-sheet-icons').querySelectorAll('button')].every((button) => button.disabled)).toBe(true);
    release();
    await settle();

    expect(byId('category-sheet-busy').hidden).toBe(true);
    expect(byId('category-sheet-name').disabled).toBe(false);
  });

  it('clears the previous status when the page is entered again', async () => {
    await openPage((method, path) =>
      method === 'PATCH' && path === '/api/categories/c-food' ? { category: { ...MANAGED[0], icon: 'coffee' } } : undefined
    );
    tileOf('c-food').click();
    byId('category-sheet-icons').querySelector('[data-icon="coffee"]').click();
    submitSheet();
    await settle();
    expect(byId('category-status').textContent).not.toBe('');

    byId('page-back').click();
    byId('categories-open').click();

    expect(byId('category-status').textContent).toBe('');
  });

  it('keeps the sheet open with the server reason when adding fails', async () => {
    await openPage((method, path) => (method === 'POST' && path === '/api/categories' ? { status: 409, error: 'Duplicate name' } : undefined));

    document.querySelector('[data-action="add"]').click();
    byId('category-sheet-name').value = 'อาหาร';
    submitSheet();
    await settle();

    expect(isOpen()).toBe(true);
    expect(byId('category-sheet-error').textContent).toBe('มีหมวดชื่อนี้อยู่แล้ว');
  });

  it('unhides a hidden category', async () => {
    const { bodies } = await openPage((method, path) =>
      method === 'PATCH' && path === '/api/categories/c-trip' ? { category: { ...MANAGED[1], hidden: false } } : undefined
    );

    byId('category-hidden-toggle').click();
    tileOf('c-trip').click();
    byId('category-sheet-hidden').checked = false;
    submitSheet();
    await settle();

    expect(bodies).toContainEqual({ call: 'PATCH /api/categories/c-trip', body: { hidden: false } });
    expect(tileNames()).toEqual(['อาหาร', 'เดินทาง', 'ค่าแมว', 'อื่นๆ', 'เพิ่มหมวด']);
    expect(byId('category-hidden-toggle').hidden).toBe(true);
    expect(byId('category-status').textContent).toBe('เลิกซ่อนหมวด เดินทาง แล้ว');
  });

  it('keeps hidden categories out of the pickers but in the list filter', async () => {
    await openPage();

    expect(optionsOf('edit-category')).toEqual(['อาหาร', 'ค่าแมว', 'อื่นๆ', 'เงินเดือน']);
    expect(optionsOf('recurring-category')).toEqual(['อาหาร', 'ค่าแมว', 'อื่นๆ', 'เงินเดือน']);
    expect(optionsOf('filter-category')).toEqual(['ทุกหมวด', 'อาหาร', 'เดินทาง (ซ่อนอยู่)', 'ค่าแมว', 'อื่นๆ', 'เงินเดือน']);
  });

  it('keeps the hidden category selected when editing an old entry in it', async () => {
    await openPage();
    byId('page-back').click();
    clickTab('list');

    [...document.querySelectorAll('#list .row-button')].find((button) => button.textContent.includes('BTS')).click();
    await settle();

    expect(byId('edit-category').value).toBe('c-trip');
    expect(optionsOf('edit-category')).toContain('เดินทาง (ซ่อนอยู่)');
  });

  it('keeps the hidden category selected when editing a recurring rule in it', async () => {
    const rule = { id: 'r-trip', type: 'expense', categoryId: 'c-trip', amount: 1200, dayOfMonth: 5, note: 'ค่ารถ', active: true };
    await openPage((method, path) => (method === 'GET' && path === '/api/recurring' ? { rules: [rule] } : undefined));
    byId('page-back').click();

    byId('recurring-rows').querySelector('.recurring-row button').click();
    await settle();

    expect(byId('recurring-category').value).toBe('c-trip');
    expect(optionsOf('recurring-category')).toEqual(['อาหาร', 'เดินทาง (ซ่อนอยู่)', 'ค่าแมว', 'อื่นๆ', 'เงินเดือน']);
  });

  it('no longer has a category section in the profile tab', async () => {
    await openPage();

    expect(byId('categories-manager')).toBeNull();
    expect(byId('category-dialog')).toBeNull();
  });
});

describe('LIFF recurring page under the me tab', () => {
  async function openRecurring() {
    await boot();
    clickTab('profile');
    byId('recurring-open').click();
  }

  it('puts the menu groups right after the profile card', async () => {
    await boot();
    clickTab('profile');

    const entry = byId('recurring-open');
    expect(entry.disabled).toBe(false);
    expect(byId('panel-profile').contains(entry)).toBe(true);
    expect(byId('profile-card').nextElementSibling.contains(entry)).toBe(true);
    expect(byId('profile-card').nextElementSibling.querySelector('.menu-group')).not.toBeNull();
  });

  it('opens the recurring list as a page without the bottom nav', async () => {
    await openRecurring();

    expect(byId('panel-recurring').hidden).toBe(false);
    expect(byId('panel-profile').hidden).toBe(true);
    expect(byId('bottom-nav').hidden).toBe(true);
    expect(byId('page-title').textContent).toBe('รายการประจำ');
    expect(byId('month').hidden).toBe(true);
    expect(byId('page-back').hidden).toBe(false);
    expect(byId('page-back').getAttribute('aria-label')).toBe('กลับไปหน้าฉัน');
    expect(document.activeElement).toBe(byId('page-back'));
    expect(byId('recurring-add').disabled).toBe(false);
  });

  it('goes back to the me tab and returns focus to the entry button', async () => {
    await openRecurring();

    byId('page-back').click();

    expect(byId('panel-recurring').hidden).toBe(true);
    expect(byId('panel-profile').hidden).toBe(false);
    expect(byId('bottom-nav').hidden).toBe(false);
    expect(byId('page-back').hidden).toBe(true);
    expect(byId('page-title').textContent).toBe('ฉัน');
    expect(document.activeElement).toBe(byId('recurring-open'));
  });

  it('still goes back to the budgets tab from the categories page after visiting the recurring page', async () => {
    await openRecurring();
    byId('page-back').click();
    clickTab('budgets');
    byId('categories-open').click();

    expect(byId('page-back').getAttribute('aria-label')).toBe('กลับไปจัดการงบ');

    byId('page-back').click();

    expect(byId('panel-budgets').hidden).toBe(false);
    expect(byId('panel-profile').hidden).toBe(true);
    expect(byId('panel-categories').hidden).toBe(true);
  });

  it('keeps the entry button usable and opens the page when the recurring list fails to load', async () => {
    await boot({ overrides: { '/api/recurring': { status: 500 } } });
    clickTab('profile');

    expect(byId('recurring-error').hidden).toBe(false);
    expect(byId('recurring-open').disabled).toBe(false);

    byId('recurring-open').click();

    expect(byId('panel-recurring').hidden).toBe(false);
    expect(byId('recurring-error').hidden).toBe(false);
  });
});

describe('LIFF categories page opened from the me tab', () => {
  it('opens from the me tab and goes back to the me tab', async () => {
    await boot();
    clickTab('profile');
    const open = byId('me-categories-open');
    expect(open.disabled).toBe(false);

    open.click();

    expect(byId('panel-categories').hidden).toBe(false);
    expect(byId('page-title').textContent).toBe('หมวดของฉัน');
    expect(byId('page-back').getAttribute('aria-label')).toBe('กลับไปหน้าฉัน');

    byId('page-back').click();

    expect(byId('panel-categories').hidden).toBe(true);
    expect(byId('panel-profile').hidden).toBe(false);
    expect(byId('page-title').textContent).toBe('ฉัน');
    expect(document.activeElement).toBe(byId('me-categories-open'));
  });

  it('keeps the budgets tab entry going back to the budgets tab', async () => {
    await boot();
    clickTab('budgets');
    byId('categories-open').click();

    expect(byId('page-back').getAttribute('aria-label')).toBe('กลับไปจัดการงบ');

    byId('page-back').click();

    expect(byId('panel-budgets').hidden).toBe(false);
    expect(byId('panel-profile').hidden).toBe(true);
  });
});

describe('LIFF wallets and notification pages under the me tab', () => {
  it.each([
    ['wallets-open', 'panel-wallets', 'wallets', 'กระเป๋าเงิน'],
    ['notify-open', 'panel-notify', 'notify', 'การแจ้งเตือน'],
  ])('opens %s as a page and goes back to the me tab', async (openId, panelId, sectionId, title) => {
    await boot();
    clickTab('profile');
    await settle();
    expect(byId(openId).disabled).toBe(false);

    byId(openId).click();

    expect(byId(panelId).hidden).toBe(false);
    expect(byId(panelId).contains(byId(sectionId))).toBe(true);
    expect(byId('panel-profile').hidden).toBe(true);
    expect(byId('bottom-nav').hidden).toBe(true);
    expect(byId('page-title').textContent).toBe(title);
    expect(byId('page-back').getAttribute('aria-label')).toBe('กลับไปหน้าฉัน');

    byId('page-back').click();

    expect(byId(panelId).hidden).toBe(true);
    expect(byId('panel-profile').hidden).toBe(false);
    expect(byId('page-title').textContent).toBe('ฉัน');
    expect(document.activeElement).toBe(byId(openId));
  });

  it.each([
    ['wallets-open', ['wallets']],
    ['notify-open', ['notify', 'notify-body']],
    ['friends-open', ['friends', 'friends-body']],
  ])('loads the page on entry when the me tab was opened before liff was ready and the first load failed (%s)', async (openId, visibleIds) => {
    const liff = await boot({ holdInit: true, overrides: { '/api/categories': { status: 500 } } });
    clickTab('profile');
    liff.releaseInit();
    await settle();
    routeFetch(() => undefined);

    byId(openId).click();
    await settle();

    for (const id of visibleIds) expect(byId(id).hidden).toBe(false);
  });
});

describe('LIFF friends page under the me tab', () => {
  it('opens the friends section as a page and goes back to the me tab', async () => {
    await boot();
    clickTab('profile');
    await settle();
    expect(byId('friends-open').disabled).toBe(false);

    byId('friends-open').click();

    expect(byId('panel-friends').hidden).toBe(false);
    expect(byId('panel-friends').contains(byId('friends'))).toBe(true);
    expect(byId('page-title').textContent).toBe('เพื่อนและหารบิล');
    expect(byId('page-back').getAttribute('aria-label')).toBe('กลับไปหน้าฉัน');

    byId('page-back').click();

    expect(byId('panel-friends').hidden).toBe(true);
    expect(byId('panel-profile').hidden).toBe(false);
    expect(byId('page-title').textContent).toBe('ฉัน');
    expect(document.activeElement).toBe(byId('friends-open'));
  });

  it('shows the friends page itself when the app is opened from an invite link', async () => {
    await boot({ search: '?friend=wxyz-2345' });
    await settle();

    expect(byId('panel-friends').hidden).toBe(false);
    expect(byId('panel-profile').hidden).toBe(true);
    expect(byId('bottom-nav').hidden).toBe(true);
    expect(byId('page-title').textContent).toBe('เพื่อนและหารบิล');
    expect(byId('friend-dialog').hasAttribute('open')).toBe(true);

    byId('friend-dialog-cancel').click();
    byId('page-back').click();

    expect(byId('panel-profile').hidden).toBe(false);
    expect(byId('bottom-nav').hidden).toBe(false);
    expect(document.querySelector('#bottom-nav [aria-current="page"]').dataset.tab).toBe('profile');
  });

  it('shows the friends page from the start for an invite link, before liff is ready', async () => {
    const liff = await boot({ search: '?friend=WXYZ2345', holdInit: true });

    expect(byId('panel-friends').hidden).toBe(false);
    expect(byId('panel-list').hidden).toBe(true);
    expect(byId('bottom-nav').hidden).toBe(true);
    expect(byId('page-title').textContent).toBe('เพื่อนและหารบิล');
    liff.releaseInit();
    await settle();
  });
});

describe('LIFF usage page under the me tab', () => {
  it('keeps the usage page alone when a tab link finishes booting after the row was tapped', async () => {
    const liff = await boot({ holdInit: true, search: '?tab=summary' });
    clickTab('profile');
    byId('tips-open').click();
    liff.releaseInit();
    await settle();

    expect(byId('panel-tips').hidden).toBe(false);
    expect(byId('panel-summary').hidden).toBe(true);
    expect(byId('panel-list').hidden).toBe(true);
  });

  it('keeps both category rows disabled when there are no categories', async () => {
    await boot({ overrides: { '/api/categories': { categories: [] } } });

    expect(byId('me-categories-open').disabled).toBe(true);
    expect(byId('categories-open').disabled).toBe(true);
  });

  it('opens the usage tips as a page and goes back to the me tab', async () => {
    await boot();
    clickTab('profile');
    expect(byId('tips-open').disabled).toBe(false);

    byId('tips-open').click();

    expect(byId('panel-tips').hidden).toBe(false);
    expect(document.querySelectorAll('#panel-tips .profile-tips li')).toHaveLength(6);
    expect(byId('page-title').textContent).toBe('วิธีใช้งาน');
    expect(byId('page-back').getAttribute('aria-label')).toBe('กลับไปหน้าฉัน');

    byId('page-back').click();

    expect(byId('panel-tips').hidden).toBe(true);
    expect(byId('panel-profile').hidden).toBe(false);
    expect(document.activeElement).toBe(byId('tips-open'));
  });

  it('keeps the profile card without the usage tips', async () => {
    await boot();
    clickTab('profile');

    expect(byId('profile-card').querySelector('.profile-tips')).toBeNull();
    expect(byId('profile-card').querySelector('.balance-card')).not.toBeNull();
    expect(byId('profile-card').querySelectorAll('.profile-stats .stat')).toHaveLength(3);
  });
});

describe('LIFF bill form with a hidden category', () => {
  it('does not offer a hidden expense category', async () => {
    const liff = await boot({ search: '?tab=bills', holdInit: true });
    routeFetch((method, path) =>
      method === 'GET' && path === '/api/categories'
        ? { categories: [...CATEGORIES, { id: 'c-old', name: 'เก่า', type: 'expense', hidden: true }] }
        : undefined
    );
    liff.releaseInit();
    await settle();

    byId('bill-new').click();
    await settle();

    expect([...byId('bill-form-category').options].map((option) => option.textContent)).toEqual(['อาหาร', 'เดินทาง']);
  });
});

describe('LIFF category icons on rows', () => {
  const WITH_ICON = { categories: [{ ...CATEGORIES[0], icon: 'coffee' }, ...CATEGORIES.slice(1)] };

  it('shows the icon the user picked on list rows and the chart', async () => {
    await boot({ overrides: { '/api/categories': WITH_ICON } });

    const row = [...document.querySelectorAll('#list .row')].find((item) => item.textContent.includes('ข้าวมันไก่'));
    expect(row.querySelector('.cat-badge use').getAttribute('href')).toBe('#cat-coffee');
    expect(row.querySelector('.cat-badge').classList.contains('cat-tone-expense')).toBe(true);
    expect(byId('chart-rows').querySelector('.cat-badge use').getAttribute('href')).toBe('#cat-coffee');
  });

  it('keeps the default icon and uses the income tone for income rows', async () => {
    await boot();

    const salary = [...document.querySelectorAll('#list .row')].find((item) => item.textContent.includes('เงินเดือน'));
    expect(salary.querySelector('.cat-badge use').getAttribute('href')).toBe('#cat-salary');
    expect(salary.querySelector('.cat-badge').classList.contains('cat-tone-income')).toBe(true);
  });
});

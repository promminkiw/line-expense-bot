// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { settle, boot, byId, routeFetch, clickTab, cleanupGlobals } from './dom-harness.mjs';

afterEach(cleanupGlobals);

describe('LIFF device back button on sub pages', () => {
  const pressDeviceBack = () => window.dispatchEvent(new PopStateEvent('popstate', { state: null }));

  async function openWallets() {
    await boot();
    clickTab('profile');
    await settle();
    byId('wallets-open').click();
  }

  it('adds one history entry when a sub page opens', async () => {
    await boot();
    clickTab('profile');
    await settle();
    const push = vi.spyOn(window.history, 'pushState');

    byId('wallets-open').click();

    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith({ subPage: true }, '');
    push.mockRestore();
  });

  it('goes back to the me tab when the device back button is pressed', async () => {
    await openWallets();

    pressDeviceBack();

    expect(byId('panel-wallets').hidden).toBe(true);
    expect(byId('panel-profile').hidden).toBe(false);
    expect(byId('bottom-nav').hidden).toBe(false);
    expect(byId('page-title').textContent).toBe('ฉัน');
    expect(document.activeElement).toBe(byId('wallets-open'));
    // ผู้ใช้กดย้อนเองอยู่แล้ว ห้ามย้อนซ้ำจนออกจากเว็บ
    expect(window.history.back).not.toHaveBeenCalled();
  });

  it('goes back to the budgets tab from the categories page opened there', async () => {
    await boot();
    clickTab('budgets');
    await settle();
    byId('categories-open').click();
    expect(byId('panel-categories').hidden).toBe(false);

    pressDeviceBack();

    expect(byId('panel-categories').hidden).toBe(true);
    expect(byId('panel-budgets').hidden).toBe(false);
  });

  it('uses up the history entry when the in-page back button is pressed', async () => {
    await openWallets();

    byId('page-back').click();

    expect(byId('panel-wallets').hidden).toBe(true);
    expect(byId('panel-profile').hidden).toBe(false);
    expect(window.history.back).toHaveBeenCalledTimes(1);
    // popstate ที่ตามมาจากการย้อนนั้นไม่ทำอะไรซ้ำ
    pressDeviceBack();
    expect(byId('panel-profile').hidden).toBe(false);
  });

  it('ignores the device back button when no sub page is open', async () => {
    await boot();
    clickTab('profile');
    await settle();

    pressDeviceBack();

    expect(byId('panel-profile').hidden).toBe(false);
    expect(byId('bottom-nav').hidden).toBe(false);
  });

  it('can open the same page again after going back with the device button', async () => {
    await openWallets();
    pressDeviceBack();
    const push = vi.spyOn(window.history, 'pushState');

    byId('wallets-open').click();

    expect(byId('panel-wallets').hidden).toBe(false);
    expect(push).toHaveBeenCalledTimes(1);
    push.mockRestore();
  });

  it('adds only one entry for the friend link that opens the friends page at boot', async () => {
    const push = vi.spyOn(window.history, 'pushState');
    await boot({ search: '?friend=WXYZ2345' });

    expect(byId('panel-friends').hidden).toBe(false);
    expect(push).toHaveBeenCalledTimes(1);
    push.mockRestore();

    pressDeviceBack();

    expect(byId('panel-friends').hidden).toBe(true);
    expect(byId('panel-profile').hidden).toBe(false);
  });
});

const BUDGET_SAMPLE = {
  budgets: [
    { categoryId: 'c-food', category: 'อาหาร', budget: 6000, spent: 4200 },
    { categoryId: 'c-shop', category: 'ช้อปปิ้ง', budget: 3000, spent: 3450 },
    { categoryId: 'c-trip', category: 'เดินทาง', budget: 2000, spent: 1900 },
    { categoryId: 'c-fun', category: 'บันเทิง', budget: null, spent: 620 },
    { categoryId: 'c-other', category: 'อื่นๆ', budget: null, spent: 150 },
  ],
};

async function openBudgets(overrides = {}) {
  await boot({ overrides: { '/api/budgets': BUDGET_SAMPLE, ...overrides } });
  clickTab('budgets');
  await settle();
}

describe('LIFF budgets page', () => {
  it('shows the total used and what is left in the hero', async () => {
    await openBudgets();

    expect(byId('budget-hero-percent').textContent).toBe('86%');
    expect(byId('budget-hero-rest').textContent).toBe('เหลือ 1,450 บาท');
    expect(byId('budget-hero-percent').className).toContain('level-warn');
  });

  it('draws one column per risk category sorted by usage, all with the same track height', async () => {
    await openBudgets();
    const cols = [...byId('budget-risk-bars').querySelectorAll('.budget-col')];

    expect(byId('budget-risk-title').textContent).toBe('ต้องดูแล 2 หมวด');
    expect(cols.map((col) => col.dataset.categoryId)).toEqual(['c-shop', 'c-trip']);
    expect(cols[0].querySelector('.budget-col-pct').textContent).toBe('115%');
    expect(cols[0].querySelector('.budget-bar-over').style.height).toBe('19.5px');
    expect(cols[1].querySelector('.budget-bar-over').style.height).toBe('0px');
    expect(cols[0].querySelector('.budget-bar-fill').className).toContain('level-over');
    expect(cols[1].querySelector('.budget-bar-fill').className).toContain('level-warn');
    expect(cols[0].getAttribute('aria-label')).toBe('ช้อปปิ้ง 115% ของงบ เกิน 450');
  });

  it('hides the loading and error states once the budgets are drawn', async () => {
    await openBudgets();

    expect(byId('budgets').hidden).toBe(false);
    expect(byId('budgets-loading').hidden).toBe(true);
    expect(byId('budgets-skeleton').hidden).toBe(true);
    expect(byId('budgets-error').hidden).toBe(true);
    expect(byId('budget-empty').hidden).toBe(true);
  });

  it('lists the names and what is left under the columns', async () => {
    await openBudgets();
    const names = [...byId('budget-risk-names').querySelectorAll('.budget-col-name')];

    expect(names.map((name) => name.querySelector('.budget-col-name-text').textContent)).toEqual(['ช้อปปิ้ง', 'เดินทาง']);
    expect(names.map((name) => name.querySelector('.budget-col-diff').textContent)).toEqual(['เกิน 450', 'เหลือ 100']);
  });

  it('draws the 100 percent and 80 percent lines after the columns so they stay on top', async () => {
    await openBudgets();
    const children = [...byId('budget-risk-plot').children];
    const barsIndex = children.indexOf(byId('budget-risk-bars'));
    const lineIndex = children.findIndex((child) => child.classList.contains('budget-line-100'));

    expect(barsIndex).toBeGreaterThan(-1);
    expect(lineIndex).toBeGreaterThan(barsIndex);
    expect(children.some((child) => child.classList.contains('budget-line-80'))).toBe(true);
  });

  it('hides the risk card when nothing needs attention', async () => {
    await openBudgets({ '/api/budgets': { budgets: [{ categoryId: 'c-food', category: 'อาหาร', budget: 6000, spent: 600 }] } });

    expect(byId('budget-risk').hidden).toBe(true);
    expect(byId('budget-calm-list').querySelectorAll('.budget-calm-item')).toHaveLength(1);
  });

  it('shows calm categories with their percent and a link to see all of them', async () => {
    await openBudgets();
    const items = [...byId('budget-calm-list').querySelectorAll('.budget-calm-item')];

    expect(byId('budget-calm-title').textContent).toBe('ปกติ 1 หมวด');
    expect(items.map((item) => item.textContent)).toEqual(['อาหาร70%']);
    expect(byId('budget-all-open').textContent).toBe('ดูทั้งหมด 3 หมวด ›');
  });

  it('summarises the unset categories', async () => {
    await openBudgets();

    expect(byId('budget-unset').hidden).toBe(false);
    expect(byId('budget-unset-text').textContent).toBe('ยังไม่ตั้งงบ 2 หมวด');
  });

  it('hides the unset strip when every category has a budget', async () => {
    await openBudgets({ '/api/budgets': { budgets: [BUDGET_SAMPLE.budgets[0]] } });

    expect(byId('budget-unset').hidden).toBe(true);
  });

  it('opens the existing budget editor when a column is tapped', async () => {
    await openBudgets();

    byId('budget-risk-bars').querySelector('.budget-col').click();

    expect(byId('budget-editor').hasAttribute('open')).toBe(true);
    expect(byId('budget-title').textContent).toBe('ช้อปปิ้ง');
  });

  it('pages the risk columns six at a time', async () => {
    const risk = Array.from({ length: 8 }, (_, index) => ({ categoryId: `r${index}`, category: `หมวด${index}`, budget: 1000, spent: 1000 + index }));
    await openBudgets({ '/api/budgets': { budgets: risk } });

    expect(byId('budget-risk-bars').querySelectorAll('.budget-col')).toHaveLength(6);
    expect(byId('budget-risk-page').textContent).toBe('หน้า 1 จาก 2');
    expect(byId('budget-risk-prev').disabled).toBe(true);

    byId('budget-risk-next').click();

    expect(byId('budget-risk-bars').querySelectorAll('.budget-col')).toHaveLength(2);
    expect(byId('budget-risk-page').textContent).toBe('หน้า 2 จาก 2');
    expect(byId('budget-risk-next').disabled).toBe(true);
  });

  it('shows the search button and group chips only when there are more than 14 categories', async () => {
    const many = Array.from({ length: 15 }, (_, index) => ({ categoryId: `m${index}`, category: `หมวด${index}`, budget: 1000, spent: 100 }));
    await openBudgets({ '/api/budgets': { budgets: many } });

    expect(byId('budget-many').hidden).toBe(false);
    expect(byId('budget-many-search').textContent).toBe('ค้นหาหมวดจาก 15 หมวด');

    await openBudgets();

    expect(byId('budget-many').hidden).toBe(true);
  });

  it('keeps the link to manage categories', async () => {
    await openBudgets();

    expect(byId('categories-open').disabled).toBe(false);
  });
});

describe('LIFF budgets page states', () => {
  it('shows the error card with a retry button when loading fails', async () => {
    await openBudgets({ '/api/budgets': { status: 500 } });

    expect(byId('budgets-error').hidden).toBe(false);
    expect(byId('budgets-error-text').textContent).toBe('โหลดงบไม่สำเร็จ');
    expect(byId('budgets-retry').hidden).toBe(false);
    expect(byId('budgets').hidden).toBe(true);
  });

  it('hides the retry button when login is required', async () => {
    await openBudgets({ '/api/budgets': { status: 401 } });

    expect(byId('budgets-retry').hidden).toBe(true);
  });

  it('shows the empty state with the most spent categories first', async () => {
    await openBudgets({
      '/api/budgets': {
        budgets: [
          { categoryId: 'a', category: 'ก', budget: null, spent: 100 },
          { categoryId: 'b', category: 'ข', budget: null, spent: 900 },
          { categoryId: 'c', category: 'ค', budget: null, spent: 0 },
        ],
      },
    });
    const items = [...byId('budget-empty-list').querySelectorAll('.budget-empty-item')];

    expect(byId('budget-empty').hidden).toBe(false);
    expect(byId('budgets').hidden).toBe(true);
    expect(items.map((item) => item.querySelector('.budget-empty-name').firstChild.textContent)).toEqual(['ข', 'ก']);
  });

  it('shows only the error card when a reload after saving fails from the empty state', async () => {
    await openBudgets({ '/api/budgets': { budgets: [{ categoryId: 'b', category: 'ข', budget: null, spent: 900 }] } });
    byId('budget-empty-list').querySelector('.budget-empty-set').click();
    byId('budget-amount').value = '500';
    routeFetch((method, path) => (method === 'PUT' ? {} : path === '/api/budgets' ? { status: 500 } : undefined));

    byId('budget-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();

    expect(byId('budgets-error').hidden).toBe(false);
    expect(byId('budget-empty').hidden).toBe(true);
  });

  it('opens the editor from an empty state row', async () => {
    await openBudgets({ '/api/budgets': { budgets: [{ categoryId: 'b', category: 'ข', budget: null, spent: 900 }] } });

    byId('budget-empty-list').querySelector('.budget-empty-set').click();

    expect(byId('budget-title').textContent).toBe('ตั้งงบ ข');
  });

  it('tells the user to log spending first when there is nothing to suggest', async () => {
    await openBudgets({ '/api/budgets': { budgets: [] } });

    expect(byId('budget-empty-list').children).toHaveLength(0);
    expect(byId('budget-empty-hint').textContent).toContain('ลองจดรายจ่ายในแชตก่อน');
  });
});

describe('LIFF budgets all page', () => {
  async function openAll(tabButtonId = 'budget-all-open') {
    await openBudgets();
    byId(tabButtonId).click();
    await settle();
  }

  it('opens as a sub page with the back label for the budgets tab', async () => {
    await openAll();

    expect(byId('panel-budget-all').hidden).toBe(false);
    expect(byId('panel-budgets').hidden).toBe(true);
    expect(byId('bottom-nav').hidden).toBe(true);
    expect(byId('page-title').textContent).toBe('ดูงบทุกหมวด');
    expect(byId('page-back').getAttribute('aria-label')).toBe('กลับไปหน้างบ');
  });

  it('starts on the risk tab with section headers and percent as plain text', async () => {
    await openAll();
    const rows = [...byId('budget-all-list').querySelectorAll('.budget-all-row')];
    const heads = [...byId('budget-all-list').querySelectorAll('.budget-all-head')].map((head) => head.textContent);

    expect(heads).toEqual(['เต็มหรือเกินงบ 1 หมวด', 'ใกล้เต็ม 1 หมวด']);
    expect(rows.map((row) => row.querySelector('.budget-all-name').textContent)).toEqual(['ช้อปปิ้ง', 'เดินทาง']);
    expect(rows[0].querySelector('.budget-all-pct').textContent).toBe('115%');
    expect(rows[0].querySelector('.budget-all-diff').textContent).toBe('เกิน 450');
    expect(rows[0].querySelector('.cat-badge')).not.toBeNull();
    expect(rows[0].querySelector('.budget-all-dot').className).toContain('level-over');
    expect(byId('budget-all-list').querySelector('.budget-bar, .budget-track, .budget-fill')).toBeNull();
  });

  it('shows the counts on the tabs and switches between groups', async () => {
    await openAll();
    const tabs = [...byId('budget-all-tabs').querySelectorAll('button[data-tab]')];

    expect(tabs.map((tab) => tab.textContent)).toEqual(['ต้องดูแล 2', 'ปกติ 1', 'ไม่มีงบ 2']);
    expect(tabs[0].getAttribute('aria-pressed')).toBe('true');

    tabs[1].click();

    expect(tabs[1].getAttribute('aria-pressed')).toBe('true');
    expect([...byId('budget-all-list').querySelectorAll('.budget-all-name')].map((name) => name.textContent)).toEqual(['อาหาร']);
  });

  it('puts a set-budget button on every unset row that opens the editor', async () => {
    await openAll();
    byId('budget-all-tabs').querySelector('button[data-tab="unset"]').click();
    const buttons = byId('budget-all-list').querySelectorAll('.budget-all-set');

    expect(buttons).toHaveLength(2);

    buttons[0].click();

    expect(byId('budget-title').textContent).toBe('ตั้งงบ บันเทิง');
  });

  it('filters all groups by the search text and updates the counts', async () => {
    await openAll();

    byId('budget-all-search').value = 'อาหาร';
    byId('budget-all-search').dispatchEvent(new Event('input'));

    expect([...byId('budget-all-tabs').querySelectorAll('button[data-tab]')].map((tab) => tab.textContent)).toEqual(['ต้องดูแล 0', 'ปกติ 1', 'ไม่มีงบ 0']);
    expect(byId('budget-all-tab-empty').hidden).toBe(false);
    expect(byId('budget-all-tab-empty').textContent).toBe('ไม่มีหมวดในกลุ่มนี้');
  });

  it('shows the not-found state only when no group matches and can clear the search', async () => {
    await openAll();
    byId('budget-all-search').value = 'กาแฟแก้ว';
    byId('budget-all-search').dispatchEvent(new Event('input'));

    expect(byId('budget-all-empty').hidden).toBe(false);
    expect(byId('budget-all-empty-title').textContent).toBe('ไม่พบหมวด "กาแฟแก้ว"');
    expect(byId('budget-all-list').hidden).toBe(true);

    byId('budget-all-empty-clear').click();

    expect(byId('budget-all-search').value).toBe('');
    expect(byId('budget-all-empty').hidden).toBe(true);
    expect(byId('budget-all-list').querySelectorAll('.budget-all-row').length).toBeGreaterThan(0);
  });

  it('sorts by name when asked', async () => {
    await openAll();
    byId('budget-all-tabs').querySelector('button[data-tab="unset"]').click();

    byId('budget-all-sort').value = 'name';
    byId('budget-all-sort').dispatchEvent(new Event('change'));

    expect([...byId('budget-all-list').querySelectorAll('.budget-all-name')].map((name) => name.textContent)).toEqual(['บันเทิง', 'อื่นๆ']);
  });

  it('shows the month and how many categories are listed', async () => {
    await openAll();

    expect(byId('budget-all-count').textContent).toBe('10/2026 · แสดง 2 จาก 2 หมวด');
  });

  it('opens the unset tab from the strip on the main page and focuses search from the many bar', async () => {
    await openBudgets();
    byId('budget-unset-open').click();

    expect(byId('budget-all-tabs').querySelector('button[data-tab="unset"]').getAttribute('aria-pressed')).toBe('true');
  });

  it('puts the see-all button in the risk card when one is shown', async () => {
    await openBudgets();

    expect(byId('budget-all-open').closest('#budget-risk')).not.toBeNull();
  });

  it('hides the calm card when every budgeted category needs attention', async () => {
    await openBudgets({ '/api/budgets': { budgets: [{ categoryId: 'c-food', category: 'อาหาร', budget: 1000, spent: 1200 }] } });

    expect(byId('budget-risk').hidden).toBe(false);
    expect(byId('budget-calm').hidden).toBe(true);
    expect(byId('budget-all-open').closest('#budget-risk')).not.toBeNull();
  });

  it('puts the see-all button in the calm card when nothing needs attention', async () => {
    await openBudgets({ '/api/budgets': { budgets: [{ categoryId: 'c-food', category: 'อาหาร', budget: 6000, spent: 600 }] } });

    expect(byId('budget-all-open').closest('#budget-calm')).not.toBeNull();
  });

  it('gives the transaction search box a magnifier icon', async () => {
    await boot();

    const field = byId('search').closest('.filter-search');
    expect(field).not.toBeNull();
    expect(field.querySelector('use').getAttribute('href')).toBe('#icon-search');
  });

  it('opens the calm tab from see-all when nothing needs attention', async () => {
    await openBudgets({ '/api/budgets': { budgets: [{ categoryId: 'c-food', category: 'อาหาร', budget: 6000, spent: 600 }] } });

    byId('budget-all-open').click();
    await settle();

    expect(byId('budget-all-tabs').querySelector('button[data-tab="calm"]').getAttribute('aria-pressed')).toBe('true');
  });

  it('goes back to the budgets tab', async () => {
    await openAll();

    byId('page-back').click();

    expect(byId('panel-budgets').hidden).toBe(false);
    expect(byId('panel-budget-all').hidden).toBe(true);
    expect(document.activeElement).toBe(byId('budget-all-open'));
  });

  it('refreshes the rows after a budget is saved from this page', async () => {
    await openAll();
    byId('budget-all-list').querySelector('.budget-all-row').click();
    byId('budget-amount').value = '9000';
    routeFetch((method) => (method === 'PUT' ? {} : undefined));

    byId('budget-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();

    expect(byId('budget-editor').hasAttribute('open')).toBe(false);
    expect(byId('panel-budget-all').hidden).toBe(false);
  });
});

describe('LIFF budget edit sheet', () => {
  const openSheetFor = async (categoryId) => {
    await openBudgets();
    byId('budget-risk-bars').querySelector(`[data-category-id="${categoryId}"]`).click();
  };

  it('opens as a sheet with the category name, usage line and before/after preview', async () => {
    await openSheetFor('c-shop');

    expect(byId('budget-editor').hasAttribute('open')).toBe(true);
    expect(byId('budget-title').textContent).toBe('ช้อปปิ้ง');
    expect(byId('budget-sheet-sub').textContent).toBe('ใช้ไปเดือนนี้ 3,450 บาท · งบเดิม 3,000');
    expect(byId('budget-amount').value).toBe('3,000');
    expect(byId('budget-preview-before').textContent).toContain('115%');
    expect(byId('budget-preview-before').textContent).toContain('เกิน 450');
    expect(byId('budget-scope').textContent).toBe('มีผลตั้งแต่เดือน 10/2026 เป็นต้นไป');
    expect(byId('budget-remove').hidden).toBe(false);
    expect(byId('budget-submit').textContent).toBe('บันทึก');
  });

  it('steps the amount by 500 and updates the after preview', async () => {
    await openSheetFor('c-shop');

    byId('budget-plus').click();

    expect(byId('budget-amount').value).toBe('3,500');
    expect(byId('budget-preview-after').textContent).toContain('98%');
    expect(byId('budget-preview-after').textContent).toContain('เหลือ 50');
    expect(byId('budget-preview-after').textContent).toContain('ถ้างบ 3,500');

    byId('budget-minus').click();
    byId('budget-minus').click();

    expect(byId('budget-amount').value).toBe('2,500');
  });

  it('updates the preview while typing and disables minus for an empty field', async () => {
    await openSheetFor('c-shop');

    byId('budget-amount').value = '';
    byId('budget-amount').dispatchEvent(new Event('input'));

    expect(byId('budget-minus').disabled).toBe(true);
    expect(byId('budget-preview-after').textContent).toContain('ใส่จำนวนเงิน');

    byId('budget-amount').value = '4000';
    byId('budget-amount').dispatchEvent(new Event('input'));

    expect(byId('budget-preview-after').textContent).toContain('86%');
  });

  it('fills the field from a quick chip', async () => {
    await openSheetFor('c-shop');
    const chips = [...byId('budget-chips').querySelectorAll('button')];

    expect(chips.map((chip) => chip.textContent.replace(/\s+/g, ' ').trim())).toEqual([
      'เท่าที่ใช้จริง 3,450', 'เพิ่ม 10% 3,300', 'เพิ่ม 20% 3,600',
    ]);

    chips[0].click();

    expect(byId('budget-amount').value).toBe('3,450');
    expect(byId('budget-preview-after').textContent).toContain('100%');
  });

  it('saves the amount, closes the sheet and reloads the budgets', async () => {
    await openSheetFor('c-shop');
    const calls = routeFetch((method, path) => (method === 'PUT' && path.startsWith('/api/budgets/') ? {} : undefined));
    byId('budget-plus').click();

    byId('budget-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();

    expect(calls).toContain('PUT /api/budgets/c-shop');
    expect(calls).toContain('GET /api/budgets');
    expect(byId('budget-editor').hasAttribute('open')).toBe(false);
  });

  it('closes the sheet before it reloads the budgets so focus can return to the column', async () => {
    await openSheetFor('c-shop');
    let openDuringReload = null;
    routeFetch((method, path) => {
      if (method === 'GET' && path === '/api/budgets') openDuringReload = byId('budget-editor').hasAttribute('open');
      return method === 'PUT' ? {} : undefined;
    });

    byId('budget-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();

    expect(openDuringReload).toBe(false);
  });

  it('does not call the API for an empty amount and says the amount is not valid', async () => {
    await openSheetFor('c-shop');
    const calls = routeFetch(() => undefined);
    byId('budget-amount').value = '';

    byId('budget-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();

    expect(calls.filter((call) => call.startsWith('PUT'))).toHaveLength(0);
    expect(byId('budget-error').hidden).toBe(false);
    expect(byId('budget-error-title').textContent).toBe('จำนวนเงินไม่ถูกต้อง');
  });

  it('keeps the amount and offers a retry when saving fails', async () => {
    await openSheetFor('c-shop');
    routeFetch((method) => (method === 'PUT' ? { status: 500 } : undefined));
    byId('budget-plus').click();

    byId('budget-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();

    expect(byId('budget-editor').hasAttribute('open')).toBe(true);
    expect(byId('budget-error').hidden).toBe(false);
    expect(byId('budget-error-title').textContent).toBe('บันทึกงบไม่สำเร็จ');
    expect(byId('budget-error-text').textContent).toBe('ตัวเลข 3,500 ยังอยู่ในช่อง ลองบันทึกอีกครั้งได้เลย');
    expect(byId('budget-amount').value).toBe('3,500');
    expect(byId('budget-amount').getAttribute('aria-invalid')).toBe('true');
    expect(byId('budget-submit').textContent).toBe('ลองบันทึกอีกครั้ง');
    expect(byId('budget-submit').disabled).toBe(false);
  });

  it('uses the server reason for 400 and 404', async () => {
    await openSheetFor('c-shop');
    routeFetch((method) => (method === 'PUT' ? { status: 404 } : undefined));

    byId('budget-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();

    expect(byId('budget-error-text').textContent).toBe('ไม่พบหมวดนี้แล้ว');
  });

  it('clears the error when the amount changes', async () => {
    await openSheetFor('c-shop');
    routeFetch((method) => (method === 'PUT' ? { status: 500 } : undefined));
    byId('budget-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();

    byId('budget-plus').click();

    expect(byId('budget-error').hidden).toBe(true);
    expect(byId('budget-amount').hasAttribute('aria-invalid')).toBe(false);
    expect(byId('budget-submit').textContent).toBe('บันทึก');
  });

  it('opens the set-budget sheet for a category without a budget', async () => {
    await openBudgets();
    byId('budget-unset-open').click();
    await settle();
    byId('budget-all-list').querySelector('.budget-all-set').click();

    expect(byId('budget-title').textContent).toBe('ตั้งงบ บันเทิง');
    expect(byId('budget-sheet-sub').textContent).toBe('ยังไม่เคยตั้งงบ · ใช้ไปเดือนนี้ 620 บาท');
    expect(byId('budget-amount').value).toBe('');
    expect(byId('budget-remove').hidden).toBe(true);
    expect(byId('budget-submit').textContent).toBe('ตั้งงบ');
    expect(byId('budget-preview-before').textContent).toContain('ไม่มีงบ');
    expect(byId('budget-scope').textContent).toBe('มีผลตั้งแต่เดือน 10/2026 เป็นต้นไป · เฮียจะเตือนเมื่อใช้ถึง 80%');
    expect([...byId('budget-chips').querySelectorAll('button')].map((chip) => chip.textContent.replace(/\s+/g, ' ').trim())).toEqual([
      'เท่าที่ใช้จริง 620', 'ปัดขึ้น 700', 'ปัดขึ้น 1,000',
    ]);
  });

  it('asks before removing a budget and keeps the sheet when the user declines', async () => {
    await openSheetFor('c-shop');

    byId('budget-remove').click();

    expect(byId('budget-remove-confirm').hasAttribute('open')).toBe(true);
    expect(byId('budget-confirm-title').textContent).toBe('เลิกตั้งงบ ช้อปปิ้ง ใช่ไหม');
    expect(byId('budget-confirm-body').textContent).toContain('3,000');
    expect(byId('budget-confirm-body').textContent).toContain('10/2026');

    byId('budget-confirm-cancel').click();

    expect(byId('budget-remove-confirm').hasAttribute('open')).toBe(false);
    expect(byId('budget-editor').hasAttribute('open')).toBe(true);
    expect(byId('budget-amount').value).toBe('3,000');
  });

  it('removes the budget after confirmation with a null amount', async () => {
    await openSheetFor('c-shop');
    const requests = [];
    vi.stubGlobal('fetch', async (url, options = {}) => {
      requests.push({ url: String(url), method: options.method ?? 'GET', body: options.body });
      return { ok: true, status: 200, json: async () => (String(url).includes('/api/budgets') && !options.method ? BUDGET_SAMPLE : {}) };
    });

    byId('budget-remove').click();
    byId('budget-confirm-ok').click();
    await settle();

    const put = requests.find((request) => request.method === 'PUT');
    expect(JSON.parse(put.body)).toEqual({ month: '2026-10', amount: null });
    expect(byId('budget-editor').hasAttribute('open')).toBe(false);
    expect(byId('budget-remove-confirm').hasAttribute('open')).toBe(false);
  });

  it('shows a failed removal inside the edit sheet', async () => {
    await openSheetFor('c-shop');
    routeFetch((method) => (method === 'PUT' ? { status: 500 } : undefined));

    byId('budget-remove').click();
    byId('budget-confirm-ok').click();
    await settle();

    expect(byId('budget-editor').hasAttribute('open')).toBe(true);
    expect(byId('budget-error').hidden).toBe(false);
    expect(byId('budget-error-title').textContent).toBe('เลิกตั้งงบไม่สำเร็จ');
    expect(byId('budget-submit').textContent).toBe('บันทึก');
  });

  it('does not close on Escape while saving', async () => {
    await openSheetFor('c-shop');
    let release;
    vi.stubGlobal('fetch', () => new Promise((resolve) => { release = resolve; }));

    byId('budget-form').dispatchEvent(new Event('submit', { cancelable: true }));
    const cancel = new Event('cancel', { cancelable: true });
    byId('budget-editor').dispatchEvent(cancel);

    expect(cancel.defaultPrevented).toBe(true);
    expect(byId('budget-submit').disabled).toBe(true);
    expect(byId('budget-busy').hidden).toBe(false);
    release({ ok: true, status: 200, json: async () => ({}) });
  });

  it('closes with the X button when not saving', async () => {
    await openSheetFor('c-shop');

    byId('budget-cancel').click();

    expect(byId('budget-editor').hasAttribute('open')).toBe(false);
  });
});

describe('LIFF bulk budget edit', () => {
  async function openBulk(tab) {
    await openBudgets();
    byId('budget-all-open').click();
    await settle();
    if (tab) byId('budget-all-tabs').querySelector(`button[data-tab="${tab}"]`).click();
    byId('budget-all-bulk-open').click();
    await settle();
  }
  const row = (categoryId) => byId('budget-bulk-list').querySelector(`[data-category-id="${categoryId}"]`);
  const plus = (categoryId) => row(categoryId).querySelector('.budget-bulk-plus');
  const minus = (categoryId) => row(categoryId).querySelector('.budget-bulk-minus');

  it('has an entry button on the see-all page that changes its label on the unset tab', async () => {
    await openBudgets();
    byId('budget-all-open').click();
    await settle();

    expect(byId('budget-all-bulk-open').textContent).toBe('แก้งบหลายหมวดพร้อมกัน');

    byId('budget-all-tabs').querySelector('button[data-tab="unset"]').click();

    expect(byId('budget-all-bulk-open').textContent).toBe('ตั้งงบหลายหมวดพร้อมกัน');
  });

  it('opens as a sub page with every category and nothing to save yet', async () => {
    await openBulk();

    expect(byId('panel-budget-bulk').hidden).toBe(false);
    expect(byId('page-title').textContent).toBe('แก้งบหลายหมวด');
    expect([...byId('budget-bulk-list').children].map((item) => item.dataset.categoryId)).toEqual(['c-shop', 'c-trip', 'c-food', 'c-fun', 'c-other']);
    expect(byId('budget-bulk-save').disabled).toBe(true);
    expect(byId('budget-bulk-count').textContent).toBe('ยังไม่ได้แก้อะไร');
  });

  it('puts the unset categories first when opened from the unset tab', async () => {
    await openBulk('unset');

    expect([...byId('budget-bulk-list').children].map((item) => item.dataset.categoryId).slice(0, 2)).toEqual(['c-fun', 'c-other']);
    expect(byId('budget-bulk-list').children[0].querySelector('.budget-bulk-value').textContent).toBe('ไม่ตั้งงบ');
    expect(minus('c-fun').disabled).toBe(true);
  });

  it('adds 500 per tap and shows the percent before and after', async () => {
    await openBulk();

    plus('c-shop').click();

    const item = row('c-shop');
    expect(item.querySelector('.budget-bulk-value').textContent).toBe('3,500');
    expect(item.querySelector('.budget-bulk-was').textContent).toBe('เดิม 3,000');
    expect(item.querySelector('.budget-bulk-old').textContent).toBe('115%');
    expect(item.querySelector('.budget-bulk-new').textContent).toBe('98%');
    expect(item.classList.contains('dirty')).toBe(true);
    expect(byId('budget-bulk-count').textContent).toBe('แก้ 1 หมวด · รวมงบ');
    expect(byId('budget-bulk-delta').textContent).toBe('+500');
    expect(byId('budget-bulk-total').textContent).toBe('เป็น 11,500');
    expect(byId('budget-bulk-save').disabled).toBe(false);
  });

  it('shows a new budget for an unset category', async () => {
    await openBulk();

    plus('c-fun').click();

    const item = row('c-fun');
    expect(item.querySelector('.budget-bulk-value').textContent).toBe('500');
    expect(item.querySelector('.budget-bulk-was').textContent).toBe('ใหม่');
    expect(item.querySelector('.budget-bulk-old').textContent).toBe('ยังไม่ตั้งงบ');
    expect(item.querySelector('.budget-bulk-new').textContent).toBe('124%');
  });

  it('clears the mark when a tap is undone', async () => {
    await openBulk();
    plus('c-shop').click();

    minus('c-shop').click();

    expect(row('c-shop').classList.contains('dirty')).toBe(false);
    expect(byId('budget-bulk-save').disabled).toBe(true);
  });

  it('saves each changed category with the month and goes back to the see-all page', async () => {
    await openBulk();
    plus('c-shop').click();
    plus('c-fun').click();
    const requests = [];
    vi.stubGlobal('fetch', async (url, options = {}) => {
      requests.push({ method: options.method ?? 'GET', path: new URL(url, 'http://localhost').pathname, body: options.body });
      return { ok: true, status: 200, json: async () => (options.method ? {} : BUDGET_SAMPLE) };
    });

    byId('budget-bulk-save').click();
    await settle();

    const puts = requests.filter((request) => request.method === 'PUT');
    expect(puts.map((put) => [put.path, JSON.parse(put.body)])).toEqual([
      ['/api/budgets/c-shop', { month: '2026-10', amount: 3500 }],
      ['/api/budgets/c-fun', { month: '2026-10', amount: 500 }],
    ]);
    expect(requests.some((request) => request.method === 'GET' && request.path === '/api/budgets')).toBe(true);
    expect(byId('panel-budget-all').hidden).toBe(false);
    expect(byId('panel-budget-bulk').hidden).toBe(true);
    expect(byId('budget-all-status').textContent).toBe('บันทึกงบแล้ว 2 หมวด');
  });

  it('disables the buttons while saving', async () => {
    await openBulk();
    plus('c-shop').click();
    let release;
    vi.stubGlobal('fetch', () => new Promise((resolve) => { release = resolve; }));

    byId('budget-bulk-save').click();

    expect(byId('budget-bulk-save').disabled).toBe(true);
    expect(plus('c-shop').disabled).toBe(true);
    release({ ok: true, status: 200, json: async () => ({}) });
    await settle();
  });

  it('lists successes and failures and retries only the failed ones', async () => {
    await openBulk();
    plus('c-shop').click();
    plus('c-trip').click();
    routeFetch((method, path) => (method === 'PUT' && path === '/api/budgets/c-trip' ? { status: 500 } : method === 'PUT' ? {} : undefined));

    byId('budget-bulk-save').click();
    await settle();

    expect(byId('budget-bulk-result').hasAttribute('open')).toBe(true);
    expect(byId('budget-bulk-result-title').textContent).toBe('บันทึกได้ 1 จาก 2 หมวด');
    const items = [...byId('budget-bulk-result-list').children];
    expect(items.map((item) => item.querySelector('.budget-bulk-result-say').textContent)).toEqual(['บันทึกแล้ว', 'บันทึกไม่สำเร็จ']);
    expect(items[1].classList.contains('failed')).toBe(true);
    expect(row('c-shop').classList.contains('dirty')).toBe(false);
    expect(row('c-trip').classList.contains('dirty')).toBe(true);

    const retried = [];
    vi.stubGlobal('fetch', async (url, options = {}) => {
      if (options.method === 'PUT') retried.push(new URL(url, 'http://localhost').pathname);
      return { ok: true, status: 200, json: async () => (options.method ? {} : BUDGET_SAMPLE) };
    });
    byId('budget-bulk-result-retry').click();
    await settle();

    expect(retried).toEqual(['/api/budgets/c-trip']);
    expect(byId('budget-bulk-result').hasAttribute('open')).toBe(false);
    expect(byId('budget-all-status').textContent).toBe('บันทึกงบแล้ว 2 หมวด');
  });

  it('keeps the failed rows editable after closing the result', async () => {
    await openBulk();
    plus('c-trip').click();
    routeFetch((method) => (method === 'PUT' ? { status: 500 } : undefined));
    byId('budget-bulk-save').click();
    await settle();

    byId('budget-bulk-result-close').click();

    expect(byId('budget-bulk-result').hasAttribute('open')).toBe(false);
    expect(byId('panel-budget-bulk').hidden).toBe(false);
    expect(row('c-trip').classList.contains('dirty')).toBe(true);
    expect(byId('budget-bulk-save').disabled).toBe(false);
  });

  it('forgets an earlier failure when the user undoes it and saves something else', async () => {
    await openBulk();
    plus('c-trip').click();
    routeFetch((method) => (method === 'PUT' ? { status: 500 } : undefined));
    byId('budget-bulk-save').click();
    await settle();
    byId('budget-bulk-result-close').click();
    minus('c-trip').click();
    plus('c-shop').click();
    routeFetch((method) => (method === 'PUT' ? {} : undefined));

    byId('budget-bulk-save').click();
    await settle();

    expect(byId('budget-bulk-result').hasAttribute('open')).toBe(false);
    expect(byId('budget-all-status').textContent).toBe('บันทึกงบแล้ว 1 หมวด');
  });

  it('does not close the result on Escape while a retry is running', async () => {
    await openBulk();
    plus('c-trip').click();
    routeFetch((method) => (method === 'PUT' ? { status: 500 } : undefined));
    byId('budget-bulk-save').click();
    await settle();
    let release;
    vi.stubGlobal('fetch', () => new Promise((resolve) => { release = resolve; }));

    byId('budget-bulk-result-retry').click();
    const cancel = new Event('cancel', { cancelable: true });
    byId('budget-bulk-result').dispatchEvent(cancel);

    expect(cancel.defaultPrevented).toBe(true);
    release({ ok: true, status: 200, json: async () => ({}) });
    await settle();
  });

  it('clears the status message when the see-all page is opened again', async () => {
    await openBulk();
    plus('c-shop').click();
    routeFetch((method) => (method === 'PUT' ? {} : undefined));
    byId('budget-bulk-save').click();
    await settle();
    byId('page-back').click();
    await settle();
    byId('budget-all-open').click();
    await settle();

    expect(byId('budget-all-status').textContent).toBe('');
  });
});

describe('LIFF nested budget sub pages and the back button', () => {
  const pressDeviceBack = () => window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
  const openBulkPage = async () => {
    await openBudgets();
    byId('budget-all-open').click();
    await settle();
    byId('budget-all-bulk-open').click();
    await settle();
  };

  it('adds only one history entry for the whole chain of sub pages', async () => {
    await openBudgets();
    const push = vi.spyOn(window.history, 'pushState');

    byId('budget-all-open').click();
    await settle();
    byId('budget-all-bulk-open').click();
    await settle();

    expect(push).toHaveBeenCalledTimes(1);
    push.mockRestore();
  });

  it('goes back to the see-all page with the in-page back button without using history', async () => {
    await openBulkPage();

    byId('page-back').click();

    expect(byId('panel-budget-all').hidden).toBe(false);
    expect(byId('panel-budget-bulk').hidden).toBe(true);
    expect(byId('page-title').textContent).toBe('ดูงบทุกหมวด');
    expect(byId('page-back').getAttribute('aria-label')).toBe('กลับไปหน้างบ');
    expect(window.history.back).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(byId('budget-all-bulk-open'));
  });

  it('leaves the sub pages from the see-all page and consumes the history entry', async () => {
    await openBulkPage();
    byId('page-back').click();

    byId('page-back').click();

    expect(byId('panel-budgets').hidden).toBe(false);
    expect(byId('bottom-nav').hidden).toBe(false);
    expect(window.history.back).toHaveBeenCalledTimes(1);
  });

  it('shows the see-all page for the device back button and keeps one entry for the next press', async () => {
    await openBulkPage();
    const push = vi.spyOn(window.history, 'pushState');

    pressDeviceBack();

    expect(byId('panel-budget-all').hidden).toBe(false);
    expect(byId('panel-budget-bulk').hidden).toBe(true);
    expect(push).toHaveBeenCalledTimes(1);

    pressDeviceBack();

    expect(byId('panel-budgets').hidden).toBe(false);
    expect(byId('bottom-nav').hidden).toBe(false);
    push.mockRestore();
  });

  it('still leaves straight to the budgets tab from a sub page without a parent', async () => {
    await openBudgets();
    byId('budget-all-open').click();
    await settle();

    pressDeviceBack();

    expect(byId('panel-budgets').hidden).toBe(false);
    expect(byId('bottom-nav').hidden).toBe(false);
  });
});

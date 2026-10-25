// @vitest-environment jsdom
import { existsSync } from 'node:fs';
import { URL as NodeUrl } from 'node:url';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TABS } from './tabs.mjs';
import { categoryStyle } from './categories.mjs';
import { createEmptyState } from './empty-state.mjs';
import { CATEGORY_ICON_KEYS } from './category-icons.mjs';
import { html, CATEGORIES, RESPONSES, EMPTY_MONTH, LOADING_ELEMENT_IDS, settle, makeFetch, boot, byId, routeFetch, clickTab, submitEditOfFirstRow, deleteFirstRow, cleanupGlobals } from './dom-harness.mjs';

afterEach(cleanupGlobals);

describe('index.html static invariants', () => {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const symbolIds = new Set([...doc.querySelectorAll('symbol[id]')].map((symbol) => symbol.id));

  it('defines a sprite symbol for every category icon', () => {
    const names = ['อาหาร', 'เดินทาง', 'ช้อปปิ้ง', 'บิล/ค่าบริการ', 'สุขภาพ', 'บันเทิง', 'เงินเดือน', 'รายได้เสริม', 'ใบเสร็จ/สลิปโอนเงิน', 'อื่นๆ', 'ไม่รู้จัก'];
    const missing = names.map((name) => categoryStyle(name).symbol).filter((id) => !symbolIds.has(id));

    expect(missing).toEqual([]);
    expect(symbolIds.has('cat-food')).toBe(true);
    expect(symbolIds.has('cat-other')).toBe(true);
  });

  it('defines a sprite symbol for every icon a user can pick and for the categories page', () => {
    const missing = CATEGORY_ICON_KEYS.map((key) => `cat-${key}`).filter((id) => !symbolIds.has(id));

    expect(missing).toEqual([]);
    expect(['icon-back', 'icon-plus', 'icon-lock', 'icon-eye-off', 'icon-categories'].filter((id) => !symbolIds.has(id))).toEqual([]);
  });

  it('defines a sprite symbol for every bottom tab icon', () => {
    expect(TABS.map((tab) => tab.icon).filter((id) => !symbolIds.has(id))).toEqual([]);
    expect(symbolIds.has('tab-list')).toBe(true);
    expect(symbolIds.has('tab-user')).toBe(true);
  });

  it('names the categories entry for everything the page can do', () => {
    expect(doc.getElementById('categories-open').textContent.trim()).toBe('จัดการหมวดหมู่');
  });

  it('explains what each balance counts', () => {
    expect(doc.querySelector('#totals .stat.balance .stat-label').textContent.trim()).toBe('คงเหลือ');
    expect(doc.querySelector('#totals .stat.balance .stat-note').textContent.trim()).toBe('รายรับหักรายจ่าย ของเดือนที่เลือก');
    expect(doc.querySelector('#totals .stat.balance .stat-note .nowrap').textContent).toBe('ของเดือนที่เลือก');
    expect(doc.querySelector('.balance-card .stat-label').textContent.trim()).toBe('ยอดสะสมทั้งหมด');
    const goalHints = [...doc.querySelectorAll('#goals .goals-hint')].map((hint) => hint.textContent.trim());
    expect(goalHints).toContain('ยอดออมเก็บแยก ไม่หักจากยอดคงเหลือหรือกระเป๋าเงิน');
    expect(doc.getElementById('truncated').textContent).not.toContain('เดือนนี้');
  });

  it('names the delete action in the categories hint and avoids the minus sign in balance notes', () => {
    expect(doc.querySelector('#panel-budgets .categories-entry-hint').textContent.trim()).toBe('เพิ่ม เปลี่ยนชื่อ เลือกไอคอน ซ่อน หรือลบหมวด');
    expect(doc.querySelector('.balance-note').textContent.replace(/\s+/g, ' ').trim()).toBe(
      'รายรับหักรายจ่าย ทุกรายการที่บันทึกในบอทตั้งแต่เริ่ม ไม่ใช่ยอดเงินในบัญชีจริง'
    );
    expect(doc.querySelector('.wallets-hint').textContent).toContain('= รายรับหักรายจ่ายที่บันทึกในกระเป๋านั้น');
    expect(doc.body.textContent).not.toContain('รายรับ - รายจ่าย');
  });

  it('lists the me tab entries as menu rows that start disabled', () => {
    const recurring = doc.getElementById('recurring-open');
    expect(recurring.classList.contains('menu-row')).toBe(true);
    expect(recurring.hasAttribute('disabled')).toBe(true);
    expect(recurring.querySelector('.menu-row-title').textContent).toBe('รายการประจำ');
    expect(recurring.querySelector('.menu-row-sub').textContent).toBe('รายรับรายจ่ายที่เกิดทุกเดือน บอทจดให้เอง');
    expect(recurring.querySelector('use').getAttribute('href')).toBe('#tab-repeat');
    const categories = doc.getElementById('me-categories-open');
    expect(categories.hasAttribute('disabled')).toBe(true);
    expect(categories.querySelector('.menu-row-title').textContent).toBe('จัดการหมวดหมู่');
    expect(categories.querySelector('.menu-row-sub').textContent).toBe('เพิ่ม แก้ไข ซ่อน และลบหมวด');
    expect(recurring.textContent.replace(/\s+/g, ' ')).toContain('รายการประจำ รายรับรายจ่ายที่เกิดทุกเดือน');
    expect(categories.textContent.replace(/\s+/g, ' ')).toContain('จัดการหมวดหมู่ เพิ่ม แก้ไข ซ่อน และลบหมวด');
  });

  it('points every menu row icon at a symbol that exists in the sprite', () => {
    const hrefs = [...doc.querySelectorAll('.menu-row use')].map((use) => use.getAttribute('href'));
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) expect(doc.querySelector(href), href).not.toBeNull();
    for (const id of ['icon-wallet', 'icon-bell', 'icon-users', 'icon-book']) expect(doc.getElementById(id), id).not.toBeNull();
  });

  it('has disabled menu rows for the wallets and notification pages', () => {
    const wallets = doc.getElementById('wallets-open');
    const notify = doc.getElementById('notify-open');
    expect(wallets.hasAttribute('disabled')).toBe(true);
    expect(wallets.querySelector('.menu-row-title').textContent).toBe('กระเป๋าเงิน');
    expect(wallets.querySelector('.menu-row-sub').textContent).toBe('จัดการกระเป๋าและดูยอดแยก');
    expect(notify.hasAttribute('disabled')).toBe(true);
    expect(notify.querySelector('.menu-row-title').textContent).toBe('การแจ้งเตือน');
    expect(notify.querySelector('.menu-row-sub').textContent).toBe('สรุปรายสัปดาห์และเตือนลืมจด');
    expect(wallets.textContent.replace(/\s+/g, ' ').trim()).toBe('กระเป๋าเงิน จัดการกระเป๋าและดูยอดแยก');
    expect(notify.textContent.replace(/\s+/g, ' ').trim()).toBe('การแจ้งเตือน สรุปรายสัปดาห์และเตือนลืมจด');
  });

  it('has a disabled menu row for the friends page in the help group', () => {
    const friends = doc.getElementById('friends-open');
    expect(friends.hasAttribute('disabled')).toBe(true);
    expect(friends.closest('.menu-group').querySelector('h2').textContent).toBe('ความช่วยเหลือและการใช้งานร่วมกัน');
    expect(friends.querySelector('.menu-row-title').textContent).toBe('เพื่อนและหารบิล');
    expect(friends.querySelector('.menu-row-sub').textContent).toBe('จัดการเพื่อนและไปหารบิล');
    expect(friends.textContent.replace(/\s+/g, ' ').trim()).toBe('เพื่อนและหารบิล จัดการเพื่อนและไปหารบิล');
  });

  it('has an enabled usage menu row and keeps the close button outside the profile card', () => {
    const tips = doc.getElementById('tips-open');
    expect(tips.hasAttribute('disabled')).toBe(false);
    expect(tips.querySelector('.menu-row-title').textContent).toBe('วิธีใช้งาน');
    expect(tips.querySelector('.menu-row-sub').textContent).toBe('วิธีใช้บอทและคำสั่งในแชต');
    expect(tips.textContent.replace(/\s+/g, ' ').trim()).toBe('วิธีใช้งาน วิธีใช้บอทและคำสั่งในแชต');
    expect(doc.getElementById('panel-tips').contains(doc.querySelector('.profile-tips'))).toBe(true);
    expect(doc.getElementById('profile-card').contains(doc.getElementById('profile-close'))).toBe(false);
    expect(doc.getElementById('panel-profile').contains(doc.getElementById('profile-close'))).toBe(true);
  });

  it('lists the main chat commands in the profile tips and points to the full help', () => {
    const tips = [...doc.querySelectorAll('.profile-tips li')].map((item) => item.textContent.replace(/\s+/g, ' ').trim());
    expect(tips).toHaveLength(6);
    expect(tips.some((tip) => tip.includes('เดือนนี้กินกาแฟไปเท่าไหร่'))).toBe(true);
    expect(tips.at(-1)).toContain('"ช่วยเหลือ"');
  });

  // ผู้ใช้ให้แถวปุ่มล่างเหลือแค่ ลบ/ไม่ตั้งงบ กับ บันทึก ส่วนปิดเป็นปุ่ม X มุมขวาบน
  it.each([
    ['edit-form', 'cancel-button', 'delete-button'],
    ['recurring-form', 'recurring-cancel', 'recurring-delete'],
  ])('moves the close button of %s to a labelled X outside the action row', (formId, closeId, removeId) => {
    const close = doc.getElementById(closeId);
    const actions = doc.getElementById(formId).querySelector('.actions');

    expect(close.closest('.actions')).toBeNull();
    expect(close.classList.contains('dialog-close')).toBe(true);
    expect(close.getAttribute('aria-label')).toBe('ปิด');
    expect(close.querySelector('use').getAttribute('href')).toBe('#icon-close');
    expect([...actions.querySelectorAll('button')].map((button) => button.id || button.className)).toEqual([removeId, 'primary']);
  });

  it('defines the close icon symbol', () => {
    expect(symbolIds.has('icon-close')).toBe(true);
  });

  it('defines the search, alert and check icon symbols', () => {
    for (const id of ['icon-search', 'icon-alert', 'icon-check']) expect(symbolIds.has(id)).toBe(true);
  });

  // ผู้ใช้อยากให้ลิงก์อ่านใบเสร็จอยู่ในกรอบขาวเดียวกับช่องยอดรวม แต่ปุ่มต้องไม่อยู่ใน label
  it('puts the receipt link in the same card as the total, outside its label', () => {
    const card = doc.getElementById('bill-form-total').closest('.bill-form-card');

    expect(card).not.toBeNull();
    expect(card.parentElement.id).toBe('bill-form');
    expect(card.contains(doc.getElementById('bill-form-receipt-button'))).toBe(true);
    expect(doc.getElementById('bill-form-receipt-button').closest('label')).toBeNull();
  });

  it('announces friend errors and offers search on the code keyboard', () => {
    expect(doc.getElementById('friends-error-text').getAttribute('role')).toBe('alert');
    expect(doc.getElementById('friend-code-input').getAttribute('enterkeyhint')).toBe('search');
    expect(doc.getElementById('friends-title').getAttribute('tabindex')).toBe('-1');
  });

  it('defines a sprite symbol for every empty state illustration', () => {
    const used = ['list', 'search', 'summary', 'recurring'].map((kind) =>
      createEmptyState(document, kind).querySelector('use').getAttribute('href').slice(1)
    );

    expect(used.filter((id) => !symbolIds.has(id))).toEqual([]);
    expect(used.sort()).toEqual(['empty-chart', 'empty-list', 'empty-recurring', 'empty-search']);
  });

  it('keeps the banner inside the sticky header so an error stays visible while scrolling', () => {
    expect(doc.querySelector('.top-sticky .bar')).not.toBeNull();
    expect(doc.querySelector('.top-sticky #banner')).not.toBeNull();
    expect(doc.querySelector('.top-sticky #banner-retry')).not.toBeNull();
  });

  it('sets the brand theme color and ships the mascot it references', () => {
    expect(doc.querySelector('meta[name="theme-color"]').getAttribute('content')).toBe('#1157c5');
    for (const img of doc.querySelectorAll('img[src^="assets/"]')) {
      expect(img.getAttribute('alt')).toBe('');
      expect(existsSync(new NodeUrl(img.getAttribute('src'), import.meta.url)), img.getAttribute('src')).toBe(true);
    }
    expect(doc.querySelector('.bar > .bar-mascot + #page-title')).not.toBeNull();
  });

  it('labels the editor dialog with its heading', () => {
    const editor = doc.getElementById('editor');
    const heading = doc.getElementById(editor.getAttribute('aria-labelledby'));

    expect(heading.textContent).toBe('แก้ไขรายการ');
  });

  it('starts the notification section hidden and gives each switch a visible label', () => {
    for (const id of ['notify', 'notify-loading', 'notify-error', 'notify-body']) {
      expect(doc.getElementById(id).hasAttribute('hidden'), id).toBe(true);
    }
    const box = doc.getElementById('notify-weekly-summary');
    expect(box.getAttribute('role')).toBe('switch');
    expect(box.closest('label.notify-switch').textContent).toContain('ส่งสรุปทุกวันอาทิตย์');
    expect(doc.getElementById('notify').closest('#panel-notify')).not.toBeNull();
    expect(doc.getElementById('notify').closest('#profile-card')).toBeNull();
  });

  it('puts the daily reminder switch in the notification section after the weekly one', () => {
    const box = doc.getElementById('notify-daily-reminder');
    const labels = [...doc.querySelectorAll('#notify-body label.notify-switch')];

    expect(box.getAttribute('role')).toBe('switch');
    expect(labels.map((label) => label.querySelector('input').id)).toEqual(['notify-weekly-summary', 'notify-daily-reminder']);
    expect(box.closest('label').textContent).toContain('เตือนถ้าวันนี้ยังไม่ได้จด');
  });

  it('starts every JS-controlled loading and error element hidden', () => {
    const ids = [
      'banner',
      'banner-retry',
      'filters',
      'filter-clear',
      'filter-wallet',
      'edit-wallet-row',
      'list-head-skeleton',
      'summary-skeleton',
      'trend-loading',
      'trend-skeleton',
      'trend-error',
      'budgets-loading',
      'budgets-skeleton',
      'bill-form-no-friends',
      'bill-form-friends-loading',
      'bill-form-friends-error',
      'bill-form-categories-error',
      'bill-form-go-profile',
      'budgets-error',
      'recurring-loading',
      'recurring-skeleton',
      'recurring-error',
      'recurring-empty',
      'profile-loading',
      'profile-skeleton',
      'profile-error',
      'profile-card',
      'profile-stale',
      'profile-close',
      'trend-empty',
      'edit-busy',
      'friends',
      'wallets',
      'wallets-loading',
      'wallets-error',
      'wallet-dialog-error',
      'panel-categories',
      'page-back',
      'bills-home',
      'category-hidden-toggle',
      'category-hidden-tiles',
      'friend-qr',
      'friends-skeleton',
      'friend-dialog-busy',
      'bills-error',
      'bills-skeleton',
      'bill-dialog-busy',
      'goals-loading',
      'goals-skeleton',
      'goals-error',
      'goals-body',
      'goals-hero',
      'goals-empty',
      'goals-closed',
      'goal-editor-closed-row',
      'goal-editor-busy',
      'goal-editor-error',
      'goal-detail-closed-note',
      'goal-detail-busy',
      'goal-detail-error',
      'goal-history-loading',
      'goal-history-error',
      'goal-history-empty',
      'goal-history-limit',
    ];

    const visible = ids.filter((id) => !doc.getElementById(id).hasAttribute('hidden'));
    expect(visible).toEqual([]);
  });
});

describe('LIFF page after a normal boot', () => {
  let liff;

  beforeEach(async () => {
    liff = await boot();
  });

  it('renders the five bottom tabs with the list tab selected', () => {
    const buttons = [...document.querySelectorAll('#bottom-nav button')];

    expect(buttons.map((button) => button.textContent)).toEqual(['รายการ', 'สรุป', 'งบ', 'ออม', 'ฉัน']);
    expect(document.querySelectorAll('#bottom-nav [aria-current="page"]')).toHaveLength(1);
    expect(document.querySelector('#bottom-nav [aria-current="page"]').textContent).toBe('รายการ');
    expect(byId('page-title').textContent).toBe('รายการของฉัน');
    expect(byId('month').hidden).toBe(false);
    expect(byId('month').value).toBe('2026-10');
    expect(byId('panel-list').hidden).toBe(false);
    for (const id of ['summary', 'budgets', 'recurring', 'goals', 'bills', 'profile']) {
      expect(byId(`panel-${id}`).hidden).toBe(true);
    }
    expect(byId('bottom-nav').hidden).toBe(false);
    expect(byId('panel-friends').contains(byId('friends'))).toBe(true);
  });

  it('initialised liff and left the shared banner hidden', () => {
    expect(liff.initOptions).toEqual([{ liffId: 'liff-1' }]);
    expect(byId('banner').hidden).toBe(true);
    expect(byId('banner').textContent).toBe('');
  });

  it('shows the transactions with category badges, names and notes in place of the skeleton', () => {
    const rows = document.querySelectorAll('#list .row');

    expect(rows).toHaveLength(3);
    expect(document.querySelector('#list .skeleton')).toBeNull();
    expect(byId('list-head-skeleton').hidden).toBe(true);
    expect(byId('summary-skeleton').hidden).toBe(true);
    expect([...document.querySelectorAll('#list .day .day-date')].map((day) => day.textContent)).toEqual(['02/10', '01/10']);
    expect([...document.querySelectorAll('#list .day .day-net')].map((net) => net.textContent)).toEqual(['-60', '+24,960']);
    expect(rows[0].querySelector('.row-title').textContent).toBe('อาหาร');
    expect(rows[0].querySelector('.row-note').textContent).toBe('ข้าวมันไก่');
    expect(rows[0].querySelector('.cat-badge use').getAttribute('href')).toBe('#cat-food');
    expect(rows[0].querySelector('.amount').textContent).toBe('-60 บาท');
    expect(rows[1].querySelector('.cat-badge use').getAttribute('href')).toBe('#cat-transport');
    expect(rows[1].querySelector('.row-title').textContent).toBe('เดินทาง');
    expect(rows[2].classList.contains('cat-salary')).toBe(true);
    expect(rows[2].classList.contains('income')).toBe(true);
    expect(rows[2].querySelector('.row-title').textContent).toBe('เงินเดือน');
    expect(rows[2].querySelector('.row-note')).toBeNull();
    expect(rows[2].querySelector('.amount').textContent).toBe('+25,000 บาท');
    expect(byId('status').hidden).toBe(true);
  });

  it('shows the three month stat cards', () => {
    expect(byId('totals').hidden).toBe(false);
    // คงเหลือเป็นตัวหลักอยู่บนสุด รายรับ/รายจ่ายอยู่แถวรองข้างใต้
    expect(byId('totals').firstElementChild.classList.contains('balance')).toBe(true);
    expect(byId('totals').querySelector('.stat-sub').children).toHaveLength(2);
    expect(byId('stat-income').textContent).toBe('25,000 บาท');
    expect(byId('stat-expense').textContent).toBe('100 บาท');
    expect(byId('stat-balance').textContent).toBe('24,900 บาท');
    expect(byId('stat-balance').classList.contains('negative')).toBe(false);
  });

  // CSS ใช้ความยาวของยอดสุดท้ายย่อตัวอักษร ยอดหลักล้านจึงไม่ตัดคำ บาท ขึ้นบรรทัดใหม่
  it('tells CSS how long each final stat amount is', () => {
    expect(byId('stat-income').style.getPropertyValue('--amount-chars')).toBe(String('25,000 บาท'.length));
    expect(byId('stat-expense').style.getPropertyValue('--amount-chars')).toBe(String('100 บาท'.length));
  });

  it('shows the filter bar with the category options and no active filter', () => {
    const options = [...byId('filter-category').options].map((option) => option.textContent);

    expect(byId('filters').hidden).toBe(false);
    expect(byId('filter-clear').hidden).toBe(true);
    expect(byId('filter-status').textContent).toBe('');
    expect(options).toEqual(['ทุกหมวด', 'อาหาร', 'เดินทาง', 'เงินเดือน']);
  });

  it('filters the list by the search box, shows the search empty state, and clear restores', () => {
    const search = byId('search');

    search.value = 'bts';
    search.dispatchEvent(new Event('input'));
    expect(document.querySelectorAll('#list .row')).toHaveLength(1);
    expect(document.querySelector('#list .row .row-note').textContent).toBe('BTS');
    expect(byId('filter-status').textContent).toBe('พบ 1 จาก 3 รายการ รวม -40 บาท');
    expect(byId('filter-clear').hidden).toBe(false);

    search.value = 'ไม่มีแน่นอน';
    search.dispatchEvent(new Event('input'));
    expect(document.querySelectorAll('#list .row')).toHaveLength(0);
    expect(document.querySelector('#list .empty-title').textContent).toBe('ไม่พบรายการที่ค้นหา');
    expect(document.querySelector('#list .empty-state use').getAttribute('href')).toBe('#empty-search');
    expect(byId('filter-status').textContent).toBe('พบ 0 จาก 3 รายการ');
    expect(byId('filters').hidden).toBe(false);

    byId('filter-clear').click();
    expect(search.value).toBe('');
    expect(document.querySelectorAll('#list .row')).toHaveLength(3);
    expect(byId('filter-status').textContent).toBe('');
    expect(byId('filter-clear').hidden).toBe(true);
  });

  it('filters by type', () => {
    const type = byId('filter-type');

    type.value = 'income';
    type.dispatchEvent(new Event('input'));
    expect(document.querySelectorAll('#list .row')).toHaveLength(1);
    expect(byId('filter-status').textContent).toBe('พบ 1 จาก 3 รายการ รวม +25,000 บาท');

    byId('filter-clear').click();
    expect(type.value).toBe('');
    expect(document.querySelectorAll('#list .row')).toHaveLength(3);
  });

  // สรุปตามหมวดแบบ S5: แถบเดียวแบ่งสีตามหมวด สีของแต่ละแถวตรงกับช่วงในแถบ
  it('draws the segmented category bar with matching row colors', () => {
    const segments = [...byId('chart-stack').children];
    const rows = [...document.querySelectorAll('#chart-rows .chart-row')];

    expect(byId('chart-stack').getAttribute('aria-hidden')).toBe('true');
    expect(segments.map((segment) => segment.style.width)).toEqual(['60%', '40%']);
    expect(segments.map((segment) => segment.style.background)).toEqual(['var(--chart-1)', 'var(--chart-2)']);
    expect(rows.map((row) => row.style.getPropertyValue('--dot'))).toEqual(['var(--chart-1)', 'var(--chart-2)']);

    document.querySelector('#chart .tabs [data-type="income"]').click();
    expect([...byId('chart-stack').children].map((segment) => segment.style.width)).toEqual(['100%']);
    document.querySelector('#chart .tabs [data-type="expense"]').click();
  });

  it('renders the six-month trend and the comparison text', () => {
    const columns = document.querySelectorAll('#trend-bars .trend-col');
    const current = document.querySelectorAll('#trend-bars .trend-col.current');

    expect(columns).toHaveLength(6);
    expect(current).toHaveLength(1);
    expect(current[0]).toBe(columns[5]);
    expect(current[0].querySelector('.trend-label').textContent).toBe('ต.ค.');
    expect(byId('trend-bars').hidden).toBe(false);
    expect(byId('trend-legend').hidden).toBe(false);
    expect(byId('trend-error').hidden).toBe(true);
    expect(byId('trend-loading').hidden).toBe(true);
    expect(byId('trend-skeleton').hidden).toBe(true);
    expect(byId('trend-comparison').hidden).toBe(false);
    expect(byId('trend-comparison').textContent).toBe('รายจ่ายน้อยกว่าเดือนก่อน 50% (-100 บาท)');
    expect(byId('trend-comparison').classList.contains('down')).toBe(true);
  });

  it('gives every trend bar a data-width and data-property for the replay animation', () => {
    const bars = [...document.querySelectorAll('#trend-bars .trend-bar')];
    const currentBars = document.querySelectorAll('#trend-bars .trend-col.current .trend-bar');

    expect(bars).toHaveLength(12);
    for (const bar of bars) {
      expect(bar.dataset.property).toBe('height');
      expect(Number.isFinite(Number(bar.dataset.width))).toBe(true);
    }
    expect(currentBars[0].classList.contains('income')).toBe(true);
    expect(currentBars[0].dataset.width).toBe('100');
    expect(currentBars[0].style.height).toBe('100%');
    expect(currentBars[1].dataset.width).toBe('2');
  });

  it('shows the recurring empty state when there are no rules', () => {
    expect(byId('recurring').hidden).toBe(false);
    expect(byId('recurring-empty').hidden).toBe(false);
    expect(document.querySelector('#recurring-empty .empty-title').textContent).toBe('ยังไม่มีรายการประจำ');
    expect(document.querySelectorAll('#recurring-rows .recurring-row')).toHaveLength(0);
    expect(byId('recurring-loading').hidden).toBe(true);
    expect(byId('recurring-skeleton').hidden).toBe(true);
    expect(byId('recurring-error').hidden).toBe(true);
    expect(byId('recurring-add').disabled).toBe(false);
  });

  it('shows the in-LINE close button only when liff reports it is in the client', () => {
    expect(byId('profile-close').hidden).toBe(false);

    byId('profile-close').click();
    expect(liff.closeWindow).toHaveBeenCalledTimes(1);
  });

  it('switches through every tab updating selection, panels, title, and month picker', () => {
    const expected = {
      list: { title: 'รายการของฉัน', month: false },
      summary: { title: 'สรุปรายเดือน', month: false },
      budgets: { title: 'จัดการงบประมาณ', month: false },
      goals: { title: 'เป้าหมายการออม', month: true },
      profile: { title: 'ฉัน', month: true },
    };

    for (const [id, { title, month }] of Object.entries(expected)) {
      document.querySelector(`#bottom-nav button[data-tab="${id}"]`).click();
      expect(document.querySelector('#bottom-nav [aria-current="page"]').dataset.tab).toBe(id);
      expect(byId('page-title').textContent).toBe(title);
      expect(byId('month').hidden).toBe(month);
      for (const other of Object.keys(expected)) {
        expect(byId(`panel-${other}`).hidden).toBe(other !== id);
      }
      expect(byId('panel-recurring').hidden).toBe(true);
    }
  });

  it('shows the profile with name, avatar initial, balance and since text', () => {
    document.querySelector('#bottom-nav button[data-tab="profile"]').click();

    expect(byId('profile-card').hidden).toBe(false);
    expect(byId('profile-name').textContent).toBe('สมชาย');
    expect(byId('profile-avatar').textContent).toBe('ส');
    expect(byId('profile-balance').textContent).toBe('24,900 บาท');
    expect(byId('profile-balance').classList.contains('negative')).toBe(false);
    expect(byId('profile-since').textContent).toBe('เริ่มบันทึกตั้งแต่ 3 ส.ค. 2569');
    expect(byId('profile-income').textContent).toBe('25,000 บาท');
    expect(byId('profile-expense').textContent).toBe('100 บาท');
    expect(byId('profile-count').textContent).toBe('3 รายการ');
    expect(byId('profile-loading').hidden).toBe(true);
    expect(byId('profile-skeleton').hidden).toBe(true);
    expect(byId('profile-error').hidden).toBe(true);
    expect(byId('profile-stale').hidden).toBe(true);
  });

  it('clears a transient banner message when the tab changes', async () => {
    routeFetch((method) => (method === 'PATCH' ? { status: 404 } : undefined));
    await submitEditOfFirstRow();
    expect(byId('banner').textContent).toBe('ไม่พบรายการนี้แล้ว');
    expect(byId('banner').hidden).toBe(false);

    clickTab('summary');

    expect(byId('banner').hidden).toBe(true);
    expect(byId('banner').textContent).toBe('');
    expect(byId('banner-retry').hidden).toBe(true);
  });

  // skeleton แต่ละชิ้นต้องเป็นรูปเดียวกับของจริงที่จะมาแทน ไม่งั้นเนื้อหาด้านล่างกระโดดตอนโหลดเสร็จ
  it('shapes each skeleton like the content that replaces it', () => {
    const variants = (id) => [...byId(id).children].map((item) => item.className.replace('skeleton skeleton-', ''));

    expect(variants('list-head-skeleton')).toEqual(['totals', 'filters']);
    expect(variants('summary-skeleton')).toEqual(['chart']);
    expect(variants('trend-skeleton')).toEqual(['trend']);
    expect(variants('budgets-skeleton')).toEqual(['budget-hero', 'budget-chart', 'budget-list']);
    expect(variants('recurring-skeleton')).toEqual(['recurring', 'recurring', 'recurring']);
    expect(variants('profile-skeleton')).toEqual(['profile-head', 'balance', 'stats']);
    expect(variants('goals-skeleton')).toEqual(['goal-hero', 'goal-card', 'goal-card']);
  });

  it('puts the list head skeleton where the totals card will appear', () => {
    const panel = byId('panel-list');
    const order = (id) => [...panel.children].indexOf(byId(id));

    expect(order('list-head-skeleton')).toBe(0);
    expect(order('list-head-skeleton')).toBeLessThan(order('totals'));
  });

  it('keeps the summary skeleton and empty state above the trend card', () => {
    const panel = byId('panel-summary');
    const order = (id) => [...panel.children].indexOf(byId(id));

    expect(order('summary-empty')).toBeLessThan(order('trend'));
    expect(order('summary-skeleton')).toBeLessThan(order('trend'));
    expect(order('chart')).toBeLessThan(order('trend'));
  });
});

describe('LIFF profile freshness after edits', () => {
  const profileCalls = (calls) => calls.filter((call) => call === 'GET /api/profile').length;

  it('reloads the profile after an edit and after a delete', async () => {
    await boot();
    const calls = routeFetch((method) => (method === 'PATCH' || method === 'DELETE' ? {} : undefined));

    await submitEditOfFirstRow();
    expect(profileCalls(calls)).toBe(1);
    expect(byId('editor').open).toBe(false);

    await deleteFirstRow();
    expect(profileCalls(calls)).toBe(2);
    expect(byId('confirm-delete').open).toBe(false);
  });

  it('shows the stale notice when the reload fails, then reloads on profile tab entry', async () => {
    await boot();
    routeFetch((method, path) => {
      if (method === 'PATCH') return {};
      return path === '/api/profile' ? { status: 500 } : undefined;
    });
    await submitEditOfFirstRow();

    expect(byId('profile-stale').hidden).toBe(false);
    expect(byId('profile-card').hidden).toBe(false);
    expect(byId('profile-error').hidden).toBe(true);

    const calls = routeFetch(() => undefined);
    clickTab('profile');
    await settle();

    expect(profileCalls(calls)).toBe(1);
    expect(byId('profile-stale').hidden).toBe(true);
    expect(byId('profile-balance').textContent).toBe('24,900 บาท');
  });

  it('does not reload a fresh profile on tab entry', async () => {
    await boot();
    const calls = routeFetch(() => undefined);

    clickTab('profile');
    await settle();

    expect(profileCalls(calls)).toBe(0);
  });
});

describe('LIFF page outside the LINE client', () => {
  it('keeps the profile close button hidden', async () => {
    const liff = await boot({ inClient: false });

    expect(byId('profile-close').hidden).toBe(true);
    byId('profile-close').click();
    expect(liff.closeWindow).not.toHaveBeenCalled();
  });
});

describe('LIFF page for an empty month', () => {
  it('hides the filter bar and shows the list and summary empty states', async () => {
    await boot({ overrides: { '/api/transactions': EMPTY_MONTH } });

    expect(byId('filters').hidden).toBe(true);
    expect(document.querySelectorAll('#list .row')).toHaveLength(0);
    expect(document.querySelector('#list .skeleton')).toBeNull();
    expect(document.querySelector('#list .empty-title').textContent).toBe('ยังไม่มีรายการในเดือนที่เลือก');
    expect(byId('status').textContent).toBe('ยังไม่มีรายการในเดือนที่เลือก');
    expect(byId('summary-empty').hidden).toBe(false);
    expect(byId('summary-empty').querySelector('.empty-title').textContent).toBe('ยังไม่มีข้อมูลสรุปในเดือนที่เลือก');
    expect(byId('chart').hidden).toBe(true);
    expect(byId('stat-balance').textContent).toBe('0 บาท');
  });

  // ใช้เกินรายรับต้องเห็นเป็นสีแดงเหมือนยอดสะสมในหน้าโปรไฟล์
  it('marks a negative month balance so it shows in red', async () => {
    const overspent = { ...RESPONSES['/api/transactions'], summary: [{ type: 'expense', category: 'อาหาร', total: 500, entryCount: 1 }] };
    await boot({ overrides: { '/api/transactions': overspent } });

    expect(byId('stat-balance').textContent).toBe('-500 บาท');
    expect(byId('stat-balance').classList.contains('negative')).toBe(true);
  });

  // ยอดยาวจะไม่พอในกล่องครึ่งการ์ด จึงเรียงรายรับ/รายจ่ายลงแนวตั้งแทนการย่อตัวอักษรจนอ่านยาก
  it('stacks the income and expense boxes when an amount is long', async () => {
    const big = { ...RESPONSES['/api/transactions'], summary: [{ type: 'expense', category: 'อาหาร', total: 1234567.89, entryCount: 1 }] };
    await boot({ overrides: { '/api/transactions': big } });

    expect(byId('stat-expense').textContent).toBe('1,234,567.89 บาท');
    expect(byId('totals').querySelector('.stat-sub').classList.contains('long')).toBe(true);
  });

  it('keeps the income and expense boxes side by side for short amounts', async () => {
    await boot();

    expect(byId('totals').querySelector('.stat-sub').classList.contains('long')).toBe(false);
  });

  it('shows the filter bar again when the month changes to one with data', async () => {
    await boot({ overrides: { '/api/transactions': EMPTY_MONTH } });
    expect(byId('filters').hidden).toBe(true);
    vi.stubGlobal('fetch', makeFetch({}));

    byId('month').value = '2026-09';
    byId('month').dispatchEvent(new Event('change'));
    await settle();

    expect(byId('filters').hidden).toBe(false);
    expect(document.querySelectorAll('#list .row')).toHaveLength(3);
  });

  // กั้นการโหลดรายการของเดือนถัดไปไว้ เพื่อดู skeleton ระหว่างรอ
  function holdTransactions() {
    const fallback = makeFetch({});
    let release;
    const gate = new Promise((resolve) => (release = resolve));
    vi.stubGlobal('fetch', async (url, ...rest) => {
      if (new URL(url, 'http://localhost').pathname === '/api/transactions') await gate;
      return fallback(url, ...rest);
    });
    return release;
  }

  // การ์ดสรุปสูงตามจำนวนหมวด skeleton ที่สูงเท่าการ์ดเดือนก่อนจึงใกล้ของจริงกว่าค่าคงที่
  it('sizes the summary skeleton like the last drawn chart while the next month loads', async () => {
    await boot();
    byId('chart').getBoundingClientRect = () => ({ height: 397 });
    const release = holdTransactions();

    byId('month').value = '2026-09';
    byId('month').dispatchEvent(new Event('change'));

    expect(byId('summary-skeleton').hidden).toBe(false);
    expect(byId('summary-skeleton').querySelector('.skeleton').style.height).toBe('397px');
    release();
    await settle();
  });

  it('keeps the default summary skeleton height when no chart was drawn yet', async () => {
    await boot({ overrides: { '/api/transactions': EMPTY_MONTH } });
    const release = holdTransactions();

    byId('month').value = '2026-09';
    byId('month').dispatchEvent(new Event('change'));

    expect(byId('summary-skeleton').querySelector('.skeleton').style.height).toBe('');
    release();
    await settle();
  });
});

describe('LIFF page when loading fails', () => {
  it('shows the load error in the shared banner when /api/config rejects', async () => {
    const liff = await boot({ overrides: { '/api/config': new TypeError('network down') } });

    // loading never started, so there is no skeleton to clear
    expect(liff.fetched).toEqual(['/api/config']);
    expect(byId('banner').hidden).toBe(false);
    expect(byId('banner').textContent).toBe('โหลดข้อมูลไม่สำเร็จ ลองใหม่อีกครั้ง');
    expect(document.querySelector('#list .skeleton')).toBeNull();
    expect(byId('summary-skeleton').hidden).toBe(true);
    expect(byId('status').hidden).toBe(true);
  });

  it('shows the load error in the shared banner when /api/categories rejects', async () => {
    const liff = await boot({ overrides: { '/api/categories': new TypeError('network down') } });

    // loading never started, so there is no skeleton to clear
    expect(liff.fetched).not.toContain('/api/transactions');
    expect(byId('banner').textContent).toBe('โหลดข้อมูลไม่สำเร็จ ลองใหม่อีกครั้ง');
    expect(byId('banner').hidden).toBe(false);
    expect(document.querySelector('#list .skeleton')).toBeNull();
    expect(byId('summary-skeleton').hidden).toBe(true);
  });

  it('removes the skeletons and shows the banner when /api/transactions fails after loading started', async () => {
    const liff = await boot({ overrides: { '/api/transactions': { status: 500 } } });

    // skeletons were really shown when the request went out
    expect(liff.loadingSnapshot.listSkeletons).toBe(6);
    expect(liff.loadingSnapshot.visibleLoaders).toEqual(LOADING_ELEMENT_IDS);
    expect(byId('banner').hidden).toBe(false);
    expect(byId('banner').textContent).toBe('โหลดข้อมูลไม่สำเร็จ ลองใหม่อีกครั้ง');
    expect(document.querySelector('#list .skeleton')).toBeNull();
    expect(byId('list-head-skeleton').hidden).toBe(true);
    expect(byId('summary-skeleton').hidden).toBe(true);
    expect(byId('filters').hidden).toBe(true);
    expect(byId('status').hidden).toBe(true);
    // the other sections load independently and still render
    expect(byId('budget-hero-percent').textContent).toBe('6%');
    expect(document.querySelectorAll('#trend-bars .trend-col')).toHaveLength(6);
  });

  it('asks the user to reopen from LINE on a 401', async () => {
    await boot({ overrides: { '/api/transactions': { status: 401 } } });

    expect(byId('banner').textContent).toBe('กรุณาเปิดหน้านี้จากแอป LINE อีกครั้ง');
  });

  it('shows the profile error with a retry button when only /api/profile fails', async () => {
    await boot({ overrides: { '/api/profile': { status: 500 } } });
    // entering the tab retries a profile that never loaded
    document.querySelector('#bottom-nav button[data-tab="profile"]').click();
    await settle();

    expect(byId('profile-error').hidden).toBe(false);
    expect(byId('profile-error-text').textContent).toBe('โหลดโปรไฟล์ไม่สำเร็จ');
    expect(byId('profile-retry').hidden).toBe(false);
    expect(byId('profile-card').hidden).toBe(true);
    expect(byId('profile-skeleton').hidden).toBe(true);

    vi.stubGlobal('fetch', makeFetch({}));
    byId('profile-retry').click();
    await settle();

    expect(byId('profile-error').hidden).toBe(true);
    expect(byId('profile-card').hidden).toBe(false);
    expect(byId('profile-name').textContent).toBe('สมชาย');
  });

  it('keeps the load error visible after switching tabs and back when /api/transactions fails', async () => {
    await boot({ overrides: { '/api/transactions': { status: 500 } } });

    clickTab('summary');
    expect(byId('banner').textContent).toBe('โหลดข้อมูลไม่สำเร็จ ลองใหม่อีกครั้ง');
    expect(byId('banner').hidden).toBe(false);
    clickTab('list');

    expect(byId('banner').textContent).toBe('โหลดข้อมูลไม่สำเร็จ ลองใหม่อีกครั้ง');
    expect(byId('banner').hidden).toBe(false);
    expect(byId('banner-retry').hidden).toBe(false);
    expect(document.querySelectorAll('#list .row')).toHaveLength(0);
  });

  it('shows the boot load error on every tab after a boot failure', async () => {
    await boot({ overrides: { '/api/categories': new TypeError('network down') } });

    for (const id of ['list', 'summary', 'budgets', 'profile', 'list']) {
      clickTab(id);
      expect(byId('banner').hidden, id).toBe(false);
      expect(byId('banner').textContent, id).toBe('โหลดข้อมูลไม่สำเร็จ ลองใหม่อีกครั้ง');
      expect(byId('banner-retry').hidden, id).toBe(false);
    }
  });

  it('offers no retry for the login-required message', async () => {
    await boot({ overrides: { '/api/transactions': { status: 401 } } });

    clickTab('summary');

    expect(byId('banner').textContent).toBe('กรุณาเปิดหน้านี้จากแอป LINE อีกครั้ง');
    expect(byId('banner-retry').hidden).toBe(true);
  });

  it('reloads the month and clears the error when the retry button is clicked', async () => {
    await boot({ overrides: { '/api/transactions': { status: 500 } } });
    expect(byId('banner-retry').hidden).toBe(false);
    const calls = routeFetch(() => undefined);

    byId('banner-retry').click();
    await settle();

    expect(calls).toContain('GET /api/transactions');
    expect(document.querySelectorAll('#list .row')).toHaveLength(3);
    expect(byId('banner').hidden).toBe(true);
    expect(byId('banner-retry').hidden).toBe(true);
    clickTab('summary');
    clickTab('list');
    expect(byId('banner').hidden).toBe(true);
  });

  it('keeps the stale list and the filter bar when a non-reset reload fails', async () => {
    await boot();
    routeFetch((method, path) => {
      if (method === 'PATCH') return {};
      return path === '/api/transactions' ? { status: 500 } : undefined;
    });

    await submitEditOfFirstRow();

    expect(document.querySelectorAll('#list .row')).toHaveLength(3);
    expect(byId('filters').hidden).toBe(false);
    expect(byId('banner').textContent).toBe('โหลดข้อมูลไม่สำเร็จ ลองใหม่อีกครั้ง');
    expect(byId('banner-retry').hidden).toBe(false);
  });

  it('redirects to LINE login instead of loading data when not logged in', async () => {
    const liff = await boot({ loggedIn: false });

    expect(liff.login).toHaveBeenCalledTimes(1);
    expect(byId('banner').hidden).toBe(true);
    expect(liff.fetched).toEqual(['/api/config']);
    expect(document.querySelectorAll('#list .row')).toHaveLength(0);
  });
});


describe('LIFF page opened from a totals answer card', () => {
  const noteOf = () => [...document.querySelectorAll('#list .row .row-note')].map((el) => el.textContent);

  it('opens the list on the linked month with the search box and type filter filled', async () => {
    await boot({ search: `?tab=list&m=2026-09&q=${encodeURIComponent('bts')}&type=expense` });
    await settle();

    expect(byId('month').value).toBe('2026-09');
    expect(byId('search').value).toBe('bts');
    expect(byId('filter-type').value).toBe('expense');
    expect(document.querySelector('#bottom-nav [aria-current="page"]').dataset.tab).toBe('list');
    expect(noteOf()).toEqual(['BTS']);
    expect(byId('filter-status').textContent).toBe('พบ 1 จาก 3 รายการ รวม -40 บาท');
    expect(window.location.search).toBe('');
  });

  describe('with a category in the link', () => {
    const categories = [...CATEGORIES, { id: 'c-other-in', name: 'อื่นๆ', type: 'income' }, { id: 'c-other-out', name: 'อื่นๆ', type: 'expense' }];
    const transactions = [
      { id: 'a1', type: 'expense', amount: 60, note: 'กาแฟเช้า', occurredOn: '2026-10-02', categoryId: 'c-food', categoryName: 'อาหาร' },
      { id: 'a2', type: 'expense', amount: 40, note: 'ข้าว', occurredOn: '2026-10-02', categoryId: 'c-food', categoryName: 'อาหาร' },
      { id: 'a3', type: 'expense', amount: 30, note: 'กาแฟ BTS', occurredOn: '2026-10-01', categoryId: 'c-trip', categoryName: 'เดินทาง' },
      { id: 'a4', type: 'expense', amount: 99, note: 'ซื้ออาหารแมว', occurredOn: '2026-10-01', categoryId: 'c-trip', categoryName: 'เดินทาง' },
    ];
    const overrides = { '/api/categories': { categories }, '/api/transactions': { transactions, summary: [], truncated: false } };
    const ids = () => [...document.querySelectorAll('#list .row')].map((el) => el.dataset.id);

    it('counts only entries of that category whose note matches the keyword', async () => {
      await boot({ overrides, search: `?tab=list&c=${encodeURIComponent('อาหาร')}&q=${encodeURIComponent('กาแฟ')}&type=expense` });
      await settle();

      expect(byId('filter-category').value).toBe('c-food');
      expect(byId('search').value).toBe('กาแฟ');
      expect(ids()).toEqual(['a1']);
      expect(byId('filter-status').textContent).toBe('พบ 1 จาก 4 รายการ รวม -60 บาท');
    });

    it('filters by the category alone when there is no keyword', async () => {
      await boot({ overrides, search: `?tab=list&c=${encodeURIComponent('อาหาร')}&type=expense` });
      await settle();

      expect(byId('search').value).toBe('');
      expect(ids()).toEqual(['a1', 'a2']);
    });

    it('puts the name in the search box when it exists in both types and the type is open', async () => {
      await boot({ overrides, search: `?tab=list&c=${encodeURIComponent('อื่นๆ')}` });
      await settle();

      expect(byId('filter-category').value).toBe('');
      expect(byId('search').value).toBe('อื่นๆ');
    });

    it('picks the category of the linked type when the name exists in both types', async () => {
      await boot({ overrides, search: `?tab=list&c=${encodeURIComponent('อื่นๆ')}&type=income` });
      await settle();

      expect(byId('filter-category').value).toBe('c-other-in');
      expect(byId('search').value).toBe('');
    });

    it('puts the name in the search box when no category has it', async () => {
      await boot({ overrides, search: `?tab=list&c=${encodeURIComponent('ไม่มีหมวดนี้')}&type=expense` });
      await settle();

      expect(byId('filter-category').value).toBe('');
      expect(byId('search').value).toBe('ไม่มีหมวดนี้');
    });
  });

  it('opens the list tab even when the link carries no tab', async () => {
    await boot({ search: '?m=2026-10&type=income' });
    await settle();

    expect(document.querySelector('#bottom-nav [aria-current="page"]').dataset.tab).toBe('list');
    expect(document.querySelectorAll('#list .row')).toHaveLength(1);
  });

  it('ignores invalid parts and shows the normal list', async () => {
    await boot({ search: '?tab=list&m=2026-13&type=all' });
    await settle();

    expect(byId('month').value).toBe('2026-10');
    expect(byId('search').value).toBe('');
    expect(document.querySelectorAll('#list .row')).toHaveLength(3);
  });

  it('keeps the edit link in charge when both are present', async () => {
    await boot({ search: '?tx=t2&d=2026-10-01&m=2026-09&q=zzz' });

    expect(byId('month').value).toBe('2026-10');
    expect(byId('search').value).toBe('');
    expect(byId('editor').open).toBe(true);
  });
});

describe('LIFF page opened from a card link', () => {
  it('opens only the friend dialog when the link has both an entry and a friend code', async () => {
    await boot({ search: '?tx=t2&d=2026-10-01&friend=WXYZ2345' });
    await settle();

    expect(byId('friend-dialog').hasAttribute('open')).toBe(true);
    expect(byId('editor').hasAttribute('open')).toBe(false);
  });

  it('opens the editor of the linked transaction and cleans the address', async () => {
    await boot({ search: '?tx=t2&d=2026-10-01' });

    expect(byId('editor').open).toBe(true);
    expect(byId('edit-amount').value).toBe('40');
    expect(byId('edit-date').value).toBe('2026-10-01');
    expect(window.location.search).toBe('');
  });

  it('switches to the month of the linked date before looking for the transaction', async () => {
    await boot({ search: '?tx=t1&d=2026-09-29' });

    expect(byId('month').value).toBe('2026-09');
    expect(byId('editor').open).toBe(true);
  });

  it('says so when the linked transaction is no longer there', async () => {
    await boot({ search: '?tx=gone&d=2026-10-02' });

    expect(byId('editor').open).toBe(false);
    expect(byId('banner').hidden).toBe(false);
    expect(byId('banner').textContent).toBe('ไม่พบรายการนี้ อาจถูกลบหรือยกเลิกไปแล้ว');
  });

  it('ignores a link with a malformed id and shows the normal list', async () => {
    await boot({ search: '?tx=%3Cscript%3E&d=2026-09-29' });

    expect(byId('editor').open).toBe(false);
    expect(byId('month').value).toBe('2026-10');
    expect(document.querySelectorAll('#list .row')).toHaveLength(3);
  });

  it('does not open an editor on a normal visit', async () => {
    await boot();

    expect(byId('editor').open).toBe(false);
  });
});

describe('LIFF summary stacked bar motion', () => {
  it('replays the sweep class when the summary tab opens', async () => {
    await boot();
    clickTab('summary');
    await settle();

    expect(byId('chart-stack').classList.contains('sweep')).toBe(true);
  });

  // สลับรายรับ/รายจ่ายเป็น re-render ธรรมดา ไม่เล่น animation เหมือนแท่งรายหมวด
  it('does not replay the sweep when only the chart type changes', async () => {
    await boot();
    clickTab('summary');
    await settle();
    byId('chart-stack').classList.remove('sweep');
    document.querySelector('#chart .tabs [data-type="income"]').click();
    await settle();

    expect(byId('chart-stack').classList.contains('sweep')).toBe(false);
  });
});

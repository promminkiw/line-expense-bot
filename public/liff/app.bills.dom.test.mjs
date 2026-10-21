// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { CATEGORIES, RESPONSES, settle, makeFetch, boot, byId, routeFetch, cleanupGlobals } from './dom-harness.mjs';

afterEach(cleanupGlobals);

describe('LIFF bills tab', () => {
  // หยุด boot ไว้ที่ liff.init เพื่อให้ route ใช้กับการโหลดบิลครั้งแรกของหน้าหารบิลด้วย
  async function openBills({ route } = {}) {
    const liff = await boot({ search: '?tab=bills', holdInit: true });
    const calls = route ? routeFetch(route) : routeFetch(() => undefined);
    liff.releaseInit();
    await settle();
    return calls;
  }

  const incomingCard = () => document.querySelector('#bills-incoming .bill-card');
  const ownedCard = () => document.querySelector('#bills-owned .bill-card');
  // บิลที่จบแล้วย้ายไปอยู่ในส่วนที่พับไว้ จึงหาด้วย id ทั้งหน้า
  const cardOf = (id) => document.querySelector(`#panel-bills .bill-card[data-id="${id}"]`);

  const withBills = (bills) => (method, path) => (path === '/api/bills' && method === 'GET' ? bills : undefined);
  const BASE = RESPONSES['/api/bills'];

  it('names the bill or the friend on every card button for screen readers', async () => {
    await openBills();

    expect(incomingCard().querySelector('.bill-confirm').getAttribute('aria-label')).toBe('ยืนยันบิล ชาบู');
    expect(incomingCard().querySelector('.bill-decline').getAttribute('aria-label')).toBe('ปฏิเสธบิล ชาบู');
    expect(ownedCard().querySelector('.bill-cancel').getAttribute('aria-label')).toBe('ยกเลิกบิล เนื้อย่าง');
    const paidBoxes = [...ownedCard().querySelectorAll('.bill-member-paid input')];
    expect(paidBoxes.map((box) => box.getAttribute('aria-label'))).toEqual(['บี คืนแล้ว', 'ซี คืนแล้ว']);
    expect(ownedCard().querySelector('.bill-share-link').getAttribute('aria-label')).toBe('ส่งลิงก์บิล เนื้อย่าง');
  });

  it('shows a link back to the main page and hides the link to itself', async () => {
    await openBills();

    const home = byId('bills-home');
    expect(home.hidden).toBe(false);
    expect(home.getAttribute('href')).toBe('./');
    expect(home.textContent.trim()).toBe('หน้าหลัก');
    expect(byId('friends-bills-link').hidden).toBe(true);
  });

  it('puts decline on the left of confirm', async () => {
    await openBills();

    const actions = [...incomingCard().querySelectorAll('.bill-actions button')];
    expect(actions.map((node) => node.className)).toEqual(['bill-decline', 'bill-confirm']);
  });

  it('opens the friends page first when a bill waits for an answer', async () => {
    await openBills();

    expect(byId('bills-show-incoming').getAttribute('aria-pressed')).toBe('true');
    expect(byId('bills-show-owned').getAttribute('aria-pressed')).toBe('false');
    expect(byId('bills-incoming-section').hidden).toBe(false);
    expect(byId('bills-owned-section').hidden).toBe(true);
    expect(byId('bills-awaiting').textContent).toBe('1');
    expect(byId('bills-show-incoming').getAttribute('aria-label')).toBe('เพื่อนส่งมา รอคุณตอบ 1 บิล');
  });

  it('opens my bills first when nothing waits for an answer, and switches between the two pages', async () => {
    const incoming = [{ ...BASE.incoming[0], myStatus: 'confirmed' }];
    await openBills({ route: withBills({ owned: BASE.owned, incoming }) });

    expect(byId('bills-owned-section').hidden).toBe(false);
    expect(byId('bills-incoming-section').hidden).toBe(true);
    expect(byId('bills-awaiting').hidden).toBe(true);
    expect(byId('bills-show-incoming').hasAttribute('aria-label')).toBe(false);
    byId('bills-show-incoming').click();
    expect(byId('bills-incoming-section').hidden).toBe(false);
    expect(byId('bills-owned-section').hidden).toBe(true);
    expect(byId('bills-show-incoming').getAttribute('aria-pressed')).toBe('true');
  });

  it('keeps the chosen page when the list reloads', async () => {
    await openBills({ route: (method, path) => (path === '/api/bills/b-in/confirm' ? { status: 'confirmed' } : undefined) });

    incomingCard().querySelector('.bill-confirm').click();
    byId('bills-show-owned').click();
    await settle();

    expect(byId('bills-owned-section').hidden).toBe(false);
  });

  it('shows a short card that opens to the members when tapped', async () => {
    await openBills();
    const row = ownedCard().querySelector('.bill-row');
    const detail = ownedCard().querySelector('.bill-detail');

    expect(row.getAttribute('aria-expanded')).toBe('false');
    expect(row.getAttribute('aria-controls')).toBe(detail.id);
    expect(detail.hidden).toBe(true);
    row.click();
    expect(ownedCard().querySelector('.bill-row').getAttribute('aria-expanded')).toBe('true');
    expect(ownedCard().querySelector('.bill-detail').hidden).toBe(false);
    ownedCard().querySelector('.bill-row').click();
    expect(ownedCard().querySelector('.bill-detail').hidden).toBe(true);
  });

  it('keeps an opened card open and focused after ticking paid', async () => {
    await openBills({ route: (method, path) => (path === '/api/bills/b-own/members/f-1/paid' ? { paid: true } : undefined) });
    ownedCard().querySelector('.bill-row').click();

    const box = ownedCard().querySelector('.bill-member-paid input');
    box.checked = true;
    box.dispatchEvent(new Event('change'));
    await settle();

    expect(ownedCard().querySelector('.bill-detail').hidden).toBe(false);
    expect(document.activeElement).toBe(ownedCard().querySelector('.bill-member-paid input'));
  });

  it('keeps answer buttons outside the folded part so they work without opening the card', async () => {
    await openBills();

    expect(incomingCard().querySelector('.bill-row .bill-confirm')).toBeNull();
    expect(incomingCard().querySelector('.bill-detail .bill-confirm')).toBeNull();
    expect(incomingCard().querySelector('.bill-confirm')).not.toBeNull();
  });

  it('moves finished bills into a folded section with a count', async () => {
    const owned = [
      BASE.owned[0],
      { ...BASE.owned[0], id: 'b-done', title: 'ตั๋วหนัง', status: 'cancelled' },
      { ...BASE.owned[0], id: 'b-paid', title: 'แท็กซี่', members: [{ ...BASE.owned[0].members[0], paid: true }] },
    ];
    await openBills({ route: withBills({ owned, incoming: [] }) });

    expect([...document.querySelectorAll('#bills-owned .bill-card')].map((card) => card.dataset.id)).toEqual(['b-own']);
    expect(byId('bills-owned-done').hidden).toBe(false);
    expect(byId('bills-owned-done').open).toBe(false);
    expect(byId('bills-owned-done-count').textContent).toBe('2');
    const done = [...byId('bills-owned-done-list').querySelectorAll('.bill-card')];
    expect(done.map((card) => card.querySelector('.bill-summary').textContent)).toEqual(['ยกเลิกแล้ว', 'คืนครบแล้ว']);
    expect(cardOf('b-paid').querySelector('.bill-amount').textContent).toBe('900 บาท');
    expect(byId('bills-incoming-done').hidden).toBe(true);
  });

  it('says there is nothing left to handle when every bill is finished', async () => {
    const owned = [{ ...BASE.owned[0], status: 'cancelled' }];
    await openBills({ route: withBills({ owned, incoming: [] }) });

    expect(byId('bills-owned-empty').hidden).toBe(false);
    expect(byId('bills-owned-empty').textContent).toBe('ไม่มีบิลที่เพื่อนยังค้าง');
  });

  it('notes when a list may be cut at the server limit', async () => {
    const owned = Array.from({ length: 50 }, (_, i) => ({ ...BASE.owned[0], id: `b-${i}` }));
    await openBills({ route: withBills({ owned, incoming: BASE.incoming }) });

    expect(byId('bills-owned-limit').hidden).toBe(false);
    expect(byId('bills-owned-limit').textContent).toBe('แสดง 50 บิลล่าสุด');
    expect(byId('bills-incoming-limit').hidden).toBe(true);
  });

  it('opens a linked finished bill on its page, unfolds it and focuses the card', async () => {
    const linkedId = '77777777-7777-7777-7777-777777777777';
    const bills = { owned: [{ ...BASE.owned[0], id: linkedId, status: 'cancelled' }], incoming: BASE.incoming };
    await boot({ search: `?bill=${linkedId}`, overrides: { '/api/bills': bills } });
    await settle();

    expect(byId('bills-owned-section').hidden).toBe(false);
    expect(byId('bills-owned-done').open).toBe(true);
    expect(cardOf(linkedId).querySelector('.bill-detail').hidden).toBe(false);
    expect(document.activeElement).toBe(cardOf(linkedId));
  });

  it('focuses the folded section when an answered bill moves out of sight', async () => {
    const declined = { ...BASE.incoming[0], myStatus: 'declined' };
    let listCalls = 0;
    await openBills({
      route: (method, path) => {
        if (path === '/api/bills/b-in/decline') return { status: 'declined' };
        if (path !== '/api/bills') return undefined;
        listCalls += 1;
        return listCalls > 1 ? { owned: BASE.owned, incoming: [declined] } : undefined;
      },
    });

    incomingCard().querySelector('.bill-decline').click();
    byId('bill-dialog-ok').click();
    await settle();

    expect(document.activeElement).toBe(byId('bills-incoming-done').querySelector('summary'));
  });

  it('keeps focus on the bill after answering it, instead of losing it to the page', async () => {
    await openBills({ route: (method, path) => (path === '/api/bills/b-in/confirm' ? { status: 'confirmed' } : undefined) });

    incomingCard().querySelector('.bill-confirm').focus();
    incomingCard().querySelector('.bill-confirm').click();
    await settle();

    expect(document.activeElement).toBe(incomingCard());
  });

  it('keeps focus on the paid box after ticking it', async () => {
    await openBills({ route: (method, path) => (path.endsWith('/paid') ? { paid: true } : undefined) });
    const box = ownedCard().querySelector('.bill-member-paid input');

    box.checked = true;
    box.dispatchEvent(new Event('change'));
    await settle();

    expect(document.activeElement).toBe(ownedCard().querySelector('.bill-member-paid input'));
  });

  it('labels the dialog close button so it is not confused with cancelling the bill', async () => {
    await openBills();

    ownedCard().querySelector('.bill-cancel').click();
    expect(byId('bill-dialog-cancel').textContent).toBe('กลับ');
    byId('bill-dialog-cancel').click();
    incomingCard().querySelector('.bill-decline').click();
    expect(byId('bill-dialog-cancel').textContent).toBe('ยกเลิก');
  });

  it('offers no paid box for a member who never answered a cancelled bill', async () => {
    const owned = [{ ...BASE.owned[0], status: 'cancelled' }];
    await openBills({ route: withBills({ owned, incoming: [] }) });

    const rows = [...cardOf('b-own').querySelectorAll('.bill-member')];
    expect(rows.map((row) => Boolean(row.querySelector('.bill-member-paid')))).toEqual([true, false]);
  });

  it('disables retry while the bills are loading again', async () => {
    await openBills({ route: (method, path) => (path === '/api/bills' ? { status: 500 } : undefined) });
    const release = holdRequest('/api/bills');

    byId('bills-retry').click();
    expect(byId('bills-retry').disabled).toBe(true);
    release();
    await settle();
    expect(byId('bills-retry').disabled).toBe(false);
  });

  it('shows a failed decline only in the dialog, not twice', async () => {
    await openBills({ route: (method, path) => (path === '/api/bills/b-in/decline' ? new Error('offline') : undefined) });

    incomingCard().querySelector('.bill-decline').click();
    byId('bill-dialog-ok').click();
    await settle();

    expect(byId('bill-dialog-error').textContent).toBe('ตอบบิลไม่สำเร็จ ลองใหม่อีกครั้ง');
    expect(byId('bills-status').textContent).toBe('');
  });

  it('keeps the buttons of a bill that is still sending disabled when another card redraws the list', async () => {
    const incoming = [BASE.incoming[0], { ...BASE.incoming[0], id: 'b-in2', title: 'หมูกระทะ' }];
    await openBills({
      route: (method, path) => {
        if (path === '/api/bills' && method === 'GET') return { owned: [], incoming };
        if (path === '/api/bills/b-in2/confirm') return { status: 'confirmed' };
        return undefined;
      },
    });
    const release = holdRequest('/api/bills/b-in/confirm', 'POST');
    const cards = () => [...document.querySelectorAll('#bills-incoming .bill-card')];

    cards()[0].querySelector('.bill-confirm').click();
    cards()[1].querySelector('.bill-confirm').click();
    await settle();

    expect(cards()[0].querySelector('.bill-confirm').disabled).toBe(true);
    release();
    await settle();
  });

  it('disables creating a bill until the page is signed in', async () => {
    const liff = await boot({ search: '?tab=bills', holdInit: true });

    expect(byId('bill-new').disabled).toBe(true);
    liff.releaseInit();
    await settle();
    expect(byId('bill-new').disabled).toBe(false);
  });

  it('uses the same decline wording as the bot', async () => {
    await openBills({ route: (method, path) => (path === '/api/bills/b-in/decline' ? { status: 'declined' } : undefined) });

    incomingCard().querySelector('.bill-decline').click();
    byId('bill-dialog-ok').click();
    await settle();

    expect(byId('bills-status').textContent).toBe('ปฏิเสธบิลนี้แล้ว');
  });

  it('tells a friend who confirmed a cancelled bill that the expense is still recorded', async () => {
    const incoming = [{ ...BASE.incoming[0], status: 'cancelled', myStatus: 'confirmed', expenseRecorded: true }];
    await openBills({ route: withBills({ owned: [], incoming }) });

    // ยังต้องไปลบรายจ่าย จึงอยู่กับบิลที่ต้องจัดการ ไม่ใช่ในส่วนที่พับไว้
    expect(incomingCard().dataset.id).toBe('b-in');

    // ต้องเห็นได้โดยไม่ต้องกางการ์ด เพราะผู้ใช้ต้องไปลบรายจ่ายเอง
    expect(cardOf('b-in').querySelector('.bill-detail .bill-note')).toBeNull();
    expect(cardOf('b-in').querySelector('.bill-note').textContent).toBe('บิลถูกยกเลิก แต่รายจ่ายส่วนของคุณยังบันทึกอยู่ ลบเองได้ในหน้าเว็บหลัก');
  });

  it('shows the category of an incoming bill and only the total when the server leaves it out', async () => {
    const incoming = [BASE.incoming[0], { ...BASE.incoming[0], id: 'b-private', categoryName: '' }];
    await openBills({ route: withBills({ owned: [], incoming }) });

    expect(cardOf('b-in').querySelector('.bill-meta').textContent).toBe('อาหาร · รวม 600 บาท');
    expect(cardOf('b-private').querySelector('.bill-meta').textContent).toBe('รวม 600 บาท');
  });

  it('moves a cancelled bill to the finished part once its expense was deleted', async () => {
    const incoming = [{ ...BASE.incoming[0], status: 'cancelled', myStatus: 'confirmed', expenseRecorded: false }];
    await openBills({ route: withBills({ owned: [], incoming }) });

    expect(byId('bills-incoming-done').contains(cardOf('b-in'))).toBe(true);
    expect(cardOf('b-in').querySelector('.bill-note')).toBeNull();
  });

  it('loads the bills when the tab opens and shows both lists', async () => {
    await openBills();

    expect(byId('bills-incoming-title').textContent).toBe('บิลที่เพื่อนส่งมา');
    expect(incomingCard().querySelector('.bill-title').textContent).toBe('ชาบู');
    expect(incomingCard().querySelector('.bill-summary').textContent).toBe('ดี · รอคุณตอบ');
    expect(incomingCard().querySelector('.bill-amount').textContent).toBe('200 บาท');
    expect(incomingCard().querySelector('.bill-cal').textContent).toBe('ต.ค.7');
    expect(ownedCard().querySelector('.bill-title').textContent).toBe('เนื้อย่าง');
    expect(ownedCard().querySelector('.bill-summary').textContent).toBe('ค้างรับ · คืนแล้ว 0/2 คน');
    expect(ownedCard().querySelector('.bill-amount').textContent).toBe('600 บาท');
    expect(ownedCard().querySelector('.bill-meta').textContent).toBe('อาหาร · รวม 900 บาท');
    const members = [...ownedCard().querySelectorAll('.bill-member')];
    expect(members.map((row) => row.querySelector('.bill-member-name').textContent)).toEqual(['บี', 'ซี']);
    expect(members.map((row) => row.querySelector('.bill-member-status').textContent)).toEqual(['ยืนยันแล้ว', 'รอตอบ']);
  });

  it('shows the empty notes when there are no bills', async () => {
    await openBills({ route: (method, path) => (path === '/api/bills' ? { owned: [], incoming: [] } : undefined) });

    expect(byId('bills-incoming-empty').hidden).toBe(false);
    expect(byId('bills-incoming-empty').textContent).toBe('ยังไม่มีบิลที่เพื่อนส่งมา');
    expect(byId('bills-owned-empty').hidden).toBe(false);
    expect(byId('bills-owned-empty').textContent).toBe('ยังไม่มีบิลที่คุณสร้าง');
  });

  it('shows an error with retry when the bills fail to load', async () => {
    await openBills({ route: (method, path) => (path === '/api/bills' ? { status: 500 } : undefined) });

    expect(byId('bills-error').hidden).toBe(false);
    expect(byId('bills-error-text').textContent).toBe('โหลดบิลไม่สำเร็จ');
    routeFetch(() => undefined);
    byId('bills-retry').click();
    await settle();
    expect(byId('bills-error').hidden).toBe(true);
    expect(incomingCard()).not.toBeNull();
  });

  it('confirms an incoming bill and reloads', async () => {
    const calls = await openBills({ route: (method, path) => (path === '/api/bills/b-in/confirm' ? { status: 'confirmed' } : undefined) });

    incomingCard().querySelector('.bill-confirm').click();
    await settle();

    expect(calls).toContain('POST /api/bills/b-in/confirm');
    expect(calls.filter((call) => call === 'GET /api/bills').length).toBeGreaterThanOrEqual(2);
    expect(byId('bills-status').textContent).toBe('ยืนยันแล้ว บันทึกเป็นรายจ่ายของคุณ');
  });

  it('declines an incoming bill after confirming in the dialog', async () => {
    const calls = await openBills({ route: (method, path) => (path === '/api/bills/b-in/decline' ? { status: 'declined' } : undefined) });

    incomingCard().querySelector('.bill-decline').click();
    expect(byId('bill-dialog-text').textContent).toBe('ปฏิเสธบิล ชาบู ของ ดี?');
    byId('bill-dialog-ok').click();
    await settle();

    expect(calls).toContain('POST /api/bills/b-in/decline');
    expect(byId('bill-dialog').hasAttribute('open')).toBe(false);
  });

  it('shows why answering failed', async () => {
    await openBills({ route: (method, path) => (path === '/api/bills/b-in/confirm' ? { status: 404 } : undefined) });

    incomingCard().querySelector('.bill-confirm').click();
    await settle();

    expect(byId('bills-status').textContent).toBe('ไม่พบบิลนี้แล้ว');
  });

  it('marks a member as paid back and lowers the outstanding amount', async () => {
    const calls = await openBills({ route: (method, path) => (path === '/api/bills/b-own/members/f-1/paid' ? { paid: true } : undefined) });

    const paidBox = ownedCard().querySelector('.bill-member input[type="checkbox"]');
    paidBox.checked = true;
    paidBox.dispatchEvent(new Event('change'));
    await settle();

    expect(calls).toContain('POST /api/bills/b-own/members/f-1/paid');
    expect(ownedCard().querySelector('.bill-amount').textContent).toBe('300 บาท');
    expect(ownedCard().querySelector('.bill-summary').textContent).toBe('ค้างรับ · คืนแล้ว 1/2 คน');
  });

  it('puts the checkbox back when marking paid fails', async () => {
    await openBills({ route: (method, path) => (path === '/api/bills/b-own/members/f-1/paid' ? { status: 500 } : undefined) });

    const paidBox = ownedCard().querySelector('.bill-member input[type="checkbox"]');
    paidBox.checked = true;
    paidBox.dispatchEvent(new Event('change'));
    await settle();

    expect(ownedCard().querySelector('.bill-member input[type="checkbox"]').checked).toBe(false);
    expect(byId('bills-status').textContent).toBe('บันทึกการคืนเงินไม่สำเร็จ ลองใหม่อีกครั้ง');
  });

  it('cancels an owned bill after confirming in the dialog', async () => {
    const calls = await openBills({ route: (method, path) => (path === '/api/bills/b-own/cancel' ? { status: 'cancelled' } : undefined) });

    ownedCard().querySelector('.bill-cancel').click();
    expect(byId('bill-dialog-text').textContent).toBe(
      'ยกเลิกบิล เนื้อย่าง? เพื่อนที่ยังไม่ตอบจะยืนยันไม่ได้ รายจ่ายส่วนของคุณจะถูกลบ ส่วนที่เพื่อนยืนยันแล้วยังอยู่'
    );
    byId('bill-dialog-ok').click();
    await settle();

    expect(calls).toContain('POST /api/bills/b-own/cancel');
    expect(calls).not.toContain('GET /api/transactions');
    expect(calls).not.toContain('GET /api/profile');
  });

  it('does not mention the owner share when cancelling a bill without one', async () => {
    const bill = { ...RESPONSES['/api/bills'].owned[0], ownerShare: 0 };
    const calls = await openBills({
      route: (method, path) => {
        if (path === '/api/bills') return { owned: [bill], incoming: [] };
        return path === '/api/bills/b-own/cancel' ? { status: 'cancelled' } : undefined;
      },
    });

    ownedCard().querySelector('.bill-cancel').click();
    expect(byId('bill-dialog-text').textContent).toBe('ยกเลิกบิล เนื้อย่าง? เพื่อนที่ยังไม่ตอบจะยืนยันไม่ได้ ส่วนที่เพื่อนยืนยันแล้วยังอยู่');
    byId('bill-dialog-ok').click();
    await settle();

    expect(calls).toContain('POST /api/bills/b-own/cancel');
    expect(calls).not.toContain('GET /api/transactions');
  });

  it('flags members the push did not reach and shares the bill link with them', async () => {
    const writeText = vi.fn().mockResolvedValue();
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    await openBills();

    const unreached = [...ownedCard().querySelectorAll('.bill-member')][1];
    expect(unreached.querySelector('.bill-member-note').textContent).toBe('แจ้งเตือนไม่ถึง ส่งลิงก์บิลให้เพื่อนแทน');
    // ปุ่มเดียวต่อบิล อยู่แถวเดียวกับยกเลิกบิล ยกเลิกอยู่ซ้าย
    const actions = [...ownedCard().querySelectorAll('.bill-actions button')];
    expect(actions.map((node) => node.className)).toEqual(['bill-cancel', 'bill-share-link']);
    actions[1].click();
    await settle();

    expect(writeText).toHaveBeenCalledWith('https://liff.line.me/liff-1?bill=b-own');
    expect(byId('bills-status').textContent).toBe('คัดลอกลิงก์บิลแล้ว ส่งให้เพื่อนได้เลย');
  });

  it('shows a cancelled bill without actions', async () => {
    await openBills({
      route: (method, path) =>
        path === '/api/bills'
          ? {
              owned: [],
              incoming: [{ ...RESPONSES['/api/bills'].incoming[0], status: 'cancelled' }],
            }
          : undefined,
    });

    expect(cardOf('b-in').querySelector('.bill-summary').textContent).toBe('ดี · ยกเลิกแล้ว');
    expect(cardOf('b-in').querySelector('.bill-confirm')).toBeNull();
  });

  it('opens the bills tab at the linked bill and focuses its card', async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    const linkedId = '66666666-6666-6666-6666-666666666666';
    const bills = { owned: [], incoming: [{ ...RESPONSES['/api/bills'].incoming[0], id: linkedId }] };
    await boot({ search: `?bill=${linkedId}`, overrides: { '/api/bills': bills } });
    await settle();

    expect(byId('panel-bills').hidden).toBe(false);
    expect(byId('bottom-nav').hidden).toBe(true);
    expect(window.location.search).toBe('');
    expect(document.activeElement).toBe(incomingCard());
    expect(scrollIntoView).toHaveBeenCalled();
    delete Element.prototype.scrollIntoView;
  });

  it('opens the bills page on its own, without the main tabs, from the rich menu link', async () => {
    const liff = await boot({ search: '?tab=bills' });
    await settle();

    expect(window.location.search).toBe('');
    expect(byId('bottom-nav').hidden).toBe(true);
    expect(byId('page-title').textContent).toBe('หารบิล');
    expect(byId('month').hidden).toBe(true);
    expect(byId('panel-bills').hidden).toBe(false);
    for (const id of ['list', 'summary', 'budgets', 'recurring', 'profile']) {
      expect(byId(`panel-${id}`).hidden, id).toBe(true);
    }
    expect(byId('panel-bills').contains(byId('friends'))).toBe(true);
    expect(byId('friends').hidden).toBe(false);
    expect(document.querySelectorAll('#bills-owned .bill-card').length).toBe(1);
    expect(liff.fetched).toContain('/api/friends');
    for (const path of ['/api/transactions', '/api/profile', '/api/recurring', '/api/trend']) {
      expect(liff.fetched, path).not.toContain(path);
    }
  });

  it('still opens a main tab named in the link', async () => {
    await boot({ search: '?tab=profile' });
    await settle();

    expect(document.querySelector('#bottom-nav [aria-current="page"]').dataset.tab).toBe('profile');
    expect(byId('bottom-nav').hidden).toBe(false);
  });

  it('says so when the linked bill is not in the lists', async () => {
    await boot({ search: '?bill=55555555-5555-5555-5555-555555555555' });
    await settle();

    expect(byId('bills-status').textContent).toBe('ไม่พบบิลนี้ในรายการ อาจเป็นบิลเก่าหรือไม่ได้ส่งถึงคุณ');
  });

  it('says the bill was cancelled when confirming a bill the owner already cancelled', async () => {
    const calls = await openBills({ route: (method, path) => (path === '/api/bills/b-in/confirm' ? { status: 'cancelled' } : undefined) });

    incomingCard().querySelector('.bill-confirm').click();
    await settle();

    expect(calls).toContain('POST /api/bills/b-in/confirm');
    expect(byId('bills-status').textContent).toBe('บิลนี้ถูกยกเลิกแล้ว');
  });

  it('ignores a second confirm tap while the first is in flight', async () => {
    const calls = await openBills({ route: (method, path) => (path === '/api/bills/b-in/confirm' ? { status: 'confirmed' } : undefined) });
    const confirmButton = incomingCard().querySelector('.bill-confirm');

    confirmButton.click();
    confirmButton.click();
    await settle();

    expect(calls.filter((call) => call === 'POST /api/bills/b-in/confirm')).toHaveLength(1);
  });

  it('reloads the list when confirming a bill that no longer exists', async () => {
    const calls = await openBills({ route: (method, path) => (path === '/api/bills/b-in/confirm' ? { status: 404 } : undefined) });

    incomingCard().querySelector('.bill-confirm').click();
    await settle();

    expect(calls.filter((call) => call === 'GET /api/bills').length).toBeGreaterThanOrEqual(2);
    expect(byId('bills-status').textContent).toBe('ไม่พบบิลนี้แล้ว');
  });

  it('does not load the main web data after confirming on the bills page', async () => {
    const calls = await openBills({ route: (method, path) => (path === '/api/bills/b-in/confirm' ? { status: 'confirmed' } : undefined) });

    incomingCard().querySelector('.bill-confirm').click();
    await settle();

    expect(calls).toContain('POST /api/bills/b-in/confirm');
    expect(calls).not.toContain('GET /api/transactions');
    expect(calls).not.toContain('GET /api/profile');
  });

  // reload ที่พังทำให้การ์ดยังเป็นสถานะที่แก้ในหน่วยความจำ จึงตรวจการ map สถานะได้
  function answerRoute(answerPath, answerBody) {
    let listCalls = 0;
    return (method, path) => {
      if (path === answerPath) return answerBody;
      if (path !== '/api/bills') return undefined;
      listCalls += 1;
      return listCalls > 1 ? { status: 500 } : undefined;
    };
  }

  it('says already confirmed, not saved, when the bill was confirmed before', async () => {
    const calls = await openBills({ route: answerRoute('/api/bills/b-in/confirm', { status: 'already_confirmed' }) });

    incomingCard().querySelector('.bill-confirm').click();
    await settle();

    expect(byId('bills-status').textContent).toBe('คุณยืนยันบิลนี้ไปแล้ว (โหลดบิลไม่สำเร็จ)');
    expect(incomingCard().querySelector('.bill-summary').textContent).toBe('ดี · ยังไม่คืน');
    expect(incomingCard().querySelector('.bill-confirm')).toBeNull();
    expect(calls).not.toContain('GET /api/transactions');
  });

  it('says already declined when declining a bill declined before', async () => {
    const calls = await openBills({ route: answerRoute('/api/bills/b-in/decline', { status: 'already_declined' }) });

    incomingCard().querySelector('.bill-decline').click();
    byId('bill-dialog-ok').click();
    await settle();

    expect(byId('bills-status').textContent).toBe('คุณปฏิเสธบิลนี้ไปแล้ว (โหลดบิลไม่สำเร็จ)');
    expect(cardOf('b-in').querySelector('.bill-summary').textContent).toBe('ดี · ปฏิเสธแล้ว');
    expect(byId('bills-incoming-done').contains(cardOf('b-in'))).toBe(true);
    expect(calls).not.toContain('GET /api/transactions');
  });

  it('keeps the confirmed message when the reload after confirm fails', async () => {
    let listCalls = 0;
    await openBills({
      route: (method, path) => {
        if (path === '/api/bills/b-in/confirm') return { status: 'confirmed' };
        if (path === '/api/bills') {
          listCalls += 1;
          return listCalls > 1 ? { status: 500 } : undefined;
        }
        return undefined;
      },
    });

    incomingCard().querySelector('.bill-confirm').click();
    await settle();

    expect(byId('bills-status').textContent).toContain('ยืนยันแล้ว บันทึกเป็นรายจ่ายของคุณ');
    expect(incomingCard().querySelector('.bill-confirm')).toBeNull();
  });

  it('scrolls the status line into view when a message is set', async () => {
    await openBills({ route: (method, path) => (path === '/api/bills/b-in/confirm' ? { status: 404 } : undefined) });
    const scrollIntoView = vi.fn();
    byId('bills-status').scrollIntoView = scrollIntoView;

    incomingCard().querySelector('.bill-confirm').click();
    await settle();

    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
  });

  async function openForm(route) {
    const calls = await openBills({ route });
    byId('bill-new').click();
    await settle();
    return calls;
  }

  const shareInputs = () => [...document.querySelectorAll('#bill-form-members input[type="number"]')];

  it('opens the form with today, the food category and the friends to pick', async () => {
    await openForm();

    expect(byId('bill-form-dialog').hasAttribute('open')).toBe(true);
    expect(byId('bill-form-date').value).toBe('2026-10-15');
    expect(byId('bill-form-category').selectedOptions[0].textContent).toBe('อาหาร');
    expect([...document.querySelectorAll('#bill-form-members .bill-form-name')].map((el) => el.textContent)).toEqual(['บี']);
  });

  it('splits evenly with the leftover on the owner when friends are picked', async () => {
    await openForm();

    byId('bill-form-total').value = '1000';
    byId('bill-form-total').dispatchEvent(new Event('input'));
    const pick = document.querySelector('#bill-form-members input[type="checkbox"]');
    pick.checked = true;
    pick.dispatchEvent(new Event('change'));

    expect(byId('bill-form-owner-share').value).toBe('500');
    expect(shareInputs().map((input) => input.value)).toEqual(['500']);
  });

  it('blocks submit and says how far off the shares are', async () => {
    await openForm();
    byId('bill-form-title').value = 'เนื้อย่าง';
    byId('bill-form-total').value = '1000';
    byId('bill-form-total').dispatchEvent(new Event('input'));
    const pick = document.querySelector('#bill-form-members input[type="checkbox"]');
    pick.checked = true;
    pick.dispatchEvent(new Event('change'));

    shareInputs()[0].value = '600';
    shareInputs()[0].dispatchEvent(new Event('input'));

    expect(byId('bill-form-error').textContent).toBe('ยอดรวมของทุกคนเกินยอดบิล 100 บาท');
    expect(byId('bill-form-submit').disabled).toBe(true);
    byId('bill-form-even').click();
    expect(byId('bill-form-error').textContent).toBe('');
    expect(byId('bill-form-submit').disabled).toBe(false);
  });

  it('asks to pick at least one friend', async () => {
    await openForm();
    byId('bill-form-title').value = 'เนื้อย่าง';
    byId('bill-form-total').value = '1000';
    byId('bill-form-total').dispatchEvent(new Event('input'));

    expect(byId('bill-form-error').textContent).toBe('เลือกเพื่อนอย่างน้อย 1 คน');
    expect(byId('bill-form-submit').disabled).toBe(true);
  });

  it('creates the bill, closes the form and reloads the list', async () => {
    let posted;
    const calls = await openForm((method, path) => {
      if (method === 'POST' && path === '/api/bills') return { id: 'b-new', notNotified: [] };
      return undefined;
    });
    vi.stubGlobal('fetch', ((original) => async (url, options = {}) => {
      if ((options.method ?? 'GET') === 'POST' && new URL(url, 'http://localhost').pathname === '/api/bills') posted = JSON.parse(options.body);
      return original(url, options);
    })(globalThis.fetch));
    byId('bill-form-title').value = 'เนื้อย่าง';
    byId('bill-form-total').value = '1000';
    byId('bill-form-total').dispatchEvent(new Event('input'));
    const pick = document.querySelector('#bill-form-members input[type="checkbox"]');
    pick.checked = true;
    pick.dispatchEvent(new Event('change'));

    byId('bill-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();

    expect(posted).toEqual({
      title: 'เนื้อย่าง',
      total: 1000,
      occurredOn: '2026-10-15',
      categoryId: 'c-food',
      ownerShare: 500,
      members: [{ userId: 'f-1', share: 500 }],
    });
    expect(byId('bill-form-dialog').hasAttribute('open')).toBe(false);
    expect(byId('bills-status').textContent).toBe('สร้างบิลแล้ว ส่งให้เพื่อนยืนยันแล้ว');
    expect(calls.filter((call) => call === 'GET /api/bills').length).toBeGreaterThanOrEqual(2);
  });

  it('does not load the main web data after creating a bill', async () => {
    const calls = await openForm((method, path) => (method === 'POST' && path === '/api/bills' ? { id: 'b-new', notNotified: [] } : undefined));
    fillValidForm();

    byId('bill-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();

    expect(calls).toContain('POST /api/bills');
    expect(calls).not.toContain('GET /api/transactions');
    expect(calls).not.toContain('GET /api/profile');
  });

  it('does not reload transactions after creating a bill without an owner share', async () => {
    const calls = await openForm((method, path) => (method === 'POST' && path === '/api/bills' ? { id: 'b-new', notNotified: [] } : undefined));
    fillValidForm();
    byId('bill-form-owner-share').value = '0';
    byId('bill-form-owner-share').dispatchEvent(new Event('input'));
    shareInputs()[0].value = '1000';
    shareInputs()[0].dispatchEvent(new Event('input'));

    byId('bill-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();

    expect(calls).toContain('POST /api/bills');
    expect(calls).not.toContain('GET /api/transactions');
  });

  it('tells the owner when some friends were not notified', async () => {
    await openForm((method, path) => (method === 'POST' && path === '/api/bills' ? { id: 'b-new', notNotified: ['f-1'] } : undefined));
    byId('bill-form-title').value = 'เนื้อย่าง';
    byId('bill-form-total').value = '1000';
    byId('bill-form-total').dispatchEvent(new Event('input'));
    const pick = document.querySelector('#bill-form-members input[type="checkbox"]');
    pick.checked = true;
    pick.dispatchEvent(new Event('change'));

    byId('bill-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();

    expect(byId('bills-status').textContent).toBe('สร้างบิลแล้ว แจ้งเตือนเพื่อนไม่ถึง 1 คน ส่งลิงก์บิลให้เขาได้ในรายการด้านล่าง');
  });

  it('keeps the form open and shows the server error', async () => {
    await openForm((method, path) => (method === 'POST' && path === '/api/bills' ? { status: 429 } : undefined));
    byId('bill-form-title').value = 'เนื้อย่าง';
    byId('bill-form-total').value = '1000';
    byId('bill-form-total').dispatchEvent(new Event('input'));
    const pick = document.querySelector('#bill-form-members input[type="checkbox"]');
    pick.checked = true;
    pick.dispatchEvent(new Event('change'));

    byId('bill-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();

    expect(byId('bill-form-dialog').hasAttribute('open')).toBe(true);
    expect(byId('bill-form-error').textContent).toBe('สร้างบิลบ่อยเกินไป รอสักครู่แล้วลองใหม่');
  });

  it('points to the friends section below when there are no friends yet', async () => {
    await openForm((method, path) => (path === '/api/friends' ? { code: 'ABCD2345', friends: [] } : undefined));

    expect(byId('bill-form-no-friends').hidden).toBe(false);
    expect(byId('bill-form-no-friends').textContent).toBe('ยังไม่มีเพื่อน เพิ่มเพื่อนในส่วนเพื่อนด้านล่างก่อน');
  });

  it('blocks submit when a picked friend share is empty', async () => {
    await openForm();
    byId('bill-form-title').value = 'เนื้อย่าง';
    byId('bill-form-total').value = '1000';
    byId('bill-form-total').dispatchEvent(new Event('input'));
    const pick = document.querySelector('#bill-form-members input[type="checkbox"]');
    pick.checked = true;
    pick.dispatchEvent(new Event('change'));

    shareInputs()[0].value = '';
    shareInputs()[0].dispatchEvent(new Event('input'));

    expect(byId('bill-form-error').textContent).toBe('ใส่ยอดของเพื่อนทุกคนที่เลือก');
    expect(byId('bill-form-submit').disabled).toBe(true);
  });

  it('blocks submit when the owner share is empty', async () => {
    await openForm();
    byId('bill-form-title').value = 'เนื้อย่าง';
    byId('bill-form-total').value = '1000';
    byId('bill-form-total').dispatchEvent(new Event('input'));
    const pick = document.querySelector('#bill-form-members input[type="checkbox"]');
    pick.checked = true;
    pick.dispatchEvent(new Event('change'));

    byId('bill-form-owner-share').value = '';
    byId('bill-form-owner-share').dispatchEvent(new Event('input'));

    expect(byId('bill-form-error').textContent).toBe('ใส่ส่วนของฉัน');
    expect(byId('bill-form-submit').disabled).toBe(true);
  });

  function holdRequest(pathname, method = 'GET') {
    let release;
    const hold = new Promise((resolve) => {
      release = resolve;
    });
    const original = globalThis.fetch;
    vi.stubGlobal('fetch', async (url, options = {}) => {
      if ((options.method ?? 'GET') === method && new URL(url, 'http://localhost').pathname === pathname) await hold;
      return original(url, options);
    });
    return release;
  }

  function fillValidForm() {
    byId('bill-form-title').value = 'เนื้อย่าง';
    byId('bill-form-total').value = '1000';
    byId('bill-form-total').dispatchEvent(new Event('input'));
    const pick = document.querySelector('#bill-form-members input[type="checkbox"]');
    pick.checked = true;
    pick.dispatchEvent(new Event('change'));
  }

  // jsdom เลือกไฟล์จริงไม่ได้ จึงใส่ files เองแล้วยิง change เหมือนผู้ใช้เลือกรูป
  function pickReceipt() {
    const input = byId('bill-form-receipt');
    Object.defineProperty(input, 'files', { configurable: true, value: [new File(['jpeg'], 'r.jpg', { type: 'image/jpeg' })] });
    input.dispatchEvent(new Event('change'));
  }

  it('opens the picker from the read receipt button', async () => {
    await openForm();
    const click = vi.spyOn(byId('bill-form-receipt'), 'click').mockImplementation(() => {});

    byId('bill-form-receipt-button').click();

    expect(click).toHaveBeenCalledTimes(1);
    expect(byId('bill-form-receipt').accept).toBe('image/*');
  });

  it('fills the total from the receipt photo, splits it again and asks to check it', async () => {
    const calls = await openForm((method, path) => (path === '/api/bills/read-receipt' ? { amount: 1234.5 } : undefined));
    fillValidForm();
    const release = holdRequest('/api/bills/read-receipt', 'POST');

    pickReceipt();
    await settle();
    expect(byId('bill-form-receipt-status').textContent).toBe('กำลังอ่านยอดจากรูป...');
    expect(byId('bill-form-receipt-button').disabled).toBe(true);
    expect(byId('bill-form-submit').disabled).toBe(true);

    release();
    await settle();
    expect(calls).toContain('POST /api/bills/read-receipt');
    expect(byId('bill-form-total').value).toBe('1234.5');
    expect(byId('bill-form-owner-share').value).toBe('617.25');
    expect(shareInputs().map((input) => input.value)).toEqual(['617.25']);
    expect(byId('bill-form-receipt-status').textContent).toBe('อ่านยอดได้ 1,234.5 บาท ตรวจให้ตรงกับใบเสร็จก่อนหารบิล');
    expect(byId('bill-form-receipt-button').disabled).toBe(false);
    expect(byId('bill-form-submit').disabled).toBe(false);
    expect(byId('bill-form-receipt').value).toBe('');
  });

  it('keeps the typed total and says why when the photo cannot be read', async () => {
    await openForm((method, path) => (path === '/api/bills/read-receipt' ? { status: 422 } : undefined));
    byId('bill-form-total').value = '500';

    pickReceipt();
    await settle();

    expect(byId('bill-form-total').value).toBe('500');
    expect(byId('bill-form-receipt-status').textContent).toBe('อ่านยอดจากรูปนี้ไม่ได้ ลองรูปที่ชัดขึ้น หรือพิมพ์ยอดเอง');
    expect(byId('bill-form-receipt-button').disabled).toBe(false);
  });

  it('drops a read that finishes after the form was closed and opened again', async () => {
    await openForm((method, path) => (path === '/api/bills/read-receipt' ? { amount: 999 } : undefined));
    const release = holdRequest('/api/bills/read-receipt', 'POST');
    pickReceipt();
    await settle();

    byId('bill-form-cancel').click();
    byId('bill-new').click();
    await settle();
    expect(byId('bill-form-receipt-status').textContent).toBe('');
    expect(byId('bill-form-receipt-button').disabled).toBe(false);

    release();
    await settle();
    expect(byId('bill-form-total').value).toBe('');
    expect(byId('bill-form-receipt-status').textContent).toBe('');
  });

  const typeInto = (id, value) => {
    byId(id).value = value;
    byId(id).dispatchEvent(new Event('input'));
  };

  it('says which field is missing once the user starts filling the form, not before', async () => {
    await openForm();
    expect(byId('bill-form-error').textContent).toBe('');

    typeInto('bill-form-total', '1000');
    expect(byId('bill-form-error').textContent).toBe('ใส่ชื่อบิล');
    typeInto('bill-form-title', 'เนื้อย่าง');
    typeInto('bill-form-total', '');
    expect(byId('bill-form-error').textContent).toBe('ใส่ยอดรวม');
  });

  it('accepts a total typed with thousands separators', async () => {
    await openForm();
    typeInto('bill-form-title', 'เนื้อย่าง');

    typeInto('bill-form-total', '1,000');
    const pick = document.querySelector('#bill-form-members input[type="checkbox"]');
    pick.checked = true;
    pick.dispatchEvent(new Event('change'));

    expect(byId('bill-form-owner-share').value).toBe('500');
    expect(byId('bill-form-error').textContent).toBe('');
  });

  it.each([
    ['abc', 'ใส่ยอดเป็นตัวเลข เช่น 1000'],
    ['1.005', 'ใส่ยอดไม่เกินทศนิยม 2 ตำแหน่ง'],
    ['10000000.01', 'ยอดรวมต้องไม่เกิน 10,000,000 บาท'],
  ])('explains a total of %s and marks the field invalid', async (total, message) => {
    await openForm();
    typeInto('bill-form-title', 'เนื้อย่าง');

    typeInto('bill-form-total', total);

    expect(byId('bill-form-error').textContent).toBe(message);
    expect(byId('bill-form-total').getAttribute('aria-invalid')).toBe('true');
    expect(byId('bill-form-submit').disabled).toBe(true);
  });

  it('points the fields at the form message and announces it politely', async () => {
    await openForm();

    expect(byId('bill-form-total').getAttribute('aria-describedby')).toBe('bill-form-error');
    expect(byId('bill-form-title').getAttribute('aria-describedby')).toBe('bill-form-error');
    expect(byId('bill-form-error').getAttribute('role')).toBe('status');
    expect(byId('bill-form-total').hasAttribute('aria-invalid')).toBe(false);
  });

  it('asks for a date when the date is cleared', async () => {
    await openForm();
    fillValidForm();

    typeInto('bill-form-date', '');

    expect(byId('bill-form-error').textContent).toBe('เลือกวันที่');
    expect(byId('bill-form-submit').disabled).toBe(true);
  });

  // server นับความยาวชื่อตามอักขระ maxlength ของ browser นับตาม UTF-16 ทำให้ emoji กินสองช่อง
  it('counts the title by characters, so 60 emoji fit and 61 letters do not', async () => {
    await openForm();
    fillValidForm();

    typeInto('bill-form-title', '🍖'.repeat(60));
    expect(byId('bill-form-error').textContent).toBe('');
    typeInto('bill-form-title', 'ก'.repeat(61));
    expect(byId('bill-form-error').textContent).toBe('ชื่อบิลยาวเกิน 60 ตัวอักษร');
    expect(byId('bill-form-title').hasAttribute('maxlength')).toBe(false);
  });

  it('allows at most 20 friends on one bill, like the server', async () => {
    const many = Array.from({ length: 21 }, (_, index) => ({ id: `f-${index}`, displayName: `เพื่อน ${index}` }));
    await openForm((method, path) => (path === '/api/friends' ? { code: 'ABCD2345', friends: many } : undefined));
    typeInto('bill-form-title', 'เนื้อย่าง');
    typeInto('bill-form-total', '2100');

    for (const box of document.querySelectorAll('#bill-form-members input[type="checkbox"]')) {
      box.checked = true;
      box.dispatchEvent(new Event('change'));
    }

    expect(byId('bill-form-error').textContent).toBe('เลือกเพื่อนได้ไม่เกิน 20 คน');
    expect(byId('bill-form-submit').disabled).toBe(true);
  });

  it('focuses the heading on open so the keyboard does not pop up at once', async () => {
    await openForm();

    expect(document.activeElement).toBe(byId('bill-form-heading'));
  });

  it('says what to pick in the split', async () => {
    await openForm();

    expect(document.querySelector('.bill-form-split legend').textContent).toBe('หารกับเพื่อน');
  });

  it('drops a friend list from an earlier opening of the form', async () => {
    let releaseFirst;
    let friendCalls = 0;
    await openBills();
    vi.stubGlobal('fetch', async (url, options = {}) => {
      const path = new URL(url, 'http://localhost').pathname;
      if (path === '/api/friends') {
        friendCalls += 1;
        if (friendCalls === 1) {
          const body = await new Promise((resolve) => (releaseFirst = resolve));
          return makeFetch({ [path]: body })(url, options);
        }
        return makeFetch({ [path]: { code: 'ABCD2345', friends: [{ id: 'f-9', displayName: 'ใหม่' }] } })(url, options);
      }
      return makeFetch({})(url, options);
    });

    byId('bill-new').click();
    await settle();
    byId('bill-form-cancel').click();
    byId('bill-new').click();
    await settle();
    releaseFirst({ code: 'ABCD2345', friends: [{ id: 'f-1', displayName: 'เก่า' }] });
    await settle();

    expect([...document.querySelectorAll('#bill-form-members .bill-form-name')].map((el) => el.textContent)).toEqual(['ใหม่']);
  });

  it('shows the error the server gives for shares that do not add up', async () => {
    await openForm();
    vi.stubGlobal('fetch', async (url, options = {}) => {
      if ((options.method ?? 'GET') === 'POST' && new URL(url, 'http://localhost').pathname === '/api/bills') {
        return { ok: false, status: 400, json: async () => ({ error: 'Shares do not add up' }) };
      }
      return makeFetch({})(url, options);
    });
    fillValidForm();

    byId('bill-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();

    expect(byId('bill-form-error').textContent).toBe('ยอดของทุกคนรวมกันไม่เท่ากับยอดบิล');
  });

  it('scrolls the created message into view', async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    await openForm((method, path) => (method === 'POST' && path === '/api/bills' ? { id: 'b-new', notNotified: [] } : undefined));
    fillValidForm();

    byId('bill-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();

    expect(byId('bills-status').textContent).toBe('สร้างบิลแล้ว ส่งให้เพื่อนยืนยันแล้ว');
    expect(scrollIntoView.mock.contexts).toContain(byId('bills-status'));
    delete Element.prototype.scrollIntoView;
  });

  it('keeps cancel disabled while the bill is being created', async () => {
    await openForm((method, path) => (method === 'POST' && path === '/api/bills' ? { id: 'b-new', notNotified: [] } : undefined));
    const release = holdRequest('/api/bills', 'POST');
    fillValidForm();

    byId('bill-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();
    expect(byId('bill-form-cancel').disabled).toBe(true);

    release();
    await settle();
    expect(byId('bill-form-cancel').disabled).toBe(false);
  });

  it('keeps the created message when reloading the list fails', async () => {
    let created = false;
    await openForm((method, path) => {
      if (method === 'POST' && path === '/api/bills') {
        created = true;
        return { id: 'b-new', notNotified: [] };
      }
      return created && path === '/api/bills' ? { status: 500 } : undefined;
    });
    fillValidForm();

    byId('bill-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();

    expect(byId('bills-status').textContent).toBe('สร้างบิลแล้ว ส่งให้เพื่อนยืนยันแล้ว (โหลดบิลไม่สำเร็จ)');
  });

  it('shows a loading line while friends load', async () => {
    await openBills();
    const release = holdRequest('/api/friends');
    byId('bill-new').click();
    await settle();

    expect(byId('bill-form-friends-loading').hidden).toBe(false);
    expect(byId('bill-form-friends-loading').textContent).toBe('กำลังโหลดรายชื่อเพื่อน...');
    release();
    await settle();
    expect(byId('bill-form-friends-loading').hidden).toBe(true);
  });

  it('shows a friends error with retry that survives typing', async () => {
    let friendCalls = 0;
    await openForm((method, path) => {
      if (path !== '/api/friends') return undefined;
      friendCalls += 1;
      // ครั้งแรกเป็นของส่วนเพื่อนในหน้าหารบิล ครั้งที่สองเป็นของฟอร์ม
      return friendCalls === 2 ? { status: 500 } : undefined;
    });

    expect(byId('bill-form-friends-error').hidden).toBe(false);
    expect(byId('bill-form-friends-error-text').textContent).toBe('โหลดรายชื่อเพื่อนไม่สำเร็จ');
    byId('bill-form-title').value = 'เนื้อย่าง';
    byId('bill-form-title').dispatchEvent(new Event('input'));
    expect(byId('bill-form-friends-error').hidden).toBe(false);
    expect(byId('bill-form-submit').disabled).toBe(true);

    byId('bill-form-friends-retry').click();
    await settle();
    expect(byId('bill-form-friends-error').hidden).toBe(true);
    expect(document.querySelectorAll('#bill-form-members .bill-form-name').length).toBe(1);
  });

  it('no friends: hides the split controls and offers a button to the friends section', async () => {
    await openForm((method, path) => (path === '/api/friends' ? { code: 'ABCD2345', friends: [] } : undefined));
    byId('bill-form-title').value = 'เนื้อย่าง';
    byId('bill-form-total').value = '1000';
    byId('bill-form-total').dispatchEvent(new Event('input'));

    expect(byId('bill-form-split-controls').hidden).toBe(true);
    expect(byId('bill-form-error').textContent).toBe('');
    expect(byId('bill-form-go-profile').hidden).toBe(false);

    expect(byId('bill-form-go-profile').textContent).toBe('ไปเพิ่มเพื่อน');

    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    byId('bill-form-go-profile').click();
    expect(byId('bill-form-dialog').hasAttribute('open')).toBe(false);
    expect(byId('panel-profile').hidden).toBe(true);
    expect(byId('panel-bills').hidden).toBe(false);
    expect(scrollIntoView.mock.contexts[0]).toBe(byId('friends'));
    delete Element.prototype.scrollIntoView;
  });

  const noFriendsRoute = (method, path) => (path === '/api/friends' ? { code: 'ABCD2345', friends: [] } : undefined);

  async function leaveToAddFriend() {
    byId('bill-form-title').value = 'เนื้อย่าง';
    byId('bill-form-total').value = '1000';
    byId('bill-form-date').value = '2026-10-10';
    byId('bill-form-category').value = 'c-trip';
    Element.prototype.scrollIntoView = vi.fn();
    byId('bill-form-go-profile').click();
    delete Element.prototype.scrollIntoView;
    byId('bill-new').click();
    await settle();
  }

  it('keeps what was typed when the user leaves to add a friend and opens the form again', async () => {
    await openForm(noFriendsRoute);
    await leaveToAddFriend();

    expect(byId('bill-form-dialog').hasAttribute('open')).toBe(true);
    expect(byId('bill-form-title').value).toBe('เนื้อย่าง');
    expect(byId('bill-form-total').value).toBe('1000');
    expect(byId('bill-form-date').value).toBe('2026-10-10');
    expect(byId('bill-form-category').value).toBe('c-trip');
  });

  it('restores the typed values only once', async () => {
    await openForm(noFriendsRoute);
    await leaveToAddFriend();
    byId('bill-form-cancel').click();
    byId('bill-new').click();
    await settle();

    expect(byId('bill-form-title').value).toBe('');
    expect(byId('bill-form-total').value).toBe('');
    expect(byId('bill-form-date').value).toBe('2026-10-15');
  });

  it('does not remember values when the form is closed with cancel', async () => {
    await openForm(noFriendsRoute);
    byId('bill-form-title').value = 'เนื้อย่าง';
    byId('bill-form-cancel').click();
    byId('bill-new').click();
    await settle();

    expect(byId('bill-form-title').value).toBe('');
  });

  it('after a network failure it warns to check the list and reloads bills', async () => {
    const calls = await openForm((method, path) => (method === 'POST' && path === '/api/bills' ? new Error('network down') : undefined));
    fillValidForm();
    const before = calls.filter((call) => call === 'GET /api/bills').length;

    byId('bill-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();

    expect(byId('bill-form-error').textContent).toBe('ไม่ทราบผล ตรวจรายการบิลก่อนสร้างใหม่');
    expect(byId('bill-form-dialog').hasAttribute('open')).toBe(true);
    expect(calls.filter((call) => call === 'GET /api/bills').length).toBe(before + 1);
  });

  it('after a server error on create it warns to check the list and reloads bills', async () => {
    const calls = await openForm((method, path) => (method === 'POST' && path === '/api/bills' ? { status: 500 } : undefined));
    fillValidForm();
    const before = calls.filter((call) => call === 'GET /api/bills').length;

    byId('bill-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();

    expect(byId('bill-form-error').textContent).toBe('ไม่ทราบผล ตรวจรายการบิลก่อนสร้างใหม่');
    expect(byId('bill-form-dialog').hasAttribute('open')).toBe(true);
    expect(calls.filter((call) => call === 'GET /api/bills').length).toBe(before + 1);
  });

  it('Not friends error refreshes the friend list and keeps the typed fields', async () => {
    await openForm();
    fillValidForm();
    const original = globalThis.fetch;
    vi.stubGlobal('fetch', async (url, options = {}) => {
      const path = new URL(url, 'http://localhost').pathname;
      if (options.method === 'POST' && path === '/api/bills') {
        return { ok: false, status: 400, json: async () => ({ error: 'Not friends' }) };
      }
      if (path === '/api/friends') {
        return { ok: true, status: 200, json: async () => ({ code: 'ABCD2345', friends: [{ id: 'f-2', displayName: 'ซี' }] }) };
      }
      return original(url, options);
    });

    byId('bill-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();

    const names = [...document.querySelectorAll('#bill-form-members .bill-form-name')].map((el) => el.textContent);
    expect(names).toEqual(['ซี']);
    expect(document.querySelector('#bill-form-members input[type="checkbox"]').checked).toBe(false);
    expect(byId('bill-form-title').value).toBe('เนื้อย่าง');
    expect(byId('bill-form-total').value).toBe('1000');
    expect(byId('bill-form-error').textContent).toBe('มีคนที่ไม่ได้เป็นเพื่อนกันแล้ว โหลดรายชื่อใหม่แล้วลองอีกครั้ง');
  });

  it('keeps submit disabled while categories are still loading', async () => {
    await openBills();
    const release = holdRequest('/api/categories');
    byId('bill-new').click();
    await settle();
    fillValidForm();

    expect(byId('bill-form-submit').disabled).toBe(true);
    expect(byId('bill-form-error').textContent).toBe('');

    release();
    await settle();
    expect(byId('bill-form-submit').disabled).toBe(false);
  });

  it('shows a category load failure, not no expense category, when categories fail to load', async () => {
    let categoryCalls = 0;
    await openBills({
      route: (method, path) => {
        if (path !== '/api/categories') return undefined;
        categoryCalls += 1;
        return categoryCalls === 1 ? { status: 500 } : undefined;
      },
    });
    byId('bill-new').click();
    await settle();
    fillValidForm();

    expect(byId('bill-form-categories-error').hidden).toBe(false);
    expect(byId('bill-form-categories-error-text').textContent).toBe('โหลดหมวดไม่สำเร็จ ลองใหม่อีกครั้ง');
    expect(byId('bill-form-error').textContent).toBe('');
    expect(byId('bill-form-submit').disabled).toBe(true);

    byId('bill-form-categories-retry').click();
    await settle();
    expect(byId('bill-form-categories-error').hidden).toBe(true);
    expect(byId('bill-form-category').selectedOptions[0].textContent).toBe('อาหาร');
    expect(byId('bill-form-submit').disabled).toBe(false);
  });

  it('blocks submit when no expense category is available', async () => {
    const incomeOnly = { categories: CATEGORIES.filter((category) => category.type === 'income') };
    await openBills({ route: (method, path) => (path === '/api/categories' ? incomeOnly : undefined) });
    byId('bill-new').click();
    await settle();
    fillValidForm();

    expect(byId('bill-form-error').textContent).toBe('ไม่มีหมวดรายจ่ายให้เลือก');
    expect(byId('bill-form-submit').disabled).toBe(true);
  });

  it('clicking the friend name toggles the checkbox', async () => {
    await openForm();

    document.querySelector('#bill-form-members label.bill-form-name').click();

    expect(document.querySelector('#bill-form-members input[type="checkbox"]').checked).toBe(true);
  });
});

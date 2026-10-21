// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { RESPONSES, settle, makeFetch, boot, byId, clickTab, cleanupGlobals } from './dom-harness.mjs';

afterEach(cleanupGlobals);

describe('LIFF goals tab', () => {
  const rowsOf = (id = 'goal-rows') => [...byId(id).querySelectorAll('.goal-row')];
  const namesOf = (id) => rowsOf(id).map((row) => row.querySelector('.goal-name').textContent);
  const submitEditor = () => byId('goal-editor-form').dispatchEvent(new Event('submit', { cancelable: true }));
  const openGoalEditor = async (index) => {
    rowsOf()[index].querySelector('button').click();
    await settle();
    byId('goal-detail-edit').click();
  };

  // เก็บ body ที่ส่งไว้ตรวจ route คืน override แบบเดียวกับ makeFetch หรือ undefined เพื่อใช้ค่าเริ่มต้น
  function captureFetch(route = () => undefined) {
    const calls = [];
    const fallback = makeFetch({});
    vi.stubGlobal('fetch', async (url, options = {}) => {
      const path = new URL(url, 'http://localhost').pathname;
      const method = options.method ?? 'GET';
      calls.push({ call: `${method} ${path}`, body: options.body ? JSON.parse(options.body) : undefined });
      const override = route(method, path);
      return override === undefined ? fallback(url, options) : makeFetch({ [path]: override })(url, options);
    });
    return calls;
  }

  async function openTab(options) {
    const liff = await boot(options);
    clickTab('goals');
    await settle();
    return liff;
  }

  it('loads the goals only when the tab opens and shows the open goals with their progress', async () => {
    const liff = await boot();
    expect(liff.fetched).not.toContain('/api/goals');

    clickTab('goals');
    await settle();

    expect(liff.fetched).toContain('/api/goals');
    const rows = rowsOf();
    expect(namesOf()).toEqual(['เที่ยวญี่ปุ่น', 'กองทุนฉุกเฉิน']);
    expect(rows[0].querySelector('.goal-amount').textContent).toBe('6,000 บาท จาก 50,000 บาท');
    expect(rows[0].querySelector('.goal-percent').textContent).toBe('12%');
    expect(rows[0].querySelector('.goal-fill').dataset.width).toBe('12');
    expect(rows[0].querySelector('.goal-date').textContent).toBe('ถึงเป้า 31 ธ.ค. 2569');
    expect(rows[1].classList.contains('reached')).toBe(true);
    expect(rows[1].querySelector('.goal-fill').dataset.width).toBe('100');
    expect(rows[1].querySelector('.goal-date')).toBeNull();
    expect(byId('goals-closed').hidden).toBe(false);
    expect(byId('goals-closed-count').textContent).toBe('ปิดแล้ว 1 เป้า');
    expect(namesOf('goal-closed-rows')).toEqual(['มือถือใหม่']);
    expect(byId('goals-empty').hidden).toBe(true);
    expect(byId('goal-add').disabled).toBe(false);
  });

  it('shows the empty note when there are no goals', async () => {
    await openTab({ overrides: { '/api/goals': { goals: [] } } });

    expect(rowsOf()).toHaveLength(0);
    expect(byId('goals-empty').hidden).toBe(false);
    expect(byId('goals-closed').hidden).toBe(true);
  });

  it('shows an error with retry when the goals fail to load, and the retry loads them', async () => {
    await openTab({ overrides: { '/api/goals': { status: 500 } } });

    expect(byId('goals-error').hidden).toBe(false);
    expect(byId('goals-error-text').textContent).toBe('โหลดเป้าออมไม่สำเร็จ');
    expect(byId('goals-retry').hidden).toBe(false);
    expect(byId('goals-body').hidden).toBe(true);

    captureFetch();
    byId('goals-retry').click();
    await settle();

    expect(byId('goals-error').hidden).toBe(true);
    expect(rowsOf()).toHaveLength(2);
  });

  it('asks to reopen from LINE without a retry on a 401', async () => {
    await openTab({ overrides: { '/api/goals': { status: 401 } } });

    expect(byId('goals-error-text').textContent).toBe('กรุณาเปิดหน้านี้จากแอป LINE อีกครั้ง');
    expect(byId('goals-retry').hidden).toBe(true);
  });

  // ผู้ใช้อาจออมผ่านแชตระหว่างที่หน้าเว็บเปิดอยู่
  it('reloads the goals every time the tab opens again', async () => {
    await openTab();
    const calls = captureFetch();

    clickTab('list');
    clickTab('goals');
    await settle();

    expect(calls.map((entry) => entry.call)).toEqual(['GET /api/goals']);
  });

  it('creates a goal without a date and reloads the list', async () => {
    await openTab();
    const calls = captureFetch((method, path) => (method === 'POST' && path === '/api/goals' ? { goal: { id: 'g-9' } } : undefined));

    byId('goal-add').click();
    expect(byId('goal-editor').hasAttribute('open')).toBe(true);
    expect(byId('goal-editor-title').textContent).toBe('สร้างเป้าใหม่');
    expect(byId('goal-editor-closed-row').hidden).toBe(true);
    byId('goal-editor-name').value = '  คอนโด  ';
    byId('goal-editor-target').value = '1500000';
    submitEditor();
    await settle();

    expect(calls).toEqual([
      { call: 'POST /api/goals', body: { name: 'คอนโด', targetAmount: 1500000, targetDate: null } },
      { call: 'GET /api/goals', body: undefined },
    ]);
    expect(byId('goal-editor').hasAttribute('open')).toBe(false);
    expect(byId('goals-status').textContent).toBe('สร้างเป้า คอนโด แล้ว');
  });

  it('keeps the editor open with the reason when the name is taken', async () => {
    await openTab();
    captureFetch((method) => (method === 'POST' ? { status: 409, error: 'Duplicate name' } : undefined));

    byId('goal-add').click();
    byId('goal-editor-name').value = 'เที่ยวญี่ปุ่น';
    byId('goal-editor-target').value = '1000';
    submitEditor();
    await settle();

    expect(byId('goal-editor').hasAttribute('open')).toBe(true);
    expect(byId('goal-editor-error').hidden).toBe(false);
    expect(byId('goal-editor-error').textContent).toBe('มีเป้าชื่อนี้อยู่แล้ว');
    expect(byId('goal-editor-save').disabled).toBe(false);
  });

  it('scrolls the goal editor error into view', async () => {
    const scroll = vi.fn();
    HTMLElement.prototype.scrollIntoView = scroll;
    try {
      await openTab();
      captureFetch((method) => (method === 'POST' ? { status: 409, error: 'Duplicate name' } : undefined));

      byId('goal-add').click();
      byId('goal-editor-name').value = 'เที่ยวญี่ปุ่น';
      byId('goal-editor-target').value = '1000';
      submitEditor();
      await settle();

      expect(scroll.mock.contexts).toContain(byId('goal-editor-error'));
    } finally {
      delete HTMLElement.prototype.scrollIntoView;
    }
  });

  it('fills the editor with the goal and sends only the changed field when closing it', async () => {
    await openTab();
    const calls = captureFetch((method) => (method === 'PATCH' ? { goal: { id: 'g-1' } } : undefined));

    await openGoalEditor(0);
    expect(byId('goal-editor-title').textContent).toBe('แก้เป้า');
    expect(byId('goal-editor-name').value).toBe('เที่ยวญี่ปุ่น');
    expect(byId('goal-editor-target').value).toBe('50000');
    expect(byId('goal-editor-date').value).toBe('2026-12-31');
    expect(byId('goal-editor-closed-row').hidden).toBe(false);
    byId('goal-editor-closed').checked = true;
    submitEditor();
    await settle();

    expect(calls.find((entry) => entry.call.startsWith('PATCH'))).toEqual({ call: 'PATCH /api/goals/g-1', body: { closed: true } });
    expect(byId('goals-status').textContent).toBe('ปิดเป้า เที่ยวญี่ปุ่น แล้ว');
  });

  it('closes the editor without a request when nothing changed', async () => {
    await openTab();
    const calls = captureFetch();

    await openGoalEditor(0);
    submitEditor();
    await settle();

    expect(calls.filter((entry) => entry.call.startsWith('PATCH'))).toEqual([]);
    expect(byId('goal-editor').hasAttribute('open')).toBe(false);
  });

  const openDetailOf = async (id, index) => {
    rowsOf(id)[index].querySelector('button').click();
    await settle();
  };
  const historyTexts = () => [...byId('goal-history').querySelectorAll('li > span')].map((el) => el.textContent);
  const submitDetail = () => byId('goal-detail-form').dispatchEvent(new Event('submit', { cancelable: true }));

  it('reads each goal card out with its name, amounts and percent', async () => {
    await openTab();

    expect(rowsOf()[0].querySelector('button').getAttribute('aria-label')).toBe('เที่ยวญี่ปุ่น ออมแล้ว 6,000 บาท จาก 50,000 บาท (12%)');
    expect(rowsOf('goal-closed-rows')[0].querySelector('button').getAttribute('aria-label')).toBe('มือถือใหม่ ออมแล้ว 30,000 บาท จาก 30,000 บาท (100%)');
  });

  it('shows a reached goal as a done badge instead of the percent', async () => {
    await openTab();
    const [open, reached] = rowsOf();

    expect(open.querySelector('.goal-done')).toBeNull();
    expect(reached.querySelector('.goal-percent')).toBeNull();
    expect(reached.querySelector('.goal-done').textContent).toBe('ครบแล้ว');
  });

  it('says there is no date for an unfinished goal without one', async () => {
    const goals = [{ id: 'g-5', name: 'ทุนเรียน', targetAmount: 1000, targetDate: null, closed: false, saved: 400, contributionCount: 1 }];
    await openTab({ overrides: { '/api/goals': { goals } } });

    expect(rowsOf()[0].querySelector('.goal-date').textContent).toBe('ไม่กำหนดวัน');
  });

  it('summarises only the open goals in the hero card', async () => {
    await openTab();

    expect(byId('goals-hero').hidden).toBe(false);
    expect(byId('goals-hero-count').textContent).toBe('ออมแล้วรวม 2 เป้า');
    expect(byId('goals-hero-saved').textContent).toBe('18,000');
    expect(byId('goals-hero-fill').dataset.width).toBe('30');
    expect(byId('goals-hero-percent').textContent).toBe('30% ของเป้ารวม 60,000 บาท');
    expect(byId('goals-hero-rest').textContent).toBe('เหลืออีก 42,000 บาท');
  });

  it('hides the hero card when no goal is open', async () => {
    const goals = RESPONSES['/api/goals'].goals.filter((goal) => goal.closed);
    await openTab({ overrides: { '/api/goals': { goals } } });

    expect(byId('goals-hero').hidden).toBe(true);
    expect(byId('goals-empty').hidden).toBe(false);
  });

  it('refreshes the hero card after a goal is saved', async () => {
    await openTab();
    const first = RESPONSES['/api/goals'].goals[0];
    captureFetch((method) => (method === 'POST' ? { goal: { id: 'g-9' } } : { goals: [{ ...first, saved: 7000 }] }));

    byId('goal-add').click();
    byId('goal-editor-name').value = 'x';
    byId('goal-editor-target').value = '1';
    submitEditor();
    await settle();

    expect(byId('goals-hero-count').textContent).toBe('ออมแล้วรวม 1 เป้า');
    expect(byId('goals-hero-saved').textContent).toBe('7,000');
  });

  it('opens the goal detail with its progress, today as the date and the history', async () => {
    await openTab();
    await openDetailOf('goal-rows', 0);

    expect(byId('goal-detail').hasAttribute('open')).toBe(true);
    expect(byId('goal-detail-title').textContent).toBe('เที่ยวญี่ปุ่น');
    expect(byId('goal-detail-progress').textContent).toBe('ออมแล้ว 6,000 บาท จาก 50,000 บาท (12%)');
    expect(byId('goal-detail-date').value).toBe('2026-10-15');
    expect(byId('goal-detail-form').hidden).toBe(false);
    expect(historyTexts()).toEqual(['14 ต.ค. 2569 · 1,000 บาท', '1 ต.ค. 2569 · 5,000 บาท']);
    expect(byId('goal-history-empty').hidden).toBe(true);
    expect(byId('goal-history-limit').hidden).toBe(true);
  });

  it('adds a contribution and refreshes the goal and its history', async () => {
    await openTab();
    await openDetailOf('goal-rows', 0);
    const calls = captureFetch((method, path) =>
      method === 'POST' && path === '/api/goals/g-1/contributions' ? { contribution: { id: 'gc-3' }, saved: 6500 } : undefined
    );

    byId('goal-detail-amount').value = '500';
    submitDetail();
    await settle();

    expect(calls.map((entry) => entry.call)).toEqual([
      'POST /api/goals/g-1/contributions',
      'GET /api/goals',
      'GET /api/goals/g-1/contributions',
    ]);
    expect(calls[0].body).toEqual({ amount: 500, occurredOn: '2026-10-15' });
    expect(byId('goal-detail-status').textContent).toBe('ออมเพิ่ม 500 บาท แล้ว');
    expect(byId('goal-detail-amount').value).toBe('');
  });

  it('does not add twice when the save button is tapped while the goals reload', async () => {
    await openTab();
    await openDetailOf('goal-rows', 0);
    const calls = captureFetch((method, path) =>
      method === 'POST' && path === '/api/goals/g-1/contributions' ? { contribution: { id: 'gc-3' }, saved: 6500 } : undefined
    );
    const fallback = globalThis.fetch;
    let releaseReload;
    const reload = new Promise((resolve) => {
      releaseReload = resolve;
    });
    vi.stubGlobal('fetch', async (url, options = {}) => {
      const response = fallback(url, options);
      if ((options.method ?? 'GET') === 'GET' && new URL(url, 'http://localhost').pathname === '/api/goals') await reload;
      return response;
    });

    byId('goal-detail-amount').value = '500';
    submitDetail();
    await settle();
    expect(byId('goal-detail-save').disabled).toBe(true);
    submitDetail();
    await settle();
    releaseReload();
    await settle();

    expect(calls.filter((entry) => entry.call === 'POST /api/goals/g-1/contributions')).toHaveLength(1);
    expect(byId('goal-detail-save').disabled).toBe(false);
    expect(byId('goal-detail-amount').value).toBe('');
  });

  it('shows why adding failed and keeps the amount', async () => {
    await openTab();
    await openDetailOf('goal-rows', 0);
    captureFetch((method) => (method === 'POST' ? { status: 409, error: 'Goal closed' } : undefined));

    byId('goal-detail-amount').value = '500';
    submitDetail();
    await settle();

    expect(byId('goal-detail-error').hidden).toBe(false);
    expect(byId('goal-detail-error').textContent).toBe('เป้านี้ปิดแล้ว เปิดเป้าอีกครั้งก่อนออมเพิ่ม');
    expect(byId('goal-detail-amount').value).toBe('500');
    expect(byId('goal-detail-save').disabled).toBe(false);
  });

  // เป้าถูกปิดจากที่อื่น (แท็บอื่นหรืออีกเครื่อง) ระหว่างเปิดรายละเอียดอยู่ ต้องโหลดใหม่ให้เห็นสถานะจริง
  it('reloads the goals after a goal closed refusal so the detail shows it closed', async () => {
    await openTab();
    await openDetailOf('goal-rows', 0);
    const closedGoals = { goals: RESPONSES['/api/goals'].goals.map((goal) => (goal.id === 'g-1' ? { ...goal, closed: true } : goal)) };
    const calls = captureFetch((method, path) => {
      if (method === 'POST') return { status: 409, error: 'Goal closed' };
      if (method === 'GET' && path === '/api/goals') return closedGoals;
      return undefined;
    });

    byId('goal-detail-amount').value = '500';
    submitDetail();
    await settle();

    expect(calls.map((entry) => entry.call)).toContain('GET /api/goals');
    expect(byId('goal-detail-error').textContent).toBe('เป้านี้ปิดแล้ว เปิดเป้าอีกครั้งก่อนออมเพิ่ม');
    expect(byId('goal-detail-form').hidden).toBe(true);
    expect(byId('goal-detail-closed-note').hidden).toBe(false);
  });

  it('reloads the goals after a not found refusal', async () => {
    await openTab();
    await openDetailOf('goal-rows', 0);
    const calls = captureFetch((method) => (method === 'POST' ? { status: 404, error: 'Not found' } : undefined));

    byId('goal-detail-amount').value = '500';
    submitDetail();
    await settle();

    expect(calls.map((entry) => entry.call)).toContain('GET /api/goals');
    expect(byId('goal-detail-error').textContent).toBe('ไม่พบเป้าหรือรายการนี้แล้ว ลองเปิดหน้าใหม่');
  });

  it('does not reload the goals for other refusals', async () => {
    await openTab();
    await openDetailOf('goal-rows', 0);
    const calls = captureFetch((method) => (method === 'POST' ? { status: 400, error: 'Invalid amount' } : undefined));

    byId('goal-detail-amount').value = '500';
    submitDetail();
    await settle();

    expect(calls.map((entry) => entry.call)).not.toContain('GET /api/goals');
  });

  // ลบแล้วกู้คืนไม่ได้ จึงถามยืนยันในแถวเดิมแบบเดียวกับการลบหมวด
  it('asks to confirm in the row before deleting a contribution and can back out', async () => {
    await openTab();
    await openDetailOf('goal-rows', 0);
    const calls = captureFetch();
    const firstRow = () => byId('goal-history').querySelector('li');

    firstRow().querySelector('.friend-remove').click();
    await settle();

    const buttons = [...firstRow().querySelectorAll('button')].map((button) => button.textContent);
    expect(buttons).toEqual(['ยืนยันลบ', 'ไม่ลบ']);
    expect(document.activeElement.textContent).toBe('ไม่ลบ');
    firstRow().querySelector('[data-action="cancel-delete"]').click();
    await settle();

    expect(calls).toEqual([]);
    expect([...firstRow().querySelectorAll('button')].map((button) => button.textContent)).toEqual(['ลบ']);
  });

  it('deletes a contribution from the history and reloads', async () => {
    await openTab();
    await openDetailOf('goal-rows', 0);
    const calls = captureFetch((method) => (method === 'DELETE' ? {} : undefined));

    const remove = byId('goal-history').querySelector('.friend-remove');
    expect(remove.getAttribute('aria-label')).toBe('ลบรายการออม 1,000 บาท วันที่ 14 ต.ค. 2569');
    remove.click();
    await settle();
    expect(calls).toEqual([]);
    byId('goal-history').querySelector('[data-action="confirm-delete"]').click();
    await settle();

    expect(calls.map((entry) => entry.call)).toEqual([
      'DELETE /api/goals/g-1/contributions/gc-2',
      'GET /api/goals',
      'GET /api/goals/g-1/contributions',
    ]);
    expect(byId('goal-detail-status').textContent).toBe('ลบรายการออมแล้ว');
  });

  it('hides the add form of a closed goal and explains how to reopen it', async () => {
    await openTab();
    await openDetailOf('goal-closed-rows', 0);

    expect(byId('goal-detail-title').textContent).toBe('มือถือใหม่');
    expect(byId('goal-detail-form').hidden).toBe(true);
    expect(byId('goal-detail-closed-note').hidden).toBe(false);
    expect(byId('goal-history-empty').hidden).toBe(false);
  });

  it('says only the latest entries are shown when the goal has more', async () => {
    const goals = RESPONSES['/api/goals'].goals.map((goal) => (goal.id === 'g-1' ? { ...goal, contributionCount: 150 } : goal));
    await openTab({ overrides: { '/api/goals': { goals } } });
    await openDetailOf('goal-rows', 0);

    expect(byId('goal-history-limit').hidden).toBe(false);
  });

  it('shows a history load failure inside the detail', async () => {
    await openTab({ overrides: { '/api/goals/g-1/contributions': { status: 500 } } });
    await openDetailOf('goal-rows', 0);

    expect(byId('goal-history-error').hidden).toBe(false);
    expect(byId('goal-history-error').textContent).toBe('โหลดประวัติการออมไม่สำเร็จ');
  });

  it('opens the goal editor from the detail', async () => {
    await openTab();
    await openDetailOf('goal-rows', 0);

    byId('goal-detail-edit').click();

    expect(byId('goal-detail').hasAttribute('open')).toBe(false);
    expect(byId('goal-editor').hasAttribute('open')).toBe(true);
    expect(byId('goal-editor-name').value).toBe('เที่ยวญี่ปุ่น');
  });
});

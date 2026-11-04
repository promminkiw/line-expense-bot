// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EMPTY_MONTH, TRANSACTIONS, settle, makeFetch, boot, byId, routeFetch, clickTab, submitEditOfFirstRow, deleteFirstRow, cleanupGlobals } from './dom-harness.mjs';

afterEach(cleanupGlobals);

function pointer(element, type, x, y) {
  element.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, button: 0 }));
}

// dx คือระยะที่ปัดไปทางซ้าย (ค่าบวก = ซ้าย)
function swipeRow(row, dx) {
  pointer(row, 'pointerdown', 300, 100);
  pointer(row, 'pointermove', 300 - dx / 2, 101);
  pointer(row, 'pointermove', 300 - dx, 101);
  pointer(row, 'pointerup', 300 - dx, 101);
}

const firstRows = () => [...document.querySelectorAll('#list .row')];

describe('LIFF list swipe to delete', () => {
  it('gives every row a delete button labelled with its category, hidden until swiped', async () => {
    await boot();
    const [row] = firstRows();
    const button = row.querySelector('.row-delete');

    expect(button.getAttribute('aria-label')).toBe('ลบรายการ อาหาร');
    expect(button.textContent).toBe('ลบ');
    expect(row.classList.contains('swiped')).toBe(false);
  });

  it('reveals the delete button when swiped left past half of its width', async () => {
    await boot();
    const [row] = firstRows();

    swipeRow(row, 60);

    expect(row.classList.contains('swiped')).toBe(true);
    expect(row.style.getPropertyValue('--swipe')).toBe('88px');
  });

  it('snaps back after a short swipe and does not open the editor from the click that follows', async () => {
    await boot();
    const [row] = firstRows();

    swipeRow(row, 20);
    row.querySelector('.row-button').click();
    await settle();

    expect(row.classList.contains('swiped')).toBe(false);
    expect(row.style.getPropertyValue('--swipe')).toBe('0px');
    expect(byId('editor').open).toBe(false);
  });

  it('leaves vertical scrolling alone', async () => {
    await boot();
    const [row] = firstRows();

    pointer(row, 'pointerdown', 300, 100);
    pointer(row, 'pointermove', 297, 140);
    pointer(row, 'pointermove', 230, 150);
    pointer(row, 'pointerup', 230, 150);

    expect(row.classList.contains('swiped')).toBe(false);
  });

  it('does nothing when swiped to the right', async () => {
    await boot();
    const [row] = firstRows();

    swipeRow(row, -60);

    expect(row.classList.contains('swiped')).toBe(false);
    expect(row.style.getPropertyValue('--swipe')).toBe('0px');
  });

  it('deletes the transaction when the revealed button is tapped, without a confirm dialog, and reloads', async () => {
    await boot();
    const calls = routeFetch((method) => (method === 'DELETE' ? {} : undefined));
    const [row] = firstRows();
    swipeRow(row, 60);

    row.querySelector('.row-delete').click();
    await settle();

    expect(calls).toContain('DELETE /api/transactions/t1');
    expect(calls.indexOf('GET /api/transactions')).toBeGreaterThan(calls.indexOf('DELETE /api/transactions/t1'));
    expect(byId('confirm-delete').open).toBe(false);
    expect(byId('editor').open).toBe(false);
  });

  it('shows the failure in the banner and keeps the list when the delete fails', async () => {
    await boot();
    routeFetch((method) => (method === 'DELETE' ? { status: 500 } : undefined));
    const [row] = firstRows();
    swipeRow(row, 60);

    row.querySelector('.row-delete').click();
    await settle();

    expect(byId('banner').hidden).toBe(false);
    expect(byId('banner').textContent).toBe('ลบไม่สำเร็จ ลองใหม่อีกครั้ง');
    expect(document.querySelectorAll('#list .row')).toHaveLength(3);
  });

  it('closes a revealed row when its content is tapped instead of opening the editor', async () => {
    await boot();
    const [row] = firstRows();
    swipeRow(row, 60);
    vi.setSystemTime(new Date(Date.now() + 1000));

    row.querySelector('.row-button').click();
    await settle();

    expect(row.classList.contains('swiped')).toBe(false);
    expect(byId('editor').open).toBe(false);
  });

  it('keeps only one row open at a time', async () => {
    await boot();
    const [first, second] = firstRows();

    swipeRow(first, 60);
    swipeRow(second, 60);

    expect(first.classList.contains('swiped')).toBe(false);
    expect(second.classList.contains('swiped')).toBe(true);
  });

  it('still opens the editor on a plain tap', async () => {
    await boot();
    const [row] = firstRows();

    row.querySelector('.row-button').click();
    await settle();

    expect(byId('editor').open).toBe(true);
  });

  const SNAPSHOT = { id: 'restored', amount: 60, note: '', occurredOn: '2026-10-01', categoryId: 'c', walletId: null, source: 'text', lineEventId: null, createdAt: '2026-10-01T01:00:00+00:00' };

  async function swipeDeleteFirst() {
    const [row] = firstRows();
    swipeRow(row, 60);
    row.querySelector('.row-delete').click();
    await settle();
  }

  // routeFetch เก็บแค่ METHOD path จึงห่อ fetch อีกชั้นเพื่อเก็บ body และคุมคำตอบของ restore
  function watchRestore({ hold = false } = {}) {
    const inner = globalThis.fetch;
    const restoreBodies = [];
    const held = [];
    vi.stubGlobal('fetch', (url, options = {}) => {
      const path = new URL(url, 'http://localhost').pathname;
      if (options.method === 'POST' && path === '/api/transactions/restore') {
        restoreBodies.push(JSON.parse(options.body));
        if (hold && restoreBodies.length === 1) return new Promise((resolve) => held.push(resolve));
      }
      return inner(url, options);
    });
    return { restoreBodies, release: (response) => held.shift()(response) };
  }

  it('offers undo after a swipe delete and restores the entry', async () => {
    await boot();
    const calls = routeFetch((method, path) => {
      if (method === 'DELETE' && path.startsWith('/api/transactions/')) return { restore: SNAPSHOT };
      if (method === 'POST' && path === '/api/transactions/restore') return {};
      return undefined;
    });
    const { restoreBodies } = watchRestore();

    await swipeDeleteFirst();
    expect(byId('undo-bar').hidden).toBe(false);
    expect(byId('undo-bar-text').textContent).toBe('ลบรายการแล้ว');
    expect(byId('undo-bar-status').hidden).toBe(false);
    expect(byId('undo-bar-status').textContent).toBe('ลบรายการแล้ว');

    byId('undo-bar-button').click();
    await settle();

    expect(byId('undo-bar').hidden).toBe(true);
    expect(calls).toContain('POST /api/transactions/restore');
    expect(restoreBodies).toEqual([SNAPSHOT]);
    expect(calls.lastIndexOf('GET /api/transactions')).toBeGreaterThan(calls.indexOf('POST /api/transactions/restore'));
  });

  it('does not keep an older undo after deleting a row with no snapshot', async () => {
    await boot();
    let deletes = 0;
    routeFetch((method, path) => {
      if (method === 'DELETE' && path.startsWith('/api/transactions/')) return { restore: (deletes += 1) === 1 ? SNAPSHOT : null };
      return undefined;
    });

    await swipeDeleteFirst();
    expect(byId('undo-bar').hidden).toBe(false);
    await swipeDeleteFirst();

    expect(byId('undo-bar').hidden).toBe(true);
    expect(byId('undo-bar-status').textContent).toBe('');
  });

  it('does not keep an older undo after deleting from the editor', async () => {
    await boot();
    let deletes = 0;
    routeFetch((method, path) => {
      if (method === 'DELETE' && path.startsWith('/api/transactions/')) return { restore: (deletes += 1) === 1 ? SNAPSHOT : null };
      return undefined;
    });

    await swipeDeleteFirst();
    vi.setSystemTime(Date.now() + 1000);
    await deleteFirstRow();

    expect(byId('undo-bar').hidden).toBe(true);
  });

  it('keeps the older undo when a later delete fails', async () => {
    await boot();
    let deletes = 0;
    routeFetch((method, path) => {
      if (method === 'DELETE' && path.startsWith('/api/transactions/')) return (deletes += 1) === 1 ? { restore: SNAPSHOT } : { status: 500 };
      return undefined;
    });

    await swipeDeleteFirst();
    await swipeDeleteFirst();

    expect(byId('undo-bar').hidden).toBe(false);
  });

  it('clears the failure banner after a successful retry', async () => {
    await boot();
    let restores = 0;
    routeFetch((method, path) => {
      if (method === 'DELETE' && path.startsWith('/api/transactions/')) return { restore: SNAPSHOT };
      if (method === 'POST' && path === '/api/transactions/restore') return (restores += 1) === 1 ? { status: 500 } : {};
      return undefined;
    });

    await swipeDeleteFirst();
    byId('undo-bar-button').click();
    await settle();
    expect(byId('banner').hidden).toBe(false);
    byId('undo-bar-button').click();
    await settle();

    expect(byId('banner').hidden).toBe(true);
    expect(byId('undo-bar').hidden).toBe(true);
  });

  it('clears the failure banner when the retry answers 409', async () => {
    await boot();
    let restores = 0;
    routeFetch((method, path) => {
      if (method === 'DELETE' && path.startsWith('/api/transactions/')) return { restore: SNAPSHOT };
      if (method === 'POST' && path === '/api/transactions/restore') return (restores += 1) === 1 ? { status: 500 } : { status: 409 };
      return undefined;
    });

    await swipeDeleteFirst();
    byId('undo-bar-button').click();
    await settle();
    expect(byId('banner').hidden).toBe(false);
    byId('undo-bar-button').click();
    await settle();

    expect(byId('banner').hidden).toBe(true);
  });

  it('does not replace a newer undo when an older restore fails', async () => {
    await boot();
    const newer = { ...SNAPSHOT, id: 'newer' };
    let deletes = 0;
    routeFetch((method, path) => {
      if (method === 'DELETE' && path.startsWith('/api/transactions/')) return { restore: (deletes += 1) === 1 ? SNAPSHOT : newer };
      if (method === 'POST' && path === '/api/transactions/restore') return {};
      return undefined;
    });
    const { restoreBodies, release } = watchRestore({ hold: true });

    await swipeDeleteFirst();
    byId('undo-bar-button').click();
    await settle();
    await swipeDeleteFirst();
    expect(byId('undo-bar').hidden).toBe(false);

    release({ ok: false, status: 500, json: async () => ({}) });
    await settle();
    byId('undo-bar-button').click();
    await settle();

    expect(restoreBodies.map((body) => body.id)).toEqual(['restored', 'newer']);
  });

  it('hides the undo bar when a sub-page opens', async () => {
    await boot();
    routeFetch((method, path) => (method === 'DELETE' && path.startsWith('/api/transactions/') ? { restore: SNAPSHOT } : undefined));

    await swipeDeleteFirst();
    expect(byId('undo-bar').hidden).toBe(false);
    clickTab('budgets');
    byId('categories-open').click();

    expect(byId('undo-bar').hidden).toBe(true);
  });

  it('offers no undo when the server returns no snapshot', async () => {
    await boot();
    routeFetch((method, path) => (method === 'DELETE' && path.startsWith('/api/transactions/') ? { restore: null } : undefined));

    await swipeDeleteFirst();

    expect(byId('undo-bar').hidden).toBe(true);
  });

  it('treats 409 as already restored', async () => {
    await boot();
    const calls = routeFetch((method, path) => {
      if (method === 'DELETE' && path.startsWith('/api/transactions/')) return { restore: SNAPSHOT };
      if (method === 'POST' && path === '/api/transactions/restore') return { status: 409 };
      return undefined;
    });

    await swipeDeleteFirst();
    byId('undo-bar-button').click();
    await settle();

    expect(byId('banner').hidden).toBe(true);
    expect(byId('undo-bar').hidden).toBe(true);
    expect(calls.lastIndexOf('GET /api/transactions')).toBeGreaterThan(calls.indexOf('POST /api/transactions/restore'));
  });

  it('keeps the undo available after a network failure', async () => {
    await boot();
    routeFetch((method, path) => {
      if (method === 'DELETE' && path.startsWith('/api/transactions/')) return { restore: SNAPSHOT };
      if (method === 'POST' && path === '/api/transactions/restore') return { status: 500 };
      return undefined;
    });

    await swipeDeleteFirst();
    byId('undo-bar-button').click();
    await settle();

    expect(byId('banner').textContent).toBe('เลิกทำไม่สำเร็จ ลองใหม่อีกครั้ง');
    expect(byId('undo-bar').hidden).toBe(false);
  });
});


const ZERO_TREND = {
  months: ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'].map((month) => ({ month, income: 0, expense: 0 })),
};

// หน้ารอบเดือนแบบ R2 ที่ผู้ใช้เลือก: คำอธิบายบรรทัดเดียว เงื่อนไขพับไว้ แถวแยกวันที่ ชื่อ ยอดเป็นชิ้น
describe('recurring tab style r2', () => {
  const RULES = {
    rules: [
      { id: 'r-1', type: 'income', categoryId: 'c-salary', amount: 25000, dayOfMonth: 1, note: 'บริษัท', active: true },
      { id: 'r-2', type: 'expense', categoryId: 'c-trip', amount: 1200, dayOfMonth: 31, note: '', active: false },
    ],
  };

  it('keeps the hint to one line and folds the timing rules into a details element', async () => {
    await boot({ overrides: { '/api/recurring': RULES } });

    expect(document.querySelector('.recurring-hint').textContent).toBe('เฮียจดให้อัตโนมัติเดือนละครั้ง และแจ้งใน LINE');
    expect(document.querySelector('.recurring-more summary').textContent).toBe('เริ่มจดเมื่อไร');
    expect(document.querySelector('.recurring-more').textContent).toContain('จะเริ่มเดือนหน้า');
    expect(document.querySelector('.recurring-more').textContent).toContain('กดลบได้');
  });

  it('renders each rule as a calendar day, a name, a signed amount and a paused tag', async () => {
    await boot({ overrides: { '/api/recurring': RULES } });
    const rows = [...document.querySelectorAll('#recurring-rows .recurring-row')];

    expect(rows.map((row) => row.querySelector('.recurring-cal b').textContent)).toEqual(['1', '31']);
    expect(rows.map((row) => row.querySelector('.recurring-name').textContent)).toEqual(['บริษัท', 'เดินทาง']);
    expect(rows.map((row) => row.querySelector('.recurring-amount').textContent)).toEqual(['+25,000 บาท', '-1,200 บาท']);
    expect(rows[0].querySelector('.recurring-sub').textContent).toBe('เงินเดือน');
    expect(rows[1].querySelector('.recurring-paused').textContent).toBe('หยุดไว้');
    expect(rows[0].classList.contains('income')).toBe(true);
    expect(rows[1].classList.contains('paused')).toBe(true);
    expect(rows[0].querySelector('.recurring-cal').getAttribute('aria-hidden')).toBe('true');
    // screen reader ยังได้ข้อความเต็ม รวมเงื่อนไขวันที่ 29-31 ที่ย้ายไปพับไว้
    expect(rows[1].querySelector('button').getAttribute('aria-label')).toBe('เดินทาง รายจ่าย 1,200 บาท · ทุกวันที่ 31 (เดือนที่สั้นกว่านั้นใช้วันสุดท้าย) · หยุดไว้');
  });
});

describe('LIFF small tickets', () => {
  it('(C) says so when the six month trend has no entries at all', async () => {
    await boot({ overrides: { '/api/trend': ZERO_TREND } });

    expect(byId('trend-empty').hidden).toBe(false);
    expect(byId('trend-empty').textContent).toBe('ยังไม่มีรายการใน 6 เดือนล่าสุด');
    expect(byId('trend-bars').hidden).toBe(true);
    expect(byId('trend-legend').hidden).toBe(true);
    expect(byId('trend-comparison').hidden).toBe(true);
  });

  it('(C) keeps the chart and hides the empty note when there is data', async () => {
    await boot();

    expect(byId('trend-empty').hidden).toBe(true);
    expect(byId('trend-bars').hidden).toBe(false);
  });

  it('(B) shows saving progress in its own status line, not in the alert line', async () => {
    await boot();
    const fallback = makeFetch({});
    vi.stubGlobal('fetch', (url, options = {}) =>
      (options.method ?? 'GET') === 'PATCH' ? new Promise(() => {}) : fallback(url, options)
    );
    document.querySelector('#list .row-button').click();
    await settle();

    byId('edit-form').dispatchEvent(new Event('submit', { cancelable: true }));

    expect(byId('edit-busy').hidden).toBe(false);
    expect(byId('edit-busy').textContent).toBe('กำลังบันทึก...');
    expect(byId('edit-error').hidden).toBe(true);
  });

  it('(B) shows a failed save in the alert line and clears the progress line', async () => {
    await boot();
    routeFetch((method) => (method === 'PATCH' ? { status: 500 } : undefined));

    await submitEditOfFirstRow();

    expect(byId('edit-busy').hidden).toBe(true);
    expect(byId('edit-error').hidden).toBe(false);
    expect(byId('edit-error').textContent).toBe('บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง');
  });

  // dialog เลื่อนได้เอง ข้อความ error อยู่ล่างสุด ต้องเลื่อนให้เห็นเมื่อคีย์บอร์ดบังอยู่
  it('scrolls the failed save message into view', async () => {
    const scroll = vi.fn();
    HTMLElement.prototype.scrollIntoView = scroll;
    try {
      await boot();
      routeFetch((method) => (method === 'PATCH' ? { status: 500 } : undefined));

      await submitEditOfFirstRow();

      expect(scroll.mock.contexts).toContain(byId('edit-error'));
      expect(scroll).toHaveBeenCalledWith({ block: 'nearest' });
    } finally {
      delete HTMLElement.prototype.scrollIntoView;
    }
  });

  it('(E) does not ask for the profile again on every tab entry after a login required answer', async () => {
    const liff = await boot({ overrides: { '/api/profile': { status: 401 } } });
    const profileCalls = () => liff.fetched.filter((path) => path === '/api/profile').length;

    clickTab('profile');
    clickTab('list');
    clickTab('profile');
    await settle();

    expect(profileCalls()).toBe(1);
    expect(byId('profile-error').hidden).toBe(false);
  });

  it('(E) still retries a profile that failed for another reason when the tab is entered', async () => {
    const liff = await boot({ overrides: { '/api/profile': { status: 500 } } });

    clickTab('profile');
    await settle();

    expect(liff.fetched.filter((path) => path === '/api/profile').length).toBe(2);
  });

  it('(I) the banner retry after a boot failure loads the categories, the list and the recurring tab', async () => {
    await boot({ overrides: { '/api/categories': { status: 500 } } });
    expect(byId('banner-retry').hidden).toBe(false);
    expect(byId('recurring-empty').hidden).toBe(true);

    routeFetch(() => undefined);
    byId('banner-retry').click();
    await settle();

    expect(document.querySelectorAll('#list .row')).toHaveLength(3);
    expect(byId('recurring-empty').hidden).toBe(false);
    expect(byId('recurring-loading').hidden).toBe(true);
    expect(byId('banner').hidden).toBe(true);
  });

  it('(D) does not show a delete failure that arrives after the user moved to another tab', async () => {
    await boot();
    let release;
    const pending = new Promise((resolve) => {
      release = resolve;
    });
    const fallback = makeFetch({});
    vi.stubGlobal('fetch', async (url, options = {}) => {
      if ((options.method ?? 'GET') === 'DELETE') {
        await pending;
        return { ok: false, status: 500, json: async () => ({}) };
      }
      return fallback(url, options);
    });
    const [row] = firstRows();
    swipeRow(row, 60);
    row.querySelector('.row-delete').click();

    clickTab('summary');
    release();
    await settle();

    expect(byId('banner').hidden).toBe(true);
  });

  it('(D) still shows a delete failure on the tab where it started', async () => {
    await boot();
    routeFetch((method) => (method === 'DELETE' ? { status: 500 } : undefined));
    const [row] = firstRows();
    swipeRow(row, 60);

    row.querySelector('.row-delete').click();
    await settle();

    expect(byId('banner').textContent).toBe('ลบไม่สำเร็จ ลองใหม่อีกครั้ง');
  });

  it('(A) returns focus to the edited row after saving', async () => {
    await boot();
    routeFetch((method) => (method === 'PATCH' ? {} : undefined));
    const buttons = document.querySelectorAll('#list .row-button');
    buttons[1].click();
    await settle();

    byId('edit-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();

    expect(document.activeElement.classList.contains('row-button')).toBe(true);
    expect(document.activeElement.closest('.row').dataset.id).toBe('t2');
  });

  it('(A) moves focus to the next row after deleting from the editor', async () => {
    await boot();
    routeFetch((method) => (method === 'DELETE' ? {} : undefined));

    await deleteFirstRow();

    expect(document.activeElement.closest('.row').dataset.id).toBe('t2');
  });

  it('(A) moves focus to the next row after deleting by swipe', async () => {
    await boot();
    routeFetch((method) => (method === 'DELETE' ? {} : undefined));
    const [row] = firstRows();
    swipeRow(row, 60);

    row.querySelector('.row-delete').click();
    await settle();

    expect(document.activeElement.closest('.row').dataset.id).toBe('t2');
  });

  it('(A) falls back to the month field when the deleted row had no neighbour', async () => {
    await boot({
      overrides: {
        '/api/transactions': { transactions: [TRANSACTIONS[0]], summary: [], truncated: false },
      },
    });
    routeFetch((method) => (method === 'DELETE' ? {} : undefined));
    const [row] = firstRows();
    swipeRow(row, 60);

    row.querySelector('.row-delete').click();
    await settle();

    expect(document.activeElement).toBe(byId('month'));
  });
});

describe('LIFF swipe hint', () => {
  beforeEach(() => localStorage.clear());

  afterEach(() => localStorage.clear());

  it('shows once there are rows and stays dismissed after the button', async () => {
    await boot();
    expect(byId('swipe-hint').hidden).toBe(false);

    byId('swipe-hint-dismiss').click();
    expect(byId('swipe-hint').hidden).toBe(true);

    await boot();
    expect(byId('swipe-hint').hidden).toBe(true);
  });

  it('dismisses itself when a row is swiped open', async () => {
    await boot();

    swipeRow(firstRows()[0], 60);

    expect(byId('swipe-hint').hidden).toBe(true);
    expect(localStorage.getItem('swipe-hint-seen')).toBe('1');
  });

  it('stays hidden on an empty month', async () => {
    await boot({ overrides: { '/api/transactions': EMPTY_MONTH } });
    expect(byId('swipe-hint').hidden).toBe(true);
  });

  it('hides while the month reloads and stays hidden when the load fails', async () => {
    await boot();
    expect(byId('swipe-hint').hidden).toBe(false);

    routeFetch((method, path) => (path === '/api/transactions' ? { status: 500 } : undefined));
    byId('month').value = '2026-09';
    byId('month').dispatchEvent(new Event('change'));

    expect(byId('swipe-hint').hidden).toBe(true);
    await settle();
    expect(byId('swipe-hint').hidden).toBe(true);
  });

  it('moves focus off the dismiss button when the hint hides', async () => {
    await boot();
    byId('swipe-hint-dismiss').focus();

    byId('swipe-hint-dismiss').click();

    expect(document.activeElement).toBe(byId('month'));
  });

  it('does not move focus when a swipe dismisses the hint', async () => {
    await boot();
    const row = firstRows()[0];
    row.querySelector('.row-delete').focus();

    swipeRow(row, 60);

    expect(document.activeElement).not.toBe(byId('month'));
  });

  it('still works when storage throws', async () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    await boot();
    expect(byId('swipe-hint').hidden).toBe(false);
    spy.mockRestore();
  });
});

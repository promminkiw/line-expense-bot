// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { createSettingsPanel } from './settings-panel.mjs';
import { ApiError } from '../api.mjs';
import { LOGIN_REQUIRED_MESSAGE } from '../format.mjs';

const byId = (id) => document.getElementById(id);
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

// second: เพิ่มสวิตช์ตัวที่สอง (key dailyReminder) เพื่อพิสูจน์ว่าบันทึกตัวหนึ่งไม่ไปทับอีกตัว
function setup(api, { second = false } = {}) {
  document.body.innerHTML = `
    <section id="notify" hidden>
      <p id="notify-loading" hidden></p>
      <div id="notify-error" hidden><p id="notify-error-text"></p><button type="button" id="notify-retry"></button></div>
      <div id="notify-body" hidden><input id="notify-weekly-summary" type="checkbox">${
        second ? '<input id="notify-second" type="checkbox">' : ''
      }</div>
      <p id="notify-status"></p>
    </section>`;
  const switches = { weeklySummary: byId('notify-weekly-summary') };
  if (second) switches.dailyReminder = byId('notify-second');
  return createSettingsPanel({
    els: {
      section: byId('notify'),
      loadingText: byId('notify-loading'),
      error: byId('notify-error'),
      errorText: byId('notify-error-text'),
      retry: byId('notify-retry'),
      body: byId('notify-body'),
      status: byId('notify-status'),
      switches,
    },
    getApi: () => api,
  });
}

function toggle(input, checked) {
  input.checked = checked;
  input.dispatchEvent(new Event('change'));
}

describe('createSettingsPanel', () => {
  it('does nothing before login', async () => {
    const panel = setup(null);

    await panel.ensureLoaded();

    expect(byId('notify').hidden).toBe(true);
  });

  it('loads the switches once and shows them', async () => {
    const api = { getSettings: vi.fn().mockResolvedValue({ weeklySummary: true }) };
    const panel = setup(api);

    await panel.ensureLoaded();
    await panel.ensureLoaded();

    expect(api.getSettings).toHaveBeenCalledTimes(1);
    expect(byId('notify').hidden).toBe(false);
    expect(byId('notify-loading').hidden).toBe(true);
    expect(byId('notify-body').hidden).toBe(false);
    expect(byId('notify-weekly-summary').checked).toBe(true);
  });

  it('shows the loading text while waiting', () => {
    setup({ getSettings: () => new Promise(() => {}) }).ensureLoaded();

    expect(byId('notify').hidden).toBe(false);
    expect(byId('notify-loading').hidden).toBe(false);
    expect(byId('notify-body').hidden).toBe(true);
  });

  it('shows a retry when loading fails and loads again from it', async () => {
    const api = {
      getSettings: vi.fn().mockRejectedValueOnce(new ApiError(500)).mockResolvedValueOnce({ weeklySummary: false }),
    };
    const panel = setup(api);

    await panel.ensureLoaded();

    expect(byId('notify-error').hidden).toBe(false);
    expect(byId('notify-error-text').textContent).toBe('โหลดการตั้งค่าไม่สำเร็จ');
    expect(byId('notify-retry').hidden).toBe(false);
    expect(byId('notify-loading').hidden).toBe(true);

    byId('notify-retry').click();
    await flush();

    expect(byId('notify-error').hidden).toBe(true);
    expect(byId('notify-body').hidden).toBe(false);
  });

  it('asks to reopen from LINE without a retry when login expired', async () => {
    const panel = setup({ getSettings: vi.fn().mockRejectedValue(new ApiError(401)) });

    await panel.ensureLoaded();

    expect(byId('notify-error-text').textContent).toBe(LOGIN_REQUIRED_MESSAGE);
    expect(byId('notify-retry').hidden).toBe(true);
  });

  it('saves a switch, locks it while saving and shows the saved value', async () => {
    let finish;
    const api = {
      getSettings: vi.fn().mockResolvedValue({ weeklySummary: false }),
      updateSettings: vi.fn(() => new Promise((resolve) => (finish = resolve))),
    };
    const panel = setup(api);
    await panel.ensureLoaded();
    const box = byId('notify-weekly-summary');

    toggle(box, true);

    expect(api.updateSettings).toHaveBeenCalledWith({ weeklySummary: true });
    expect(box.disabled).toBe(true);
    finish({ weeklySummary: true });
    await flush();
    expect(box.disabled).toBe(false);
    expect(box.checked).toBe(true);
    expect(byId('notify-status').textContent).toBe('บันทึก ส่งสรุปทุกวันอาทิตย์ แล้ว');
  });

  // ผลของการบันทึกสวิตช์หนึ่งมาถึงตอนอีกสวิตช์กำลังบันทึกอยู่ ต้องไม่ทับค่าที่ผู้ใช้เพิ่งกด
  it('updates only the saved switch from the answer', async () => {
    const finish = {};
    const api = {
      getSettings: vi.fn().mockResolvedValue({ weeklySummary: false, dailyReminder: false }),
      updateSettings: vi.fn((body) => new Promise((resolve) => (finish[Object.keys(body)[0]] = resolve))),
    };
    const panel = setup(api, { second: true });
    await panel.ensureLoaded();
    const weekly = byId('notify-weekly-summary');
    const daily = byId('notify-second');

    toggle(weekly, true);
    toggle(daily, true);
    finish.weeklySummary({ weeklySummary: true, dailyReminder: false });
    await flush();

    expect(weekly.checked).toBe(true);
    expect(daily.checked).toBe(true);
    expect(daily.disabled).toBe(true);
  });

  it('puts the switch back when saving fails', async () => {
    const api = {
      getSettings: vi.fn().mockResolvedValue({ weeklySummary: false }),
      updateSettings: vi.fn().mockRejectedValue(new ApiError(500)),
    };
    const panel = setup(api);
    await panel.ensureLoaded();
    const box = byId('notify-weekly-summary');

    toggle(box, true);
    await flush();

    expect(box.checked).toBe(false);
    expect(box.disabled).toBe(false);
    expect(byId('notify-status').textContent).toBe('บันทึก ส่งสรุปทุกวันอาทิตย์ ไม่สำเร็จ ลองใหม่อีกครั้ง');
  });

  // สถานะมีบรรทัดเดียว ข้อความต้องบอกว่าเป็นของสวิตช์ไหน ไม่งั้นผลของตัวหนึ่งดูเป็นผลของอีกตัว
  it('names the switch in the status when one save fails and another succeeds', async () => {
    const api = {
      getSettings: vi.fn().mockResolvedValue({ weeklySummary: false, dailyReminder: false }),
      updateSettings: vi.fn((body) =>
        'weeklySummary' in body ? Promise.reject(new ApiError(500)) : Promise.resolve({ weeklySummary: false, dailyReminder: true }),
      ),
    };
    const panel = setup(api, { second: true });
    await panel.ensureLoaded();
    const weekly = byId('notify-weekly-summary');
    const daily = byId('notify-second');

    toggle(weekly, true);
    await flush();
    expect(byId('notify-status').textContent).toBe('บันทึก ส่งสรุปทุกวันอาทิตย์ ไม่สำเร็จ ลองใหม่อีกครั้ง');
    expect(weekly.checked).toBe(false);

    toggle(daily, true);
    await flush();
    expect(byId('notify-status').textContent).toBe('บันทึก เตือนถ้าวันนี้ยังไม่ได้จด แล้ว');
    expect(daily.checked).toBe(true);
  });

  it('asks to reopen from LINE when saving needs a new login', async () => {
    const api = {
      getSettings: vi.fn().mockResolvedValue({ weeklySummary: true }),
      updateSettings: vi.fn().mockRejectedValue(new ApiError(401)),
    };
    const panel = setup(api);
    await panel.ensureLoaded();

    toggle(byId('notify-weekly-summary'), false);
    await flush();

    expect(byId('notify-weekly-summary').checked).toBe(true);
    expect(byId('notify-status').textContent).toBe(LOGIN_REQUIRED_MESSAGE);
  });
});

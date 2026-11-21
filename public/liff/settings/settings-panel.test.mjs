// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { createSettingsPanel, createLanguagePicker } from './settings-panel.mjs';
import { ApiError } from '../api.mjs';
import { loginRequiredMessage } from '../format.mjs';

const byId = (id) => document.getElementById(id);
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

// second: เพิ่มสวิตช์ตัวที่สอง (key dailyReminder) เพื่อพิสูจน์ว่าบันทึกตัวหนึ่งไม่ไปทับอีกตัว
function setup(api, { second = false, takeBootRead } = {}) {
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
    takeBootRead,
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

    expect(byId('notify-error-text').textContent).toBe(loginRequiredMessage());
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
    expect(byId('notify-status').textContent).toBe(loginRequiredMessage());
  });
});

describe('createSettingsPanel with the boot settings read', () => {
  it('reuses the boot read instead of fetching again', async () => {
    const api = { getSettings: vi.fn() };
    const takeBootRead = vi.fn().mockReturnValueOnce(Promise.resolve({ weeklySummary: true })).mockReturnValue(null);
    const panel = setup(api, { takeBootRead });

    await panel.ensureLoaded();

    expect(api.getSettings).not.toHaveBeenCalled();
    expect(byId('notify-weekly-summary').checked).toBe(true);
    expect(byId('notify-body').hidden).toBe(false);
  });

  it('loads again when the boot read failed', async () => {
    const api = { getSettings: vi.fn().mockResolvedValue({ weeklySummary: true }) };
    const panel = setup(api, { takeBootRead: () => Promise.reject(new ApiError(500)) });

    await panel.ensureLoaded();

    expect(api.getSettings).toHaveBeenCalledTimes(1);
    expect(byId('notify-weekly-summary').checked).toBe(true);
  });

  it('shows the retry when both the boot read and the second read fail', async () => {
    const api = { getSettings: vi.fn().mockRejectedValue(new ApiError(500)) };
    const panel = setup(api, { takeBootRead: () => Promise.reject(new ApiError(500)) });

    await panel.ensureLoaded();

    expect(byId('notify-error').hidden).toBe(false);
  });
});

describe('createLanguagePicker', () => {
  function pickerSetup({ api, lang = 'th', remember = vi.fn(), reload = vi.fn() } = {}) {
    document.body.innerHTML = `
      <input id="lang-th" type="radio" name="language" value="th">
      <input id="lang-en" type="radio" name="language" value="en">
      <p id="lang-status"></p>`;
    const picker = createLanguagePicker({
      els: { radios: { th: byId('lang-th'), en: byId('lang-en') }, status: byId('lang-status') },
      getApi: () => api,
      getLang: () => lang,
      remember,
      reload,
    });
    return { picker, remember, reload };
  }

  function choose(language) {
    byId(`lang-${language}`).checked = true;
    byId(`lang-${language}`).dispatchEvent(new Event('change'));
  }

  it('checks the current language', () => {
    const { picker } = pickerSetup({ api: {}, lang: 'en' });

    picker.render();

    expect(byId('lang-en').checked).toBe(true);
    expect(byId('lang-th').checked).toBe(false);
  });

  it('saves the choice, remembers it and reloads', async () => {
    const api = { updateSettings: vi.fn().mockResolvedValue({ language: 'en' }) };
    const { picker, remember, reload } = pickerSetup({ api });
    picker.render();

    choose('en');
    await flush();

    expect(api.updateSettings).toHaveBeenCalledWith({ language: 'en' });
    expect(remember).toHaveBeenCalledWith('en');
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('keeps the old selection and shows an error in the current language when saving fails', async () => {
    const api = { updateSettings: vi.fn().mockRejectedValue(new ApiError(500)) };
    const { picker, remember, reload } = pickerSetup({ api, lang: 'en' });
    picker.render();

    choose('th');
    await flush();

    expect(byId('lang-en').checked).toBe(true);
    expect(byId('lang-th').disabled).toBe(false);
    expect(byId('lang-status').textContent).toBe("Couldn't save the language. Try again.");
    expect(remember).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it('shows the Thai error when saving fails in Thai', async () => {
    const api = { updateSettings: vi.fn().mockRejectedValue(new Error('network')) };
    const { picker } = pickerSetup({ api });
    picker.render();

    choose('en');
    await flush();

    expect(byId('lang-th').checked).toBe(true);
    expect(byId('lang-status').textContent).toBe('บันทึกภาษาไม่สำเร็จ ลองใหม่อีกครั้ง');
  });

  it('asks to reopen from LINE when saving needs a new login', async () => {
    const api = { updateSettings: vi.fn().mockRejectedValue(new ApiError(401)) };
    const { picker } = pickerSetup({ api });
    picker.render();

    choose('en');
    await flush();

    expect(byId('lang-status').textContent).toBe(loginRequiredMessage());
  });

  it('does not save when the current language is picked again', async () => {
    const api = { updateSettings: vi.fn() };
    const { picker, reload } = pickerSetup({ api });
    picker.render();

    choose('th');
    await flush();

    expect(api.updateSettings).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it('locks the options while saving and clears an old error', async () => {
    let finish;
    const api = { updateSettings: vi.fn(() => new Promise((resolve) => (finish = resolve))) };
    const { picker } = pickerSetup({ api });
    byId('lang-status').textContent = 'old';
    picker.render();

    choose('en');

    expect(byId('lang-th').disabled).toBe(true);
    expect(byId('lang-en').disabled).toBe(true);
    expect(byId('lang-status').textContent).toBe('');
    finish({ language: 'en' });
    await flush();
  });
});

describe('createLanguagePicker without an api', () => {
  function build({ getApi, reload = vi.fn() }) {
    document.body.innerHTML = '<input id="a-th" type="radio"><input id="a-en" type="radio"><p id="a-status"></p>';
    const picker = createLanguagePicker({
      els: { radios: { th: byId('a-th'), en: byId('a-en') }, status: byId('a-status') },
      getApi,
      getLang: () => 'th',
      remember: vi.fn(),
      reload,
    });
    picker.render();
    byId('a-en').checked = true;
    byId('a-en').dispatchEvent(new Event('change'));
    return reload;
  }

  it('does not call the api when getApi() is null', async () => {
    const reload = build({ getApi: () => null });
    await flush();

    expect(reload).not.toHaveBeenCalled();
    expect(byId('a-th').checked).toBe(true);
    expect(byId('a-status').textContent).toBe('');
  });

  it('keeps the options locked after a successful save', async () => {
    build({ getApi: () => ({ updateSettings: vi.fn().mockResolvedValue({}) }) });
    await flush();

    expect(byId('a-th').disabled).toBe(true);
    expect(byId('a-en').disabled).toBe(true);
  });
});

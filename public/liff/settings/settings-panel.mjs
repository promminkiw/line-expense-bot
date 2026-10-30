import { ApiError } from '../api.mjs';
import { LOGIN_REQUIRED_MESSAGE } from '../format.mjs';

const LOAD_FAILED_MESSAGE = 'โหลดการตั้งค่าไม่สำเร็จ';
// สถานะมีบรรทัดเดียวใช้ร่วมกันทุกสวิตช์ จึงต้องบอกชื่อสวิตช์ในข้อความ
const SWITCH_NAMES = { weeklySummary: 'ส่งสรุปทุกวันอาทิตย์', dailyReminder: 'เตือนถ้าวันนี้ยังไม่ได้จด' };
const savedMessage = (field) => `บันทึก ${SWITCH_NAMES[field]} แล้ว`;
const saveFailedMessage = (field) => `บันทึก ${SWITCH_NAMES[field]} ไม่สำเร็จ ลองใหม่อีกครั้ง`;

const isLoginRequired = (err) => err instanceof ApiError && err.status === 401;

// สวิตช์การแจ้งเตือนในแท็บโปรไฟล์: โหลดเมื่อเข้าแท็บครั้งแรก ไม่ให้หน้าแรกยิง request เพิ่ม
export function createSettingsPanel({ els, getApi }) {
  let loaded = false;
  let loading = null;
  const fields = Object.keys(els.switches);

  function render(settings) {
    for (const field of fields) els.switches[field].checked = settings[field] === true;
  }

  function showLoadError(err) {
    els.loadingText.hidden = true;
    const loginRequired = isLoginRequired(err);
    els.errorText.textContent = loginRequired ? LOGIN_REQUIRED_MESSAGE : LOAD_FAILED_MESSAGE;
    // 401 ต้องเปิดจาก LINE ใหม่ กดลองใหม่ก็ได้ผลเดิม
    els.retry.hidden = loginRequired;
    els.error.hidden = false;
  }

  function load() {
    const api = getApi();
    if (!api) return Promise.resolve();
    els.section.hidden = false;
    els.error.hidden = true;
    els.loadingText.hidden = false;
    loading = api
      .getSettings()
      .then((settings) => {
        loaded = true;
        render(settings);
        els.loadingText.hidden = true;
        els.body.hidden = false;
      }, showLoadError)
      .finally(() => {
        loading = null;
      });
    return loading;
  }

  function ensureLoaded() {
    if (loading) return loading;
    if (loaded) return Promise.resolve();
    return load();
  }

  async function save(field) {
    const input = els.switches[field];
    const wanted = input.checked;
    input.disabled = true;
    els.status.textContent = '';
    try {
      const saved = await getApi().updateSettings({ [field]: wanted });
      // ตั้งเฉพาะสวิตช์ที่บันทึก สวิตช์อื่นอาจกำลังบันทึกอยู่และผลนี้ยังไม่รู้ค่าที่ผู้ใช้เพิ่งกด
      input.checked = saved[field] === true;
      els.status.textContent = savedMessage(field);
    } catch (err) {
      // ถือว่า server ยังไม่เปลี่ยน ถ้าที่จริงเปลี่ยนแล้ว เปิดหน้าใหม่จะเห็นค่าจริง
      input.checked = !wanted;
      els.status.textContent = isLoginRequired(err) ? LOGIN_REQUIRED_MESSAGE : saveFailedMessage(field);
    } finally {
      input.disabled = false;
    }
  }

  els.retry.addEventListener('click', () => {
    ensureLoaded();
  });
  for (const field of fields) {
    els.switches[field].addEventListener('change', () => save(field));
  }

  return { ensureLoaded };
}

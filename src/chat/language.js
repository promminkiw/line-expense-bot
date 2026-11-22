const { t, SUPPORTED_LANGUAGES } = require('../i18n');

const LANGUAGE_ACTION = 'language';

const MENU_COMMANDS = new Set(['ภาษา', 'language', 'เปลี่ยนภาษา', 'change language']);
// พิมพ์ชื่อภาษาตรงตัวคือสั่งเปลี่ยนเลย ไม่ต้องผ่านปุ่ม
const DIRECT_COMMANDS = new Map([
  ['english', 'en'],
  ['ภาษาไทย', 'th'],
]);

// คืน 'menu' | รหัสภาษา | null ใช้เทียบตรงตัวหลังจัดช่องว่าง เพื่อไม่ชนข้อความบันทึกรายการอย่าง "ค่าภาษา 500"
function parseLanguageCommand(text) {
  const normalized = String(text).trim().replaceAll(/\s+/g, ' ').toLowerCase();
  if (MENU_COMMANDS.has(normalized)) {
    return 'menu';
  }
  return DIRECT_COMMANDS.get(normalized) ?? null;
}

// ป้ายปุ่มเป็นชื่อภาษาของตัวเอง จึงเหมือนกันทุกภาษาที่ผู้ใช้อ่านอยู่
function buildLanguageQuickReply() {
  return SUPPORTED_LANGUAGES.map((lang) => {
    const label = t(lang, `common.language.${lang}`);
    return {
      type: 'action',
      action: {
        type: 'postback',
        label,
        data: new URLSearchParams({ action: LANGUAGE_ACTION, lang }).toString(),
        displayText: label,
      },
    };
  });
}

function createLanguageHandlers({ repository, logger }) {
  function buildMenuReply(lang) {
    return { text: t(lang, 'chat.language.prompt'), quickReply: buildLanguageQuickReply() };
  }

  // ยืนยันเป็นภาษาใหม่ให้ผู้ใช้เห็นผลทันที ส่วนข้อความผิดพลาดใช้ภาษาเดิมเพราะภาษายังไม่เปลี่ยน
  async function switchLanguage(userId, newLang, currentLang) {
    try {
      await repository.setUserLanguage(userId, newLang);
    } catch (err) {
      logger.error('Failed to change language', { userId, language: newLang }, err);
      return { text: t(currentLang, 'chat.language.failed') };
    }
    return { text: t(newLang, 'chat.language.changed') };
  }

  async function handlePostback(params, { userId, lang: currentLang }) {
    const newLang = params.get('lang');
    // ค่านอกรายการเมินเหมือน postback ที่ไม่รู้จัก ไม่ส่งไปถึง DB
    if (!SUPPORTED_LANGUAGES.includes(newLang)) {
      return null;
    }
    return switchLanguage(userId, newLang, currentLang);
  }

  return { buildMenuReply, switchLanguage, handlePostback };
}

module.exports = { LANGUAGE_ACTION, parseLanguageCommand, buildLanguageQuickReply, createLanguageHandlers };

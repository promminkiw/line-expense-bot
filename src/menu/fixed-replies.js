const { t } = require('../i18n');

// ผู้ใช้อนุญาตให้ใส่ emoji เฉพาะข้อความช่วยเหลือนี้ เพื่อให้แบ่งหัวข้ออ่านง่าย
// หนึ่งหัวข้อต่อหนึ่งปุ่ม ขึ้นต้นด้วย emoji ที่สื่อเรื่องนั้นให้กวาดตาหาได้ (ปุ่มลอยของ LINE มีได้ไม่เกิน 13 ปุ่ม)
// ข้อความจริงอยู่ในชุดแปล key help.sections.<id>.label/body ที่นี่เก็บแค่ลำดับและ id
const HELP_SECTION_IDS = [
  'record',
  'backdate',
  'slip',
  'recurring',
  'undo',
  'summary',
  'ask',
  'saving',
  'wallet',
  'budget',
  'category',
  'split',
  'reminders',
];

// รูปแบบไทยเดิม ({ id, label, text }) คงไว้ให้โค้ดและเทสต์ที่อ้างถึงใช้ต่อได้
const HELP_SECTIONS = HELP_SECTION_IDS.map((id) => ({
  id,
  label: t('th', `help.sections.${id}.label`),
  text: t('th', `help.sections.${id}.body`),
}));

const HELP_MENU_REPLY = t('th', 'help.menu');
const HELP_KEYS = { th: 'ช่วยเหลือ', en: 'help' };
const SUPPORTED = Object.keys(HELP_KEYS);

// ใช้เมื่อยังไม่ได้ตั้งค่า LIFF เท่านั้น
const WEB_COMING_SOON_REPLY = t('th', 'menu.webComingSoon');

// ผู้ใช้เลือกเก็บข้อเสนอแนะใน Google Form ใช้ลิงก์ส่งของฟอร์ม เพราะลิงก์ /edit เปิดได้แค่เจ้าของ
const FEEDBACK_FORM_URL = 'https://forms.gle/byku7LUs8qsXWaP18';
const FEEDBACK_REPLY = t('th', 'menu.feedback', { url: FEEDBACK_FORM_URL });

// ปุ่ม Rich Menu เป็นรูปภาษาไทยเสมอ จึงรับแค่ข้อความไทย ส่วนคำตอบแปลตามภาษาผู้ใช้
const FIXED_REPLY_KEYS = {
  เปิดเว็บ: 'menu.webComingSoon',
  เสนอแนะ: 'menu.feedback',
};

function buildWebReply(liffUrl, lang = 'th') {
  return t(lang, 'menu.webLink', { url: liffUrl });
}

function normalizeKey(text) {
  return text.replace(/\s+/g, '').toLowerCase();
}

function buildHelpQuickReply(lang) {
  return HELP_SECTION_IDS.map((id) => {
    const label = t(lang, `help.sections.${id}.label`);
    return {
      type: 'action',
      action: { type: 'message', label, text: `${HELP_KEYS[lang] ?? HELP_KEYS.th} ${label}` },
    };
  });
}

// ปุ่มช่วยเหลือถามหัวข้อก่อน แล้วปุ่มลอยแต่ละอันส่งข้อความกลับมาขอหัวข้อนั้น
// รับคำสั่งและป้ายหัวข้อของทุกภาษา (ผู้ใช้อาจพิมพ์คนละภาษากับที่ตั้งไว้) แต่ตอบเป็นภาษาของผู้ใช้
function getHelpReply(text, lang = 'th') {
  const key = normalizeKey(text);
  for (const commandLang of SUPPORTED) {
    const command = normalizeKey(HELP_KEYS[commandLang]);
    if (key === command) {
      return { text: t(lang, 'help.menu'), quickReply: buildHelpQuickReply(lang) };
    }
    if (!key.startsWith(command)) continue;
    for (const id of HELP_SECTION_IDS) {
      for (const labelLang of SUPPORTED) {
        const label = normalizeKey(t(labelLang, `help.sections.${id}.label`));
        if (key === `${command}${label}`) return { text: t(lang, `help.sections.${id}.body`) };
      }
    }
  }
  return null;
}

function getFixedReply(text, { liffUrl } = {}, lang = 'th') {
  const key = normalizeKey(text);
  if (key === 'เปิดเว็บ' && liffUrl) {
    return buildWebReply(liffUrl, lang);
  }
  if (!Object.hasOwn(FIXED_REPLY_KEYS, key)) return null;
  const messageKey = FIXED_REPLY_KEYS[key];
  return t(lang, messageKey, messageKey === 'menu.feedback' ? { url: FEEDBACK_FORM_URL } : {});
}

module.exports = {
  getFixedReply,
  getHelpReply,
  buildWebReply,
  HELP_SECTIONS,
  HELP_MENU_REPLY,
  WEB_COMING_SOON_REPLY,
  FEEDBACK_REPLY,
};

// น้ำเสียงของบอทที่ Claude ต้องใช้ทุกครั้งที่เขียนข้อความถึงผู้ใช้
const PERSONA_PROMPT =
  'Write as a Thai man who calls himself "เฮีย" and calls the user "คุณ". Do not end sentences with particles such as ครับ, ค่ะ or นะ.';

const ENGLISH_PERSONA_PROMPT =
  'Write as a friendly, casual man who refers to himself as "I" and calls the user "you". Keep it short and informal. Do not give yourself a name.';

// ภาษาที่ไม่รู้จักใช้บุคลิกไทย เพราะ null/ค่าเดิมของผู้ใช้ถือเป็นไทย
function personaPrompt(lang) {
  return lang === 'en' ? ENGLISH_PERSONA_PROMPT : PERSONA_PROMPT;
}

module.exports = { PERSONA_PROMPT, personaPrompt };

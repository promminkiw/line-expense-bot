const HELP_REPLY = [
  'วิธีใช้บอทบันทึกรายรับรายจ่าย',
  '- พิมพ์รายการได้เลย เช่น "กินข้าว 60 กาแฟ 45"',
  '- รายรับ เช่น "เงินเดือนเข้า 25000"',
  '- ย้อนวันได้ เช่น "เมื่อวานค่าแท็กซี่ 120"',
  '- บันทึกแล้วกดปุ่ม "ยกเลิก" ใต้ข้อความเพื่อลบรายการชุดนั้น',
  '- พิมพ์ "สรุป" หรือกดปุ่มสรุปในเมนู เพื่อดูยอดวันนี้ สัปดาห์นี้ หรือเดือนนี้',
  '- จำนวนเงินต่อรายการไม่เกิน 10,000,000 บาท',
].join('\n');

// ใช้จนกว่าจะมีหน้าเว็บ LIFF ในขั้นที่ 6 แล้วเปลี่ยนปุ่มให้เปิดลิงก์แทน
const WEB_COMING_SOON_REPLY = 'หน้าเว็บสำหรับดูและแก้ไขรายการกำลังพัฒนา จะเปิดใช้ได้เร็วๆ นี้';

const FIXED_REPLIES = {
  'ช่วยเหลือ': HELP_REPLY,
  'เปิดเว็บ': WEB_COMING_SOON_REPLY,
};

function getFixedReply(text) {
  const key = text.replace(/\s+/g, '');
  return Object.hasOwn(FIXED_REPLIES, key) ? FIXED_REPLIES[key] : null;
}

module.exports = { getFixedReply, HELP_REPLY, WEB_COMING_SOON_REPLY };

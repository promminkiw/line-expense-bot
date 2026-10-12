// Haiku 4.5 ตอบ 400 เมื่อได้ effort จึงข้ามไว้ เผื่อ CLAUDE_MODEL ยังตั้งเป็นรุ่นเดิมหรือย้อนกลับไปใช้
const NO_EFFORT_MODEL = /^claude-haiku-4/;

// Haiku 5.5 คิดเป็นค่าเริ่มต้นและการคิดนับรวมใน max_tokens งานของบอทสั้นจึงให้คิดน้อย
function withLowEffort(model, outputConfig) {
  if (NO_EFFORT_MODEL.test(model)) return outputConfig;
  return { ...outputConfig, effort: 'low' };
}

module.exports = { withLowEffort };

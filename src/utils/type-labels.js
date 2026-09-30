// หน้าเว็บ (public/liff/app.mjs) มีชุดเดียวกันของตัวเอง เพราะเป็น ES module ที่ไม่มี build step แชร์กับ CommonJS ไม่ได้
const TYPE_LABELS = { expense: 'รายจ่าย', income: 'รายรับ' };

module.exports = { TYPE_LABELS };

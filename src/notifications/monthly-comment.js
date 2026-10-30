const { formatAmount } = require('../parser/format-reply');

const TOP_SHARE_WARNING = 40;
const GOOD_SAVING_RATE = 20;

// ไม่เรียก Claude เพื่อไม่เสียค่าใช้จ่ายและให้ทัน timeout 30 วินาทีของ cron-job.org
function pickMonthlyComment(summary, monthName) {
  const top = summary.topExpenses[0];
  const topShare = top && summary.expenseTotal > 0 ? Math.round((top.total / summary.expenseTotal) * 100) : 0;
  if (summary.incomeTotal === 0) {
    return `เดือน${monthName}ยังไม่มีรายรับเลย ถ้ามีเงินเข้าอย่าลืมจดด้วยนะ ยอดคงเหลือจะได้ตรง`;
  }
  if (summary.net < 0) {
    return `เดือน${monthName}จ่ายเกินรับไป ${formatAmount(-summary.net)} บาท ตัวหนักสุดคือ${top.category} (${topShare}%) เดือนหน้าลองคุมหมวดนี้ดูนะ`;
  }
  if (summary.expenseTotal === 0) {
    return `เดือน${monthName}ไม่มีรายจ่ายเลย เก็บได้เต็มๆ ${formatAmount(summary.net)} บาท`;
  }
  const saved = formatAmount(summary.net);
  if (topShare >= TOP_SHARE_WARNING) {
    return `เก็บได้ ${saved} บาท แต่${top.category}กินไป ${topShare}% ของรายจ่ายทั้งเดือน ลองตั้งงบหมวดนี้ดูไหม`;
  }
  // คิดเป็นสตางค์จำนวนเต็มก่อนหาร ไม่งั้นทศนิยมของ JavaScript ทำให้ปัดลงหาย 1%
  const rate = Math.floor((Math.round(summary.net * 100) * 100) / Math.round(summary.incomeTotal * 100));
  if (rate >= GOOD_SAVING_RATE) {
    return `เก็บได้ ${saved} บาท (${rate}% ของรายรับ) เยี่ยมเลย ทำแบบนี้ต่อไปนะ`;
  }
  return `เก็บได้ ${saved} บาท (${rate}% ของรายรับ) เดือนหน้าลองเก็บให้ถึง ${GOOD_SAVING_RATE}% ดูนะ`;
}

function buildEmptyMonthText({ monthName, nextMonthName }) {
  return `เดือน${monthName}ยังไม่ได้จดรายการเลยนะ เดือน${nextMonthName}เริ่มใหม่กัน พิมพ์ เช่น "กาแฟ 60" ส่งมาได้เลย`;
}

module.exports = { pickMonthlyComment, buildEmptyMonthText };

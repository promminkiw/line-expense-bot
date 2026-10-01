const { TYPE_LABELS } = require('../utils/type-labels');

function formatAmount(amount) {
  return amount.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function formatDate(isoDate) {
  const [, month, day] = isoDate.split('-');
  return `${day}/${month}`;
}

function formatItem(item) {
  const parts = [
    TYPE_LABELS[item.type],
    item.category,
    `${formatAmount(item.amount)} บาท`,
    formatDate(item.date),
  ];
  if (item.note) {
    parts.push(item.note);
  }
  return `- ${parts.join(' | ')}`;
}

function formatSavedReply(items) {
  return ['บันทึกแล้ว', ...items.map(formatItem)].join('\n');
}

function formatSlipConfirmReply(items, { dateAssumed = false, extrasNote = '', slipTotal = 0, truncatedTo = 0, skippedCount = 0 } = {}) {
  const header = items.length > 1 ? `อ่านสลิปได้ ${items.length} รายการ` : 'อ่านสลิปได้ดังนี้';
  const lines = [header, ...items.map(formatItem)];
  if (extrasNote) {
    lines.push(`หมายเหตุ: ${extrasNote} (ไม่ได้บันทึก)`);
    // ยอดสุทธิจากสลิปเองไม่ใช่ยอดที่ระบบรวม แสดงเฉพาะตอนมีหมายเหตุเพื่อให้เห็นว่าผลรวมอาจไม่ตรง
    if (slipTotal > 0) {
      lines.push(`ยอดสุทธิบนสลิป ${formatAmount(slipTotal)} บาท`);
    }
  }
  if (skippedCount > 0) {
    lines.push(`ข้าม ${skippedCount} รายการที่อ่านราคาไม่ได้`);
  }
  if (truncatedTo > 0) {
    lines.push(`มีสินค้ามากกว่า ${truncatedTo} รายการ บันทึกเฉพาะ ${truncatedTo} รายการแรก`);
  }
  if (dateAssumed) {
    lines.push('อ่านวันที่ไม่ได้ จึงใช้วันนี้');
  }
  lines.push('กดบันทึกเพื่อยืนยัน (หมดเวลาใน 10 นาที)');
  return lines.join('\n');
}

module.exports = { formatSavedReply, formatSlipConfirmReply, formatAmount };

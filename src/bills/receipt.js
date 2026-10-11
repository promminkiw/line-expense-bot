const { createConcurrencyLimit } = require('../slip/concurrency-limit');
const { detectMediaType } = require('../slip/download-image');

// รูปแต่ละใบกินความจำหลายสิบ MB ตอนปรับและอ่าน จึงจำกัดจำนวนที่อ่านพร้อมกันแยกจากสลิปในแชต
const MAX_CONCURRENT_RECEIPTS = 2;

// ใช้ตัวอ่านสลิปเดิมเพราะหายอดสุทธิของใบเสร็จอยู่แล้ว แต่คืนแค่ยอด ไม่เก็บรูป
function createReceiptReader({ parseSlip, maxConcurrent = MAX_CONCURRENT_RECEIPTS, logger = console }) {
  const runLimited = createConcurrencyLimit(maxConcurrent);

  return async function readReceipt(body) {
    const mediaType = Buffer.isBuffer(body) ? detectMediaType(body) : null;
    if (!mediaType) {
      return { status: 'unsupported' };
    }
    const slip = await runLimited(() => parseSlip({ data: body.toString('base64'), mediaType }));
    if (slip.status !== 'ok') {
      // log เฉพาะเหตุผล ไม่ใส่รูปหรือข้อความในรูป
      logger.info('Receipt unreadable', { reason: slip.reason, rejectionKind: slip.rejectionKind });
      return { status: 'unreadable' };
    }
    return { status: 'ok', amount: slip.items[0].amount };
  };
}

module.exports = { createReceiptReader, MAX_CONCURRENT_RECEIPTS };

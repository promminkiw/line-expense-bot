const { createConcurrencyLimit } = require('../slip/concurrency-limit');
const { buildSlipConfirmFlex } = require('../parser/saved-flex');
const { toTransactionRows } = require('../db/transaction-rows');
const {
  RATE_LIMITED_REPLY,
  SLIP_UNREADABLE_REPLY,
  SLIP_TOO_LARGE_REPLY,
  SLIP_UNSUPPORTED_REPLY,
  SLIP_EXPIRED_REPLY,
  SLIP_CANCELLED_REPLY,
  buildSavedReply,
  buildSlipQuickReply,
} = require('./replies');

// เกินเวลานี้ปุ่มบันทึกของสลิปใช้ไม่ได้ กันกดสลิปเก่าค้างแชตโดยไม่ตั้งใจ
const SLIP_TTL_MS = 10 * 60 * 1000;
// รูปแต่ละใบกินความจำประมาณ 20-25 MB ตอนโหลดและอ่าน จำกัดจำนวนที่ทำพร้อมกันกันหน่วยความจำหมด
const MAX_CONCURRENT_SLIPS = 3;

function createSlipHandlers({ repository, users, allowRequest, downloadImage, parseSlip, logger, now, urls, support }) {
  const { buildEditUrls } = urls;
  const { checkBudgets } = support;
  const runSlipTask = createConcurrencyLimit(MAX_CONCURRENT_SLIPS);

  // ล้างของหมดอายุเป็นแค่การดูแลตาราง ถ้าพังยังอ่านสลิปต่อได้
  async function clearExpiredSlips(userId) {
    try {
      await repository.deleteExpiredPendingSlips(userId, new Date(now() - SLIP_TTL_MS).toISOString());
    } catch (err) {
      logger.error('Failed to delete expired pending slips', { userId }, err);
    }
  }

  async function handleImage(event, lineUserId) {
    const userId = await users.ensureUser(lineUserId);
    // LINE ส่ง event เดิมซ้ำได้ จึงจอง event ก่อนเรียก Claude เพื่อไม่ให้ตอบและเสียค่าอ่านซ้ำ
    const claimed = await repository.claimEvent(event.webhookEventId, userId);
    if (!claimed) {
      return null;
    }
    if (!allowRequest(lineUserId)) {
      return { text: RATE_LIMITED_REPLY };
    }
    const outcome = await runSlipTask(async () => {
      const image = await downloadImage(event.message.id);
      if (image.status === 'too_large') {
        return { reply: { text: SLIP_TOO_LARGE_REPLY } };
      }
      if (image.status !== 'ok') {
        return { reply: { text: SLIP_UNSUPPORTED_REPLY } };
      }
      return { slip: await parseSlip({ data: image.data, mediaType: image.mediaType }) };
    });
    if (outcome.reply) {
      return outcome.reply;
    }
    const { slip } = outcome;
    if (slip.status !== 'ok') {
      // log เฉพาะเหตุผลและตัวเลข ไม่ใส่รูปหรือชื่อสินค้า
      logger.info('Slip unreadable', {
        userId,
        reason: slip.reason,
        itemCount: slip.itemCount,
        rejectedAmounts: slip.rejectedAmounts,
        rejectionKind: slip.rejectionKind,
      });
      return { text: SLIP_UNREADABLE_REPLY };
    }
    await clearExpiredSlips(userId);
    const slipId = await repository.savePendingSlip(userId, event.webhookEventId, slip.items);
    return {
      flex: buildSlipConfirmFlex(slip.items, {
        dateAssumed: slip.dateAssumed,
        buttons: buildSlipQuickReply(slipId),
      }),
    };
  }

  // ลบแถวพร้อมคืนค่าในคำสั่งเดียว ใครกดก่อนได้แถว คนกดซ้ำได้ null
  async function claimSlip(params, userId) {
    return repository.claimPendingSlip(userId, params.get('slip'), new Date(now() - SLIP_TTL_MS).toISOString());
  }

  // LINE ส่ง postback เดิมซ้ำได้ ถ้าไม่จองก่อนจะได้ข้อความหมดเวลาทั้งที่บันทึกสำเร็จแล้ว
  async function claimPostback(event, userId) {
    return repository.claimEvent(event.webhookEventId, userId);
  }

  async function handleSlipSave(event, params, lineUserId) {
    const userId = await users.ensureUser(lineUserId);
    if (!(await claimPostback(event, userId))) {
      return null;
    }
    // โหลดหมวดก่อนจองสลิป ถ้าโหลดพังสลิปที่รอยืนยันยังอยู่ให้กดใหม่ได้
    const categoryIds = await users.loadCategoryIds(userId);
    const slip = await claimSlip(params, userId);
    if (!slip) {
      return { text: SLIP_EXPIRED_REPLY };
    }
    const rows = toTransactionRows({
      items: slip.items,
      categoryIds,
      userId,
      webhookEventId: slip.webhookEventId,
      source: 'slip',
    });
    const ids = await repository.insertTransactions(rows);
    const budget = await checkBudgets(userId, rows);
    return { flex: buildSavedReply(slip.items, budget, slip.webhookEventId, buildEditUrls(rows, ids)) };
  }

  async function handleSlipCancel(event, params, lineUserId) {
    const userId = await users.ensureUser(lineUserId);
    if (!(await claimPostback(event, userId))) {
      return null;
    }
    const slip = await claimSlip(params, userId);
    return { text: slip ? SLIP_CANCELLED_REPLY : SLIP_EXPIRED_REPLY };
  }

  return { handleImage, handleSlipSave, handleSlipCancel };
}

module.exports = { createSlipHandlers, SLIP_TTL_MS };

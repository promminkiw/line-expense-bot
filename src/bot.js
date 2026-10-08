const { createConcurrencyLimit } = require('./slip/concurrency-limit');
const { buildSavedFlex, buildSlipConfirmFlex } = require('./parser/saved-flex');
const { toTransactionRows } = require('./db/transaction-rows');
const { parseSummaryCommand } = require('./summary/command');
const { getPeriodRange } = require('./summary/period');
const { buildSummary } = require('./summary/summary');
const { buildSummaryFlex } = require('./summary/flex');
const { getFixedReply } = require('./menu/fixed-replies');
const { budgetMonths, findBudgetAlerts } = require('./budget/alerts');

const SYSTEM_ERROR_REPLY = 'ขออภัยส่งข้อความไม่สำเร็จเนื่องจากระบบมีปัญหา รบกวนมาใช้บริการใหม่ภายหลัง';
const SLOW_PROCESSING_REPLY =
  'ระบบตอบช้ากว่าปกติ ถ้าจดรายการหรือกดบันทึกไว้ รายการอาจถูกบันทึกแล้ว ตรวจในหน้าเว็บก่อนส่งซ้ำ ถ้าส่งรูปสลิป ลองส่งใหม่อีกครั้ง';
// LINE ไม่ระบุอายุของ reply token ที่แน่นอน ตอบก่อนราว 1 นาทีที่มักใช้ได้ ผู้ใช้จะได้ไม่เงียบหาย
const REPLY_DEADLINE_MS = 50000;
const DEADLINE_PASSED = Symbol('deadline passed');
const RATE_LIMITED_REPLY = 'ส่งข้อความถี่เกินไป รอสักครู่แล้วลองใหม่อีกครั้ง';
const UNDO_DONE_REPLY = 'ยกเลิกรายการแล้ว';
const UNDO_NOT_FOUND_REPLY = 'ไม่พบรายการที่จะยกเลิก อาจถูกยกเลิกไปแล้ว';
const SUMMARY_MENU_REPLY = 'ต้องการสรุปช่วงไหน';
const NO_ENTRIES_COMMENT = 'ยังไม่มีรายการในช่วงนี้';
const SLIP_UNREADABLE_REPLY = 'อ่านยอดจากรูปนี้ไม่ได้ ลองส่งรูปสลิปที่ชัดขึ้น หรือพิมพ์เองก็ได้ เช่น "กินข้าว 60"';
const SLIP_TOO_LARGE_REPLY = 'รูปใหญ่เกินไป (ไม่เกิน 3.5 MB) ลองส่งใหม่หรือย่อรูปก่อน';
const SLIP_UNSUPPORTED_REPLY = 'ไฟล์นี้ไม่ใช่รูปที่อ่านได้ (รองรับ JPEG, PNG, GIF, WebP)';
const SLIP_EXPIRED_REPLY = 'รายการนี้ถูกบันทึกหรือยกเลิกไปแล้ว หรือหมดเวลายืนยัน (10 นาที) ส่งสลิปใหม่ได้เลย';
const SLIP_CANCELLED_REPLY = 'ยกเลิกสลิปแล้ว ไม่ได้บันทึกรายการ';
const SLIP_SAVE_ACTION = 'slip_save';
const SLIP_CANCEL_ACTION = 'slip_cancel';
// เกินเวลานี้ปุ่มบันทึกของสลิปใช้ไม่ได้ กันกดสลิปเก่าค้างแชตโดยไม่ตั้งใจ
const SLIP_TTL_MS = 10 * 60 * 1000;
// รูปแต่ละใบกินความจำประมาณ 20-25 MB ตอนโหลดและอ่าน จำกัดจำนวนที่ทำพร้อมกันกันหน่วยความจำหมด
const MAX_CONCURRENT_SLIPS = 3;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SUMMARY_PERIOD_BUTTONS = [
  { label: 'วันนี้', text: 'สรุปวันนี้' },
  { label: 'สัปดาห์นี้', text: 'สรุปสัปดาห์นี้' },
  { label: 'เดือนนี้', text: 'สรุปเดือนนี้' },
];
const UNDO_ACTION = 'undo';
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
// LINE จำกัดความยาว uri ของ action ที่ 1000 ตัวอักษร
const MAX_URI_LENGTH = 1000;
// เกิน 10 นาทีถือว่าเป็นเรื่องใหม่ กันไม่ให้ข้อความใหม่ถูกรวมกับคำถามเก่าโดยไม่ตั้งใจ
const PENDING_TTL_MS = 10 * 60 * 1000;
// จำกัดความยาวบทสนทนาที่ส่งให้ Claude เพื่อคุมค่าใช้จ่ายเมื่อผู้ใช้ถูกถามซ้ำหลายรอบ
const MAX_HISTORY_MESSAGES = 6;

function isFromUser(event) {
  return Boolean(event.source && event.source.type === 'user' && event.source.userId);
}

function isTextMessage(event) {
  return event.type === 'message' && event.message && event.message.type === 'text';
}

function isImageMessage(event) {
  return event.type === 'message' && event.message && event.message.type === 'image';
}

function buildUndoQuickReply(webhookEventId) {
  return [
    {
      type: 'action',
      action: {
        type: 'postback',
        label: 'ยกเลิก',
        data: new URLSearchParams({ action: UNDO_ACTION, event: webhookEventId }).toString(),
        displayText: 'ยกเลิก',
      },
    },
  ];
}

function buildSavedReply(items, budget, webhookEventId, editUrls) {
  return buildSavedFlex(items, {
    alerts: budget.alerts,
    budgetCheckFailed: budget.failed,
    buttons: buildUndoQuickReply(webhookEventId),
    editUrls,
  });
}

function buildSlipQuickReply(slipId) {
  const button = (label, action) => ({
    type: 'action',
    action: {
      type: 'postback',
      label,
      data: new URLSearchParams({ action, slip: slipId }).toString(),
      displayText: label,
    },
  });
  return [button('บันทึก', SLIP_SAVE_ACTION), button('ยกเลิก', SLIP_CANCEL_ACTION)];
}

// ใช้ message action เพื่อให้กดปุ่มแล้วได้ผลเหมือนพิมพ์คำสั่งเอง (Rich Menu ขั้นที่ 5 ใช้ข้อความชุดเดียวกัน)
function buildSummaryQuickReply() {
  return SUMMARY_PERIOD_BUTTONS.map((button) => ({
    type: 'action',
    action: { type: 'message', label: button.label, text: button.text },
  }));
}

function createBot({
  replyText,
  replyFlex,
  parseMessage,
  commentSummary,
  downloadImage,
  parseSlip,
  repository,
  users,
  allowRequest,
  liffUrl,
  now = () => Date.now(),
  replyDeadlineMs = REPLY_DEADLINE_MS,
  logger = console,
}) {
  const runSlipTask = createConcurrencyLimit(MAX_CONCURRENT_SLIPS);

  // บริบทเป็นตัวช่วย ถ้าอ่านไม่ได้ให้ถือว่าเป็นเรื่องใหม่ ดีกว่าตอบว่าระบบมีปัญหา
  async function loadHistory(userId) {
    let pending;
    try {
      pending = await repository.getPendingClarification(userId);
    } catch (err) {
      logger.error('Failed to load pending clarification', { userId }, err);
      return { messages: [], loadFailed: true };
    }
    if (!pending || now() - Date.parse(pending.updatedAt) > PENDING_TTL_MS) {
      return { messages: [], loadFailed: false };
    }
    return { messages: pending.messages, loadFailed: false };
  }

  // การจำบริบทเป็นตัวช่วย ถ้า DB พังตรงนี้ยังตอบผู้ใช้ตามปกติได้
  async function rememberConversation(userId, messages) {
    try {
      await repository.savePendingClarification(userId, messages);
    } catch (err) {
      logger.error('Failed to save pending clarification', { userId }, err);
    }
  }

  async function forgetConversation(userId) {
    try {
      await repository.clearPendingClarification(userId);
    } catch (err) {
      logger.error('Failed to clear pending clarification', { userId }, err);
    }
  }

  // เช็กไม่ได้ต้องบอกผู้ใช้ เพราะเตือนแค่ตอนข้ามเส้น ถ้าเงียบจะพลาดเตือนของเดือนนั้น
  // ลิงก์เข้าหน้าแก้ไขรายการ: ใส่วันที่ไปด้วยเพื่อให้หน้าเว็บเปิดเดือนที่ถูกต้องก่อนหารายการ
  function buildEditUrls(rows, ids) {
    if (!liffUrl || !Array.isArray(ids) || ids.length !== rows.length) {
      return undefined;
    }
    return ids.map((id, index) => buildEditUrl(id, rows[index].occurred_on));
  }

  function buildEditUrl(id, date) {
    try {
      const url = new URL(liffUrl);
      url.searchParams.set('tx', String(id));
      if (ISO_DATE_PATTERN.test(date)) url.searchParams.set('d', date);
      const text = url.toString();
      return url.protocol === 'https:' && text.length <= MAX_URI_LENGTH ? text : undefined;
    } catch {
      return undefined;
    }
  }

  async function checkBudgets(userId, rows) {
    const months = budgetMonths(rows);
    if (months.length === 0) {
      return { alerts: [], failed: false };
    }
    try {
      const statuses = await Promise.all(months.map((month) => repository.getBudgetStatus(userId, month)));
      const statusByMonth = new Map(months.map((month, index) => [month, statuses[index]]));
      return { alerts: findBudgetAlerts(rows, statusByMonth), failed: false };
    } catch (err) {
      logger.error('Failed to check budgets', { userId }, err);
      return { alerts: [], failed: true };
    }
  }

  async function commentOn(summary, userId) {
    if (summary.entryCount === 0) {
      return NO_ENTRIES_COMMENT;
    }
    try {
      return await commentSummary(summary);
    } catch (err) {
      // คำอธิบายเป็นส่วนเสริม ยอดจาก SQL ยังส่งได้แม้ Claude ตอบไม่สำเร็จ
      logger.error('Failed to comment summary', { userId }, err);
      return '';
    }
  }

  async function handleSummary(command, userId) {
    if (command === 'menu') {
      return { text: SUMMARY_MENU_REPLY, quickReply: buildSummaryQuickReply() };
    }
    const range = getPeriodRange(command, new Date(now()));
    const rows = await repository.summarizeTransactions(userId, range.from, range.to);
    const summary = buildSummary(rows, range.label);
    const comment = await commentOn(summary, userId);
    return { flex: buildSummaryFlex(summary, comment) };
  }

  async function handleText(event, lineUserId, deadline) {
    const userId = await users.ensureUser(lineUserId);
    // LINE ส่ง event เดิมซ้ำได้ (redelivery) จึงจอง event ก่อนเพื่อไม่ให้บันทึกซ้ำ
    const claimed = await repository.claimEvent(event.webhookEventId, userId);
    if (!claimed) {
      return null;
    }
    // ปุ่มเมนูตอบข้อความคงที่ ไม่เรียก Claude จึงไม่ต้องนับ rate limit
    const fixedReply = getFixedReply(event.message.text, { liffUrl });
    if (fixedReply) {
      return { text: fixedReply };
    }
    const summaryCommand = parseSummaryCommand(event.message.text);
    // เมนูสรุปเป็นแค่ปุ่มเลือกช่วงเวลา ไม่เรียก Claude จึงไม่นับ rate limit
    if (summaryCommand === 'menu') {
      return handleSummary(summaryCommand, userId);
    }
    if (!allowRequest(lineUserId)) {
      return { text: RATE_LIMITED_REPLY };
    }
    if (summaryCommand) {
      return handleSummary(summaryCommand, userId);
    }
    const { messages: history, loadFailed } = await loadHistory(userId);
    const result = await parseMessage(event.message.text, history);
    if (result.status === 'clarify') {
      // ผู้ใช้ไม่เคยเห็นคำถามนี้ จึงไม่จำไว้เป็นบริบทของข้อความถัดไป
      if (deadline.passed) {
        return null;
      }
      const messages = [
        ...history,
        { role: 'user', text: event.message.text },
        { role: 'assistant', text: result.question },
      ].slice(-MAX_HISTORY_MESSAGES);
      await rememberConversation(userId, messages);
      return { text: result.question };
    }
    const categoryIds = await users.loadCategoryIds(userId);
    const rows = toTransactionRows({
      items: result.items,
      categoryIds,
      userId,
      webhookEventId: event.webhookEventId,
    });
    const ids = await repository.insertTransactions(rows);
    // ล้างหลังบันทึกสำเร็จ ถ้าบันทึกพังผู้ใช้ส่งคำตอบซ้ำได้โดยบริบทยังอยู่
    // อ่านบริบทไม่ได้อาจมีแถวค้างอยู่ จึงล้างไว้ก่อนกันไปปนข้อความถัดไป
    if (history.length > 0 || loadFailed) {
      await forgetConversation(userId);
    }
    const budget = await checkBudgets(userId, rows);
    return { flex: buildSavedReply(result.items, budget, event.webhookEventId, buildEditUrls(rows, ids)) };
  }

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

  async function handleUndo(params, lineUserId) {
    const webhookEventId = params.get('event');
    if (!webhookEventId) {
      return null;
    }
    const userId = await users.ensureUser(lineUserId);
    const deleted = await repository.deleteTransactionsByEvent(userId, webhookEventId);
    return { text: deleted > 0 ? UNDO_DONE_REPLY : UNDO_NOT_FOUND_REPLY };
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

  async function handlePostback(event, lineUserId) {
    const params = new URLSearchParams(event.postback.data);
    const action = params.get('action');
    if (action === UNDO_ACTION) {
      return handleUndo(params, lineUserId);
    }
    if (action === SLIP_SAVE_ACTION || action === SLIP_CANCEL_ACTION) {
      // id ที่ไม่ใช่ UUID ทำให้ Postgres error จึงไม่ส่งไปถึง DB
      if (!UUID_PATTERN.test(params.get('slip') || '')) {
        return null;
      }
      return action === SLIP_SAVE_ACTION
        ? handleSlipSave(event, params, lineUserId)
        : handleSlipCancel(event, params, lineUserId);
    }
    return null;
  }

  async function buildReply(event, lineUserId, deadline) {
    if (event.type === 'follow') {
      await users.ensureUser(lineUserId);
      return null;
    }
    if (isTextMessage(event)) {
      return handleText(event, lineUserId, deadline);
    }
    if (isImageMessage(event)) {
      return handleImage(event, lineUserId);
    }
    if (event.type === 'postback') {
      return handlePostback(event, lineUserId);
    }
    return null;
  }

  // งานที่ค้างยังทำต่อจนจบ ผลที่มาช้าถูกทิ้งเพราะ reply token อาจหมดอายุแล้ว
  async function buildReplyBeforeDeadline(event, lineUserId) {
    const deadlineState = { passed: false };
    const work = buildReply(event, lineUserId, deadlineState);
    let timer;
    const deadline = new Promise((resolve) => {
      timer = setTimeout(() => {
        deadlineState.passed = true;
        resolve(DEADLINE_PASSED);
      }, replyDeadlineMs);
    });
    try {
      const result = await Promise.race([work, deadline]);
      if (result !== DEADLINE_PASSED) {
        return result;
      }
    } finally {
      clearTimeout(timer);
    }
    const context = { lineUserId, eventType: event.type };
    logger.error('Event passed the reply deadline', context);
    work.then(
      () => logger.info('Dropped a reply that finished after the deadline', context),
      (err) => logger.error('Failed to process event after the reply deadline', context, err)
    );
    return event.type === 'follow' ? null : { text: SLOW_PROCESSING_REPLY };
  }

  async function handleEvent(event) {
    // ข้อมูลการเงินเป็นเรื่องส่วนตัว ห้ามตอบลงกลุ่มหรือห้องแชต
    if (!isFromUser(event)) {
      return;
    }
    const lineUserId = event.source.userId;
    let reply;
    try {
      reply = await buildReplyBeforeDeadline(event, lineUserId);
    } catch (err) {
      logger.error('Failed to process event', { lineUserId, eventType: event.type }, err);
      reply = event.type === 'follow' ? null : { text: SYSTEM_ERROR_REPLY };
    }
    if (reply) {
      try {
        if (reply.flex) {
          await replyFlex(event.replyToken, reply.flex);
        } else {
          await replyText(event.replyToken, reply.text, reply.quickReply);
        }
      } catch (err) {
        logger.error('Failed to send reply', { lineUserId, eventType: event.type }, err);
      }
    }
  }

  async function handleEvents(events) {
    // ใช้ allSettled เพื่อ log error ของทุก event ที่พัง (Promise.all จะเก็บแค่ error แรก)
    const results = await Promise.allSettled(events.map(handleEvent));
    for (const result of results) {
      if (result.status === 'rejected') {
        logger.error('Failed to handle event', result.reason);
      }
    }
  }

  return { handleEvent, handleEvents };
}

module.exports = {
  createBot,
  SYSTEM_ERROR_REPLY,
  SLOW_PROCESSING_REPLY,
  REPLY_DEADLINE_MS,
  RATE_LIMITED_REPLY,
  UNDO_DONE_REPLY,
  UNDO_NOT_FOUND_REPLY,
  SUMMARY_MENU_REPLY,
  NO_ENTRIES_COMMENT,
  SLIP_UNREADABLE_REPLY,
  SLIP_TOO_LARGE_REPLY,
  SLIP_UNSUPPORTED_REPLY,
  SLIP_EXPIRED_REPLY,
  SLIP_CANCELLED_REPLY,
  SLIP_TTL_MS,
  buildUndoQuickReply,
};

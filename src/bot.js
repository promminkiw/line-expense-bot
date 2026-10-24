const { createConcurrencyLimit } = require('./slip/concurrency-limit');
const { buildSlipConfirmFlex } = require('./parser/saved-flex');
const { toTransactionRows } = require('./db/transaction-rows');
const { parseSummaryCommand } = require('./summary/command');
const { getPeriodRange } = require('./summary/period');
const { buildSummary } = require('./summary/summary');
const { buildSummaryFlex } = require('./summary/flex');
const { getFixedReply, getHelpReply } = require('./menu/fixed-replies');
const { BILL_CONFIRM_ACTION, BILL_DECLINE_ACTION } = require('./bills/flex');
const { formatAmount } = require('./parser/format-reply');
const { looksLikeQuestion } = require('./query/parse-question');
const { buildTotalsFlex } = require('./query/answer-flex');
const { buildSavingFlex } = require('./goals/flex');
const { DEFAULT_WALLET_NAME, walletChoices, walletIdsByName } = require('./wallets/wallets');
const {
  parseSavingCommand,
  hasOpenGoal,
  findOpenGoal,
  formatGoalNotFoundReply,
  formatGoalNameMissingReply,
  SAVING_AMOUNT_REPLY,
  GOAL_GONE_REPLY,
} = require('./goals/chat');
const { toBangkokDateString } = require('./utils/date');
const { createUrlBuilders } = require('./chat/urls');
const { createSupport } = require('./chat/support');
const {
  SYSTEM_ERROR_REPLY,
  SLOW_PROCESSING_REPLY,
  RATE_LIMITED_REPLY,
  QUESTION_FAILED_REPLY,
  UNDO_DONE_REPLY,
  UNDO_NOT_FOUND_REPLY,
  UNDO_SAVING_DONE_REPLY,
  UNDO_SAVING_NOT_FOUND_REPLY,
  BILL_REPLIES,
  SUMMARY_MENU_REPLY,
  NO_ENTRIES_COMMENT,
  SLIP_UNREADABLE_REPLY,
  SLIP_TOO_LARGE_REPLY,
  SLIP_UNSUPPORTED_REPLY,
  SLIP_EXPIRED_REPLY,
  SLIP_CANCELLED_REPLY,
  SLIP_SAVE_ACTION,
  SLIP_CANCEL_ACTION,
  UNDO_ACTION,
  UNDO_SAVING_ACTION,
  buildUndoQuickReply,
  buildUndoSavingQuickReply,
  buildSavedReply,
  buildSlipQuickReply,
  buildSummaryQuickReply,
} = require('./chat/replies');

// LINE ไม่ระบุอายุของ reply token ที่แน่นอน ตอบก่อนราว 1 นาทีที่มักใช้ได้ ผู้ใช้จะได้ไม่เงียบหาย
const REPLY_DEADLINE_MS = 50000;
const DEADLINE_PASSED = Symbol('deadline passed');
// เกินเวลานี้ปุ่มบันทึกของสลิปใช้ไม่ได้ กันกดสลิปเก่าค้างแชตโดยไม่ตั้งใจ
const SLIP_TTL_MS = 10 * 60 * 1000;
// รูปแต่ละใบกินความจำประมาณ 20-25 MB ตอนโหลดและอ่าน จำกัดจำนวนที่ทำพร้อมกันกันหน่วยความจำหมด
const MAX_CONCURRENT_SLIPS = 3;
const { UUID_PATTERN } = require('./utils/uuid');
// จำกัดความยาวบทสนทนาที่ส่งให้ Claude เพื่อคุมค่าใช้จ่ายเมื่อผู้ใช้ถูกถามซ้ำหลายรอบ
const MAX_HISTORY_MESSAGES = 6;

function isFromUser(event) {
  return Boolean(event.source && event.source.type === 'user' && event.source.userId);
}

function isTextMessage(event) {
  return event.type === 'message' && event.message && event.message.type === 'text';
}

// follow และ unfollow ไม่ต้องตอบ และ unfollow ไม่มี replyToken จึงห้ามส่งข้อความระบบมีปัญหาหรือตอบช้า
function isSilentEvent(event) {
  return event.type === 'follow' || event.type === 'unfollow';
}

function isImageMessage(event) {
  return event.type === 'message' && event.message && event.message.type === 'image';
}

function createBot({
  replyText,
  replyFlex,
  parseMessage,
  parseQuestion,
  commentSummary,
  downloadImage,
  parseSlip,
  repository,
  users,
  bills,
  allowRequest,
  liffUrl,
  now = () => Date.now(),
  replyDeadlineMs = REPLY_DEADLINE_MS,
  logger = console,
}) {
  const runSlipTask = createConcurrencyLimit(MAX_CONCURRENT_SLIPS);

  const deps = { parseMessage, parseQuestion, commentSummary, downloadImage, parseSlip, repository, users, bills, allowRequest, liffUrl, now, logger };
  const support = createSupport(deps);
  const {
    loadHistory,
    rememberConversation,
    forgetConversation,
    loadTextCategories,
    loadQuestionCategories,
    loadTextWallets,
    loadQuestionWallets,
    checkBudgets,
    commentOn,
  } = support;

  // ไม่ส่งต่อไปบันทึกรายการเมื่อพัง เพราะคำถามที่มีวันที่ เช่น "1-15 ต.ค. ใช้ไปเท่าไหร่" อาจกลายเป็นรายการ 15 บาท
  async function answerQuestion(text, userId) {
    try {
      const [categoryNames, walletNames] = await Promise.all([loadQuestionCategories(userId), loadQuestionWallets(userId)]);
      const question = await parseQuestion(text, categoryNames, walletNames);
      if (!question.isQuestion) {
        return null;
      }
      const rows = await repository.queryTotals(userId, question);
      return { flex: buildTotalsFlex(question, rows, { listUrl: buildTotalsListUrl(question) }) };
    } catch (err) {
      logger.error('Failed to answer totals question', { userId }, err);
      return { text: QUESTION_FAILED_REPLY };
    }
  }

  const { buildEditUrls, buildGoalsUrl, buildTotalsListUrl } = createUrlBuilders({ liffUrl });

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

  // คืน null เมื่อไม่มีเป้าที่เปิดอยู่ ให้ handleText ทำทางเดิมต่อ เพราะคนที่ไม่ใช้เป้าอาจพิมพ์ "ออมสิน 1000" เป็นรายการ
  async function handleSaving(command, userId, webhookEventId) {
    const goals = await repository.listGoals(userId);
    if (!hasOpenGoal(goals)) {
      return null;
    }
    if (command.amount === null) {
      return { text: SAVING_AMOUNT_REPLY };
    }
    if (!command.name) {
      return { text: formatGoalNameMissingReply(goals) };
    }
    const goal = findOpenGoal(goals, command.name);
    if (!goal) {
      return { text: formatGoalNotFoundReply(command.name, goals) };
    }
    const result = await repository.addGoalContribution(userId, goal.id, {
      amount: command.amount,
      occurredOn: toBangkokDateString(new Date(now())),
      lineEventId: webhookEventId,
    });
    // เป้าอาจถูกปิดจากหน้าเว็บระหว่างอ่านรายชื่อเป้ากับตอนบันทึก
    if (result.status !== 'ok') {
      return { text: GOAL_GONE_REPLY };
    }
    return {
      flex: buildSavingFlex(
        { name: goal.name, amount: command.amount, saved: result.saved, target: goal.targetAmount },
        { buttons: buildUndoSavingQuickReply(webhookEventId), goalsUrl: buildGoalsUrl() }
      ),
    };
  }

  async function handleText(event, lineUserId, deadline) {
    const userId = await users.ensureUser(lineUserId);
    // LINE ส่ง event เดิมซ้ำได้ (redelivery) จึงจอง event ก่อนเพื่อไม่ให้บันทึกซ้ำ
    const claimed = await repository.claimEvent(event.webhookEventId, userId);
    if (!claimed) {
      return null;
    }
    // คำสั่งออมไม่เรียก Claude จึงไม่นับ rate limit และต้องมาก่อนทางบันทึกรายการ ไม่งั้นยอดออมจะกลายเป็นรายจ่าย
    const savingCommand = parseSavingCommand(event.message.text);
    if (savingCommand) {
      const savingReply = await handleSaving(savingCommand, userId, event.webhookEventId);
      if (savingReply) {
        return savingReply;
      }
    }
    // ปุ่มเมนูตอบข้อความคงที่ ไม่เรียก Claude จึงไม่ต้องนับ rate limit
    const helpReply = getHelpReply(event.message.text);
    if (helpReply) {
      return helpReply;
    }
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
    // อ่านไปพร้อมกับบริบทแชต สองตัวนี้ไม่ throw เพราะจับ error แล้วใช้ค่าสำรองเอง
    const catalogue = Promise.all([loadTextCategories(userId), loadTextWallets(userId)]);
    const { messages: history, loadFailed } = await loadHistory(userId);
    // ระหว่างที่บอทถามกลับ ข้อความถัดไปคือคำตอบของรายการเดิม จึงไม่ตีความเป็นคำถามยอด
    if (history.length === 0 && looksLikeQuestion(event.message.text)) {
      const answer = await answerQuestion(event.message.text, userId);
      if (answer) {
        return answer;
      }
    }
    const [textCategories, { wallets, failed: walletsFailed }] = await catalogue;
    const choices = walletChoices(wallets);
    const result = await parseMessage(event.message.text, history, textCategories, choices);
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
    // หมวดที่ซ่อนต้องตกไป อื่นๆ เพราะตอนโหลดหมวดไม่ได้ Claude เลือกจากหมวดเริ่มต้นซึ่งอาจถูกซ่อนไว้
    const categoryIds = await users.loadCategoryIds(userId, { visibleOnly: true });
    // ผู้ใช้หลายกระเป๋าเห็นกระเป๋าของทุกรายการบนการ์ด ค่าว่างคือกระเป๋าตั้งต้น
    const items =
      choices.length > 0 ? result.items.map((item) => ({ ...item, wallet: item.wallet || DEFAULT_WALLET_NAME })) : result.items;
    const rows = toTransactionRows({
      items,
      categoryIds,
      userId,
      webhookEventId: event.webhookEventId,
      // ผู้ใช้กระเป๋าเดียวไม่ส่ง wallet_id เลย จึงยังบันทึกได้แม้อ่านกระเป๋าไม่ได้
      walletIds: choices.length > 0 ? walletIdsByName(wallets) : undefined,
    });
    const ids = await repository.insertTransactions(rows);
    // ล้างหลังบันทึกสำเร็จ ถ้าบันทึกพังผู้ใช้ส่งคำตอบซ้ำได้โดยบริบทยังอยู่
    // อ่านบริบทไม่ได้อาจมีแถวค้างอยู่ จึงล้างไว้ก่อนกันไปปนข้อความถัดไป
    if (history.length > 0 || loadFailed) {
      await forgetConversation(userId);
    }
    const budget = await checkBudgets(userId, rows);
    return { flex: buildSavedReply(items, budget, event.webhookEventId, buildEditUrls(rows, ids), { walletReadFailed: walletsFailed }) };
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

  async function handleUndoSaving(params, lineUserId) {
    const webhookEventId = params.get('event');
    if (!webhookEventId) {
      return null;
    }
    const userId = await users.ensureUser(lineUserId);
    const deleted = await repository.deleteGoalContributionsByEvent(userId, webhookEventId);
    return { text: deleted > 0 ? UNDO_SAVING_DONE_REPLY : UNDO_SAVING_NOT_FOUND_REPLY };
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

  // การ์ดบิลอาจถูกกดซ้ำหรือกดอีกปุ่มทีหลัง จึงตอบตามสถานะที่ DB คืนมาเสมอ
  async function handleBillAnswer(params, lineUserId, answer) {
    const userId = await users.ensureUser(lineUserId);
    const result = await bills.respond(userId, params.get('bill'), answer);
    if (result.status === 'confirmed') {
      return { text: `เฮียบันทึกส่วนของคุณ ${formatAmount(result.share)} บาท ในหมวด ${result.categoryName} แล้ว` };
    }
    // การ์ดเก่าแก้ไม่ได้ เมื่อตอบไปแล้ว (เช่นในเว็บ) จึงบอกชื่อบิลให้รู้ว่าไม่ต้องกดอีก
    if (result.status === 'already_confirmed' && result.title) {
      return { text: `คุณยืนยันบิล ${result.title} ไปแล้ว (ส่วนของคุณ ${formatAmount(result.share)} บาท) ไม่ต้องกดอีก` };
    }
    if (result.status === 'already_declined' && result.title) {
      return { text: `คุณปฏิเสธบิล ${result.title} ไปแล้ว ไม่ต้องกดอีก` };
    }
    return { text: BILL_REPLIES[result.status] || BILL_REPLIES.not_found };
  }

  async function handlePostback(event, lineUserId) {
    const params = new URLSearchParams(event.postback.data);
    const action = params.get('action');
    if (action === UNDO_ACTION) {
      return handleUndo(params, lineUserId);
    }
    if (action === UNDO_SAVING_ACTION) {
      return handleUndoSaving(params, lineUserId);
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
    if (action === BILL_CONFIRM_ACTION || action === BILL_DECLINE_ACTION) {
      // id ที่ไม่ใช่ UUID ทำให้ Postgres error จึงตอบว่าไม่พบโดยไม่ส่งไปถึง DB
      if (!UUID_PATTERN.test(params.get('bill') || '')) {
        return { text: BILL_REPLIES.not_found };
      }
      return handleBillAnswer(params, lineUserId, action === BILL_CONFIRM_ACTION ? 'confirm' : 'decline');
    }
    return null;
  }

  async function buildReply(event, lineUserId, deadline) {
    if (event.type === 'follow') {
      await users.ensureUser(lineUserId);
      return null;
    }
    if (event.type === 'unfollow') {
      await repository.disableNotifications(lineUserId);
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
    return isSilentEvent(event) ? null : { text: SLOW_PROCESSING_REPLY };
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
      reply = isSilentEvent(event) ? null : { text: SYSTEM_ERROR_REPLY };
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
  QUESTION_FAILED_REPLY,
  UNDO_DONE_REPLY,
  UNDO_NOT_FOUND_REPLY,
  UNDO_SAVING_DONE_REPLY,
  UNDO_SAVING_NOT_FOUND_REPLY,
  SUMMARY_MENU_REPLY,
  NO_ENTRIES_COMMENT,
  SLIP_UNREADABLE_REPLY,
  SLIP_TOO_LARGE_REPLY,
  SLIP_UNSUPPORTED_REPLY,
  SLIP_EXPIRED_REPLY,
  SLIP_CANCELLED_REPLY,
  SLIP_TTL_MS,
  BILL_REPLIES,
  buildUndoQuickReply,
};

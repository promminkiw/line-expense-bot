const { createUrlBuilders } = require('./urls');
const { createSupport } = require('./support');
const { createSlipHandlers, SLIP_TTL_MS } = require('./slip');
const { createPostbackHandlers } = require('./postback');
const { createTextHandlers } = require('./text');
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
  buildUndoQuickReply,
} = require('./replies');

// LINE ไม่ระบุอายุของ reply token ที่แน่นอน ตอบก่อนราว 1 นาทีที่มักใช้ได้ ผู้ใช้จะได้ไม่เงียบหาย
const REPLY_DEADLINE_MS = 50000;
const DEADLINE_PASSED = Symbol('deadline passed');

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
  const deps = { parseMessage, parseQuestion, commentSummary, downloadImage, parseSlip, repository, users, bills, allowRequest, liffUrl, now, logger };
  const support = createSupport(deps);
  const urls = createUrlBuilders({ liffUrl });
  const slip = createSlipHandlers({ ...deps, urls, support });
  const { handleImage } = slip;
  const { handlePostback } = createPostbackHandlers({ ...deps, slip });
  const text = createTextHandlers({ ...deps, urls, support });
  const { handleText } = text;

  async function buildReply(event, lineUserId, deadline) {
    if (event.type === 'follow') {
      await users.ensureUser(lineUserId);
      await repository.resumeMonthlySummary(lineUserId);
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

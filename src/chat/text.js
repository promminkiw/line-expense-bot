const { toTransactionRows } = require('../db/transaction-rows');
const { parseSummaryCommand } = require('../summary/command');
const { getPeriodRange } = require('../summary/period');
const { buildSummary } = require('../summary/summary');
const { buildSummaryFlex } = require('../summary/flex');
const { getFixedReply, getHelpReply } = require('../menu/fixed-replies');
const { looksLikeQuestion } = require('../query/parse-question');
const { buildTotalsFlex } = require('../query/answer-flex');
const { buildSavingFlex } = require('../goals/flex');
const { DEFAULT_WALLET_NAME, walletChoices, walletIdsByName } = require('../wallets/wallets');
const {
  parseSavingCommand,
  hasOpenGoal,
  findOpenGoal,
  formatGoalNotFoundReply,
  formatGoalNameMissingReply,
  SAVING_AMOUNT_REPLY,
  GOAL_GONE_REPLY,
} = require('../goals/chat');
const { toBangkokDateString } = require('../utils/date');
const {
  RATE_LIMITED_REPLY,
  QUESTION_FAILED_REPLY,
  SUMMARY_MENU_REPLY,
  buildUndoSavingQuickReply,
  buildSavedReply,
  buildSummaryQuickReply,
} = require('./replies');

// จำกัดความยาวบทสนทนาที่ส่งให้ Claude เพื่อคุมค่าใช้จ่ายเมื่อผู้ใช้ถูกถามซ้ำหลายรอบ
const MAX_HISTORY_MESSAGES = 6;

function createTextHandlers({ parseMessage, parseQuestion, repository, users, allowRequest, liffUrl, now, logger, urls, support }) {
  const { buildEditUrls, buildGoalsUrl, buildTotalsListUrl } = urls;
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

  return { handleText };
}

module.exports = { createTextHandlers };

const { budgetMonths, findBudgetAlerts } = require('../budgets/alerts');
const { TEXT_CATEGORIES, DEFAULT_CATEGORIES } = require('../parser/categories');
const { walletQuestionNames } = require('../wallets/wallets');
const { NO_ENTRIES_COMMENT } = require('./replies');

// เกิน 10 นาทีถือว่าเป็นเรื่องใหม่ กันไม่ให้ข้อความใหม่ถูกรวมกับคำถามเก่าโดยไม่ตั้งใจ
const PENDING_TTL_MS = 10 * 60 * 1000;
// ใช้ถามยอดเมื่อโหลดหมวดของผู้ใช้ไม่ได้ ชื่อซ้ำ (อื่นๆ) ถูกตัดใน schema อยู่แล้ว
const DEFAULT_QUESTION_CATEGORIES = [...new Set([...DEFAULT_CATEGORIES.expense, ...DEFAULT_CATEGORIES.income])];

function createSupport({ repository, users, logger, now, commentSummary }) {
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

  // หมวดของผู้ใช้เป็นตัวช่วยเลือก ถ้าโหลดไม่ได้ใช้หมวดเริ่มต้นแทน ยังบันทึกรายการได้
  async function loadTextCategories(userId) {
    try {
      return await users.loadTextCategories(userId);
    } catch (err) {
      logger.error('Failed to load text categories', { userId }, err);
      return TEXT_CATEGORIES;
    }
  }

  // ผู้ใช้ถามถึงรายการเก่าได้ จึงใช้ทุกหมวดรวมที่ซ่อน ถ้าโหลดไม่ได้ยังตอบด้วยหมวดเริ่มต้นได้
  async function loadQuestionCategories(userId) {
    try {
      const categories = await repository.listCategories(userId);
      return [...new Set(categories.map((category) => category.name))];
    } catch (err) {
      logger.error('Failed to load question categories', { userId }, err);
      return DEFAULT_QUESTION_CATEGORIES;
    }
  }

  // กระเป๋าเป็นตัวช่วยเลือก ถ้าโหลดไม่ได้ทุกรายการลงกระเป๋าตั้งต้น ยังบันทึกได้
  async function loadTextWallets(userId) {
    try {
      return { wallets: await users.loadWallets(userId), failed: false };
    } catch (err) {
      logger.error('Failed to load wallets', { userId }, err);
      return { wallets: [], failed: true };
    }
  }

  // ผู้ใช้ถามถึงรายการเก่าได้ จึงใช้ทุกกระเป๋ารวมที่ซ่อน ถ้าโหลดไม่ได้ยังถามโดยไม่แยกกระเป๋าได้
  async function loadQuestionWallets(userId) {
    try {
      return walletQuestionNames(await repository.listWallets(userId));
    } catch (err) {
      logger.error('Failed to load question wallets', { userId }, err);
      return [];
    }
  }

  // เช็กไม่ได้ต้องบอกผู้ใช้ เพราะเตือนแค่ตอนข้ามเส้น ถ้าเงียบจะพลาดเตือนของเดือนนั้น
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

  return {
    loadHistory,
    rememberConversation,
    forgetConversation,
    loadTextCategories,
    loadQuestionCategories,
    loadTextWallets,
    loadQuestionWallets,
    checkBudgets,
    commentOn,
  };
}

module.exports = { createSupport };

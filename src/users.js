const { DEFAULT_CATEGORIES } = require('./parser/categories');
const { categoryKey } = require('./db/transaction-rows');

// getProfile ของ LINE SDK ไม่มี timeout ถ้าค้างจะกินเวลาของ reply token
const PROFILE_TIMEOUT_MS = 3000;
const DEFAULT_CATEGORY_KEYS = Object.entries(DEFAULT_CATEGORIES).flatMap(([type, names]) =>
  names.map((name) => categoryKey(type, name))
);

function createUserService({ repository, getDisplayName, logger = console, profileTimeoutMs = PROFILE_TIMEOUT_MS }) {
  async function fetchDisplayName(lineUserId) {
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('LINE profile request timed out')), profileTimeoutMs);
    });
    try {
      return await Promise.race([getDisplayName(lineUserId), timeout]);
    } catch (err) {
      // ชื่อเป็นแค่ข้อมูลประกอบ ดึงไม่ได้ก็ยังสมัครผู้ใช้ต่อได้
      logger.error('Failed to fetch LINE profile', { lineUserId }, err);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  async function ensureUser(lineUserId) {
    const existingId = await repository.findUserIdByLineId(lineUserId);
    if (existingId) {
      return existingId;
    }
    const displayName = await fetchDisplayName(lineUserId);
    const userId = await repository.createUser({ lineUserId, displayName });
    await repository.seedDefaultCategories(userId);
    return userId;
  }

  async function loadCategoryIds(userId) {
    const categoryIds = await repository.getCategoryIds(userId);
    if (DEFAULT_CATEGORY_KEYS.every((key) => categoryIds.has(key))) {
      return categoryIds;
    }
    // ซ่อมกรณีสร้างผู้ใช้สำเร็จแต่สร้างหมวดไม่สำเร็จ และเติมหมวดเริ่มต้นที่เพิ่มมาหลังผู้ใช้สมัคร
    await repository.seedDefaultCategories(userId);
    return repository.getCategoryIds(userId);
  }

  return { ensureUser, loadCategoryIds };
}

module.exports = { createUserService };

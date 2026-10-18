const { DEFAULT_CATEGORIES, SYSTEM_CATEGORIES, toTextCategories } = require('./parser/categories');
const { categoryKey } = require('./db/transaction-rows');

// getProfile ของ LINE SDK ไม่มี timeout ถ้าค้างจะกินเวลาของ reply token
const PROFILE_TIMEOUT_MS = 3000;
const SYSTEM_CATEGORY_KEYS = Object.entries(SYSTEM_CATEGORIES).flatMap(([type, names]) =>
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

  // จำใน memory ว่าตรวจชื่อของ user ไหนแล้ว จะได้ไม่เขียน DB ทุก request
  const namesChecked = new Set();

  async function fillNameFromToken(userId, tokenName) {
    if (!tokenName || namesChecked.has(userId)) {
      return;
    }
    try {
      await repository.fillMissingDisplayName(userId, tokenName);
      namesChecked.add(userId);
    } catch (err) {
      // ชื่อเป็นแค่ข้อมูลประกอบ เติมไม่ได้ก็ไม่ควรทำให้ request ล้ม
      logger.error('Failed to fill display name', { userId }, err);
    }
  }

  async function ensureUser(lineUserId, { tokenName = null } = {}) {
    const existingId = await repository.findUserIdByLineId(lineUserId);
    if (existingId) {
      await fillNameFromToken(existingId, tokenName);
      return existingId;
    }
    const displayName = await fetchDisplayName(lineUserId);
    const userId = await repository.createUser({ lineUserId, displayName });
    await repository.seedDefaultCategories(userId);
    if (!displayName) {
      await fillNameFromToken(userId, tokenName);
    }
    return userId;
  }

  async function loadCategoryIds(userId) {
    const categoryIds = await repository.getCategoryIds(userId);
    // ตรวจเฉพาะหมวดระบบ เพราะหมวดเริ่มต้นอื่นผู้ใช้เปลี่ยนชื่อได้ ถ้าเติมกลับจะมีหมวดซ้ำงอกขึ้นมา
    if (SYSTEM_CATEGORY_KEYS.every((key) => categoryIds.has(key))) {
      return categoryIds;
    }
    // ไม่มีหมวดเลยคือสร้างผู้ใช้สำเร็จแต่สร้างหมวดไม่สำเร็จ จึงเติมหมวดเริ่มต้นครบชุด
    await repository.seedDefaultCategories(userId, categoryIds.size === 0 ? DEFAULT_CATEGORIES : SYSTEM_CATEGORIES);
    return repository.getCategoryIds(userId);
  }

  async function loadTextCategories(userId) {
    return toTextCategories(await repository.listCategories(userId));
  }

  return { ensureUser, loadCategoryIds, loadTextCategories };
}

module.exports = { createUserService };

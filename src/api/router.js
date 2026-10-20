const express = require('express');
const { AuthError } = require('./verify-id-token');
const {
  parseMonth,
  isValidAmount,
  validateTransactionUpdate,
  validateRecurringRule,
  validateCategoryCreate,
  validateCategoryUpdate,
  validateWalletCreate,
  validateWalletUpdate,
  validateSettingsUpdate,
} = require('./validate');
const { createLinkToken, EXPORT_LINK_TTL_MS } = require('../export/link-token');
const { toBangkokDateString } = require('../utils/date');
const { lastRunOnAfterSave } = require('../recurring/schedule');
const { monthsEndingAt, buildTrend } = require('./trend');

const { UUID_PATTERN } = require('../utils/uuid');
const MAX_RECURRING_RULES = 50;
const { isSystemCategory, MAX_VISIBLE_CATEGORIES, MAX_TOTAL_CATEGORIES } = require('../parser/categories');
const { MAX_VISIBLE_WALLETS, MAX_TOTAL_WALLETS } = require('../wallets/wallets');

function withSystemFlag(category) {
  return { ...category, system: isSystemCategory(category.type, category.name) };
}

function countVisible(categories, type) {
  return categories.filter((category) => category.type === type && !category.hidden).length;
}

// Postgres คืน uuid เป็นตัวพิมพ์เล็กเสมอ แต่ UUID_PATTERN รับตัวพิมพ์ใหญ่ด้วย
async function findOwnCategory(repository, userId, rawId) {
  if (!UUID_PATTERN.test(rawId)) return { status: 'not_found' };
  const id = rawId.toLowerCase();
  const category = (await repository.listCategories(userId)).find((item) => item.id === id);
  if (!category) return { status: 'not_found' };
  if (isSystemCategory(category.type, category.name)) return { status: 'system' };
  return { status: 'ok', category };
}

function answerCategoryLookup(res, found) {
  if (found.status === 'not_found') res.status(404).json({ error: 'Not found' });
  else res.status(400).json({ error: 'System category' });
}

function countVisibleWallets(wallets) {
  return wallets.filter((wallet) => !wallet.hidden).length;
}

function toWalletView(row) {
  // คิดเป็นสตางค์เพื่อไม่ให้ทศนิยมลอยตัวเพี้ยน เหมือนยอดในโปรไฟล์
  const balanceSatang = Math.round(row.income * 100) - Math.round(row.expense * 100);
  return {
    id: row.id,
    name: row.name,
    hidden: row.hidden,
    isDefault: row.isDefault,
    income: row.income,
    expense: row.expense,
    balance: balanceSatang / 100,
    entryCount: row.entryCount,
  };
}

function readBearerToken(req) {
  const header = req.get('authorization') || '';
  return header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
}

function createApiRouter({
  verifyIdToken,
  users,
  repository,
  liffId,
  logger = console,
  now = () => new Date(),
  allowExport,
  authFailures,
  friendsRouter,
  billsRouter,
  goalsRouter,
}) {
  // ไม่มี default เพราะถ้าลืมส่ง limit จะหายเงียบๆ
  if (typeof allowExport !== 'function') {
    throw new TypeError('createApiRouter requires allowExport');
  }
  if (typeof authFailures?.isBlocked !== 'function' || typeof authFailures?.recordFailure !== 'function') {
    throw new TypeError('createApiRouter requires authFailures');
  }
  if (typeof friendsRouter !== 'function') {
    throw new TypeError('createApiRouter requires friendsRouter');
  }
  if (typeof billsRouter !== 'function') {
    throw new TypeError('createApiRouter requires billsRouter');
  }
  if (typeof goalsRouter !== 'function') {
    throw new TypeError('createApiRouter requires goalsRouter');
  }
  const router = express.Router();

  // parse ในนี้เพื่อให้ error ของ body ไปถึง error handler ของ router และตอบเป็น JSON ไม่ใช่ข้อความจาก error handler ของ app
  router.use(express.json({ limit: '10kb' }));

  router.get('/config', (req, res) => {
    res.json({ liffId });
  });

  // ใช้ user id จาก token ที่ LINE ยืนยันเท่านั้น ไม่เชื่อค่าที่ client ส่งมา
  router.use(async (req, res, next) => {
    // ตัดก่อนเรียก LINE เพื่อไม่ให้ token มั่วถี่ๆ ทำให้ server ยิงออกไปหา LINE ตามและโดนจำกัดอัตรา
    if (authFailures.isBlocked(req.ip)) {
      res.status(429).json({ error: 'Too many requests' });
      return;
    }
    try {
      const { lineUserId, name } = await verifyIdToken(readBearerToken(req));
      req.userId = await users.ensureUser(lineUserId, { tokenName: name });
      next();
    } catch (err) {
      if (err instanceof AuthError) {
        authFailures.recordFailure(req.ip);
        // log เฉพาะเหตุผลที่ LINE ปฏิเสธ ไม่ log token
        if (readBearerToken(req)) {
          // ip/ips ใช้ตรวจว่า trust proxy ตรงกับจำนวน proxy ของ Render (ไม่ใช่ข้อมูลลับ)
          logger.error('API auth rejected', { path: req.path, reason: err.message, ip: req.ip, ips: req.ips });
        }
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      next(err);
    }
  });

  router.use('/friends', friendsRouter);
  router.use('/bills', billsRouter);
  router.use('/goals', goalsRouter);

  router.get('/categories', async (req, res) => {
    const categories = await repository.listCategories(req.userId);
    res.json({ categories: categories.map(withSystemFlag) });
  });

  router.post('/categories', async (req, res) => {
    const result = validateCategoryCreate(req.body);
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }
    const categories = await repository.listCategories(req.userId);
    if (
      categories.length >= MAX_TOTAL_CATEGORIES ||
      countVisible(categories, result.value.type) >= MAX_VISIBLE_CATEGORIES
    ) {
      res.status(409).json({ error: 'Too many categories' });
      return;
    }
    const created = await repository.createCategory(req.userId, result.value);
    if (created.status === 'duplicate') {
      res.status(409).json({ error: 'Duplicate name' });
      return;
    }
    res.status(201).json({ category: withSystemFlag(created.category) });
  });

  router.patch('/categories/:id', async (req, res) => {
    if (!UUID_PATTERN.test(req.params.id)) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    const result = validateCategoryUpdate(req.body);
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }
    const categories = await repository.listCategories(req.userId);
    // Postgres คืน uuid เป็นตัวพิมพ์เล็กเสมอ แต่ UUID_PATTERN รับตัวพิมพ์ใหญ่ด้วย
    const id = req.params.id.toLowerCase();
    const category = categories.find((item) => item.id === id);
    if (!category) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    // โค้ดอ้างหมวดระบบด้วยชื่อ ถ้าเปลี่ยนชื่อจะถูกเติมกลับจนมีหมวดซ้ำ ถ้าซ่อนรายการที่ตกหมวดนี้จะไปอยู่ในหมวดที่มองไม่เห็น
    if (isSystemCategory(category.type, category.name)) {
      res.status(400).json({ error: 'System category' });
      return;
    }
    const unhiding = result.value.hidden === false && category.hidden;
    if (unhiding && countVisible(categories, category.type) >= MAX_VISIBLE_CATEGORIES) {
      res.status(409).json({ error: 'Too many categories' });
      return;
    }
    const updated = await repository.updateCategory(req.userId, category.id, result.value);
    if (updated.status === 'duplicate') {
      res.status(409).json({ error: 'Duplicate name' });
      return;
    }
    if (updated.status === 'not_found') {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.json({ category: withSystemFlag(updated.category) });
  });

  router.get('/categories/:id/usage', async (req, res) => {
    const found = await findOwnCategory(repository, req.userId, req.params.id);
    if (found.status !== 'ok') {
      answerCategoryLookup(res, found);
      return;
    }
    res.json({ usage: await repository.countCategoryUsage(req.userId, found.category.id) });
  });

  router.delete('/categories/:id', async (req, res) => {
    const found = await findOwnCategory(repository, req.userId, req.params.id);
    if (found.status !== 'ok') {
      answerCategoryLookup(res, found);
      return;
    }
    // ตรวจซ้ำใน SQL เพราะหมวดอาจถูกลบไปแล้วระหว่างที่อ่านรายการหมวด
    const status = await repository.deleteCategory(req.userId, found.category.id);
    if (status !== 'deleted') {
      answerCategoryLookup(res, { status });
      return;
    }
    res.status(204).end();
  });

  router.get('/wallets', async (req, res) => {
    // ซ่อมกระเป๋าตั้งต้นก่อนรวมยอด ไม่งั้นรายการที่ไม่มีกระเป๋าจะไม่ถูกนับที่ไหนเลย
    await users.loadWallets(req.userId);
    const totals = await repository.getWalletTotals(req.userId);
    res.json({ wallets: totals.map(toWalletView) });
  });

  router.post('/wallets', async (req, res) => {
    const result = validateWalletCreate(req.body);
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }
    const wallets = await users.loadWallets(req.userId);
    if (wallets.length >= MAX_TOTAL_WALLETS || countVisibleWallets(wallets) >= MAX_VISIBLE_WALLETS) {
      res.status(409).json({ error: 'Too many wallets' });
      return;
    }
    const created = await repository.createWallet(req.userId, result.value);
    if (created.status === 'duplicate') {
      res.status(409).json({ error: 'Duplicate name' });
      return;
    }
    res.status(201).json({ wallet: created.wallet });
  });

  router.patch('/wallets/:id', async (req, res) => {
    if (!UUID_PATTERN.test(req.params.id)) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    const result = validateWalletUpdate(req.body);
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }
    const wallets = await users.loadWallets(req.userId);
    // Postgres คืน uuid เป็นตัวพิมพ์เล็กเสมอ แต่ UUID_PATTERN รับตัวพิมพ์ใหญ่ด้วย
    const id = req.params.id.toLowerCase();
    const wallet = wallets.find((item) => item.id === id);
    if (!wallet) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    // โค้ดอ้างกระเป๋าตั้งต้นด้วยชื่อ และรายการที่ไม่มีกระเป๋าอยู่ในนั้น จึงห้ามเปลี่ยนชื่อหรือซ่อน
    if (wallet.isDefault) {
      res.status(400).json({ error: 'Default wallet' });
      return;
    }
    const unhiding = result.value.hidden === false && wallet.hidden;
    if (unhiding && countVisibleWallets(wallets) >= MAX_VISIBLE_WALLETS) {
      res.status(409).json({ error: 'Too many wallets' });
      return;
    }
    const updated = await repository.updateWallet(req.userId, wallet.id, result.value);
    if (updated.status === 'duplicate') {
      res.status(409).json({ error: 'Duplicate name' });
      return;
    }
    if (updated.status === 'not_found') {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.json({ wallet: updated.wallet });
  });

  router.get('/transactions', async (req, res) => {
    const range = parseMonth(req.query.month);
    if (!range) {
      res.status(400).json({ error: 'Invalid month' });
      return;
    }
    const [{ transactions, totalCount }, categories, summary, wallets] = await Promise.all([
      repository.listTransactions(req.userId, range.from, range.to),
      repository.listCategories(req.userId),
      repository.summarizeTransactions(req.userId, range.from, range.to),
      users.loadWallets(req.userId),
    ]);
    const names = new Map(categories.map((category) => [category.id, category.name]));
    const walletNames = new Map(wallets.map((wallet) => [wallet.id, wallet.name]));
    const defaultWallet = wallets.find((wallet) => wallet.isDefault);
    res.json({
      transactions: transactions.map((item) => {
        // แถวที่ไม่มีกระเป๋าคือกระเป๋าตั้งต้น ส่ง id จริงไป หน้าเว็บจะได้เทียบ id อย่างเดียว
        const walletId = item.walletId ?? (defaultWallet ? defaultWallet.id : null);
        return { ...item, categoryName: names.get(item.categoryId) || '', walletId, walletName: walletNames.get(walletId) || '' };
      }),
      // ยอดรวมและกราฟใช้ summary จาก SQL จึงนับครบแม้รายการที่ส่งมาถูกตัดตาม max-rows
      summary,
      truncated: totalCount > transactions.length,
    });
  });

  router.get('/trend', async (req, res) => {
    const month = req.query.month;
    const range = typeof month === 'string' ? parseMonth(month) : null;
    if (!range) {
      res.status(400).json({ error: 'Invalid month' });
      return;
    }
    const months = monthsEndingAt(month);
    const rows = await repository.getMonthlyTotals(req.userId, `${months[0]}-01`, range.to);
    res.json({ months: buildTrend(month, rows) });
  });

  router.get('/profile', async (req, res) => {
    const [displayName, totals] = await Promise.all([
      repository.getDisplayName(req.userId),
      repository.getLifetimeTotals(req.userId),
    ]);
    // คิดเป็นสตางค์เพื่อไม่ให้ทศนิยมลอยตัวเพี้ยน
    const balanceSatang = Math.round(totals.income * 100) - Math.round(totals.expense * 100);
    res.json({
      displayName,
      income: totals.income,
      expense: totals.expense,
      balance: balanceSatang / 100,
      entryCount: totals.entryCount,
      firstDate: totals.firstDate,
    });
  });

  router.get('/settings', async (req, res) => {
    res.json(await repository.getNotificationSettings(req.userId));
  });

  router.patch('/settings', async (req, res) => {
    const result = validateSettingsUpdate(req.body);
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json(await repository.updateNotificationSettings(req.userId, result.value));
  });

  router.patch('/transactions/:id', async (req, res) => {
    if (!UUID_PATTERN.test(req.params.id)) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    const result = validateTransactionUpdate(req.body);
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }
    const categories = await repository.listCategories(req.userId);
    const category = categories.find((item) => item.id === result.value.categoryId);
    if (!category) {
      res.status(400).json({ error: 'Invalid category' });
      return;
    }
    // ประเภทรายรับ/รายจ่ายตามหมวดที่เลือก เพื่อไม่ให้ประเภทกับหมวดขัดกัน
    const fields = { ...result.value, type: category.type };
    if (result.value.walletId !== undefined) {
      const wallets = await users.loadWallets(req.userId);
      // Postgres คืน uuid เป็นตัวพิมพ์เล็กเสมอ แต่ client อาจส่งตัวพิมพ์ใหญ่
      const wallet = wallets.find((item) => item.id === result.value.walletId.toLowerCase());
      if (!wallet) {
        res.status(400).json({ error: 'Invalid wallet' });
        return;
      }
      // กระเป๋าตั้งต้นเก็บเป็น null แบบเดียวกับรายการเก่า SQL จึงนับที่เดียว
      fields.walletId = wallet.isDefault ? null : wallet.id;
    }
    const updated = await repository.updateTransaction(req.userId, req.params.id, fields);
    if (!updated) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.status(204).end();
  });

  router.delete('/transactions/:id', async (req, res) => {
    if (!UUID_PATTERN.test(req.params.id)) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    const deleted = await repository.deleteTransaction(req.userId, req.params.id);
    if (!deleted) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.status(204).end();
  });

  router.get('/budgets', async (req, res) => {
    const month = req.query.month;
    if (typeof month !== 'string' || !parseMonth(month)) {
      res.status(400).json({ error: 'Invalid month' });
      return;
    }
    const [budgets, categories] = await Promise.all([
      repository.getBudgetStatus(req.userId, month),
      repository.listCategories(req.userId),
    ]);
    const hiddenIds = new Set(categories.filter((category) => category.hidden).map((category) => category.id));
    // หมวดที่ซ่อนยังแสดงถ้ามีงบหรือยอดในเดือนนั้น ผู้ใช้จะได้ยกเลิกงบที่ค้างได้
    res.json({
      budgets: budgets.filter((row) => !hiddenIds.has(row.categoryId) || row.budget !== null || row.spent > 0),
    });
  });

  router.put('/budgets/:categoryId', async (req, res) => {
    const { month, amount } = req.body || {};
    if (typeof month !== 'string' || !parseMonth(month)) {
      res.status(400).json({ error: 'Invalid month' });
      return;
    }
    // null คือไม่ตั้งงบตั้งแต่เดือนนี้
    if (amount !== null && !isValidAmount(amount)) {
      res.status(400).json({ error: 'Invalid amount' });
      return;
    }
    const categories = await repository.listCategories(req.userId);
    // Postgres คืน uuid เป็นตัวพิมพ์เล็กเสมอ
    const categoryId = req.params.categoryId.toLowerCase();
    const category = categories.find((item) => item.id === categoryId);
    // งบมีเฉพาะหมวดรายจ่าย และต้องเป็นหมวดของผู้ใช้คนนี้
    if (!category || category.type !== 'expense') {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    await repository.setBudget({ userId: req.userId, categoryId: category.id, month, amount });
    res.status(204).end();
  });

  router.get('/recurring', async (req, res) => {
    res.json({ rules: await repository.listRecurringRules(req.userId) });
  });

  router.post('/recurring', async (req, res) => {
    const result = validateRecurringRule(req.body);
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }
    const [categories, rules] = await Promise.all([
      repository.listCategories(req.userId),
      repository.listRecurringRules(req.userId),
    ]);
    const category = categories.find((item) => item.id === result.value.categoryId);
    if (!category) {
      res.status(400).json({ error: 'Invalid category' });
      return;
    }
    if (rules.length >= MAX_RECURRING_RULES) {
      res.status(409).json({ error: 'Too many rules' });
      return;
    }
    const today = toBangkokDateString(now());
    // ประเภทตามหมวด และไม่ย้อนบันทึกให้เดือนที่วันครบกำหนดผ่านไปแล้ว (เริ่มรอบหน้า)
    const rule = await repository.createRecurringRule({
      userId: req.userId,
      type: category.type,
      ...result.value,
      lastRunOn: lastRunOnAfterSave(null, result.value.dayOfMonth, today),
    });
    res.status(201).json({ rule });
  });

  router.put('/recurring/:id', async (req, res) => {
    if (!UUID_PATTERN.test(req.params.id)) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    const result = validateRecurringRule(req.body);
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }
    const [categories, rules] = await Promise.all([
      repository.listCategories(req.userId),
      repository.listRecurringRules(req.userId),
    ]);
    const category = categories.find((item) => item.id === result.value.categoryId);
    if (!category) {
      res.status(400).json({ error: 'Invalid category' });
      return;
    }
    const existing = rules.find((item) => item.id === req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    const today = toBangkokDateString(now());
    // แก้แค่เนื้อหา (วันเดิม ยังเปิดอยู่) ต้องไม่ทำให้รอบเดือนนี้ถูกข้าม
    const keepsSchedule = existing.active && result.value.active && existing.dayOfMonth === result.value.dayOfMonth;
    const updated = await repository.updateRecurringRule(req.userId, req.params.id, {
      type: category.type,
      ...result.value,
      lastRunOn: keepsSchedule
      ? existing.lastRunOn
      : lastRunOnAfterSave(existing.lastRunOn, result.value.dayOfMonth, today),
    });
    if (!updated) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.status(204).end();
  });

  router.delete('/recurring/:id', async (req, res) => {
    if (!UUID_PATTERN.test(req.params.id)) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    const deleted = await repository.deleteRecurringRule(req.userId, req.params.id);
    if (!deleted) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.status(204).end();
  });

  router.post('/exports', async (req, res) => {
    const month = req.body && req.body.month;
    if (typeof month !== 'string' || !parseMonth(month)) {
      res.status(400).json({ error: 'Invalid month' });
      return;
    }
    if (!allowExport(req.userId)) {
      res.status(429).json({ error: 'Too many requests' });
      return;
    }
    const current = now();
    // ลบลิงก์เก่าของผู้ใช้คนนี้ไปพร้อมกัน ตารางจึงไม่โตเรื่อยๆ; ลบไม่ได้ก็ยังออกลิงก์ใหม่ได้
    try {
      await repository.deleteExpiredExportLinks(req.userId, current.toISOString());
    } catch (err) {
      logger.error('Export link cleanup failed', err);
    }
    const { token, tokenHash } = createLinkToken();
    await repository.createExportLink({
      tokenHash,
      userId: req.userId,
      month,
      expiresAt: new Date(current.getTime() + EXPORT_LINK_TTL_MS).toISOString(),
    });
    // ส่งกลับแค่ path ให้หน้าเว็บต่อ origin เอง เพราะ server ไม่รู้โดเมนของ ngrok
    res.status(201).json({ path: `/exports/${token}` });
  });

  router.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  router.use((err, req, res, next) => {
    if (res.headersSent) {
      next(err);
      return;
    }
    // error ของ body-parser (JSON พัง, body ใหญ่เกิน) เป็นความผิดของ client ไม่ใช่ 500
    if (Number.isInteger(err.status) && err.status >= 400 && err.status < 500) {
      res.status(err.status).json({ error: 'Invalid body' });
      return;
    }
    logger.error('API request failed', { path: req.path }, err);
    res.status(500).json({ error: 'Internal error' });
  });

  return router;
}

module.exports = { createApiRouter };

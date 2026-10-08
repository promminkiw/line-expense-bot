const express = require('express');
const { AuthError } = require('./verify-id-token');
const { parseMonth, isValidAmount, validateTransactionUpdate, validateRecurringRule } = require('./validate');
const { createLinkToken, EXPORT_LINK_TTL_MS } = require('../export/link-token');
const { toBangkokDateString } = require('../utils/date');
const { lastRunOnAfterSave } = require('../recurring/schedule');
const { monthsEndingAt, buildTrend } = require('./trend');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_RECURRING_RULES = 50;

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
  friendsRouter,
}) {
  // ไม่มี default เพราะถ้าลืมส่ง limit จะหายเงียบๆ
  if (typeof allowExport !== 'function') {
    throw new TypeError('createApiRouter requires allowExport');
  }
  if (!friendsRouter) {
    throw new TypeError('createApiRouter requires friendsRouter');
  }
  const router = express.Router();

  // parse ในนี้เพื่อให้ error ของ body ไปถึง error handler ของ router และตอบเป็น JSON ไม่ใช่ข้อความจาก error handler ของ app
  router.use(express.json({ limit: '10kb' }));

  router.get('/config', (req, res) => {
    res.json({ liffId });
  });

  // ใช้ user id จาก token ที่ LINE ยืนยันเท่านั้น ไม่เชื่อค่าที่ client ส่งมา
  router.use(async (req, res, next) => {
    try {
      const { lineUserId, name } = await verifyIdToken(readBearerToken(req));
      req.userId = await users.ensureUser(lineUserId, { tokenName: name });
      next();
    } catch (err) {
      if (err instanceof AuthError) {
        // log เฉพาะเหตุผลที่ LINE ปฏิเสธ ไม่ log token
        if (readBearerToken(req)) {
          logger.error('API auth rejected', { path: req.path, reason: err.message });
        }
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      next(err);
    }
  });

  router.use('/friends', friendsRouter);

  router.get('/categories', async (req, res) => {
    res.json({ categories: await repository.listCategories(req.userId) });
  });

  router.get('/transactions', async (req, res) => {
    const range = parseMonth(req.query.month);
    if (!range) {
      res.status(400).json({ error: 'Invalid month' });
      return;
    }
    const [{ transactions, totalCount }, categories, summary] = await Promise.all([
      repository.listTransactions(req.userId, range.from, range.to),
      repository.listCategories(req.userId),
      repository.summarizeTransactions(req.userId, range.from, range.to),
    ]);
    const names = new Map(categories.map((category) => [category.id, category.name]));
    res.json({
      transactions: transactions.map((item) => ({ ...item, categoryName: names.get(item.categoryId) || '' })),
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
    const updated = await repository.updateTransaction(req.userId, req.params.id, {
      ...result.value,
      type: category.type,
    });
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
    res.json({ budgets: await repository.getBudgetStatus(req.userId, month) });
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
    const category = categories.find((item) => item.id === req.params.categoryId);
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

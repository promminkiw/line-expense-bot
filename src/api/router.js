const express = require('express');
const { AuthError } = require('./verify-id-token');
const { parseMonth, isValidAmount, validateTransactionUpdate } = require('./validate');
const { createLinkToken, EXPORT_LINK_TTL_MS } = require('../export/link-token');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  allowExport = () => true,
}) {
  const router = express.Router();

  // parse ในนี้เพื่อให้ error ของ body ไปถึง error handler ของ router และตอบเป็น JSON ไม่ใช่ข้อความจาก error handler ของ app
  router.use(express.json({ limit: '10kb' }));

  router.get('/config', (req, res) => {
    res.json({ liffId });
  });

  // ใช้ user id จาก token ที่ LINE ยืนยันเท่านั้น ไม่เชื่อค่าที่ client ส่งมา
  router.use(async (req, res, next) => {
    try {
      const lineUserId = await verifyIdToken(readBearerToken(req));
      req.userId = await users.ensureUser(lineUserId);
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

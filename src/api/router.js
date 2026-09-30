const express = require('express');
const { AuthError } = require('./verify-id-token');
const { parseMonth, validateTransactionUpdate } = require('./validate');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function readBearerToken(req) {
  const header = req.get('authorization') || '';
  return header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
}

function createApiRouter({ verifyIdToken, users, repository, liffId, logger = console }) {
  const router = express.Router();

  // parse ในนี้เพื่อให้ error ของ body ไปถึง error handler ของ router ไม่หลุดเป็น HTML
  router.use(express.json());

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
    const [transactions, categories] = await Promise.all([
      repository.listTransactions(req.userId, range.from, range.to),
      repository.listCategories(req.userId),
    ]);
    const names = new Map(categories.map((category) => [category.id, category.name]));
    res.json({
      transactions: transactions.map((item) => ({ ...item, categoryName: names.get(item.categoryId) || '' })),
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

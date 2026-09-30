const express = require('express');
const { parseMonth } = require('../api/validate');
const { hashLinkToken, isLinkToken } = require('./link-token');
const { buildTransactionsCsv, exportFileName } = require('./csv');

const EXPIRED_MESSAGE = 'ลิงก์นี้หมดอายุหรือถูกใช้ไปแล้ว กลับไปกด Export CSV ในหน้าเว็บอีกครั้ง';
const FAILED_MESSAGE = 'Export ไม่สำเร็จ ลองใหม่อีกครั้ง';

function sendText(res, status, text) {
  res.status(status).type('text/plain; charset=utf-8').set('Cache-Control', 'no-store').send(text);
}

// เปิดใน Safari ซึ่งส่ง ID token ไม่ได้ จึงใช้ลิงก์ใช้ครั้งเดียวแทนการยืนยันตัวตน
function createExportRouter({ repository, now = () => new Date(), logger = console }) {
  const router = express.Router();

  // HEAD ต้องไม่ใช้ลิงก์ ไม่งั้น GET จริงของผู้ใช้จะได้ 410
  router.head('/:token', (req, res) => {
    res.status(405).set('Allow', 'GET').set('Cache-Control', 'no-store').end();
  });

  router.get('/:token', async (req, res) => {
    // ไม่แยกกรณีผิดรูป ไม่มี หมดอายุ หรือใช้แล้ว เพื่อไม่บอกใบ้คนที่เดาลิงก์
    if (!isLinkToken(req.params.token)) {
      sendText(res, 410, EXPIRED_MESSAGE);
      return;
    }
    const link = await repository.claimExportLink(hashLinkToken(req.params.token), now().toISOString());
    if (!link) {
      sendText(res, 410, EXPIRED_MESSAGE);
      return;
    }
    const range = parseMonth(link.month);
    const [rows, categories] = await Promise.all([
      repository.listAllTransactions(link.userId, range.from, range.to),
      repository.listCategories(link.userId),
    ]);
    const names = new Map(categories.map((category) => [category.id, category.name]));
    const csv = buildTransactionsCsv(rows.map((row) => ({ ...row, categoryName: names.get(row.categoryId) || '' })));
    res
      .status(200)
      .type('text/csv; charset=utf-8')
      .set('Content-Disposition', `attachment; filename="${exportFileName(link.month)}"`)
      .set('Cache-Control', 'no-store')
      .send(csv);
  });

  router.use((err, req, res, next) => {
    if (res.headersSent) {
      next(err);
      return;
    }
    // decode param พัง (%) ถือเป็นลิงก์ผิดรูป และห้าม log เพราะ message มี token ที่ยังใช้ได้
    if (err instanceof URIError || err.status === 400) {
      sendText(res, 410, EXPIRED_MESSAGE);
      return;
    }
    logger.error('Export failed', err);
    sendText(res, 500, FAILED_MESSAGE);
  });

  return router;
}

module.exports = { createExportRouter };

const express = require('express');
const { parseMonth } = require('../api/validate');
const { hashLinkToken, isLinkToken } = require('./link-token');
const { buildTransactionsCsv, exportFileName } = require('./csv');
const { t, normalizeLanguage } = require('../i18n');

// ข้อความเหล่านี้ส่งก่อนรู้ว่าลิงก์เป็นของใคร จึงใส่ทั้งสองภาษา ไทยขึ้นก่อนเพราะผู้ใช้ส่วนใหญ่เป็นคนไทย
function bilingual(key) {
  return `${t('th', key)} / ${t('en', key)}`;
}

const EXPIRED_MESSAGE = bilingual('export.error.expired');
const FAILED_MESSAGE = bilingual('export.error.failed');

const NOT_FOUND_MESSAGE = bilingual('export.error.notFound');

// nosniff กัน browser เดาชนิดไฟล์เองจากเนื้อหาที่มีข้อความของผู้ใช้
function sendText(res, status, text) {
  res
    .status(status)
    .type('text/plain; charset=utf-8')
    .set('Cache-Control', 'no-store')
    .set('X-Content-Type-Options', 'nosniff')
    .send(text);
}

function sendHeadNotAllowed(res) {
  res.status(405).set('Allow', 'GET').set('Cache-Control', 'no-store').end();
}

// เปิดใน browser ภายนอกซึ่งส่ง ID token ไม่ได้ จึงใช้ลิงก์ใช้ครั้งเดียวแทนการยืนยันตัวตน
function createExportRouter({ repository, now = () => new Date(), logger = console }) {
  const router = express.Router();

  // HEAD ต้องไม่ใช้ลิงก์ ไม่งั้น GET จริงของผู้ใช้จะได้ 410
  router.head('/:token', (req, res) => {
    sendHeadNotAllowed(res);
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
    // อ่านภาษาพร้อมกับรายการ จึงไม่ทำให้ดาวน์โหลดช้าลง
    // ลิงก์ถูกใช้ไปแล้วตอน claim อ่านภาษาไม่ได้จึงให้เป็นไทยแทนการตอบ 500 ที่ทำให้เสียลิงก์
    const [rows, categories, language] = await Promise.all([
      repository.listAllTransactions(link.userId, range.from, range.to),
      repository.listCategories(link.userId),
      repository.getUserLanguage(link.userId).catch((err) => {
        logger.error('Failed to read export language', { userId: link.userId, reason: err?.message ?? String(err) });
        return null;
      }),
    ]);
    const names = new Map(categories.map((category) => [category.id, category.name]));
    const csv = buildTransactionsCsv(
      rows.map((row) => ({ ...row, categoryName: names.get(row.categoryId) || '' })),
      normalizeLanguage(language)
    );
    res
      .status(200)
      .type('text/csv; charset=utf-8')
      .set('Content-Disposition', `attachment; filename="${exportFileName(link.month)}"`)
      .set('Cache-Control', 'no-store')
      .set('X-Content-Type-Options', 'nosniff')
      .send(csv);
  });

  router.use((req, res) => {
    sendText(res, 404, NOT_FOUND_MESSAGE);
  });

  router.use((err, req, res, next) => {
    if (res.headersSent) {
      next(err);
      return;
    }
    // decode param พัง (%) ถือเป็นลิงก์ผิดรูป และห้าม log เพราะ message มี token ที่ยังใช้ได้
    if (err instanceof URIError) {
      if (req.method === 'HEAD') {
        sendHeadNotAllowed(res);
      } else {
        sendText(res, 410, EXPIRED_MESSAGE);
      }
      return;
    }
    logger.error('Export failed', err);
    sendText(res, 500, FAILED_MESSAGE);
  });

  return router;
}

module.exports = { createExportRouter };

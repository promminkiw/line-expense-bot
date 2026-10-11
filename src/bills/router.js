const express = require('express');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function notFound(res) {
  res.status(404).json({ error: 'Not found' });
}

// ต้อง mount หลัง middleware ตรวจ ID token ของ /api เพราะใช้ req.userId
// รูปจากมือถือใหญ่หลาย MB ส่วนการย่อทำที่ server ก่อนส่ง Claude
const RECEIPT_BODY_LIMIT = '10mb';

function createBillsRouter({ bills, allowBillCreate, readReceipt, allowReceiptRead }) {
  // ไม่มี default เพราะถ้าลืมส่ง limit การสร้างบิลจะเผาโควตา push ได้ไม่จำกัด
  if (typeof allowBillCreate !== 'function') {
    throw new TypeError('createBillsRouter requires allowBillCreate');
  }
  // ไม่มี default เพราะการอ่านรูปทุกครั้งเสียค่า Claude
  if (typeof allowReceiptRead !== 'function') {
    throw new TypeError('createBillsRouter requires allowReceiptRead');
  }
  if (typeof readReceipt !== 'function') {
    throw new TypeError('createBillsRouter requires readReceipt');
  }
  const router = express.Router();

  // ตรวจ limit ก่อนรับ body เพื่อไม่ต้องอ่านรูปขนาดใหญ่ของคำขอที่จะปฏิเสธอยู่แล้ว
  router.post(
    '/read-receipt',
    (req, res, next) => {
      if (!allowReceiptRead(req.userId)) {
        res.status(429).json({ error: 'Too many requests' });
        return;
      }
      next();
    },
    // browser อาจส่ง type ว่างหรือไม่ตรงไฟล์ จึงรับทุก type แล้วตรวจจากเนื้อไฟล์แทน
    express.raw({ type: () => true, limit: RECEIPT_BODY_LIMIT }),
    async (req, res) => {
      const result = await readReceipt(req.body);
      if (result.status === 'unsupported') {
        res.status(415).json({ error: 'Unsupported image' });
        return;
      }
      if (result.status !== 'ok') {
        res.status(422).json({ error: 'Unreadable' });
        return;
      }
      res.json({ amount: result.amount });
    }
  );

  router.get('/', async (req, res) => {
    res.json(await bills.list(req.userId));
  });

  router.post('/', async (req, res) => {
    const result = await bills.create(req.userId, req.body, { allowCreate: () => allowBillCreate(req.userId) });
    if (result.status === 'limited') {
      res.status(429).json({ error: 'Too many requests' });
      return;
    }
    if (result.status !== 'ok') {
      res.status(400).json({ error: result.error });
      return;
    }
    res.status(201).json({ id: result.id, notNotified: result.notNotified });
  });

  router.post('/:id/cancel', async (req, res) => {
    if (!UUID_PATTERN.test(req.params.id) || !(await bills.cancel(req.userId, req.params.id))) {
      notFound(res);
      return;
    }
    res.json({ status: 'cancelled' });
  });

  router.post('/:id/members/:memberId/paid', async (req, res) => {
    if (!UUID_PATTERN.test(req.params.id) || !UUID_PATTERN.test(req.params.memberId)) {
      notFound(res);
      return;
    }
    const paid = req.body && req.body.paid;
    if (typeof paid !== 'boolean') {
      res.status(400).json({ error: 'Invalid body' });
      return;
    }
    if (!(await bills.setPaid(req.userId, req.params.id, req.params.memberId, paid))) {
      notFound(res);
      return;
    }
    res.json({ paid });
  });

  for (const answer of ['confirm', 'decline']) {
    router.post(`/:id/${answer}`, async (req, res) => {
      if (!UUID_PATTERN.test(req.params.id)) {
        notFound(res);
        return;
      }
      const result = await bills.respondFromWeb(req.userId, req.params.id, answer);
      if (result.status === 'not_found') {
        notFound(res);
        return;
      }
      res.json({ status: result.status });
    });
  }

  return router;
}

module.exports = { createBillsRouter };

const express = require('express');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function notFound(res) {
  res.status(404).json({ error: 'Not found' });
}

// ต้อง mount หลัง middleware ตรวจ ID token ของ /api เพราะใช้ req.userId
function createBillsRouter({ bills, allowBillCreate }) {
  // ไม่มี default เพราะถ้าลืมส่ง limit การสร้างบิลจะเผาโควตา push ได้ไม่จำกัด
  if (typeof allowBillCreate !== 'function') {
    throw new TypeError('createBillsRouter requires allowBillCreate');
  }
  const router = express.Router();

  router.get('/', async (req, res) => {
    res.json(await bills.list(req.userId));
  });

  router.post('/', async (req, res) => {
    if (!allowBillCreate(req.userId)) {
      res.status(429).json({ error: 'Too many requests' });
      return;
    }
    const result = await bills.create(req.userId, req.body);
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

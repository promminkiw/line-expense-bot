const crypto = require('node:crypto');
const express = require('express');

// เทียบ hash เพื่อให้ timingSafeEqual ได้ความยาวเท่ากันเสมอ และไม่เปิดเผยความยาวของ secret
function safeEqual(a, b) {
  const left = crypto.createHash('sha256').update(a).digest();
  const right = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(left, right);
}

function createRecurringRouter({ cronSecret, run, logger = console }) {
  if (!cronSecret) {
    throw new TypeError('createRecurringRouter requires cronSecret');
  }
  const router = express.Router();

  router.post('/recurring/run', async (req, res) => {
    const header = req.get('authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
    if (!token || !safeEqual(token, cronSecret)) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    try {
      res.json(await run());
    } catch (err) {
      logger.error('Recurring run failed', err);
      res.status(500).json({ error: 'Internal error' });
    }
  });

  return router;
}

module.exports = { createRecurringRouter };

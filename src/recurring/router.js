const express = require('express');
const { requireCronSecret, hasCronSecret } = require('../utils/cron-auth');

function createRecurringRouter({ cronSecret, run, logger = console }) {
  requireCronSecret(cronSecret, 'createRecurringRouter');
  const router = express.Router();

  router.post('/recurring/run', async (req, res) => {
    if (!hasCronSecret(req, cronSecret)) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    try {
      const result = await run();
      // ให้ cron-job.org แจ้งเตือนเมื่อมีกฎที่ทำไม่สำเร็จ
      res.status(result.failed > 0 ? 500 : 200).json(result);
    } catch (err) {
      logger.error('Recurring run failed', err);
      res.status(500).json({ error: 'Internal error' });
    }
  });

  return router;
}

module.exports = { createRecurringRouter };

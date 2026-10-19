const express = require('express');
const { requireCronSecret, hasCronSecret } = require('../utils/cron-auth');

function createNotificationsRouter({ cronSecret, runWeeklySummary, logger = console }) {
  requireCronSecret(cronSecret, 'createNotificationsRouter');
  if (typeof runWeeklySummary !== 'function') {
    throw new TypeError('createNotificationsRouter requires runWeeklySummary');
  }
  const router = express.Router();

  function mountJob(path, run, failureLog) {
    router.post(path, async (req, res) => {
      if (!hasCronSecret(req, cronSecret)) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      try {
        const result = await run();
        // ให้ cron-job.org แจ้งเตือนเมื่ออ่านหรือจองของใครไม่สำเร็จ ส่วน pushFailed ไม่นับเหมือนรายการประจำ
        res.status(result.failed > 0 ? 500 : 200).json(result);
      } catch (err) {
        // ไม่ log err ทั้งก้อนเพราะ cause อาจมีข้อมูลของผู้ใช้
        logger.error(failureLog, { reason: err?.message ?? String(err) });
        res.status(500).json({ error: 'Internal error' });
      }
    });
  }

  mountJob('/notifications/weekly', runWeeklySummary, 'Weekly summary run failed');

  return router;
}

module.exports = { createNotificationsRouter };

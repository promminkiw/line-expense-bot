function createPendingSlipSweeper({ repository, ttlMs, now = () => Date.now(), logger = console }) {
  return async function sweep() {
    try {
      await repository.deleteAllExpiredPendingSlips(new Date(now() - ttlMs).toISOString());
    } catch (err) {
      // งานกวาดล้มเหลวได้ ไม่ควรทำให้ process หยุด
      logger.error('Failed to sweep expired pending slips', err);
    }
  };
}

function startPendingSlipSweeper({ sweep, intervalMs = 60 * 60 * 1000, setIntervalFn = setInterval }) {
  sweep();
  const timer = setIntervalFn(sweep, intervalMs);
  // ไม่ให้ timer ค้าง process ไว้ตอนปิดโปรแกรม
  if (typeof timer.unref === 'function') timer.unref();
  return timer;
}

module.exports = { createPendingSlipSweeper, startPendingSlipSweeper };

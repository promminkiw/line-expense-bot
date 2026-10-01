import { describe, it, expect, vi } from 'vitest';
import { createPendingSlipSweeper, startPendingSlipSweeper } from './pending-sweep.js';

describe('createPendingSlipSweeper', () => {
  it('deletes rows older than now minus ttl', async () => {
    const repository = { deleteAllExpiredPendingSlips: vi.fn().mockResolvedValue(undefined) };
    const now = Date.parse('2026-09-29T05:00:00.000Z');
    const sweep = createPendingSlipSweeper({ repository, ttlMs: 10 * 60 * 1000, now: () => now });

    await sweep();

    expect(repository.deleteAllExpiredPendingSlips).toHaveBeenCalledWith('2026-09-29T04:50:00.000Z');
  });

  it('does not throw and logs when the repository fails', async () => {
    const err = new Error('boom');
    const repository = { deleteAllExpiredPendingSlips: vi.fn().mockRejectedValue(err) };
    const logger = { error: vi.fn() };
    const sweep = createPendingSlipSweeper({ repository, ttlMs: 1000, logger });

    await expect(sweep()).resolves.toBeUndefined();

    expect(logger.error).toHaveBeenCalledWith('Failed to sweep expired pending slips', err);
  });
});

describe('startPendingSlipSweeper', () => {
  it('runs once at once, schedules at the interval and unrefs the timer', () => {
    const sweep = vi.fn().mockResolvedValue(undefined);
    const timer = { unref: vi.fn() };
    const setIntervalFn = vi.fn().mockReturnValue(timer);

    const result = startPendingSlipSweeper({ sweep, intervalMs: 5000, setIntervalFn });

    expect(sweep).toHaveBeenCalledTimes(1);
    expect(setIntervalFn).toHaveBeenCalledWith(sweep, 5000);
    expect(timer.unref).toHaveBeenCalledTimes(1);
    expect(result).toBe(timer);
  });

  it('defaults to hourly', () => {
    const setIntervalFn = vi.fn().mockReturnValue({});

    startPendingSlipSweeper({ sweep: vi.fn(), setIntervalFn });

    expect(setIntervalFn).toHaveBeenCalledWith(expect.any(Function), 60 * 60 * 1000);
  });
});

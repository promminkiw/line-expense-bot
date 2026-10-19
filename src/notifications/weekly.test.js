import { describe, it, expect, vi } from 'vitest';
import { createWeeklySummaryRunner, WEEKLY_SUMMARY_KIND } from './weekly.js';
import { buildSummary } from '../summary/summary.js';
import { buildSummaryFlex } from '../summary/flex.js';

// 2026-10-18 19:00 เวลาไทย (วันอาทิตย์) สัปดาห์คือ 12-18 ต.ค.
const NOW = new Date('2026-10-18T12:00:00Z');
const LABEL = 'สัปดาห์นี้ (12/10 - 18/10)';
const ROWS = [
  { type: 'expense', category: 'อาหาร', total: 160, entryCount: 3 },
  { type: 'income', category: 'เงินเดือน', total: 25000, entryCount: 1 },
];

function setup(users = [{ userId: 'user-1', lineUserId: 'U1' }]) {
  const repository = {
    listWeeklySummaryUsers: vi.fn().mockResolvedValue(users),
    summarizeTransactions: vi.fn().mockResolvedValue(ROWS),
    reserveNotification: vi.fn().mockResolvedValue(true),
  };
  const pushFlex = vi.fn().mockResolvedValue();
  const logger = { error: vi.fn() };
  const run = createWeeklySummaryRunner({ repository, pushFlex, now: () => NOW, logger });
  return { repository, pushFlex, logger, run };
}

describe('createWeeklySummaryRunner', () => {
  it('pushes the Monday to Sunday summary card without a comment and reserves the week first', async () => {
    const { repository, pushFlex, run } = setup();

    const result = await run();

    expect(repository.summarizeTransactions).toHaveBeenCalledWith('user-1', '2026-10-12', '2026-10-18');
    expect(repository.reserveNotification).toHaveBeenCalledWith({ userId: 'user-1', kind: WEEKLY_SUMMARY_KIND, period: '2026-10-12' });
    expect(pushFlex).toHaveBeenCalledWith('U1', buildSummaryFlex(buildSummary(ROWS, LABEL), ''));
    const flex = pushFlex.mock.calls[0][1];
    expect(flex.altText).toBe('สรุปสัปดาห์นี้ (12/10 - 18/10): รายรับ 25,000 บาท รายจ่าย 160 บาท');
    // คอมเมนต์เป็นข้อความเดียวในการ์ดที่ wrap
    expect(JSON.stringify(flex)).not.toContain('"wrap":true');
    expect(repository.reserveNotification.mock.invocationCallOrder[0]).toBeLessThan(pushFlex.mock.invocationCallOrder[0]);
    expect(result).toEqual({ eligible: 1, sent: 1, skipped: 0, failed: 0, pushFailed: 0 });
  });

  it('skips a week without entries without reserving or pushing', async () => {
    const { repository, pushFlex, run } = setup();
    repository.summarizeTransactions.mockResolvedValue([]);

    expect(await run()).toEqual({ eligible: 1, sent: 0, skipped: 1, failed: 0, pushFailed: 0 });
    expect(repository.reserveNotification).not.toHaveBeenCalled();
    expect(pushFlex).not.toHaveBeenCalled();
  });

  it('skips a user whose summary for this week was already sent', async () => {
    const { repository, pushFlex, run } = setup();
    repository.reserveNotification.mockResolvedValue(false);

    expect(await run()).toEqual({ eligible: 1, sent: 0, skipped: 1, failed: 0, pushFailed: 0 });
    expect(pushFlex).not.toHaveBeenCalled();
  });

  it('keeps going after reading one user fails and logs only the reason', async () => {
    const { repository, pushFlex, logger, run } = setup([
      { userId: 'user-1', lineUserId: 'U1' },
      { userId: 'user-2', lineUserId: 'U2' },
    ]);
    repository.summarizeTransactions.mockRejectedValueOnce(new Error('db down'));

    expect(await run()).toEqual({ eligible: 2, sent: 1, skipped: 0, failed: 1, pushFailed: 0 });
    expect(pushFlex).toHaveBeenCalledTimes(1);
    expect(pushFlex.mock.calls[0][0]).toBe('U2');
    expect(logger.error).toHaveBeenCalledWith('Failed to prepare weekly summary', { userId: 'user-1', reason: 'db down' });
  });

  it('counts a reservation error as failed and does not push to that user', async () => {
    const { repository, pushFlex, logger, run } = setup([
      { userId: 'user-1', lineUserId: 'U1' },
      { userId: 'user-2', lineUserId: 'U2' },
    ]);
    repository.reserveNotification.mockRejectedValueOnce(new Error('db down'));

    expect(await run()).toEqual({ eligible: 2, sent: 1, skipped: 0, failed: 1, pushFailed: 0 });
    expect(pushFlex).toHaveBeenCalledTimes(1);
    expect(pushFlex.mock.calls[0][0]).toBe('U2');
    expect(logger.error).toHaveBeenCalledWith('Failed to prepare weekly summary', { userId: 'user-1', reason: 'db down' });
  });

  // จองไว้แล้วไม่ลบและไม่ลองซ้ำ เพราะ LINE อาจส่งถึงแล้วแม้ client ได้ error
  it('counts a failed push as pushFailed, keeps the reservation and still sends to the next user', async () => {
    const { repository, pushFlex, logger, run } = setup([
      { userId: 'user-1', lineUserId: 'U1' },
      { userId: 'user-2', lineUserId: 'U2' },
    ]);
    pushFlex.mockRejectedValueOnce(new Error('LINE 500'));

    expect(await run()).toEqual({ eligible: 2, sent: 1, skipped: 0, failed: 0, pushFailed: 1 });
    expect(repository.reserveNotification).toHaveBeenCalledTimes(2);
    expect(pushFlex).toHaveBeenCalledTimes(2);
    expect(pushFlex.mock.calls[1][0]).toBe('U2');
    expect(logger.error).toHaveBeenCalledWith('Failed to push weekly summary', { userId: 'user-1', reason: 'LINE 500' });
  });

  it('returns zero counts when nobody turned the summary on', async () => {
    const { repository, run } = setup([]);

    expect(await run()).toEqual({ eligible: 0, sent: 0, skipped: 0, failed: 0, pushFailed: 0 });
    expect(repository.summarizeTransactions).not.toHaveBeenCalled();
  });
});

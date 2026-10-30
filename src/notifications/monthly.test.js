import { describe, it, expect, vi } from 'vitest';
import { createMonthlySummaryRunner, MONTHLY_SUMMARY_KIND } from './monthly.js';
import { buildSummary } from '../summary/summary.js';
import { buildSummaryFlex } from '../summary/flex.js';
import { pickMonthlyComment } from './monthly-comment.js';

// 2026-11-01 08:00 เวลาไทย สรุปเดือนตุลาคม
const NOW = new Date('2026-11-01T01:00:00Z');
const LABEL = 'เดือนตุลาคม 2569';
const SUMMARY_URL = 'https://liff.line.me/liff-1?tab=summary&m=2026-10';
const ROWS = [
  { type: 'expense', category: 'อาหาร', total: 6200, entryCount: 30 },
  { type: 'expense', category: 'เดินทาง', total: 3100, entryCount: 10 },
  { type: 'income', category: 'เงินเดือน', total: 25000, entryCount: 1 },
];

const TWO_USERS = [{ userId: 'user-1', lineUserId: 'U1' }, { userId: 'user-2', lineUserId: 'U2' }];

function setup({ users = [{ userId: 'user-1', lineUserId: 'U1' }], rows = ROWS } = {}) {
  const repository = {
    listMonthlySummaryUsers: vi.fn().mockResolvedValue(users),
    summarizeTransactions: vi.fn().mockResolvedValue(rows),
    reserveNotification: vi.fn().mockResolvedValue(true),
  };
  const pushFlex = vi.fn().mockResolvedValue();
  const pushText = vi.fn().mockResolvedValue();
  const buildSummaryUrl = vi.fn(() => SUMMARY_URL);
  const logger = { error: vi.fn() };
  const run = createMonthlySummaryRunner({ repository, pushFlex, pushText, buildSummaryUrl, now: () => NOW, logger });
  return { repository, pushFlex, pushText, buildSummaryUrl, logger, run };
}

describe('createMonthlySummaryRunner', () => {
  it('pushes last month with the canned comment after reserving the month', async () => {
    const { repository, pushFlex, pushText, buildSummaryUrl, run } = setup();

    const result = await run();

    const summary = buildSummary(ROWS, LABEL);
    expect(repository.summarizeTransactions).toHaveBeenCalledWith('user-1', '2026-10-01', '2026-10-31');
    expect(repository.reserveNotification).toHaveBeenCalledWith({ userId: 'user-1', kind: MONTHLY_SUMMARY_KIND, period: '2026-10-01' });
    expect(buildSummaryUrl).toHaveBeenCalledWith('2026-10');
    expect(pushFlex).toHaveBeenCalledWith('U1', buildSummaryFlex(summary, pickMonthlyComment(summary, 'ตุลาคม'), { summaryUrl: SUMMARY_URL }));
    const flex = pushFlex.mock.calls[0][1];
    expect(flex.altText).toBe('สรุปเดือนตุลาคม 2569: รายรับ 25,000 บาท รายจ่าย 9,300 บาท');
    expect(JSON.stringify(flex)).toContain('เฮียว่า');
    expect(repository.reserveNotification.mock.invocationCallOrder[0]).toBeLessThan(pushFlex.mock.invocationCallOrder[0]);
    expect(pushText).not.toHaveBeenCalled();
    expect(result).toEqual({ eligible: 1, sent: 1, nudged: 0, skipped: 0, failed: 0, pushFailed: 0 });
  });

  it('sends the comeback text instead of a card for a month without entries', async () => {
    const { pushFlex, pushText, repository, run } = setup({ rows: [] });

    const result = await run();

    expect(repository.reserveNotification).toHaveBeenCalledWith({ userId: 'user-1', kind: MONTHLY_SUMMARY_KIND, period: '2026-10-01' });
    expect(pushText).toHaveBeenCalledWith('U1', 'เดือนตุลาคมยังไม่ได้จดรายการเลยนะ เดือนพฤศจิกายนเริ่มใหม่กัน พิมพ์ เช่น "กาแฟ 60" ส่งมาได้เลย');
    expect(pushFlex).not.toHaveBeenCalled();
    expect(result).toEqual({ eligible: 1, sent: 0, nudged: 1, skipped: 0, failed: 0, pushFailed: 0 });
  });

  it('skips a user whose month was already reserved', async () => {
    const { repository, pushFlex, pushText, run } = setup();
    repository.reserveNotification.mockResolvedValue(false);

    expect(await run()).toEqual({ eligible: 1, sent: 0, nudged: 0, skipped: 1, failed: 0, pushFailed: 0 });
    expect(pushFlex).not.toHaveBeenCalled();
    expect(pushText).not.toHaveBeenCalled();
  });

  it('keeps going after one user fails to load and logs no amounts', async () => {
    const { repository, pushFlex, logger, run } = setup({ users: [{ userId: 'user-1', lineUserId: 'U1' }, { userId: 'user-2', lineUserId: 'U2' }] });
    repository.summarizeTransactions.mockRejectedValueOnce(new Error('db down'));

    const result = await run();

    expect(pushFlex).toHaveBeenCalledTimes(1);
    expect(pushFlex.mock.calls[0][0]).toBe('U2');
    expect(logger.error).toHaveBeenCalledWith('Failed to prepare monthly summary', { userId: 'user-1', reason: 'db down' });
    expect(result).toEqual({ eligible: 2, sent: 1, nudged: 0, skipped: 0, failed: 1, pushFailed: 0 });
  });

  it('counts a reservation error as failed and does not push to that user', async () => {
    const { repository, pushFlex, logger, run } = setup({ users: TWO_USERS });
    repository.reserveNotification.mockRejectedValueOnce(new Error('db down'));

    const result = await run();

    expect(pushFlex).toHaveBeenCalledTimes(1);
    expect(pushFlex.mock.calls[0][0]).toBe('U2');
    expect(logger.error).toHaveBeenCalledWith('Failed to prepare monthly summary', { userId: 'user-1', reason: 'db down' });
    expect(result).toEqual({ eligible: 2, sent: 1, nudged: 0, skipped: 0, failed: 1, pushFailed: 0 });
  });

  // จองไว้แล้วไม่ลบและไม่ลองซ้ำ เพราะ LINE อาจส่งถึงแล้วแม้ client ได้ error
  it('counts a failed push as pushFailed, keeps the reservation and still sends to the next user', async () => {
    const { repository, pushFlex, logger, run } = setup({ users: TWO_USERS });
    pushFlex.mockRejectedValueOnce(new Error('LINE 500'));

    const result = await run();

    expect(repository.reserveNotification).toHaveBeenCalledTimes(2);
    expect(pushFlex).toHaveBeenCalledTimes(2);
    expect(pushFlex.mock.calls[1][0]).toBe('U2');
    expect(logger.error).toHaveBeenCalledWith('Failed to push monthly summary', { userId: 'user-1', reason: 'LINE 500' });
    expect(result).toEqual({ eligible: 2, sent: 1, nudged: 0, skipped: 0, failed: 0, pushFailed: 1 });
  });

  it('counts a failed comeback text as pushFailed after reserving the month', async () => {
    const { repository, pushText, logger, run } = setup({ rows: [] });
    pushText.mockRejectedValue(new Error('LINE 500'));

    const result = await run();

    expect(repository.reserveNotification.mock.invocationCallOrder[0]).toBeLessThan(pushText.mock.invocationCallOrder[0]);
    expect(pushText).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith('Failed to push monthly summary', { userId: 'user-1', reason: 'LINE 500' });
    expect(result).toEqual({ eligible: 1, sent: 0, nudged: 0, skipped: 0, failed: 0, pushFailed: 1 });
  });

  it('returns zero counts when nobody is enrolled', async () => {
    const { repository, run } = setup({ users: [] });

    expect(await run()).toEqual({ eligible: 0, sent: 0, nudged: 0, skipped: 0, failed: 0, pushFailed: 0 });
    expect(repository.summarizeTransactions).not.toHaveBeenCalled();
  });

  it('counts a failed push separately and does not retry it', async () => {
    const { pushFlex, logger, run } = setup();
    pushFlex.mockRejectedValue(new Error('blocked'));

    const result = await run();

    expect(pushFlex).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith('Failed to push monthly summary', { userId: 'user-1', reason: 'blocked' });
    expect(result).toEqual({ eligible: 1, sent: 0, nudged: 0, skipped: 0, failed: 0, pushFailed: 1 });
  });
});

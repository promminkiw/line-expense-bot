import { describe, it, expect, vi } from 'vitest';
import { createDailyReminderRunner, DAILY_REMINDER_KIND, DAILY_REMINDER_TEXT } from './daily-reminder.js';

// 2026-10-19 21:00 เวลาไทย
const NOW = new Date('2026-10-19T14:00:00Z');

function setup(users = [{ userId: 'user-1', lineUserId: 'U1' }]) {
  const repository = {
    listUsersToRemind: vi.fn().mockResolvedValue(users),
    reserveNotification: vi.fn().mockResolvedValue(true),
  };
  const pushText = vi.fn().mockResolvedValue();
  const logger = { error: vi.fn() };
  const run = createDailyReminderRunner({ repository, pushText, now: () => NOW, logger });
  return { repository, pushText, logger, run };
}

describe('createDailyReminderRunner', () => {
  it('uses the agreed reminder text', () => {
    expect(DAILY_REMINDER_TEXT).toBe('วันนี้ยังไม่ได้จดรายการเลย ใช้อะไรไปบ้าง พิมพ์มาได้เลย เช่น "กินข้าว 60"');
  });

  it('asks for users to remind today in Bangkok time, reserves the day and pushes the text without buttons', async () => {
    const { repository, pushText, run } = setup();

    const result = await run();

    expect(repository.listUsersToRemind).toHaveBeenCalledWith('2026-10-19');
    expect(repository.reserveNotification).toHaveBeenCalledWith({ userId: 'user-1', kind: DAILY_REMINDER_KIND, period: '2026-10-19' });
    expect(pushText).toHaveBeenCalledWith('U1', DAILY_REMINDER_TEXT);
    expect(repository.reserveNotification.mock.invocationCallOrder[0]).toBeLessThan(pushText.mock.invocationCallOrder[0]);
    expect(result).toEqual({ eligible: 1, sent: 1, skipped: 0, failed: 0, pushFailed: 0 });
  });

  // 00:30 ของวันที่ 20 ตามเวลาไทยยังเป็นวันที่ 19 ตาม UTC ต้องได้วันไทย
  it('uses the Bangkok date near midnight', async () => {
    const { repository } = setup([]);
    const run = createDailyReminderRunner({ repository, pushText: vi.fn(), now: () => new Date('2026-10-19T17:30:00Z') });

    await run();

    expect(repository.listUsersToRemind).toHaveBeenCalledWith('2026-10-20');
  });

  it('skips a user who was already reminded today', async () => {
    const { repository, pushText, run } = setup();
    repository.reserveNotification.mockResolvedValue(false);

    expect(await run()).toEqual({ eligible: 1, sent: 0, skipped: 1, failed: 0, pushFailed: 0 });
    expect(pushText).not.toHaveBeenCalled();
  });

  it('counts a reservation error as failed, does not push to that user and keeps going', async () => {
    const { repository, pushText, logger, run } = setup([
      { userId: 'user-1', lineUserId: 'U1' },
      { userId: 'user-2', lineUserId: 'U2' },
    ]);
    repository.reserveNotification.mockRejectedValueOnce(new Error('db down'));

    expect(await run()).toEqual({ eligible: 2, sent: 1, skipped: 0, failed: 1, pushFailed: 0 });
    expect(pushText).toHaveBeenCalledTimes(1);
    expect(pushText).toHaveBeenCalledWith('U2', DAILY_REMINDER_TEXT);
    expect(logger.error).toHaveBeenCalledWith('Failed to reserve daily reminder', { userId: 'user-1', reason: 'db down' });
  });

  // จองไว้แล้วไม่ลบและไม่ลองซ้ำ เพราะ LINE อาจส่งถึงแล้วแม้ client ได้ error
  it('counts a failed push as pushFailed, keeps the reservation and still sends to the next user', async () => {
    const { repository, pushText, logger, run } = setup([
      { userId: 'user-1', lineUserId: 'U1' },
      { userId: 'user-2', lineUserId: 'U2' },
    ]);
    pushText.mockRejectedValueOnce(new Error('LINE 500'));

    expect(await run()).toEqual({ eligible: 2, sent: 1, skipped: 0, failed: 0, pushFailed: 1 });
    expect(repository.reserveNotification).toHaveBeenCalledTimes(2);
    expect(pushText).toHaveBeenLastCalledWith('U2', DAILY_REMINDER_TEXT);
    expect(logger.error).toHaveBeenCalledWith('Failed to push daily reminder', { userId: 'user-1', reason: 'LINE 500' });
  });

  it('returns zero counts when nobody needs a reminder', async () => {
    const { repository, run } = setup([]);

    expect(await run()).toEqual({ eligible: 0, sent: 0, skipped: 0, failed: 0, pushFailed: 0 });
    expect(repository.reserveNotification).not.toHaveBeenCalled();
  });
});

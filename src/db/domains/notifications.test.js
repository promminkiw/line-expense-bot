import { describe, it, expect } from 'vitest';
import { createNotificationsRepository } from './notifications.js';
import { DatabaseError } from '../repository.js';
import { SETTINGS_COLUMNS } from '../../notifications/settings.js';
import { fakeSupabase } from '../test-helpers.mjs';

describe('repository notification settings', () => {
  it('reads the switches of this user', async () => {
    const { supabase, calls } = fakeSupabase({ data: { weekly_summary_enabled: true }, error: null });

    expect(await createNotificationsRepository(supabase).getNotificationSettings('user-1')).toEqual({ weeklySummary: true, dailyReminder: false });
    expect(calls).toEqual([['from', 'users'], ['select', SETTINGS_COLUMNS], ['eq', 'id', 'user-1'], ['maybeSingle']]);
  });

  it('treats a missing user row as everything off', async () => {
    const { supabase } = fakeSupabase({ data: null, error: null });

    expect(await createNotificationsRepository(supabase).getNotificationSettings('user-1')).toEqual({ weeklySummary: false, dailyReminder: false });
  });

  it('updates only the given switches of this user and returns the saved values', async () => {
    const { supabase, calls } = fakeSupabase({ data: { weekly_summary_enabled: true }, error: null });

    expect(await createNotificationsRepository(supabase).updateNotificationSettings('user-1', { weeklySummary: true })).toEqual({ weeklySummary: true, dailyReminder: false });
    expect(calls).toEqual([
      ['from', 'users'],
      ['update', { weekly_summary_enabled: true }],
      ['eq', 'id', 'user-1'],
      ['select', SETTINGS_COLUMNS],
      ['maybeSingle'],
    ]);
  });

  it('throws DatabaseError when reading or saving fails', async () => {
    const { supabase } = fakeSupabase({ data: null, error: { message: 'boom' } });
    const repository = createNotificationsRepository(supabase);

    await expect(repository.getNotificationSettings('user-1')).rejects.toThrow('Database getNotificationSettings failed: boom');
    await expect(repository.updateNotificationSettings('user-1', { weeklySummary: true })).rejects.toBeInstanceOf(DatabaseError);
  });

  it('saves the daily reminder switch to its own column', async () => {
    const { supabase, calls } = fakeSupabase({ data: { weekly_summary_enabled: false, daily_reminder_enabled: true }, error: null });

    expect(await createNotificationsRepository(supabase).updateNotificationSettings('user-1', { dailyReminder: true })).toEqual({
      weeklySummary: false,
      dailyReminder: true,
    });
    expect(calls[1]).toEqual(['update', { daily_reminder_enabled: true }]);
  });
});

describe('repository.disableNotifications', () => {
  it('turns off both notification switches of that LINE user', async () => {
    const { supabase, calls } = fakeSupabase({ data: null, error: null });

    await expect(createNotificationsRepository(supabase).disableNotifications('U1')).resolves.toBeUndefined();
    expect(calls).toEqual([
      ['from', 'users'],
      ['update', { weekly_summary_enabled: false, daily_reminder_enabled: false }],
      ['eq', 'line_user_id', 'U1'],
    ]);
  });

  it('throws DatabaseError when Supabase returns an error', async () => {
    const { supabase } = fakeSupabase({ data: null, error: { message: 'boom' } });

    const promise = createNotificationsRepository(supabase).disableNotifications('U1');

    await expect(promise).rejects.toBeInstanceOf(DatabaseError);
    await expect(promise).rejects.toThrow('Database disableNotifications failed: boom');
  });
});

describe('repository.listWeeklySummaryUsers', () => {
  it('lists only users who turned the weekly summary on', async () => {
    const { supabase, calls } = fakeSupabase({ data: [{ id: 'user-1', line_user_id: 'U1' }], error: null });

    expect(await createNotificationsRepository(supabase).listWeeklySummaryUsers()).toEqual([{ userId: 'user-1', lineUserId: 'U1' }]);
    expect(calls).toEqual([
      ['from', 'users'],
      ['select', 'id, line_user_id'],
      ['eq', 'weekly_summary_enabled', true],
      ['order', 'id'],
    ]);
  });

  it('throws DatabaseError when Supabase returns an error', async () => {
    const { supabase } = fakeSupabase({ data: null, error: { message: 'boom' } });

    await expect(createNotificationsRepository(supabase).listWeeklySummaryUsers()).rejects.toThrow('Database listWeeklySummaryUsers failed: boom');
  });
});

describe('repository.reserveNotification', () => {
  const reservation = { userId: 'user-1', kind: 'weekly_summary', period: '2026-10-12' };

  it('returns true when the log row was inserted', async () => {
    const { supabase, calls } = fakeSupabase({ data: [{ user_id: 'user-1' }], error: null });

    expect(await createNotificationsRepository(supabase).reserveNotification(reservation)).toBe(true);
    expect(calls).toEqual([
      ['from', 'notification_log'],
      [
        'upsert',
        { user_id: 'user-1', kind: 'weekly_summary', period: '2026-10-12' },
        { onConflict: 'user_id,kind,period', ignoreDuplicates: true },
      ],
      ['select', 'user_id'],
    ]);
  });

  it('returns false when this notification was already reserved', async () => {
    const { supabase } = fakeSupabase({ data: [], error: null });

    expect(await createNotificationsRepository(supabase).reserveNotification(reservation)).toBe(false);
  });

  it('throws DatabaseError when Supabase returns an error', async () => {
    const { supabase } = fakeSupabase({ data: null, error: { message: 'boom' } });

    await expect(createNotificationsRepository(supabase).reserveNotification(reservation)).rejects.toThrow('Database reserveNotification failed: boom');
  });
});

describe('repository.listUsersToRemind', () => {
  it('calls the SQL function with the Bangkok day and maps the rows', async () => {
    const { supabase, calls } = fakeSupabase({ data: [{ user_id: 'user-1', line_user_id: 'U1' }], error: null });

    expect(await createNotificationsRepository(supabase).listUsersToRemind('2026-10-19')).toEqual([{ userId: 'user-1', lineUserId: 'U1' }]);
    expect(calls).toEqual([['rpc', 'users_to_remind', { p_day: '2026-10-19' }]]);
  });

  it('throws DatabaseError when Supabase returns an error', async () => {
    const { supabase } = fakeSupabase({ data: null, error: { message: 'boom' } });

    const promise = createNotificationsRepository(supabase).listUsersToRemind('2026-10-19');

    await expect(promise).rejects.toBeInstanceOf(DatabaseError);
    await expect(promise).rejects.toThrow('Database listUsersToRemind failed: boom');
  });
});

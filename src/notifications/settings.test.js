import { describe, it, expect } from 'vitest';
import { NOTIFICATION_SETTINGS, SETTINGS_COLUMNS, toNotificationSettings, toSettingsColumns } from './settings.js';

describe('notification settings', () => {
  it('maps each API field to its users column', () => {
    expect(NOTIFICATION_SETTINGS).toEqual({ weeklySummary: 'weekly_summary_enabled', dailyReminder: 'daily_reminder_enabled' });
    expect(SETTINGS_COLUMNS).toBe('weekly_summary_enabled, daily_reminder_enabled');
  });

  it('reads a users row into API fields, and a missing row as everything off', () => {
    expect(toNotificationSettings({ weekly_summary_enabled: true, daily_reminder_enabled: false })).toEqual({
      weeklySummary: true,
      dailyReminder: false,
    });
    expect(toNotificationSettings(null)).toEqual({ weeklySummary: false, dailyReminder: false });
  });

  it('turns API fields into users columns', () => {
    expect(toSettingsColumns({ dailyReminder: true })).toEqual({ daily_reminder_enabled: true });
  });
});

import { describe, it, expect } from 'vitest';
import { NOTIFICATION_SETTINGS, SETTINGS_COLUMNS, toNotificationSettings, toSettingsColumns } from './settings.js';

describe('notification settings', () => {
  it('maps each API field to its users column', () => {
    expect(NOTIFICATION_SETTINGS).toEqual({ weeklySummary: 'weekly_summary_enabled' });
    expect(SETTINGS_COLUMNS).toBe('weekly_summary_enabled');
  });

  it('reads a users row into API fields, and a missing row as everything off', () => {
    expect(toNotificationSettings({ weekly_summary_enabled: true })).toEqual({ weeklySummary: true });
    expect(toNotificationSettings(null)).toEqual({ weeklySummary: false });
  });

  it('turns API fields into users columns', () => {
    expect(toSettingsColumns({ weeklySummary: false })).toEqual({ weekly_summary_enabled: false });
  });
});

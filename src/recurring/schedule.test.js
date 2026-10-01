import { describe, it, expect } from 'vitest';
import { lastDayOf, monthStartOf, dueDateFor, isDue, lastRunOnAfterSave } from './schedule.js';

describe('lastDayOf and monthStartOf', () => {
  it('knows month lengths including February in leap and normal years', () => {
    expect(lastDayOf('2026-10-15')).toBe(31);
    expect(lastDayOf('2026-04-01')).toBe(30);
    expect(lastDayOf('2026-02-10')).toBe(28);
    expect(lastDayOf('2028-02-10')).toBe(29);
    expect(monthStartOf('2026-10-15')).toBe('2026-10-01');
  });
});

describe('dueDateFor', () => {
  it('uses the day of the month as is when the month is long enough', () => {
    expect(dueDateFor('2026-10-15', 5)).toBe('2026-10-05');
    expect(dueDateFor('2026-10-15', 31)).toBe('2026-10-31');
  });

  it('falls back to the last day of a shorter month', () => {
    expect(dueDateFor('2026-02-10', 31)).toBe('2026-02-28');
    expect(dueDateFor('2028-02-10', 30)).toBe('2028-02-29');
    expect(dueDateFor('2026-04-10', 31)).toBe('2026-04-30');
  });
});

describe('isDue', () => {
  const rule = { active: true, dayOfMonth: 5, lastRunOn: null };

  it('is due on and after the due day when it has not run this month', () => {
    expect(isDue(rule, '2026-10-05')).toBe(true);
    expect(isDue(rule, '2026-10-20')).toBe(true);
  });

  it('is not due before the due day', () => {
    expect(isDue(rule, '2026-10-04')).toBe(false);
  });

  it('is not due when it already ran this month, even if the day was edited later', () => {
    expect(isDue({ ...rule, lastRunOn: '2026-10-05' }, '2026-10-20')).toBe(false);
    expect(isDue({ ...rule, dayOfMonth: 25, lastRunOn: '2026-10-05' }, '2026-10-25')).toBe(false);
  });

  it('is due again in the next month after a run last month', () => {
    expect(isDue({ ...rule, lastRunOn: '2026-09-05' }, '2026-10-05')).toBe(true);
  });

  it('is never due when paused', () => {
    expect(isDue({ ...rule, active: false }, '2026-10-20')).toBe(false);
  });

  it('is due on the last day of a short month for day 31', () => {
    expect(isDue({ ...rule, dayOfMonth: 31 }, '2026-02-27')).toBe(false);
    expect(isDue({ ...rule, dayOfMonth: 31 }, '2026-02-28')).toBe(true);
  });
});

describe('lastRunOnAfterSave', () => {
  it('marks this month as done when the due day has already passed', () => {
    expect(lastRunOnAfterSave(null, 5, '2026-10-10')).toBe('2026-10-05');
    expect(lastRunOnAfterSave(null, 10, '2026-10-10')).toBe('2026-10-10');
  });

  it('keeps the old value when the due day is still ahead', () => {
    expect(lastRunOnAfterSave(null, 20, '2026-10-10')).toBeNull();
    expect(lastRunOnAfterSave('2026-09-20', 20, '2026-10-10')).toBe('2026-09-20');
  });
});

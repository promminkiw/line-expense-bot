import { describe, it, expect } from 'vitest';
import { toBangkokDateString, isValidCalendarDate } from './date.js';

describe('toBangkokDateString', () => {
  it('formats as YYYY-MM-DD', () => {
    expect(toBangkokDateString(new Date('2026-09-29T05:00:00Z'))).toBe('2026-09-29');
  });

  it('rolls to next day after 17:00 UTC because Bangkok is UTC+7', () => {
    expect(toBangkokDateString(new Date('2026-09-29T17:00:00Z'))).toBe('2026-09-30');
  });

  it('stays on same day just before Bangkok midnight', () => {
    expect(toBangkokDateString(new Date('2026-09-29T16:59:59Z'))).toBe('2026-09-29');
  });
});

describe('isValidCalendarDate', () => {
  it('accepts real dates including a leap day', () => {
    expect(isValidCalendarDate('2026-09-29')).toBe(true);
    expect(isValidCalendarDate('2028-02-29')).toBe(true);
  });

  it('rejects dates that do not exist', () => {
    expect(isValidCalendarDate('2026-02-30')).toBe(false);
    expect(isValidCalendarDate('2026-02-29')).toBe(false);
    expect(isValidCalendarDate('2026-13-01')).toBe(false);
  });

  it('rejects malformed strings', () => {
    for (const value of ['2026-9-1', '', '26-09-29', '2026-09-29T00:00', 'abc']) {
      expect(isValidCalendarDate(value)).toBe(false);
    }
  });

  it('rejects non-strings', () => {
    for (const value of [undefined, null, 20260929, ['2026-09-29']]) {
      expect(isValidCalendarDate(value)).toBe(false);
    }
  });
});

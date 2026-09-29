import { describe, it, expect } from 'vitest';
import { toBangkokDateString } from './date.js';

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

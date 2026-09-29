import { describe, it, expect } from 'vitest';
import { getPeriodRange } from './period.js';

// 2026-09-29 เป็นวันอังคาร
const TUESDAY_NOON_BANGKOK = new Date('2026-09-29T05:00:00Z');

describe('getPeriodRange', () => {
  it('uses today for today', () => {
    expect(getPeriodRange('today', TUESDAY_NOON_BANGKOK)).toEqual({
      from: '2026-09-29',
      to: '2026-09-29',
      label: 'วันนี้ (29/09)',
    });
  });

  it('starts the week on Monday', () => {
    expect(getPeriodRange('week', TUESDAY_NOON_BANGKOK)).toEqual({
      from: '2026-09-28',
      to: '2026-09-29',
      label: 'สัปดาห์นี้ (28/09 - 29/09)',
    });
  });

  it('keeps Sunday in the week that started the Monday before', () => {
    const sunday = new Date('2026-10-04T05:00:00Z');

    expect(getPeriodRange('week', sunday).from).toBe('2026-09-28');
  });

  it('shows a single date when the week starts today', () => {
    const monday = new Date('2026-09-28T05:00:00Z');

    expect(getPeriodRange('week', monday).label).toBe('สัปดาห์นี้ (28/09)');
  });

  it('uses Bangkok time to decide the day', () => {
    // 2026-09-27 18:00 UTC คือ 2026-09-28 01:00 เวลาไทย (วันจันทร์)
    const earlyMondayBangkok = new Date('2026-09-27T18:00:00Z');

    expect(getPeriodRange('week', earlyMondayBangkok)).toMatchObject({
      from: '2026-09-28',
      to: '2026-09-28',
    });
  });

  it('starts the month on day 1', () => {
    expect(getPeriodRange('month', TUESDAY_NOON_BANGKOK)).toEqual({
      from: '2026-09-01',
      to: '2026-09-29',
      label: 'เดือนนี้ (01/09 - 29/09)',
    });
  });

  it('throws for an unknown period', () => {
    expect(() => getPeriodRange('year', TUESDAY_NOON_BANGKOK)).toThrow('Unknown period: year');
  });
});

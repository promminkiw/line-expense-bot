import { describe, it, expect } from 'vitest';
import { parseSummaryCommand } from './command.js';

describe('parseSummaryCommand', () => {
  it('maps each summary text to its command', () => {
    expect(parseSummaryCommand('สรุป')).toBe('menu');
    expect(parseSummaryCommand('สรุปวันนี้')).toBe('today');
    expect(parseSummaryCommand('สรุปสัปดาห์นี้')).toBe('week');
    expect(parseSummaryCommand('สรุปเดือนนี้')).toBe('month');
  });

  it('ignores spaces anywhere in the text', () => {
    expect(parseSummaryCommand('  สรุป เดือนนี้ ')).toBe('month');
  });

  it('returns null for other messages', () => {
    expect(parseSummaryCommand('กินข้าว 60')).toBeNull();
    expect(parseSummaryCommand('สรุปปีนี้')).toBeNull();
    expect(parseSummaryCommand('ช่วยสรุปให้หน่อย')).toBeNull();
  });
});

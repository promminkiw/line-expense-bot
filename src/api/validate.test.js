import { describe, it, expect } from 'vitest';
import { parseMonth, validateTransactionUpdate, validateRecurringRule } from './validate.js';

const VALID = { amount: 60, categoryId: 'cat-1', occurredOn: '2026-09-29', note: ' กินข้าว ' };

describe('parseMonth', () => {
  it('returns the first and last day of the month', () => {
    expect(parseMonth('2026-09')).toEqual({ from: '2026-09-01', to: '2026-09-30' });
    expect(parseMonth('2026-12')).toEqual({ from: '2026-12-01', to: '2026-12-31' });
  });

  it('knows February in leap and normal years', () => {
    expect(parseMonth('2028-02').to).toBe('2028-02-29');
    expect(parseMonth('2026-02').to).toBe('2026-02-28');
  });

  it('rejects anything that is not YYYY-MM', () => {
    expect(parseMonth('2026-13')).toBeNull();
    expect(parseMonth('2026-9')).toBeNull();
    expect(parseMonth('')).toBeNull();
    expect(parseMonth(undefined)).toBeNull();
  });

  it('accepts only years 2000 to 2100 so the database never sees an out of range date', () => {
    expect(parseMonth('2000-01')).toEqual({ from: '2000-01-01', to: '2000-01-31' });
    expect(parseMonth('2100-12')).toEqual({ from: '2100-12-01', to: '2100-12-31' });
    for (const month of ['0000-01', '1999-12', '2101-01', '9999-12']) {
      expect(parseMonth(month)).toBeNull();
    }
  });
});

describe('validateTransactionUpdate', () => {
  it('accepts a valid update and trims the note', () => {
    expect(validateTransactionUpdate(VALID)).toEqual({
      ok: true,
      value: { amount: 60, categoryId: 'cat-1', occurredOn: '2026-09-29', note: 'กินข้าว' },
    });
  });

  it('accepts the smallest and largest amounts', () => {
    expect(validateTransactionUpdate({ ...VALID, amount: 0.01 }).ok).toBe(true);
    expect(validateTransactionUpdate({ ...VALID, amount: 10000000 }).ok).toBe(true);
  });

  it('rejects amounts that are not positive, too large, not numbers or finer than satang', () => {
    for (const amount of [0, -5, 10000000.01, '60', Number.NaN, 1.005]) {
      expect(validateTransactionUpdate({ ...VALID, amount })).toEqual({ ok: false, error: 'Invalid amount' });
    }
  });

  it('rejects a missing category', () => {
    expect(validateTransactionUpdate({ ...VALID, categoryId: '' })).toEqual({ ok: false, error: 'Invalid category' });
  });

  it('rejects dates that are malformed or do not exist', () => {
    for (const occurredOn of ['2026-9-1', '2026-02-30', '', undefined]) {
      expect(validateTransactionUpdate({ ...VALID, occurredOn })).toEqual({ ok: false, error: 'Invalid date' });
    }
  });

  it('rejects notes that are not strings or longer than 200 characters', () => {
    expect(validateTransactionUpdate({ ...VALID, note: 5 })).toEqual({ ok: false, error: 'Invalid note' });
    expect(validateTransactionUpdate({ ...VALID, note: 'ก'.repeat(201) })).toEqual({ ok: false, error: 'Invalid note' });
  });

  it('rejects a body that is not an object', () => {
    expect(validateTransactionUpdate(null)).toEqual({ ok: false, error: 'Invalid body' });
  });
});

describe('validateRecurringRule', () => {
  const RULE = { amount: 590, categoryId: 'cat-1', dayOfMonth: 5, note: ' ค่าเน็ต ', active: true };

  it('accepts a valid rule and trims the note', () => {
    expect(validateRecurringRule(RULE)).toEqual({
      ok: true,
      value: { amount: 590, categoryId: 'cat-1', dayOfMonth: 5, note: 'ค่าเน็ต', active: true },
    });
  });

  it('accepts day 1 and day 31 and an empty note', () => {
    expect(validateRecurringRule({ ...RULE, dayOfMonth: 1, note: '' }).ok).toBe(true);
    expect(validateRecurringRule({ ...RULE, dayOfMonth: 31 }).ok).toBe(true);
  });

  it('rejects each bad field with its own error', () => {
    expect(validateRecurringRule(null)).toEqual({ ok: false, error: 'Invalid body' });
    expect(validateRecurringRule({ ...RULE, amount: 0 })).toEqual({ ok: false, error: 'Invalid amount' });
    expect(validateRecurringRule({ ...RULE, amount: 10.001 })).toEqual({ ok: false, error: 'Invalid amount' });
    expect(validateRecurringRule({ ...RULE, categoryId: '' })).toEqual({ ok: false, error: 'Invalid category' });
    expect(validateRecurringRule({ ...RULE, dayOfMonth: 0 })).toEqual({ ok: false, error: 'Invalid day' });
    expect(validateRecurringRule({ ...RULE, dayOfMonth: 32 })).toEqual({ ok: false, error: 'Invalid day' });
    expect(validateRecurringRule({ ...RULE, dayOfMonth: 5.5 })).toEqual({ ok: false, error: 'Invalid day' });
    expect(validateRecurringRule({ ...RULE, dayOfMonth: '5' })).toEqual({ ok: false, error: 'Invalid day' });
    expect(validateRecurringRule({ ...RULE, note: 'ก'.repeat(201) })).toEqual({ ok: false, error: 'Invalid note' });
    expect(validateRecurringRule({ ...RULE, note: 5 })).toEqual({ ok: false, error: 'Invalid note' });
    expect(validateRecurringRule({ ...RULE, active: 'yes' })).toEqual({ ok: false, error: 'Invalid active' });
  });
});

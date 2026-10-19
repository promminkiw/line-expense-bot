import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { validateGoalCreate, validateGoalUpdate, validateContribution, MAX_GOAL_NAME_LENGTH } = require('./validate.js');

describe('validateGoalCreate', () => {
  it('trims the name and leaves the date empty when it is not sent', () => {
    expect(validateGoalCreate({ name: '  เที่ยวญี่ปุ่น  ', targetAmount: 50000 })).toEqual({
      ok: true,
      value: { name: 'เที่ยวญี่ปุ่น', targetAmount: 50000, targetDate: null },
    });
  });

  it('keeps a valid wished date', () => {
    expect(validateGoalCreate({ name: 'คอนโด', targetAmount: 1500000.5, targetDate: '2027-06-30' }).value.targetDate).toBe('2027-06-30');
  });

  it('counts the name length in characters, not bytes', () => {
    expect(validateGoalCreate({ name: 'ก'.repeat(MAX_GOAL_NAME_LENGTH), targetAmount: 1 }).ok).toBe(true);
    expect(validateGoalCreate({ name: 'ก'.repeat(MAX_GOAL_NAME_LENGTH + 1), targetAmount: 1 })).toEqual({ ok: false, error: 'Invalid name' });
  });

  it.each([[undefined], [123], ['   '], ['เที่ยว\nญี่ปุ่น']])('refuses the name %j', (name) => {
    expect(validateGoalCreate({ name, targetAmount: 1 })).toEqual({ ok: false, error: 'Invalid name' });
  });

  it.each([[0], [-1], [10000000.01], [1.001], ['100'], [undefined]])('refuses the target %j', (targetAmount) => {
    expect(validateGoalCreate({ name: 'เที่ยว', targetAmount })).toEqual({ ok: false, error: 'Invalid amount' });
  });

  it.each([['2026-02-30'], [''], [20261231]])('refuses the date %j', (targetDate) => {
    expect(validateGoalCreate({ name: 'เที่ยว', targetAmount: 1, targetDate })).toEqual({ ok: false, error: 'Invalid date' });
  });

  it('refuses a body that is not an object', () => {
    expect(validateGoalCreate(undefined)).toEqual({ ok: false, error: 'Invalid body' });
  });
});

describe('validateGoalUpdate', () => {
  it('returns only the fields that were sent', () => {
    expect(validateGoalUpdate({ closed: true })).toEqual({ ok: true, value: { closed: true } });
    expect(validateGoalUpdate({ name: ' ทริป ', targetAmount: 900, targetDate: null })).toEqual({
      ok: true,
      value: { name: 'ทริป', targetAmount: 900, targetDate: null },
    });
  });

  it('refuses an empty change and a closed flag that is not a boolean', () => {
    expect(validateGoalUpdate({})).toEqual({ ok: false, error: 'Invalid body' });
    expect(validateGoalUpdate(null)).toEqual({ ok: false, error: 'Invalid body' });
    expect(validateGoalUpdate({ closed: 'yes' })).toEqual({ ok: false, error: 'Invalid closed' });
  });

  it('checks each sent field like create does', () => {
    expect(validateGoalUpdate({ name: '' })).toEqual({ ok: false, error: 'Invalid name' });
    expect(validateGoalUpdate({ targetAmount: 0 })).toEqual({ ok: false, error: 'Invalid amount' });
    expect(validateGoalUpdate({ targetDate: '2026-13-01' })).toEqual({ ok: false, error: 'Invalid date' });
  });
});

describe('validateContribution', () => {
  it('accepts an amount and a date', () => {
    expect(validateContribution({ amount: 500.25, occurredOn: '2026-10-19' })).toEqual({
      ok: true,
      value: { amount: 500.25, occurredOn: '2026-10-19' },
    });
  });

  it('refuses a bad amount, a bad date and a missing body', () => {
    expect(validateContribution({ amount: 0, occurredOn: '2026-10-19' })).toEqual({ ok: false, error: 'Invalid amount' });
    expect(validateContribution({ amount: 1, occurredOn: '19/10/2026' })).toEqual({ ok: false, error: 'Invalid date' });
    expect(validateContribution(undefined)).toEqual({ ok: false, error: 'Invalid body' });
  });
});

describe('goal names with invisible characters', () => {
  // ชื่อเป้าไปอยู่ในข้อความตอบของแชต และแชตหาเป้าจากชื่อที่พิมพ์
  it.each(['\u0085', '\u200b', '\u2060', '\ufeff', '\u202e', '\u2066', '\u2028', '\ud800'])('refuses %j', (char) => {
    expect(validateGoalCreate({ name: `บ้าน${char}ริมทะเล`, targetAmount: 1 })).toEqual({ ok: false, error: 'Invalid name' });
    expect(validateGoalUpdate({ name: `บ้าน${char}ริมทะเล` })).toEqual({ ok: false, error: 'Invalid name' });
  });
});

import { describe, it, expect } from 'vitest';
import {
  parseMonth,
  validateTransactionUpdate,
  validateRecurringRule,
  validateCategoryCreate,
  validateCategoryUpdate,
  validateSettingsUpdate,
  validateWalletCreate,
  validateWalletUpdate,
} from './validate.js';

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

  // Postgres ไม่มีปี 0 และปีไกลๆ เป็นการพิมพ์ผิด ใช้ช่วงเดียวกับ parseMonth ไม่งั้น DB ตอบ error เป็น 500
  it('rejects years outside 2000 to 2100 and keeps the edges', () => {
    expect(validateTransactionUpdate({ ...VALID, occurredOn: '2000-01-01' }).ok).toBe(true);
    expect(validateTransactionUpdate({ ...VALID, occurredOn: '2100-12-31' }).ok).toBe(true);
    for (const occurredOn of ['0000-01-01', '1999-12-31', '2101-01-01']) {
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

describe('validateCategoryCreate', () => {
  it('accepts a type and a trimmed name', () => {
    expect(validateCategoryCreate({ type: 'expense', name: '  ค่าแมว ' })).toEqual({
      ok: true,
      value: { type: 'expense', name: 'ค่าแมว' },
    });
  });

  it('accepts a 30 unit name and rejects 31', () => {
    expect(validateCategoryCreate({ type: 'income', name: 'ก'.repeat(30) }).ok).toBe(true);
    expect(validateCategoryCreate({ type: 'income', name: 'ก'.repeat(31) })).toEqual({ ok: false, error: 'Invalid name' });
  });

  // prompt ของ Claude คั่นชื่อหมวดด้วยจุลภาค และตัวควบคุมทำให้ prompt เพี้ยน
  it.each([[''], ['   '], ['แมว,หมา'], ['แมว\nหมา'], ['a\u007fb'], [42], [undefined]])('rejects the name %j', (name) => {
    expect(validateCategoryCreate({ type: 'expense', name })).toEqual({ ok: false, error: 'Invalid name' });
  });

  it('rejects the names of system categories for any type', () => {
    expect(validateCategoryCreate({ type: 'income', name: 'อื่นๆ' })).toEqual({ ok: false, error: 'Reserved name' });
    expect(validateCategoryCreate({ type: 'income', name: 'ใบเสร็จ/สลิปโอนเงิน' })).toEqual({ ok: false, error: 'Reserved name' });
  });

  it('rejects a bad type or body', () => {
    expect(validateCategoryCreate({ type: 'saving', name: 'x' })).toEqual({ ok: false, error: 'Invalid type' });
    expect(validateCategoryCreate(null)).toEqual({ ok: false, error: 'Invalid body' });
  });

  it('accepts a known icon and leaves icon out when it is not sent', () => {
    expect(validateCategoryCreate({ type: 'expense', name: 'กาแฟ', icon: 'coffee' })).toEqual({
      ok: true,
      value: { type: 'expense', name: 'กาแฟ', icon: 'coffee' },
    });
    expect(validateCategoryCreate({ type: 'expense', name: 'กาแฟ' }).value).not.toHaveProperty('icon');
  });

  it.each([['unicorn'], [''], [42], ['Coffee']])('rejects the icon %j', (icon) => {
    expect(validateCategoryCreate({ type: 'expense', name: 'กาแฟ', icon })).toEqual({ ok: false, error: 'Invalid icon' });
  });
});

describe('validateCategoryUpdate', () => {
  it('accepts a new name, a hidden flag, or both', () => {
    expect(validateCategoryUpdate({ name: ' แมว ' })).toEqual({ ok: true, value: { name: 'แมว' } });
    expect(validateCategoryUpdate({ hidden: true })).toEqual({ ok: true, value: { hidden: true } });
    expect(validateCategoryUpdate({ name: 'แมว', hidden: false })).toEqual({ ok: true, value: { name: 'แมว', hidden: false } });
  });

  it('rejects an empty or missing body', () => {
    expect(validateCategoryUpdate({})).toEqual({ ok: false, error: 'Invalid body' });
    expect(validateCategoryUpdate(null)).toEqual({ ok: false, error: 'Invalid body' });
  });

  it('rejects a bad name or hidden value', () => {
    expect(validateCategoryUpdate({ name: '' })).toEqual({ ok: false, error: 'Invalid name' });
    expect(validateCategoryUpdate({ name: 'อื่นๆ' })).toEqual({ ok: false, error: 'Reserved name' });
    expect(validateCategoryUpdate({ hidden: 'true' })).toEqual({ ok: false, error: 'Invalid hidden' });
  });

  it('accepts a known icon, and null to go back to the default icon', () => {
    expect(validateCategoryUpdate({ icon: 'pet' })).toEqual({ ok: true, value: { icon: 'pet' } });
    expect(validateCategoryUpdate({ icon: null })).toEqual({ ok: true, value: { icon: null } });
    expect(validateCategoryUpdate({ name: 'แมว', icon: 'pet', hidden: false })).toEqual({
      ok: true,
      value: { name: 'แมว', hidden: false, icon: 'pet' },
    });
  });

  it('rejects an unknown icon', () => {
    expect(validateCategoryUpdate({ icon: 'unicorn' })).toEqual({ ok: false, error: 'Invalid icon' });
  });
});

describe('validateSettingsUpdate', () => {
  it('keeps a known boolean switch and drops unknown fields', () => {
    expect(validateSettingsUpdate({ weeklySummary: true, isAdmin: true })).toEqual({ ok: true, value: { weeklySummary: true } });
    expect(validateSettingsUpdate({ weeklySummary: false })).toEqual({ ok: true, value: { weeklySummary: false } });
  });

  it.each([[null], ['on'], [{}], [{ isAdmin: true }], [[true]]])('refuses %j without a known switch', (body) => {
    expect(validateSettingsUpdate(body)).toEqual({ ok: false, error: 'Invalid body' });
  });

  it('refuses a switch that is not a boolean', () => {
    expect(validateSettingsUpdate({ weeklySummary: 'true' })).toEqual({ ok: false, error: 'Invalid weeklySummary' });
  });

  it('keeps the daily reminder switch together with the weekly one', () => {
    expect(validateSettingsUpdate({ dailyReminder: true })).toEqual({ ok: true, value: { dailyReminder: true } });
    expect(validateSettingsUpdate({ weeklySummary: false, dailyReminder: true })).toEqual({
      ok: true,
      value: { weeklySummary: false, dailyReminder: true },
    });
  });

  it('refuses a daily reminder switch that is not a boolean', () => {
    expect(validateSettingsUpdate({ dailyReminder: 1 })).toEqual({ ok: false, error: 'Invalid dailyReminder' });
  });
});

describe('validateTransactionUpdate walletId', () => {
  const body = { amount: 60, categoryId: 'c1', occurredOn: '2026-09-29', note: 'x' };

  it('leaves walletId out when it is not sent', () => {
    expect(validateTransactionUpdate(body).value).not.toHaveProperty('walletId');
  });

  it('keeps a walletId string and refuses other values', () => {
    expect(validateTransactionUpdate({ ...body, walletId: 'w-card' }).value.walletId).toBe('w-card');
    expect(validateTransactionUpdate({ ...body, walletId: '' })).toEqual({ ok: false, error: 'Invalid wallet' });
    expect(validateTransactionUpdate({ ...body, walletId: null })).toEqual({ ok: false, error: 'Invalid wallet' });
  });
});

describe('validateWalletCreate', () => {
  it('trims the name', () => {
    expect(validateWalletCreate({ name: '  บัตรเครดิต ' })).toEqual({ ok: true, value: { name: 'บัตรเครดิต' } });
  });

  it.each([
    [{ name: '' }, 'Invalid name'],
    [{ name: 'ก'.repeat(31) }, 'Invalid name'],
    [{ name: 'a,b' }, 'Invalid name'],
    [{ name: 'a\nb' }, 'Invalid name'],
    [{ name: 5 }, 'Invalid name'],
    [{ name: ' เงินสด ' }, 'Reserved name'],
    [null, 'Invalid body'],
  ])('refuses %j with %s', (body, error) => {
    expect(validateWalletCreate(body)).toEqual({ ok: false, error });
  });
});

describe('validateWalletUpdate', () => {
  it('accepts a name, hidden, or both', () => {
    expect(validateWalletUpdate({ name: 'กสิกร' })).toEqual({ ok: true, value: { name: 'กสิกร' } });
    expect(validateWalletUpdate({ hidden: true })).toEqual({ ok: true, value: { hidden: true } });
  });

  it('refuses an empty body, a bad hidden and a reserved name', () => {
    expect(validateWalletUpdate({})).toEqual({ ok: false, error: 'Invalid body' });
    expect(validateWalletUpdate({ hidden: 'yes' })).toEqual({ ok: false, error: 'Invalid hidden' });
    expect(validateWalletUpdate({ name: 'เงินสด' })).toEqual({ ok: false, error: 'Reserved name' });
  });
});

// อักขระมองไม่เห็นทำให้ชื่อหน้าตาเหมือนชื่อที่ห้าม เช่น "เงินสด" ที่มี zero-width ต่อท้าย
const INVISIBLE_CHARACTERS = ['\u0085', '\u009f', '\u200b', '\u200d', '\u2060', '\ufeff', '\u200e', '\u202e', '\u2066', '\u061c', '\u2028', '\u2029', '\ud800'];

describe('invisible characters in names', () => {
  it.each(INVISIBLE_CHARACTERS)('refuses a category name with %j', (char) => {
    expect(validateCategoryCreate({ type: 'expense', name: `แมว${char}หมา` })).toEqual({ ok: false, error: 'Invalid name' });
    expect(validateCategoryUpdate({ name: `แมว${char}หมา` })).toEqual({ ok: false, error: 'Invalid name' });
  });

  it.each(INVISIBLE_CHARACTERS)('refuses a wallet name with %j', (char) => {
    expect(validateWalletCreate({ name: `เงิน${char}สด` })).toEqual({ ok: false, error: 'Invalid name' });
    expect(validateWalletUpdate({ name: `บัตร${char}เครดิต` })).toEqual({ ok: false, error: 'Invalid name' });
  });

  it('refuses a fullwidth comma like the plain comma', () => {
    expect(validateCategoryCreate({ type: 'expense', name: 'แมว\uff0cหมา' })).toEqual({ ok: false, error: 'Invalid name' });
    expect(validateWalletCreate({ name: 'a\uff0cb' })).toEqual({ ok: false, error: 'Invalid name' });
  });

  it('still accepts Thai names with tone marks and emoji', () => {
    expect(validateCategoryCreate({ type: 'expense', name: 'ค่าน้ำมัน ⛽' }).ok).toBe(true);
    expect(validateWalletCreate({ name: 'กระเป๋าตังค์ 👛' }).ok).toBe(true);
  });
});

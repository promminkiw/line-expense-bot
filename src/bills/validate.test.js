import { describe, it, expect } from 'vitest';
import { toSatang, splitEvenly, validateBillInput, MAX_BILL_MEMBERS } from './validate.js';

const OWNER = '11111111-1111-1111-1111-111111111111';
const F1 = '22222222-2222-2222-2222-222222222222';
const F2 = '33333333-3333-3333-3333-333333333333';
const CATEGORY = '44444444-4444-4444-4444-444444444444';

function body(overrides = {}) {
  return {
    title: ' เนื้อย่าง ',
    total: 1000,
    occurredOn: '2026-10-08',
    categoryId: CATEGORY,
    ownerShare: 333.34,
    members: [
      { userId: F1, share: 333.33 },
      { userId: F2, share: 333.33 },
    ],
    ...overrides,
  };
}

describe('toSatang', () => {
  it('turns baht with up to two decimals into whole satang', () => {
    expect(toSatang(1000)).toBe(100000);
    expect(toSatang(333.33)).toBe(33333);
    expect(toSatang(0.1 + 0.2)).toBe(30);
    expect(toSatang(0)).toBe(0);
  });

  it('rejects negatives, more than two decimals and non-numbers', () => {
    for (const value of [-1, 1.005, '10', NaN, Infinity, null]) {
      expect(toSatang(value)).toBeNull();
    }
  });
});

describe('splitEvenly', () => {
  it('gives everyone the floor and keeps the leftover satang apart', () => {
    expect(splitEvenly(100000, 3)).toEqual({ base: 33333, remainder: 1 });
    expect(splitEvenly(90000, 3)).toEqual({ base: 30000, remainder: 0 });
  });
});

describe('validateBillInput', () => {
  it('accepts a valid bill and trims the title', () => {
    const result = validateBillInput(body(), OWNER);

    expect(result).toEqual({
      ok: true,
      value: {
        title: 'เนื้อย่าง',
        total: 1000,
        occurredOn: '2026-10-08',
        categoryId: CATEGORY,
        ownerShare: 333.34,
        members: [
          { userId: F1, share: 333.33 },
          { userId: F2, share: 333.33 },
        ],
      },
    });
  });

  it('allows the owner share to be zero', () => {
    const result = validateBillInput(body({ ownerShare: 0, members: [{ userId: F1, share: 1000 }] }), OWNER);

    expect(result.ok).toBe(true);
  });

  it.each([
    ['a missing or empty title', { title: '   ' }, 'Invalid title'],
    ['a title over 60 characters', { title: 'ก'.repeat(61) }, 'Invalid title'],
    ['a zero total', { total: 0 }, 'Invalid total'],
    ['a total over the limit', { total: 10000000.01 }, 'Invalid total'],
    ['a total with three decimals', { total: 1000.001 }, 'Invalid total'],
    ['a date that does not exist', { occurredOn: '2026-02-30' }, 'Invalid date'],
    ['a date in another format', { occurredOn: '08/10/2026' }, 'Invalid date'],
    ['a category that is not a uuid', { categoryId: 'food' }, 'Invalid category'],
    ['no members', { members: [] }, 'Invalid members'],
    ['the owner as a member', { members: [{ userId: OWNER, share: 666.66 }] }, 'Invalid members'],
    ['the same member twice', { members: [{ userId: F1, share: 333.33 }, { userId: F1, share: 333.33 }] }, 'Invalid members'],
    ['a member id that is not a uuid', { members: [{ userId: 'x', share: 666.66 }] }, 'Invalid members'],
    ['a zero share', { members: [{ userId: F1, share: 0 }, { userId: F2, share: 666.66 }] }, 'Invalid share'],
    ['a negative owner share', { ownerShare: -1 }, 'Invalid share'],
    ['shares that miss the total by one satang', { ownerShare: 333.33 }, 'Shares do not add up'],
  ])('rejects %s', (name, overrides, error) => {
    expect(validateBillInput(body(overrides), OWNER)).toEqual({ ok: false, error });
  });

  it('rejects more than the member limit and a body that is not an object', () => {
    const members = Array.from({ length: MAX_BILL_MEMBERS + 1 }, (_, index) => ({
      userId: `55555555-5555-5555-5555-${String(index).padStart(12, '0')}`,
      share: 1,
    }));

    expect(validateBillInput(body({ total: members.length, ownerShare: 0, members }), OWNER)).toEqual({ ok: false, error: 'Invalid members' });
    expect(validateBillInput(null, OWNER)).toEqual({ ok: false, error: 'Invalid title' });
  });
});

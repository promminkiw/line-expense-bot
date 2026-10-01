import { describe, it, expect } from 'vitest';
import { categoryKey, toTransactionRows } from './transaction-rows.js';

const CATEGORY_IDS = new Map([
  ['expense:อาหาร', 'cat-food'],
  ['expense:อื่นๆ', 'cat-expense-other'],
]);

function item(overrides = {}) {
  return { type: 'expense', category: 'อาหาร', amount: 60, date: '2026-09-29', note: 'กินข้าว', ...overrides };
}

describe('toTransactionRows', () => {
  it('maps items to transaction rows linked to the event', () => {
    const rows = toTransactionRows({
      items: [item()],
      categoryIds: CATEGORY_IDS,
      userId: 'user-1',
      webhookEventId: 'ev1',
    });

    expect(rows).toEqual([
      {
        user_id: 'user-1',
        type: 'expense',
        category_id: 'cat-food',
        amount: 60,
        note: 'กินข้าว',
        occurred_on: '2026-09-29',
        source: 'text',
        line_event_id: 'ev1',
      },
    ]);
  });

  it('falls back to the other category of the same type', () => {
    const rows = toTransactionRows({
      items: [item({ category: 'เดินทาง' })],
      categoryIds: CATEGORY_IDS,
      userId: 'user-1',
      webhookEventId: 'ev1',
    });

    expect(rows[0].category_id).toBe('cat-expense-other');
  });

  it('throws when neither the category nor the fallback exists', () => {
    expect(() =>
      toTransactionRows({
        items: [item({ type: 'income', category: 'เงินเดือน' })],
        categoryIds: CATEGORY_IDS,
        userId: 'user-1',
        webhookEventId: 'ev1',
      })
    ).toThrow('No category for income:เงินเดือน');
  });

  it('uses the given source for every row and defaults to text', () => {
    const base = { items: [item()], categoryIds: CATEGORY_IDS, userId: 'user-1', webhookEventId: 'ev1' };

    expect(toTransactionRows({ ...base, source: 'slip' })[0].source).toBe('slip');
    expect(toTransactionRows(base)[0].source).toBe('text');
  });

  it('builds category keys as type and name', () => {
    expect(categoryKey('income', 'เงินเดือน')).toBe('income:เงินเดือน');
  });
});

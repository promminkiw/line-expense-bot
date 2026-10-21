import { describe, expect, it, vi } from 'vitest';
import { applyResults, createDraft, draftSummary, entryView, isDirty, saveDraft, stepDraft } from './budget-bulk.mjs';

const BUDGETS = [
  { categoryId: 'food', category: 'อาหาร', budget: 6000, spent: 4200 },
  { categoryId: 'shop', category: 'ช้อปปิ้ง', budget: 3000, spent: 3450 },
  { categoryId: 'trip', category: 'เดินทาง', budget: 2000, spent: 1900 },
  { categoryId: 'fun', category: 'บันเทิง', budget: null, spent: 620 },
  { categoryId: 'other', category: 'อื่นๆ', budget: null, spent: 150 },
];

describe('createDraft', () => {
  it('orders risk, calm, then unset', () => {
    expect(createDraft(BUDGETS).map((entry) => entry.categoryId)).toEqual(['shop', 'trip', 'food', 'fun', 'other']);
  });

  it('can put the unset categories first', () => {
    expect(createDraft(BUDGETS, { first: 'unset' }).map((entry) => entry.categoryId)).toEqual(['fun', 'other', 'shop', 'trip', 'food']);
  });

  it('starts clean with next equal to original', () => {
    const draft = createDraft(BUDGETS);

    expect(draft.every((entry) => !isDirty(entry))).toBe(true);
    expect(draft[3]).toEqual({ categoryId: 'fun', category: 'บันเทิง', spent: 620, original: null, next: null });
  });
});

describe('stepDraft', () => {
  it('adds 500 to one entry without touching the others or the input', () => {
    const draft = createDraft(BUDGETS);
    const next = stepDraft(draft, 'shop', 1);

    expect(next.find((entry) => entry.categoryId === 'shop').next).toBe(3500);
    expect(next.find((entry) => entry.categoryId === 'trip').next).toBe(2000);
    expect(draft.find((entry) => entry.categoryId === 'shop').next).toBe(3000);
  });

  it('starts an unset category at 500', () => {
    const next = stepDraft(createDraft(BUDGETS), 'fun', 1);

    expect(next.find((entry) => entry.categoryId === 'fun').next).toBe(500);
  });

  it('is clean again after stepping back to the original', () => {
    let draft = stepDraft(createDraft(BUDGETS), 'shop', 1);
    draft = stepDraft(draft, 'shop', -1);

    expect(draft.every((entry) => !isDirty(entry))).toBe(true);
  });

  it('does not remove a budget by stepping down', () => {
    const next = stepDraft(createDraft(BUDGETS), 'fun', -1);

    expect(next.find((entry) => entry.categoryId === 'fun').next).toBeNull();
  });
});

describe('entryView', () => {
  it('shows the old and new percent and the was label for a changed entry', () => {
    const entry = stepDraft(createDraft(BUDGETS), 'shop', 1).find((item) => item.categoryId === 'shop');

    expect(entryView(entry)).toEqual({
      dirty: true,
      oldPercent: 115,
      newPercent: 98,
      oldLevel: 'over',
      newLevel: 'warn',
      valueText: '3,500',
      wasText: 'เดิม 3,000',
    });
  });

  it('describes an untouched unset entry', () => {
    const entry = createDraft(BUDGETS).find((item) => item.categoryId === 'fun');

    expect(entryView(entry)).toEqual({
      dirty: false,
      oldPercent: null,
      newPercent: null,
      oldLevel: null,
      newLevel: null,
      valueText: 'ไม่ตั้งงบ',
      wasText: '',
    });
  });

  it('labels a freshly set budget as new', () => {
    const entry = stepDraft(createDraft(BUDGETS), 'fun', 1).find((item) => item.categoryId === 'fun');

    expect(entryView(entry)).toMatchObject({ dirty: true, oldPercent: null, newPercent: 124, newLevel: 'over', valueText: '500', wasText: 'ใหม่' });
  });
});

describe('draftSummary', () => {
  it('is empty for a clean draft', () => {
    expect(draftSummary(createDraft(BUDGETS))).toEqual({ dirtyCount: 0, delta: 0, newTotal: 11000 });
  });

  it('adds the changes of edited and new budgets', () => {
    let draft = stepDraft(createDraft(BUDGETS), 'shop', 1);
    draft = stepDraft(draft, 'fun', 1);

    expect(draftSummary(draft)).toEqual({ dirtyCount: 2, delta: 1000, newTotal: 12000 });
  });

  it('goes negative when budgets are lowered', () => {
    const draft = stepDraft(createDraft(BUDGETS), 'food', -1);

    expect(draftSummary(draft)).toMatchObject({ dirtyCount: 1, delta: -500, newTotal: 10500 });
  });
});

describe('saveDraft', () => {
  const edited = () => stepDraft(stepDraft(createDraft(BUDGETS), 'shop', 1), 'fun', 1);

  it('saves only the changed entries, one after another, with the month', async () => {
    const order = [];
    const setBudget = vi.fn(async (categoryId) => {
      order.push(`start:${categoryId}`);
      await Promise.resolve();
      order.push(`end:${categoryId}`);
    });

    const results = await saveDraft(edited(), { month: '2026-10', setBudget });

    expect(setBudget.mock.calls).toEqual([
      ['shop', { month: '2026-10', amount: 3500 }],
      ['fun', { month: '2026-10', amount: 500 }],
    ]);
    expect(order).toEqual(['start:shop', 'end:shop', 'start:fun', 'end:fun']);
    expect(results.map((result) => [result.categoryId, result.ok])).toEqual([['shop', true], ['fun', true]]);
  });

  it('keeps going after a failure and records the status', async () => {
    const setBudget = vi.fn(async (categoryId) => {
      if (categoryId === 'shop') throw Object.assign(new Error('x'), { status: 500 });
    });

    const results = await saveDraft(edited(), { month: '2026-10', setBudget });

    expect(results).toEqual([
      { categoryId: 'shop', category: 'ช้อปปิ้ง', from: 3000, to: 3500, ok: false, status: 500 },
      { categoryId: 'fun', category: 'บันเทิง', from: null, to: 500, ok: true },
    ]);
  });

  it('can retry just some categories', async () => {
    const setBudget = vi.fn(async () => {});

    await saveDraft(edited(), { month: '2026-10', setBudget, only: ['fun'] });

    expect(setBudget.mock.calls.map((call) => call[0])).toEqual(['fun']);
  });
});

describe('applyResults', () => {
  it('treats saved entries as the new original and leaves failed ones dirty', () => {
    const draft = stepDraft(stepDraft(createDraft(BUDGETS), 'shop', 1), 'fun', 1);
    const next = applyResults(draft, [
      { categoryId: 'shop', ok: false },
      { categoryId: 'fun', ok: true },
    ]);

    expect(isDirty(next.find((entry) => entry.categoryId === 'shop'))).toBe(true);
    expect(isDirty(next.find((entry) => entry.categoryId === 'fun'))).toBe(false);
    expect(next.find((entry) => entry.categoryId === 'fun').original).toBe(500);
  });
});

import { describe, it, expect } from 'vitest';
import { checkCase } from './nlu-eval-check.js';

describe('checkCase', () => {
  it('passes when every expected key matches', () => {
    expect(checkCase({ status: 'intent', intent: 'help' }, { status: 'intent', intent: 'help' })).toEqual([]);
  });

  it('ignores keys that are not expected', () => {
    expect(checkCase({ status: 'clarify' }, { status: 'clarify', question: 'กี่บาท' })).toEqual([]);
  });

  it('reports a different value', () => {
    expect(checkCase({ status: 'ok' }, { status: 'clarify', question: 'x' })).toEqual(['status: expected "ok", got "clarify"']);
  });

  it('compares items by count and by the expected fields', () => {
    const actual = { status: 'ok', items: [{ type: 'expense', amount: 50, note: 'ข้าว' }] };
    expect(checkCase({ status: 'ok', items: [{ amount: 50 }] }, actual)).toEqual([]);
    expect(checkCase({ status: 'ok', items: [{ amount: 70 }] }, actual)).toEqual(['items[0].amount: expected 70, got 50']);
    expect(checkCase({ status: 'ok', items: [{ amount: 50 }, { amount: 10 }] }, actual)).toEqual([
      'items: expected 2 items, got 1',
    ]);
  });

  it('reports missing items', () => {
    expect(checkCase({ items: [{ amount: 50 }] }, { status: 'clarify' })).toEqual(['items: expected 1 items, got 0']);
  });
});

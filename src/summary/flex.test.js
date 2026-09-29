import { describe, it, expect } from 'vitest';
import { buildSummaryFlex } from './flex.js';

function summary(overrides = {}) {
  return {
    label: 'วันนี้ (29/09)',
    incomeTotal: 25000,
    expenseTotal: 105,
    net: 24895,
    topExpenses: [{ category: 'อาหาร', total: 105 }],
    otherExpenseTotal: 0,
    entryCount: 3,
    ...overrides,
  };
}

function texts(flex) {
  const found = [];
  (function walk(node) {
    if (node && typeof node === 'object') {
      if (node.type === 'text') found.push(node.text);
      Object.values(node).forEach(walk);
    }
  })(flex.contents);
  return found;
}

describe('buildSummaryFlex', () => {
  it('builds a flex bubble with alt text for notifications', () => {
    const flex = buildSummaryFlex(summary(), 'ใช้จ่ายน้อย');

    expect(flex.type).toBe('flex');
    expect(flex.contents.type).toBe('bubble');
    expect(flex.altText).toBe('สรุปวันนี้ (29/09): รายรับ 25,000 บาท รายจ่าย 105 บาท');
  });

  it('shows the title, totals, categories and comment in order', () => {
    const flex = buildSummaryFlex(summary(), 'ใช้จ่ายน้อย');

    expect(texts(flex)).toEqual([
      'สรุปวันนี้ (29/09)',
      'รายรับ',
      '25,000 บาท',
      'รายจ่าย',
      '105 บาท',
      'คงเหลือ',
      '24,895 บาท',
      'รายจ่ายตามหมวด',
      'อาหาร',
      '105 บาท',
      'ใช้จ่ายน้อย',
    ]);
  });

  it('adds the other categories row only when there is a remainder', () => {
    const flex = buildSummaryFlex(summary({ otherExpenseTotal: 75 }), '');

    expect(texts(flex)).toContain('หมวดอื่น');
    expect(texts(flex)).toContain('75 บาท');
    expect(texts(buildSummaryFlex(summary(), ''))).not.toContain('หมวดอื่น');
  });

  it('omits the category section and the comment when both are empty', () => {
    const flex = buildSummaryFlex(summary({ expenseTotal: 0, net: 25000, topExpenses: [] }), '');

    expect(texts(flex)).not.toContain('รายจ่ายตามหมวด');
    expect(texts(flex)).toHaveLength(7);
  });

  it('shows a negative balance with a minus sign', () => {
    const flex = buildSummaryFlex(summary({ incomeTotal: 0, net: -105 }), '');

    expect(texts(flex)).toContain('-105 บาท');
  });
});

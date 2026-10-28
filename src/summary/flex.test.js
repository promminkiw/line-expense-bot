import { describe, it, expect } from 'vitest';
import { buildSummaryFlex } from './flex.js';
import { COLORS, CHART_COLORS } from '../utils/flex-style.js';

function summary(overrides = {}) {
  return {
    label: 'เดือนนี้ (01/10 - 28/10)',
    incomeTotal: 25000,
    expenseTotal: 14320,
    net: 10680,
    topExpenses: [
      { category: 'อาหาร', total: 5160 },
      { category: 'เดินทาง', total: 3100 },
      { category: 'ช้อปปิ้ง', total: 2450 },
    ],
    otherExpenseTotal: 3610,
    entryCount: 99,
    ...overrides,
  };
}

function texts(node) {
  const found = [];
  (function walk(value) {
    if (value && typeof value === 'object') {
      if (value.type === 'text') found.push(value.text);
      Object.values(value).forEach(walk);
    }
  })(node);
  return found;
}

function findStack(node) {
  if (!node || typeof node !== 'object') return null;
  if (node.type === 'box' && node.height === '8px' && node.spacing === '2px') return node;
  for (const child of node.contents ?? []) {
    const found = findStack(child);
    if (found) return found;
  }
  return null;
}

describe('buildSummaryFlex', () => {
  it('keeps the alt text for notifications', () => {
    expect(buildSummaryFlex(summary(), '').altText).toBe('สรุปเดือนนี้ (01/10 - 28/10): รายรับ 25,000 บาท รายจ่าย 14,320 บาท');
  });

  it('puts the balance in the brand header', () => {
    const flex = buildSummaryFlex(summary(), '');

    expect(flex.contents.header.backgroundColor).toBe(COLORS.brand);
    expect(texts(flex.contents.header)).toEqual(['สรุปเดือนนี้ (01/10 - 28/10)', 'คงเหลือ 10,680 บาท']);
  });

  it('says the balance is negative in words', () => {
    expect(texts(buildSummaryFlex(summary({ incomeTotal: 2000, expenseTotal: 3180, net: -1180 }), '').contents.header)[1]).toBe('ติดลบ 1,180 บาท');
  });

  it('shows income and expense, then the category legend with amount and share', () => {
    const body = texts(buildSummaryFlex(summary(), '').contents.body);

    expect(body).toEqual([
      'รายรับ', '25,000', 'รายจ่าย', '14,320',
      'รายจ่ายตามหมวด',
      'อาหาร', '5,160 · 36%',
      'เดินทาง', '3,100 · 22%',
      'ช้อปปิ้ง', '2,450 · 17%',
      'หมวดอื่น', '3,610 · 25%',
    ]);
  });

  it('draws an 8px stacked bar with the web chart colors in rank order', () => {
    const stack = findStack(buildSummaryFlex(summary(), '').contents.body);

    expect(stack.contents.map((part) => [part.flex, part.backgroundColor])).toEqual([
      [36, CHART_COLORS[0]],
      [22, CHART_COLORS[1]],
      [17, CHART_COLORS[2]],
      [25, CHART_COLORS[3]],
    ]);
  });

  it('keeps a tiny category visible in the bar', () => {
    const stack = findStack(buildSummaryFlex(summary({ expenseTotal: 10001, topExpenses: [{ category: 'อาหาร', total: 10000 }, { category: 'ขนม', total: 1 }], otherExpenseTotal: 0 }), '').contents.body);

    expect(stack.contents.map((part) => part.flex)).toEqual([100, 1]);
  });

  it('omits the category section when there is no expense', () => {
    const body = texts(buildSummaryFlex(summary({ expenseTotal: 0, net: 25000, topExpenses: [], otherExpenseTotal: 0 }), '').contents.body);

    expect(body).not.toContain('รายจ่ายตามหมวด');
  });

  it('shows the comment under a label only when there is one', () => {
    expect(texts(buildSummaryFlex(summary(), 'กินน้อยลงหน่อย').contents.body).slice(-2)).toEqual(['เฮียว่า', 'กินน้อยลงหน่อย']);
    expect(texts(buildSummaryFlex(summary(), '').contents.body)).not.toContain('เฮียว่า');
  });

  it('adds a yellow button to the web summary only when a link is given', () => {
    const footer = buildSummaryFlex(summary(), '', { summaryUrl: 'https://liff.line.me/l?tab=summary' }).contents.footer;

    expect(footer.contents[0].action).toEqual({ type: 'uri', label: 'เปิดหน้าสรุป', uri: 'https://liff.line.me/l?tab=summary' });
    expect(footer.contents[0].backgroundColor).toBe(COLORS.cta);
    expect(buildSummaryFlex(summary(), '').contents.footer).toBeUndefined();
  });
});

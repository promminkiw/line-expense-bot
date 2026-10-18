import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { buildTotalsFlex } = require('./answer-flex.js');

const BASE = { type: 'expense', category: '', keyword: '', from: '2026-10-01', to: '2026-10-19' };
const EXPENSE_ROWS = [{ type: 'expense', total: 450, entryCount: 6 }];
const INCOME_ROWS = [{ type: 'income', total: 25000, entryCount: 1 }];

function bodyTexts(flex) {
  return flex.contents.body.contents.map((item) =>
    item.type === 'box' ? item.contents.map((part) => part.text) : item.type
  );
}

describe('buildTotalsFlex', () => {
  it('shows the range as the title and the keyword, category and total as rows', () => {
    const flex = buildTotalsFlex({ ...BASE, keyword: 'กาแฟ' }, EXPENSE_ROWS, {});

    expect(flex.type).toBe('flex');
    expect(flex.contents.type).toBe('bubble');
    expect(flex.contents.header.contents[0].text).toBe('ยอด 1-19 ต.ค. 2569');
    expect(bodyTexts(flex)).toEqual([
      ['คำค้น', '"กาแฟ"'],
      ['หมวด', 'ทุกหมวด'],
      'separator',
      ['รายจ่าย', '450 บาท'],
      ['จำนวนรายการ', '6 รายการ'],
    ]);
  });

  it('leaves out the keyword row without a keyword and names the category', () => {
    const flex = buildTotalsFlex({ ...BASE, category: 'อาหาร' }, EXPENSE_ROWS, {});

    expect(bodyTexts(flex)[0]).toEqual(['หมวด', 'อาหาร']);
  });

  it('colors the amount by type', () => {
    const expense = buildTotalsFlex(BASE, EXPENSE_ROWS, {});
    const income = buildTotalsFlex({ ...BASE, type: 'income' }, INCOME_ROWS, {});

    expect(expense.contents.body.contents[2].contents[1].color).toBe('#E53935');
    expect(income.contents.body.contents[2].contents[1].color).toBe('#1DB446');
  });

  it('says there are no entries when the count is zero', () => {
    const flex = buildTotalsFlex(BASE, [], {});

    expect(bodyTexts(flex).slice(-2)).toEqual([['รายจ่าย', '0 บาท'], ['จำนวนรายการ', 'ไม่มีรายการ']]);
  });

  it('lists income first and then expense, each with its own count, when the type is both', () => {
    const flex = buildTotalsFlex({ ...BASE, type: 'both' }, [...EXPENSE_ROWS, ...INCOME_ROWS], {});

    expect(bodyTexts(flex).slice(-5)).toEqual([
      ['รายรับ', '25,000 บาท'],
      ['จำนวนรายการ', '1 รายการ'],
      'separator',
      ['รายจ่าย', '450 บาท'],
      ['จำนวนรายการ', '6 รายการ'],
    ]);
  });

  it('keeps the plain sentence as the alt text', () => {
    const flex = buildTotalsFlex({ ...BASE, keyword: 'กาแฟ' }, EXPENSE_ROWS, {});

    expect(flex.altText).toBe('ช่วง 1-19 ต.ค. 2569 คำว่า "กาแฟ": รายจ่าย 450 บาท (6 รายการ)');
  });

  it('caps a long alt text with capAltText', () => {
    const flex = buildTotalsFlex({ ...BASE, keyword: 'ก'.repeat(500) }, EXPENSE_ROWS, {});

    expect(flex.altText).toHaveLength(400);
    expect(flex.altText.endsWith('...')).toBe(true);
  });

  it('adds a footer button that opens the list url', () => {
    const flex = buildTotalsFlex(BASE, EXPENSE_ROWS, { listUrl: 'https://liff.line.me/1?tab=list' });

    expect(flex.contents.footer.contents).toEqual([
      {
        type: 'button',
        style: 'link',
        height: 'sm',
        action: { type: 'uri', label: 'ดูรายการในเว็บ', uri: 'https://liff.line.me/1?tab=list' },
      },
    ]);
  });

  it('has no footer without a list url', () => {
    expect(buildTotalsFlex(BASE, EXPENSE_ROWS, {}).contents.footer).toBeUndefined();
  });
});

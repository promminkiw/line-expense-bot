import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { buildTotalsFlex } = require('./answer-flex.js');
const { COLORS } = require('../utils/flex-style.js');

const BASE = { type: 'expense', category: '', keyword: '', from: '2026-10-01', to: '2026-10-19' };
const EXPENSE_ROWS = [{ type: 'expense', total: 450, entryCount: 6 }];
const INCOME_ROWS = [{ type: 'income', total: 25000, entryCount: 1 }];

function texts(node) {
  if (!node || typeof node !== 'object') return [];
  return [...(node.type === 'text' ? [node.text] : []), ...(node.contents ?? []).flatMap(texts)];
}

function bars(node, found = []) {
  if (!node || typeof node !== 'object') return found;
  if (node.type === 'box' && node.height === '8px') found.push(node);
  (node.contents ?? []).forEach((child) => bars(child, found));
  return found;
}

describe('buildTotalsFlex', () => {
  it('puts the range and the answer in the brand header', () => {
    const flex = buildTotalsFlex({ ...BASE, keyword: 'กาแฟ' }, EXPENSE_ROWS, {});

    expect(flex.contents.header.backgroundColor).toBe(COLORS.brand);
    expect(texts(flex.contents.header)).toEqual(['ยอด 1-19 ต.ค. 2569', 'จ่ายไป 450 บาท']);
    expect(texts(buildTotalsFlex({ ...BASE, type: 'income' }, INCOME_ROWS, {}).contents.header)[1]).toBe('รับมา 25,000 บาท');
  });

  it('shows the filters as chips, then the count and the average', () => {
    const flex = buildTotalsFlex({ ...BASE, keyword: 'กาแฟ' }, EXPENSE_ROWS, {});

    expect(texts(flex.contents.body)).toEqual(['คำค้น กาแฟ', 'ทุกหมวด', 'จำนวนรายการ', '6 รายการ', 'เฉลี่ยรายการละ', '75 บาท']);
  });

  it('names the category and adds the wallet chip only when asked', () => {
    const withWallet = buildTotalsFlex({ ...BASE, category: 'อาหาร', wallet: 'บัตรเครดิต' }, EXPENSE_ROWS, {});

    expect(texts(withWallet.contents.body.contents[0])).toEqual(['อาหาร', 'กระเป๋า บัตรเครดิต']);
    expect(withWallet.altText).toContain('กระเป๋า บัตรเครดิต');
    expect(JSON.stringify(buildTotalsFlex(BASE, EXPENSE_ROWS, {}).contents.body)).not.toContain('กระเป๋า');
  });

  it('says there are no entries and skips the average when the count is zero', () => {
    const found = texts(buildTotalsFlex(BASE, [], {}).contents.body);

    expect(found.slice(-2)).toEqual(['จำนวนรายการ', 'ไม่มีรายการ']);
    expect(found).not.toContain('เฉลี่ยรายการละ');
  });

  it('compares income and expense with bars when the type is both', () => {
    const flex = buildTotalsFlex({ ...BASE, type: 'both' }, [...EXPENSE_ROWS, ...INCOME_ROWS], {});

    expect(texts(flex.contents.header)[1]).toBe('เหลือ 24,550 บาท');
    expect(texts(flex.contents.body).slice(-4)).toEqual(['รายรับ · 1 รายการ', '25,000', 'รายจ่าย · 6 รายการ', '450']);
    expect(bars(flex.contents.body).map((bar) => bar.contents[0].width)).toEqual(['100%', '2%']);
  });

  it('says the balance is negative in words when spending is larger', () => {
    const flex = buildTotalsFlex({ ...BASE, type: 'both' }, [{ type: 'income', total: 100, entryCount: 1 }, ...EXPENSE_ROWS], {});

    expect(texts(flex.contents.header)[1]).toBe('ติดลบ 350 บาท');
  });

  it('keeps the plain sentence as the alt text and caps it', () => {
    expect(buildTotalsFlex({ ...BASE, keyword: 'กาแฟ' }, EXPENSE_ROWS, {}).altText).toBe('ช่วง 1-19 ต.ค. 2569 คำว่า "กาแฟ": รายจ่าย 450 บาท (6 รายการ)');
    const long = buildTotalsFlex({ ...BASE, keyword: 'ก'.repeat(500) }, EXPENSE_ROWS, {});
    expect(long.altText).toHaveLength(400);
  });

  it('adds a yellow footer button that opens the list url', () => {
    const footer = buildTotalsFlex(BASE, EXPENSE_ROWS, { listUrl: 'https://liff.line.me/1?tab=list' }).contents.footer;

    expect(footer.contents[0].action).toEqual({ type: 'uri', label: 'ดูรายการในเว็บ', uri: 'https://liff.line.me/1?tab=list' });
    expect(footer.contents[0].backgroundColor).toBe(COLORS.cta);
    expect(buildTotalsFlex(BASE, EXPENSE_ROWS, {}).contents.footer).toBeUndefined();
  });
});

describe('buildTotalsFlex in English', () => {
  it('writes the header, chips, count and average in English', () => {
    const flex = buildTotalsFlex({ ...BASE, keyword: 'coffee' }, EXPENSE_ROWS, { listUrl: 'https://liff.line.me/1?tab=list', lang: 'en' });

    expect(texts(flex.contents.header)).toEqual(['Totals 1-19 Oct 2026', 'Spent ฿450']);
    expect(texts(flex.contents.body)).toEqual(['Search: coffee', 'All categories', 'Entries', '6 entries', 'Average per entry', '฿75']);
    expect(flex.altText).toBe('For 1-19 Oct 2026 matching "coffee": Expense ฿450 (6 entries)');
    expect(flex.contents.footer.contents[0].action.label).toBe('See entries on web');
  });

  it('translates default category and wallet names on the chips', () => {
    const flex = buildTotalsFlex({ ...BASE, type: 'income', category: 'เงินเดือน', wallet: 'เงินสด' }, INCOME_ROWS, { lang: 'en' });

    expect(texts(flex.contents.header)[1]).toBe('Received ฿25,000');
    expect(texts(flex.contents.body.contents[0])).toEqual(['Salary', 'Wallet: Cash']);
    expect(texts(flex.contents.body).slice(-4)).toEqual(['Entries', '1 entry', 'Average per entry', '฿25,000']);
  });

  it('compares both types and says what is left or over in English', () => {
    const flex = buildTotalsFlex({ ...BASE, type: 'both' }, [...EXPENSE_ROWS, ...INCOME_ROWS], { lang: 'en' });
    const over = buildTotalsFlex({ ...BASE, type: 'both' }, [{ type: 'income', total: 100, entryCount: 1 }, ...EXPENSE_ROWS], { lang: 'en' });

    expect(texts(flex.contents.header)[1]).toBe('Left ฿24,550');
    expect(texts(flex.contents.body).slice(-4)).toEqual(['Income · 1 entry', '25,000', 'Expense · 6 entries', '450']);
    expect(texts(over.contents.header)[1]).toBe('Over ฿350');
    expect(texts(buildTotalsFlex(BASE, [], { lang: 'en' }).contents.body).slice(-2)).toEqual(['Entries', 'No entries']);
  });

  it.each(['th', 'en'])('caps the longest totals altText in %s', (lang) => {
    const long = buildTotalsFlex({ ...BASE, type: 'both', category: 'ค'.repeat(200), wallet: 'w'.repeat(200), keyword: 'k'.repeat(500) }, EXPENSE_ROWS, { lang });

    expect(long.altText).toHaveLength(400);
  });
});

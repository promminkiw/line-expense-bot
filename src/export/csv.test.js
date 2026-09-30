import { describe, it, expect } from 'vitest';
import { buildTransactionsCsv, exportFileName } from './csv.js';

const BOM = '﻿';
const HEADER = 'วันที่,ประเภท,หมวด,จำนวนเงิน,โน้ต';

function row(overrides = {}) {
  return { occurredOn: '2026-09-29', type: 'expense', categoryName: 'อาหาร', amount: 60, note: 'กินข้าว', ...overrides };
}

describe('buildTransactionsCsv', () => {
  it('starts with a BOM and the Thai header row', () => {
    const csv = buildTransactionsCsv([]);

    expect(csv.startsWith(BOM)).toBe(true);
    expect(csv).toBe(`${BOM}${HEADER}\r\n`);
  });

  it('writes one line per entry with CRLF line endings', () => {
    const csv = buildTransactionsCsv([row(), row({ type: 'income', categoryName: 'เงินเดือน', amount: 25000.5, note: '' })]);

    expect(csv).toBe(
      `${BOM}${HEADER}\r\n2026-09-29,รายจ่าย,อาหาร,60.00,กินข้าว\r\n2026-09-29,รายรับ,เงินเดือน,25000.50,\r\n`
    );
  });

  it('writes an empty note when the note is null', () => {
    expect(buildTransactionsCsv([row({ note: null })])).toContain('2026-09-29,รายจ่าย,อาหาร,60.00,\r\n');
  });

  it('quotes cells that contain commas, quotes or line breaks', () => {
    const csv = buildTransactionsCsv([row({ note: 'ข้าว, "พิเศษ"\nมื้อเย็น' })]);

    expect(csv).toContain('2026-09-29,รายจ่าย,อาหาร,60.00,"ข้าว, ""พิเศษ""\nมื้อเย็น"\r\n');
  });

  it('prefixes cells that a spreadsheet could run as a formula', () => {
    const csv = buildTransactionsCsv([
      row({ note: '=SUM(A1:A9)' }),
      row({ note: '+1' }),
      row({ note: '-5' }),
      row({ note: '@cmd' }),
    ]);

    expect(csv).toContain(",'=SUM(A1:A9)\r\n");
    expect(csv).toContain(",'+1\r\n");
    expect(csv).toContain(",'-5\r\n");
    expect(csv).toContain(",'@cmd\r\n");
  });
});

describe('exportFileName', () => {
  it('names the file after the month', () => {
    expect(exportFileName('2026-09')).toBe('transactions-2026-09.csv');
  });
});

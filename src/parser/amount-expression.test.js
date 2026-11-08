import { describe, it, expect } from 'vitest';
import { evaluateAmountExpression, MAX_EXPRESSION_LENGTH } from './amount-expression.js';

describe('evaluateAmountExpression', () => {
  it.each([
    ['60', 60],
    ['2*35', 70],
    ['40+10+20', 70],
    ['1200/3', 400],
    ['sqrt(25)*10', 50],
    ['(10+5)*2', 30],
    ['100-20', 80],
    ['1,500*2', 3000],
    ['2.5*3', 7.5],
    ['10/3', 3.33],
    ['sqrt(2)*10', 14.14],
  ])('computes %s as %s', (text, expected) => {
    expect(evaluateAmountExpression(text)).toBe(expected);
  });

  // Claude อาจส่งรูปที่ผู้ใช้พิมพ์มาตรงๆ จึงรับสัญลักษณ์ที่คนไทยใช้บ่อยด้วย
  it.each([
    ['2×35', 70],
    ['2x35', 70],
    ['70÷2', 35],
    ['√25*10', 50],
    ['รูท25*x10', 50],
    ['2 * 35', 70],
  ])('accepts the written form %s', (text, expected) => {
    expect(evaluateAmountExpression(text)).toBe(expected);
  });

  it.each([
    [''],
    ['abc'],
    ['2+'],
    ['(2+3'],
    ['2)'],
    ['5/0'],
    ['sqrt(-4)'],
    ['10-20'],
    ['0*5'],
    ['process.exit()'],
    ['2;3'],
    // ตัวเลขที่คั่นด้วยช่องว่างคือหลายยอด ห้ามต่อกันเป็นยอดเดียว
    ['40 100'],
    ['40, 100'],
    ['1 0 0'],
    ['2**3'],
  ])('returns null for %s', (text) => {
    expect(evaluateAmountExpression(text)).toBeNull();
  });

  it('returns null for a non-string', () => {
    expect(evaluateAmountExpression(undefined)).toBeNull();
    expect(evaluateAmountExpression(60)).toBeNull();
  });

  it('returns null for an expression longer than the limit', () => {
    expect(evaluateAmountExpression('1+'.repeat(MAX_EXPRESSION_LENGTH) + '1')).toBeNull();
  });
});

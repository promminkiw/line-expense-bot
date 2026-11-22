import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { typeLabel } = require('./type-labels.js');

describe('typeLabel', () => {
  it('keeps the Thai labels', () => {
    expect(typeLabel('th', 'expense')).toBe('รายจ่าย');
    expect(typeLabel('th', 'income')).toBe('รายรับ');
  });

  it('has English labels', () => {
    expect(typeLabel('en', 'expense')).toBe('Expense');
    expect(typeLabel('en', 'income')).toBe('Income');
  });
});

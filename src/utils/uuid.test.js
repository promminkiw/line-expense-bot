import { describe, it, expect } from 'vitest';
import { UUID_PATTERN } from './uuid.js';

describe('UUID_PATTERN', () => {
  it('accepts a whole UUID in any case and nothing around it', () => {
    expect(UUID_PATTERN.test('55555555-5555-5555-5555-555555555555')).toBe(true);
    expect(UUID_PATTERN.test('ABCDEFAB-CDEF-ABCD-EFAB-CDEFABCDEFAB')).toBe(true);
    for (const value of ['', 'x', '55555555-5555-5555-5555-55555555555', ' 55555555-5555-5555-5555-555555555555', '55555555-5555-5555-5555-555555555555,id.eq.1']) {
      expect(UUID_PATTERN.test(value), value).toBe(false);
    }
  });
});

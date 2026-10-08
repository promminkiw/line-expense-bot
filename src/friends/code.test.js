import { describe, it, expect } from 'vitest';
import { generateFriendCode, normalizeFriendCode, FRIEND_CODE_PATTERN, FRIEND_CODE_ALPHABET } from './code.js';

describe('generateFriendCode', () => {
  it('builds 8 characters from the alphabet using the picker', () => {
    expect(generateFriendCode(() => 0)).toBe('AAAAAAAA');
    expect(generateFriendCode(() => FRIEND_CODE_ALPHABET.length - 1)).toBe('99999999');
  });

  it('leaves out the look-alike characters I, O, 0 and 1', () => {
    expect(FRIEND_CODE_ALPHABET).toHaveLength(32);
    expect(FRIEND_CODE_ALPHABET).not.toMatch(/[IO01]/);
  });

  it('always matches the pattern the database checks', () => {
    for (let index = 0; index < 200; index += 1) {
      expect(generateFriendCode()).toMatch(FRIEND_CODE_PATTERN);
    }
  });
});

describe('normalizeFriendCode', () => {
  it('upper-cases and drops spaces and dashes', () => {
    expect(normalizeFriendCode(' abcd-2345 ')).toBe('ABCD2345');
    expect(normalizeFriendCode('ab cd 23 45')).toBe('ABCD2345');
  });

  it('rejects the wrong length, look-alike characters and non-strings', () => {
    for (const input of ['ABCD234', 'ABCD23456', 'ABCD234I', 'ABCD2340', '', null, undefined, 12345678, ['ABCD2345']]) {
      expect(normalizeFriendCode(input)).toBeNull();
    }
  });
});

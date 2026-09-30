import { describe, it, expect } from 'vitest';
import { createLinkToken, hashLinkToken, isLinkToken, EXPORT_LINK_TTL_MS } from './link-token.js';

describe('createLinkToken', () => {
  it('returns a 43 character base64url token and its hash', () => {
    const { token, tokenHash } = createLinkToken();

    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(tokenHash).toBe(hashLinkToken(token));
  });

  it('returns a different token every time', () => {
    expect(createLinkToken().token).not.toBe(createLinkToken().token);
  });
});

describe('hashLinkToken', () => {
  it('returns the SHA-256 hex digest', () => {
    expect(hashLinkToken('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

describe('isLinkToken', () => {
  it('accepts a generated token', () => {
    expect(isLinkToken(createLinkToken().token)).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isLinkToken('short')).toBe(false);
    expect(isLinkToken(`${'a'.repeat(42)}!`)).toBe(false);
    expect(isLinkToken('a'.repeat(44))).toBe(false);
    expect(isLinkToken(undefined)).toBe(false);
  });
});

describe('EXPORT_LINK_TTL_MS', () => {
  it('is five minutes', () => {
    expect(EXPORT_LINK_TTL_MS).toBe(5 * 60 * 1000);
  });
});

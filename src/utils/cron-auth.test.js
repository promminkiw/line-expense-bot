import { describe, it, expect } from 'vitest';
import { safeEqual, requireCronSecret, hasCronSecret } from './cron-auth.js';

function request(authorization) {
  return { get: (name) => (name.toLowerCase() === 'authorization' ? authorization : undefined) };
}

describe('safeEqual', () => {
  it('matches only the same text', () => {
    expect(safeEqual('s3cret', 's3cret')).toBe(true);
    expect(safeEqual('s3cret', 's3cret-longer')).toBe(false);
    expect(safeEqual('', 's3cret')).toBe(false);
  });
});

describe('requireCronSecret', () => {
  it.each([[''], [undefined], [12345]])('throws for %j with the owner name', (secret) => {
    expect(() => requireCronSecret(secret, 'createThing')).toThrow('createThing requires cronSecret');
  });

  it('accepts a non-empty string', () => {
    expect(() => requireCronSecret('s3cret', 'createThing')).not.toThrow();
  });
});

describe('hasCronSecret', () => {
  it('accepts the matching bearer token', () => {
    expect(hasCronSecret(request('Bearer s3cret'), 's3cret')).toBe(true);
  });

  it.each([[undefined], [''], ['Bearer '], ['Bearer wrong'], ['bearer s3cret'], ['s3cret']])('refuses %j', (header) => {
    expect(hasCronSecret(request(header), 's3cret')).toBe(false);
  });
});

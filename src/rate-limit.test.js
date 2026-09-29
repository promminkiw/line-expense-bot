import { describe, it, expect } from 'vitest';
import { createRateLimiter } from './rate-limit.js';

function fakeClock(start = 0) {
  let current = start;
  return {
    now: () => current,
    advance: (ms) => {
      current += ms;
    },
  };
}

describe('createRateLimiter', () => {
  it('allows up to the limit and blocks the next call', () => {
    const clock = fakeClock();
    const allow = createRateLimiter({ limit: 2, windowMs: 1000, now: clock.now });

    expect(allow('U1')).toBe(true);
    expect(allow('U1')).toBe(true);
    expect(allow('U1')).toBe(false);
  });

  it('counts each key separately', () => {
    const clock = fakeClock();
    const allow = createRateLimiter({ limit: 1, windowMs: 1000, now: clock.now });

    expect(allow('U1')).toBe(true);
    expect(allow('U2')).toBe(true);
    expect(allow('U1')).toBe(false);
  });

  it('allows again after the window has passed', () => {
    const clock = fakeClock();
    const allow = createRateLimiter({ limit: 1, windowMs: 1000, now: clock.now });

    expect(allow('U1')).toBe(true);
    clock.advance(999);
    expect(allow('U1')).toBe(false);
    clock.advance(1);
    expect(allow('U1')).toBe(true);
  });

  it('does not count blocked calls', () => {
    const clock = fakeClock();
    const allow = createRateLimiter({ limit: 1, windowMs: 1000, now: clock.now });

    allow('U1');
    clock.advance(500);
    allow('U1');
    clock.advance(500);

    expect(allow('U1')).toBe(true);
  });
});

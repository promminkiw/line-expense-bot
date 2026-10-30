import { describe, it, expect } from 'vitest';
import { createRateLimiter, createFailureLimiter } from './rate-limit.js';

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

describe('createFailureLimiter', () => {
  it('blocks a key only after it reaches the failure limit', () => {
    const clock = fakeClock();
    const failures = createFailureLimiter({ limit: 2, windowMs: 1000, now: clock.now });

    expect(failures.isBlocked('ip1')).toBe(false);
    failures.recordFailure('ip1');
    expect(failures.isBlocked('ip1')).toBe(false);
    failures.recordFailure('ip1');
    expect(failures.isBlocked('ip1')).toBe(true);
    expect(failures.isBlocked('ip2')).toBe(false);
  });

  it('unblocks once the failures leave the window', () => {
    const clock = fakeClock();
    const failures = createFailureLimiter({ limit: 1, windowMs: 1000, now: clock.now });

    failures.recordFailure('ip1');
    clock.advance(999);
    expect(failures.isBlocked('ip1')).toBe(true);
    clock.advance(1);
    expect(failures.isBlocked('ip1')).toBe(false);
  });

  it('keeps no memory of keys whose failures have expired', () => {
    const clock = fakeClock();
    const failures = createFailureLimiter({ limit: 5, windowMs: 1000, now: clock.now });

    failures.recordFailure('ip1');
    clock.advance(1000);
    failures.recordFailure('ip2');

    expect(failures.size()).toBe(1);
  });
});

describe('createRateLimiter memory', () => {
  it('forgets keys that have been idle for a whole window', () => {
    const clock = fakeClock();
    const allow = createRateLimiter({ limit: 1, windowMs: 1000, now: clock.now });

    allow('U1');
    clock.advance(1000);
    allow('U2');

    expect(allow.size()).toBe(1);
  });
});

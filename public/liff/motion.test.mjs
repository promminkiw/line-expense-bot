import { describe, it, expect, vi } from 'vitest';
import { easeOutCubic, interpolate, prefersReducedMotion, animateNumber, growBar, replayClass, playBars } from './motion.mjs';

function fakeWindow({ reduced = false } = {}) {
  const frames = [];
  let now = 0;
  return {
    frames,
    advance(ms) {
      now += ms;
      const pending = frames.splice(0);
      for (const callback of pending) callback(now);
    },
    matchMedia: vi.fn(() => ({ matches: reduced })),
    performance: { now: () => now },
    requestAnimationFrame: vi.fn((callback) => frames.push(callback)),
    cancelAnimationFrame: vi.fn(),
  };
}

describe('easing', () => {
  it('starts at 0 and ends at 1', () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5);
  });

  it('interpolates and clamps the progress', () => {
    expect(interpolate(10, 20, 0)).toBe(10);
    expect(interpolate(10, 20, 1)).toBe(20);
    expect(interpolate(10, 20, 5)).toBe(20);
    expect(interpolate(10, 20, -1)).toBe(10);
  });
});

describe('prefersReducedMotion', () => {
  it('reads the media query and tolerates a missing matchMedia', () => {
    expect(prefersReducedMotion(fakeWindow({ reduced: true }))).toBe(true);
    expect(prefersReducedMotion(fakeWindow({ reduced: false }))).toBe(false);
    expect(prefersReducedMotion({})).toBe(false);
  });
});

describe('animateNumber', () => {
  it('jumps straight to the target when motion is reduced', () => {
    const win = fakeWindow({ reduced: true });
    const onFrame = vi.fn();

    animateNumber({ win, from: 0, to: 500, onFrame });

    expect(onFrame).toHaveBeenCalledTimes(1);
    expect(onFrame).toHaveBeenCalledWith(500);
    expect(win.requestAnimationFrame).not.toHaveBeenCalled();
  });

  it('does not animate when the value does not change', () => {
    const win = fakeWindow();
    const onFrame = vi.fn();

    animateNumber({ win, from: 7, to: 7, onFrame });

    expect(onFrame).toHaveBeenCalledWith(7);
    expect(win.requestAnimationFrame).not.toHaveBeenCalled();
  });

  it('counts up over the duration and ends exactly on the target', () => {
    const win = fakeWindow();
    const values = [];

    animateNumber({ win, from: 0, to: 100, durationMs: 600, onFrame: (value) => values.push(value) });
    win.advance(300);
    win.advance(400);

    expect(values).toHaveLength(2);
    expect(values[0]).toBeGreaterThan(0);
    expect(values[0]).toBeLessThan(100);
    expect(values[1]).toBe(100);
    expect(win.frames).toHaveLength(0);
  });

  it('returns a function that cancels the pending frame', () => {
    const win = fakeWindow();

    const cancel = animateNumber({ win, from: 0, to: 100, onFrame: () => {} });
    cancel();

    expect(win.cancelAnimationFrame).toHaveBeenCalled();
  });
});

describe('growBar', () => {
  it('sets the final size directly when motion is reduced', () => {
    const el = { style: {} };

    growBar(fakeWindow({ reduced: true }), el, 40);

    expect(el.style.width).toBe('40%');
  });

  it('starts from zero and grows on a later frame', () => {
    const win = fakeWindow();
    const el = { style: {} };

    growBar(win, el, 40, 'height');

    expect(el.style.height).toBe('0%');
    win.advance(16);
    expect(el.style.height).toBe('0%');
    win.advance(16);
    expect(el.style.height).toBe('40%');
  });
});

describe('replayClass', () => {
  it('removes the class, forces a reflow, then adds it back', () => {
    const calls = [];
    const el = {
      classList: { remove: (name) => calls.push(`remove ${name}`), add: (name) => calls.push(`add ${name}`) },
      get offsetWidth() {
        calls.push('reflow');
        return 0;
      },
    };

    replayClass(el, 'enter');

    expect(calls).toEqual(['remove enter', 'reflow', 'add enter']);
  });
});

describe('playBars', () => {
  function fakeBar(width, property) {
    return { dataset: property ? { width: String(width), property } : { width: String(width) }, style: {} };
  }

  it('grows every [data-width] element from zero to its stored target', () => {
    const win = fakeWindow();
    const wide = fakeBar(40);
    const tall = fakeBar(70, 'height');
    const container = { querySelectorAll: vi.fn(() => [wide, tall]) };

    playBars(win, container);

    expect(container.querySelectorAll).toHaveBeenCalledWith('[data-width]');
    expect(wide.style.width).toBe('0%');
    expect(tall.style.height).toBe('0%');
    win.advance(16);
    win.advance(16);
    expect(wide.style.width).toBe('40%');
    expect(tall.style.height).toBe('70%');
  });

  it('sets the final size directly when motion is reduced', () => {
    const bar = fakeBar(25);

    playBars(fakeWindow({ reduced: true }), { querySelectorAll: () => [bar] });

    expect(bar.style.width).toBe('25%');
  });
});

// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { installRipple } from './ripple.mjs';

function press(target, x = 30, y = 10) {
  target.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: x, clientY: y }));
}

describe('installRipple', () => {
  let primary;
  let secondary;

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = `
      <div class="actions">
        <button type="button" id="secondary">ยกเลิก</button>
        <button type="submit" class="primary" id="primary">บันทึก</button>
      </div>`;
    primary = document.getElementById('primary');
    secondary = document.getElementById('secondary');
    installRipple(document);
  });

  afterEach(() => {
    vi.useRealTimers();
    delete window.matchMedia;
  });

  it('adds a ripple at the pointer position of a primary button and removes it afterwards', () => {
    press(primary, 30, 10);

    const ripple = primary.querySelector('.ripple');
    expect(ripple).not.toBeNull();
    expect(ripple.style.left).toBe('30px');
    expect(ripple.style.top).toBe('10px');

    vi.advanceTimersByTime(750);
    expect(primary.querySelector('.ripple')).toBeNull();
  });

  it('ignores secondary buttons', () => {
    press(secondary);
    expect(secondary.querySelector('.ripple')).toBeNull();
  });

  it('ignores a disabled primary button', () => {
    primary.disabled = true;
    press(primary);
    expect(primary.querySelector('.ripple')).toBeNull();
  });

  it('adds nothing when the user prefers reduced motion', () => {
    window.matchMedia = () => ({ matches: true });
    press(primary);
    expect(primary.querySelector('.ripple')).toBeNull();
  });
});

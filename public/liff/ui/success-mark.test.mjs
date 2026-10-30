// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { setSuccessStatus } from './success-mark.mjs';

describe('setSuccessStatus', () => {
  let el;

  beforeEach(() => {
    document.body.innerHTML = '<p id="status"></p>';
    el = document.getElementById('status');
  });

  it('puts a check mark before the text and keeps textContent equal to the text', () => {
    setSuccessStatus(el, 'บันทึกงบแล้ว 2 หมวด');

    expect(el.textContent).toBe('บันทึกงบแล้ว 2 หมวด');
    expect(el.querySelector('svg.success-mark')).not.toBeNull();
    expect(el.firstElementChild.getAttribute('aria-hidden')).toBe('true');
  });

  it('keeps a single mark when called twice', () => {
    setSuccessStatus(el, 'ครั้งแรก');
    setSuccessStatus(el, 'ครั้งที่สอง');

    expect(el.querySelectorAll('svg.success-mark')).toHaveLength(1);
    expect(el.textContent).toBe('ครั้งที่สอง');
  });

  it('clears the element without a mark when the text is empty', () => {
    setSuccessStatus(el, 'บันทึกแล้ว');
    setSuccessStatus(el, '');

    expect(el.textContent).toBe('');
    expect(el.querySelector('svg')).toBeNull();
  });
});

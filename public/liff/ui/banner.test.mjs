// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { createBannerSetter } from './banner.mjs';

describe('createBannerSetter', () => {
  it('shows the text and hides the banner again on empty text', () => {
    const el = document.createElement('p');
    el.hidden = true;
    const setBanner = createBannerSetter(el);

    setBanner('ข้อความ');
    expect(el.textContent).toBe('ข้อความ');
    expect(el.hidden).toBe(false);

    setBanner('');
    expect(el.textContent).toBe('');
    expect(el.hidden).toBe(true);
  });

  it('does not rewrite the text when it is unchanged (screen readers would read it again)', () => {
    const el = document.createElement('p');
    const original = Object.getOwnPropertyDescriptor(Node.prototype, 'textContent');
    let writes = 0;
    Object.defineProperty(el, 'textContent', {
      configurable: true,
      get() {
        return original.get.call(this);
      },
      set(value) {
        writes += 1;
        original.set.call(this, value);
      },
    });
    const setBanner = createBannerSetter(el);

    setBanner('ข้อความ');
    setBanner('ข้อความ');
    setBanner('ข้อความ');

    expect(writes).toBe(1);
    expect(el.hidden).toBe(false);
  });
});

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
});

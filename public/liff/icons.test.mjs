// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { createSvgIcon } from './icons.mjs';

describe('createSvgIcon', () => {
  it('builds an svg that references the sprite symbol and is hidden from screen readers', () => {
    const svg = createSvgIcon(document, 'cat-food');

    expect(svg.namespaceURI).toBe('http://www.w3.org/2000/svg');
    expect(svg.getAttribute('class')).toBe('icon');
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('focusable')).toBe('false');
    expect(svg.querySelector('use').getAttribute('href')).toBe('#cat-food');
  });

  it('accepts a custom class', () => {
    expect(createSvgIcon(document, 'tab-list', 'icon nav-icon').getAttribute('class')).toBe('icon nav-icon');
  });
});

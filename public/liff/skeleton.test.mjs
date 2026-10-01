// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { createSkeletonRows, createLoadingIndicator } from './skeleton.mjs';

describe('createSkeletonRows', () => {
  it('creates the requested number of hidden placeholder rows', () => {
    const list = document.createElement('ul');
    list.append(createSkeletonRows(document, 3, 'bar'));

    const items = list.querySelectorAll('li');
    expect(items).toHaveLength(3);
    for (const item of items) {
      expect(item.className).toBe('skeleton skeleton-bar');
      expect(item.getAttribute('aria-hidden')).toBe('true');
      expect(item.textContent).toBe('');
    }
  });

  it('defaults to the row variant', () => {
    const list = document.createElement('ul');
    list.append(createSkeletonRows(document, 1));

    expect(list.firstElementChild.className).toBe('skeleton skeleton-row');
  });
});

describe('createLoadingIndicator', () => {
  function setup() {
    const textEl = document.createElement('p');
    const skeletonEl = document.createElement('ul');
    const indicator = createLoadingIndicator({ doc: document, textEl, skeletonEl, count: 2, variant: 'bar' });
    return { textEl, skeletonEl, indicator };
  }

  it('fills the skeleton once and toggles both elements together', () => {
    const { textEl, skeletonEl, indicator } = setup();

    expect(skeletonEl.children).toHaveLength(2);

    indicator.set(true);
    expect(textEl.hidden).toBe(false);
    expect(skeletonEl.hidden).toBe(false);

    indicator.set(false);
    expect(textEl.hidden).toBe(true);
    expect(skeletonEl.hidden).toBe(true);
    expect(skeletonEl.children).toHaveLength(2);
  });
});

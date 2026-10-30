// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { createSkeletonRows, createSkeletonBlocks, createLoadingIndicator } from './skeleton.mjs';

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

describe('createSkeletonBlocks', () => {
  it('creates one hidden placeholder per variant in order', () => {
    const list = document.createElement('ul');
    list.append(createSkeletonBlocks(document, ['totals', 'filters']));

    expect([...list.children].map((item) => item.className)).toEqual(['skeleton skeleton-totals', 'skeleton skeleton-filters']);
    for (const item of list.children) expect(item.getAttribute('aria-hidden')).toBe('true');
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

  it('fills the skeleton from a list of variants when one is given', () => {
    const textEl = document.createElement('p');
    const skeletonEl = document.createElement('ul');
    createLoadingIndicator({ doc: document, textEl, skeletonEl, variants: ['profile-head', 'balance'] });

    expect([...skeletonEl.children].map((item) => item.className)).toEqual(['skeleton skeleton-profile-head', 'skeleton skeleton-balance']);
  });
});

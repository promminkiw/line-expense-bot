import { describe, expect, it, vi } from 'vitest';
import { revealError } from './reveal.mjs';

describe('revealError', () => {
  it('scrolls the error into view with the nearest edge', () => {
    const element = { scrollIntoView: vi.fn() };

    revealError(element);

    expect(element.scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
  });

  it('does nothing when the browser has no scrollIntoView', () => {
    expect(() => revealError({})).not.toThrow();
  });
});

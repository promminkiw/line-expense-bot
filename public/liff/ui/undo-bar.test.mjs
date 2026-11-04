// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createUndoBar } from './undo-bar.mjs';

function setup() {
  const el = document.createElement('div');
  const textEl = document.createElement('span');
  const button = document.createElement('button');
  el.append(textEl, button);
  el.hidden = true;
  return { el, textEl, button, bar: createUndoBar({ el, textEl, button, durationMs: 5000 }) };
}

afterEach(() => vi.useRealTimers());

describe('createUndoBar', () => {
  it('shows the text and hides itself when time runs out', () => {
    vi.useFakeTimers();
    const { el, textEl, bar } = setup();

    bar.show('ลบรายการแล้ว', () => {});
    expect(el.hidden).toBe(false);
    expect(textEl.textContent).toBe('ลบรายการแล้ว');

    vi.advanceTimersByTime(5000);
    expect(el.hidden).toBe(true);
  });

  it('runs the undo once and hides immediately', () => {
    vi.useFakeTimers();
    const { el, button, bar } = setup();
    const onUndo = vi.fn();

    bar.show('ลบรายการแล้ว', onUndo);
    button.click();
    button.click();

    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(el.hidden).toBe(true);
  });

  it('replaces the previous undo and restarts the time on a new show', () => {
    vi.useFakeTimers();
    const { el, button, bar } = setup();
    const first = vi.fn();
    const second = vi.fn();

    bar.show('ก', first);
    vi.advanceTimersByTime(4000);
    bar.show('ข', second);
    vi.advanceTimersByTime(4000);
    expect(el.hidden).toBe(false);

    button.click();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});

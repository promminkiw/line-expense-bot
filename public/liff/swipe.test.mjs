import { describe, it, expect } from 'vitest';
import { createSwipeTracker } from './swipe.mjs';

const REVEAL = 88;

function tracker() {
  return createSwipeTracker({ revealWidth: REVEAL });
}

describe('createSwipeTracker', () => {
  it('follows a horizontal drag to the left and stops at the reveal width', () => {
    const swipe = tracker();
    swipe.start(300, 100);

    expect(swipe.move(270, 102)).toEqual({ dragging: true, offset: 30 });
    expect(swipe.move(-100, 103)).toEqual({ dragging: true, offset: REVEAL });
  });

  it('does not move when dragged to the right from the closed position', () => {
    const swipe = tracker();
    swipe.start(200, 100);

    expect(swipe.move(250, 100)).toEqual({ dragging: true, offset: 0 });
  });

  it('ignores small movements until the direction is clear', () => {
    const swipe = tracker();
    swipe.start(100, 100);

    expect(swipe.move(96, 101)).toEqual({ dragging: false, offset: 0 });
  });

  it('gives the gesture to vertical scrolling when it moves up or down first', () => {
    const swipe = tracker();
    swipe.start(100, 100);

    expect(swipe.move(97, 130)).toEqual({ dragging: false, offset: 0 });
    // เมื่อปล่อยให้เลื่อนแนวตั้งแล้ว การเลื่อนไปทางซ้ายต่อมาต้องไม่ถูกนับเป็นการปัด
    expect(swipe.move(40, 135)).toEqual({ dragging: false, offset: 0 });
    expect(swipe.end()).toEqual({ open: false, dragged: false });
  });

  it('opens when released past half of the reveal width', () => {
    const swipe = tracker();
    swipe.start(200, 100);
    swipe.move(150, 100);

    expect(swipe.end()).toEqual({ open: true, dragged: true });
  });

  it('snaps back when released before half', () => {
    const swipe = tracker();
    swipe.start(200, 100);
    swipe.move(180, 100);

    expect(swipe.end()).toEqual({ open: false, dragged: true });
  });

  it('can be closed by dragging right from the open position', () => {
    const swipe = tracker();
    swipe.start(100, 100, REVEAL);

    expect(swipe.move(150, 100)).toEqual({ dragging: true, offset: 38 });
    expect(swipe.end()).toEqual({ open: false, dragged: true });
  });

  it('reports no drag for a plain tap', () => {
    const swipe = tracker();
    swipe.start(100, 100);

    expect(swipe.end()).toEqual({ open: false, dragged: false });
  });

  it('keeps an already open row open for a tap', () => {
    const swipe = tracker();
    swipe.start(100, 100, REVEAL);

    expect(swipe.end()).toEqual({ open: true, dragged: false });
  });
});

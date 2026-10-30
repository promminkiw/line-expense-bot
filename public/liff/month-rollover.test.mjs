import { describe, it, expect, vi } from 'vitest';
import { createMonthRollover } from './month-rollover.mjs';

function setup({ start, canSwitch = () => true }) {
  let now = new Date(start);
  const onRollover = vi.fn();
  const rollover = createMonthRollover({ now: () => now, canSwitch, onRollover });
  return { rollover, onRollover, setNow: (value) => { now = new Date(value); } };
}

describe('createMonthRollover', () => {
  it('does nothing while the Bangkok month is unchanged', () => {
    const { rollover, onRollover, setNow } = setup({ start: '2026-10-15T05:00:00Z' });
    setNow('2026-10-31T16:59:00Z');

    expect(rollover.check()).toBe(false);
    expect(onRollover).not.toHaveBeenCalled();
  });

  it('reports the new month once after the Bangkok month changes', () => {
    // 2026-10-31 17:00 UTC คือ 2026-11-01 00:00 เวลาไทย
    const { rollover, onRollover, setNow } = setup({ start: '2026-10-15T05:00:00Z' });
    setNow('2026-10-31T17:00:00Z');

    expect(rollover.check()).toBe(true);
    expect(rollover.check()).toBe(false);
    expect(onRollover).toHaveBeenCalledTimes(1);
    expect(onRollover).toHaveBeenCalledWith('2026-11');
  });

  it('waits until switching is allowed, then reports the month', () => {
    let allowed = false;
    const { rollover, onRollover, setNow } = setup({ start: '2026-10-15T05:00:00Z', canSwitch: () => allowed });
    setNow('2026-11-02T05:00:00Z');

    expect(rollover.check()).toBe(false);
    expect(onRollover).not.toHaveBeenCalled();

    allowed = true;
    expect(rollover.check()).toBe(true);
    expect(onRollover).toHaveBeenCalledWith('2026-11');
  });

  it('jumps straight to the latest month after several months away', () => {
    const { rollover, onRollover, setNow } = setup({ start: '2026-10-15T05:00:00Z' });
    setNow('2027-01-03T05:00:00Z');

    rollover.check();

    expect(onRollover).toHaveBeenCalledTimes(1);
    expect(onRollover).toHaveBeenCalledWith('2027-01');
  });
});

import { describe, it, expect } from 'vitest';
import { capAltText, ALT_TEXT_MAX } from './alt-text.js';

describe('capAltText', () => {
  it('keeps text within the LINE limit as it is', () => {
    expect(ALT_TEXT_MAX).toBe(400);
    expect(capAltText('สรุปบิล')).toBe('สรุปบิล');
    expect(capAltText('ก'.repeat(400))).toBe('ก'.repeat(400));
  });

  it('cuts long text to the limit with an ellipsis', () => {
    const capped = capAltText('ก'.repeat(500));

    expect(capped).toHaveLength(400);
    expect(capped.endsWith('...')).toBe(true);
  });

  // ตัดกลาง surrogate pair ทำให้ได้อักขระเสีย
  it('never splits an emoji in half', () => {
    const capped = capAltText(`ก${'😀'.repeat(300)}`);

    expect(capped.length).toBeLessThanOrEqual(400);
    expect(capped.isWellFormed()).toBe(true);
    expect(capped.endsWith('😀...')).toBe(true);
  });
});

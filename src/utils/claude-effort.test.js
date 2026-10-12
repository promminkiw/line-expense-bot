import { describe, it, expect } from 'vitest';
import { withLowEffort } from './claude-effort.js';

describe('withLowEffort', () => {
  it('asks Haiku 5.5 to think little', () => {
    expect(withLowEffort('claude-haiku-5-5', { format: { type: 'json_schema' } })).toEqual({
      format: { type: 'json_schema' },
      effort: 'low',
    });
    expect(withLowEffort('claude-haiku-5-5')).toEqual({ effort: 'low' });
  });

  // Haiku 4.5 ตอบ 400 เมื่อได้ effort ค่า CLAUDE_MODEL ที่ยังเป็นรุ่นเดิมต้องใช้งานต่อได้
  it('leaves effort out for Haiku 4.5, which rejects it', () => {
    expect(withLowEffort('claude-haiku-4-5', { format: { type: 'json_schema' } })).toEqual({ format: { type: 'json_schema' } });
    expect(withLowEffort('claude-haiku-4-5')).toBeUndefined();
  });

  it('does not change the object it was given', () => {
    const base = { format: { type: 'json_schema' } };
    withLowEffort('claude-haiku-5-5', base);
    expect(base).toEqual({ format: { type: 'json_schema' } });
  });
});

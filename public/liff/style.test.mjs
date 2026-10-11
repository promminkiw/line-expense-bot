import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const css = readFileSync(new URL('./style.css', import.meta.url), 'utf8');

function declarations(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`));
  return match ? match[1] : null;
}

describe('style.css skeleton sizes', () => {
  // jsdom ไม่มี layout จึงตรวจได้แค่ว่าทุก variant มีความสูงตายตัว ส่วนตัวเลขตรงของจริงตรวจในเบราว์เซอร์
  it.each(['totals', 'filters', 'chart', 'trend', 'budget', 'recurring', 'profile-head', 'balance', 'stats', 'tips', 'bill-card'])(
    'gives the %s skeleton a fixed pixel height',
    (variant) => {
      const rule = declarations(`.skeleton-${variant}`);

      expect(rule).not.toBeNull();
      expect(rule).toMatch(/(?:^|;)\s*height:\s*\d+px/);
    },
  );
});

describe('style.css trend bars', () => {
  // ความสูงเป็น % ของแท่งต้องอ้างกล่องที่สูงตายตัว WebView รุ่นเก่าคิด % ของกล่องที่ได้ความสูงจาก flex เป็น 0
  it('gives the bar pair a fixed pixel height instead of a flexed one', () => {
    const rule = declarations('.trend-pair');

    expect(rule).toMatch(/(?:^|;)\s*height:\s*\d+px/);
    expect(rule).not.toMatch(/flex:\s*1/);
  });
});

describe('style.css date inputs', () => {
  // Safari บน iOS ให้ช่องวันที่กว้างขั้นต่ำของตัวเองและจัดกลาง ทำให้ล้นกรอบ dialog
  it('lets dialog date inputs shrink to the dialog width and align left', () => {
    const rule = declarations('dialog input[type="date"]');

    expect(rule).not.toBeNull();
    expect(rule).toMatch(/(?:^|;)\s*-webkit-appearance:\s*none/);
    expect(rule).toMatch(/(?:^|;)\s*min-width:\s*0/);
    expect(rule).toMatch(/(?:^|;)\s*min-height:\s*\d+px/);
    expect(declarations('dialog input[type="date"]::-webkit-date-and-time-value')).toMatch(/text-align:\s*left/);
  });
});

describe('style.css friend status', () => {
  // ข้อความสถานะอาจเป็นลิงก์ชวนยาวๆ ที่ไม่มีช่องว่าง ต้องตัดบรรทัดได้ไม่ล้นจอ
  it('wraps a long invite link in the friend status', () => {
    expect(declarations('#friend-status')).toMatch(/overflow-wrap:\s*anywhere/);
  });
});

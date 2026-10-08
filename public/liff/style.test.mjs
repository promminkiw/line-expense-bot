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
  it.each(['totals', 'filters', 'chart', 'trend', 'budget', 'recurring', 'profile-head', 'balance', 'stats', 'tips'])(
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

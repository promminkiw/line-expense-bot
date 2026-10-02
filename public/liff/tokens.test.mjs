import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const css = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8');

function parseVars(text) {
  const vars = {};
  for (const [, name, value] of text.matchAll(/--([a-z-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    vars[name] = value;
  }
  return vars;
}

const vars = parseVars(css);

function luminance(hex) {
  const [r, g, b] = [1, 3, 5]
    .map((index) => parseInt(hex.slice(index, index + 2), 16) / 255)
    .map((channel) => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

const CATEGORY_KEYS = ['food', 'transport', 'shopping', 'bill', 'health', 'fun', 'salary', 'side', 'other'];

// คู่ที่เป็นข้อความต้อง >= 4.5 (AA)
const TEXT_PAIRS = [
  ['text', 'bg'],
  ['text', 'surface'],
  ['muted', 'bg'],
  ['muted', 'surface'],
  ['primary', 'surface'],
  ['income', 'surface'],
  ['danger', 'surface'],
  ['on-primary', 'primary'],
  ['on-danger', 'danger'],
  ['notice-text', 'notice-bg'],
  ...CATEGORY_KEYS.map((key) => [`cat-${key}-fg`, `cat-${key}-bg`]),
];

// คู่ที่ไม่ใช่ข้อความ (เส้นขอบปุ่ม แท่งสีเตือน) ต้อง >= 3
const UI_PAIRS = [
  ['outline', 'surface'],
  ['warn', 'surface'],
];

it('does not define a dark theme', () => {
  expect(css).not.toContain('prefers-color-scheme');
});

describe('tokens', () => {
  it('defines every token used by the pairs', () => {
    for (const name of new Set([...TEXT_PAIRS, ...UI_PAIRS].flat())) {
      expect(vars[name], `missing --${name}`).toBeDefined();
    }
  });

  it.each(TEXT_PAIRS)('text pair %s on %s has AA contrast', (fg, bg) => {
    expect(contrast(vars[fg], vars[bg])).toBeGreaterThanOrEqual(4.5);
  });

  it.each(UI_PAIRS)('ui pair %s on %s has at least 3:1', (fg, bg) => {
    expect(contrast(vars[fg], vars[bg])).toBeGreaterThanOrEqual(3);
  });
});

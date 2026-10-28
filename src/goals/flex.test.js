import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { buildSavingFlex } = require('./flex.js');
const { COLORS } = require('../utils/flex-style.js');

const UNDO_BUTTON = {
  type: 'action',
  action: { type: 'postback', label: 'ยกเลิก', data: 'action=undo_saving&event=ev1', displayText: 'ยกเลิก' },
};
const GOALS_URL = 'https://liff.line.me/liff-1?tab=goals';

function texts(node) {
  if (!node || typeof node !== 'object') return [];
  const own = node.type === 'text' ? [node.text] : [];
  return own.concat(...(node.contents ?? []).map(texts));
}

function findBar(node) {
  if (!node || typeof node !== 'object') return null;
  if (node.type === 'box' && node.height === '8px') return node;
  for (const child of node.contents ?? []) {
    const found = findBar(child);
    if (found) return found;
  }
  return null;
}

describe('buildSavingFlex', () => {
  const saving = { name: 'เที่ยวญี่ปุ่น', amount: 1000, saved: 6000.5, target: 50000 };

  it('puts the goal and the amount saved in the brand header and keeps the altText', () => {
    const message = buildSavingFlex(saving, { buttons: [UNDO_BUTTON], goalsUrl: GOALS_URL });

    expect(message.altText).toBe('เฮียจดออมเข้าเป้า เที่ยวญี่ปุ่น 1,000 บาทแล้ว\nยอดสะสม 6,000.5 / 50,000 บาท (12%)');
    expect(message.contents.header.backgroundColor).toBe(COLORS.brand);
    expect(texts(message.contents.header)).toEqual(['ออมเข้าเป้าแล้ว', 'เที่ยวญี่ปุ่น', '+1,000']);
  });

  it('shows the percent with what is left, the bar, and the running total', () => {
    const message = buildSavingFlex(saving, {});

    expect(texts(message.contents.body)).toEqual(['ความคืบหน้า', '12% · อีก 43,999.5', 'ยอดสะสม 6,000.5 จาก 50,000 บาท']);
    expect(findBar(message.contents.body).contents[0]).toMatchObject({ width: '12%', backgroundColor: COLORS.brand });
  });

  it('turns green, caps the bar at 100% and says the goal is reached', () => {
    const message = buildSavingFlex({ name: 'มือถือ', amount: 500, saved: 30500, target: 30000 }, { goalsUrl: GOALS_URL });
    const bar = findBar(message.contents.body);

    expect(bar.contents[0]).toMatchObject({ width: '100%', backgroundColor: COLORS.income });
    expect(texts(message.contents.body)).toContain('ถึงเป้าแล้ว ปิดเป้าได้ในหน้าเว็บ แท็บ ออม');
    expect(texts(message.contents.body)[1]).toBe('101% · ถึงเป้าแล้ว');
    expect(message.contents.footer.contents.at(-1).action.label).toBe('ปิดเป้าในเว็บ');
  });

  // LINE ไม่รับ box ที่กว้าง 0% จึงใช้ filler แทนเมื่อยอดยังไม่ถึง 1%
  it('leaves the bar empty without a zero width box below 1%', () => {
    const bar = findBar(buildSavingFlex({ name: 'บ้าน', amount: 1, saved: 1, target: 1000000 }, {}).contents.body);

    expect(bar.contents).toEqual([{ type: 'filler' }]);
  });

  it('puts undo on the left and the yellow goals link on the right', () => {
    const footer = buildSavingFlex(saving, { buttons: [UNDO_BUTTON], goalsUrl: GOALS_URL }).contents.footer;

    expect(footer.contents.map((node) => node.action)).toEqual([UNDO_BUTTON.action, { type: 'uri', label: 'ดูเป้าในเว็บ', uri: GOALS_URL }]);
    expect(footer.contents.map((node) => node.backgroundColor)).toEqual([COLORS.secondary, COLORS.cta]);
  });

  it('keeps only the undo button without a goals link and has no footer without either', () => {
    expect(buildSavingFlex(saving, { buttons: [UNDO_BUTTON] }).contents.footer.contents.map((node) => node.action)).toEqual([UNDO_BUTTON.action]);
    expect(buildSavingFlex(saving, {}).contents.footer).toBeUndefined();
  });
});

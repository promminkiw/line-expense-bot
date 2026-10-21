import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { buildSavingFlex } = require('./flex.js');

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

  it('shows the goal, the amount saved and the running total with the plain text reply as altText', () => {
    const message = buildSavingFlex(saving, { buttons: [UNDO_BUTTON], goalsUrl: GOALS_URL });

    expect(message.type).toBe('flex');
    expect(message.altText).toBe('เฮียจดออมเข้าเป้า เที่ยวญี่ปุ่น 1,000 บาทแล้ว\nยอดสะสม 6,000.5 / 50,000 บาท (12%)');
    expect(texts(message.contents.body)).toEqual([
      'เฮียจดออมเข้าเป้าแล้ว',
      'เที่ยวญี่ปุ่น',
      '+1,000 บาท',
      'ยอดสะสม 6,000.5 / 50,000 บาท (12%)',
    ]);
  });

  it('fills the progress bar to the percent', () => {
    const bar = findBar(buildSavingFlex(saving, { buttons: [UNDO_BUTTON] }).contents.body);

    expect(bar.contents).toHaveLength(1);
    expect(bar.contents[0].width).toBe('12%');
  });

  it('caps the bar at 100% and says the goal is reached', () => {
    const message = buildSavingFlex({ name: 'มือถือ', amount: 500, saved: 30500, target: 30000 }, { buttons: [UNDO_BUTTON] });

    expect(findBar(message.contents.body).contents[0].width).toBe('100%');
    expect(texts(message.contents.body)).toContain('ถึงเป้าแล้ว ปิดเป้าได้ในหน้าเว็บ แท็บ ออม');
  });

  // LINE ไม่รับ box ที่กว้าง 0% จึงใช้ filler แทนเมื่อยอดยังไม่ถึง 1%
  it('leaves the bar empty without a zero width box below 1%', () => {
    const bar = findBar(buildSavingFlex({ name: 'บ้าน', amount: 1, saved: 1, target: 1000000 }, {}).contents.body);

    expect(bar.contents).toEqual([{ type: 'filler' }]);
  });

  it('puts the goals link and the undo button in the footer', () => {
    const footer = buildSavingFlex(saving, { buttons: [UNDO_BUTTON], goalsUrl: GOALS_URL }).contents.footer;

    expect(footer.contents.map((button) => button.action)).toEqual([
      { type: 'uri', label: 'ดูเป้าในเว็บ', uri: GOALS_URL },
      UNDO_BUTTON.action,
    ]);
  });

  it('keeps only the undo button when there is no goals link', () => {
    const footer = buildSavingFlex(saving, { buttons: [UNDO_BUTTON] }).contents.footer;

    expect(footer.contents.map((button) => button.action)).toEqual([UNDO_BUTTON.action]);
  });
});

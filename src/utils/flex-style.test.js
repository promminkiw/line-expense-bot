import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { COLORS, CHART_COLORS, brandHeader, progressBar, stackBar, gaugeRow, boxButton, actionRow, softButton, linkButton } = require('./flex-style.js');

const SAVE = { type: 'postback', label: 'บันทึก', data: 'action=slip_save&slip=s1', displayText: 'บันทึก' };
const CANCEL = { type: 'postback', label: 'ยกเลิก', data: 'action=slip_cancel&slip=s1', displayText: 'ยกเลิก' };

describe('flex-style colors', () => {
  it('uses the web brand and chart colors', () => {
    expect(COLORS.brand).toBe('#1157C5');
    expect(COLORS.cta).toBe('#FFDE59');
    expect(CHART_COLORS).toEqual(['#1157C5', '#C26A00', '#E5484D', '#1D7A35', '#7B4FE0', '#007F96']);
  });
});

describe('brandHeader', () => {
  it('puts the eyebrow above a bold white title on the brand color', () => {
    const header = brandHeader('เฮียบันทึกแล้ว', '-120 บาท');

    expect(header.backgroundColor).toBe(COLORS.brand);
    expect(header.contents.map((node) => node.text)).toEqual(['เฮียบันทึกแล้ว', '-120 บาท']);
    expect(header.contents[1]).toMatchObject({ weight: 'bold', size: 'xl', color: COLORS.white });
  });

  it('adds an end text on the title line when given', () => {
    const header = brandHeader('ออมเข้าเป้าแล้ว', 'เที่ยวญี่ปุ่น', '+500');
    const line = header.contents[1];

    expect(line.layout).toBe('horizontal');
    expect(line.contents.map((node) => node.text)).toEqual(['เที่ยวญี่ปุ่น', '+500']);
  });
});

describe('progressBar', () => {
  it('fills to the floored percent with the given color', () => {
    const bar = progressBar(86.7, COLORS.warnBar);

    expect(bar).toMatchObject({ height: '8px', cornerRadius: '4px', backgroundColor: COLORS.track });
    expect(bar.contents[0]).toMatchObject({ width: '86%', backgroundColor: COLORS.warnBar });
  });

  it('caps at 100% and uses a filler below 1%', () => {
    expect(progressBar(140, COLORS.expense).contents[0].width).toBe('100%');
    expect(progressBar(0.4, COLORS.brand).contents).toEqual([{ type: 'filler' }]);
  });
});

describe('stackBar', () => {
  it('draws one colored part per segment weighted by flex', () => {
    const bar = stackBar([{ weight: 36, color: CHART_COLORS[0] }, { weight: 64, color: CHART_COLORS[1] }]);

    expect(bar.height).toBe('8px');
    expect(bar.contents.map((part) => [part.flex, part.backgroundColor])).toEqual([[36, '#1157C5'], [64, '#C26A00']]);
  });
});

describe('gaugeRow', () => {
  it('puts the label left and the colored value right', () => {
    const row = gaugeRow('งบอาหาร · ใกล้เต็มงบ', '86% · เหลือ 840', COLORS.warnText);

    expect(row.contents.map((node) => node.text)).toEqual(['งบอาหาร · ใกล้เต็มงบ', '86% · เหลือ 840']);
    expect(row.contents[1]).toMatchObject({ align: 'end', color: COLORS.warnText, weight: 'bold' });
  });
});

describe('buttons', () => {
  it('makes a box button that carries the action and shows its label', () => {
    const button = boxButton(SAVE, { background: COLORS.cta, color: COLORS.onCta });

    expect(button).toMatchObject({ type: 'box', action: SAVE, backgroundColor: COLORS.cta, height: '40px' });
    expect(button.contents[0]).toMatchObject({ type: 'text', text: 'บันทึก', color: COLORS.onCta });
  });

  it('puts the secondary buttons left and the yellow primary right', () => {
    const row = actionRow(SAVE, [CANCEL]);

    expect(row.layout).toBe('horizontal');
    expect(row.contents.map((node) => node.action)).toEqual([CANCEL, SAVE]);
    expect(row.contents.map((node) => node.backgroundColor)).toEqual([COLORS.secondary, COLORS.cta]);
  });

  it('has no row without any action', () => {
    expect(actionRow(undefined, [])).toBeUndefined();
  });

  it('makes a soft blue button and a brand link button', () => {
    expect(softButton(CANCEL)).toMatchObject({ backgroundColor: COLORS.brandSoft, action: CANCEL });
    expect(softButton(CANCEL).contents[0].color).toBe(COLORS.brand);
    const uri = { type: 'uri', label: 'ดูในเว็บ', uri: 'https://liff.line.me/1' };
    expect(linkButton(uri)).toEqual({ type: 'button', style: 'link', height: 'sm', color: COLORS.brand, action: uri });
  });
});

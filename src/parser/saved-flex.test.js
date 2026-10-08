import { describe, it, expect } from 'vitest';
import { buildSavedFlex, buildSlipConfirmFlex, ALT_TEXT_MAX } from './saved-flex.js';
import { formatSavedReply, formatSlipConfirmReply } from './format-reply.js';

const FOOD = { type: 'expense', category: 'อาหาร', amount: 60, date: '2026-09-29', note: 'กินข้าว' };
const SALARY = { type: 'income', category: 'เงินเดือน', amount: 25000, date: '2026-09-01', note: '' };
const UNDO = [{ type: 'action', action: { type: 'postback', label: 'ยกเลิก', data: 'action=undo&event=ev1' } }];

// เก็บ text node ทุกอันในการ์ดตามลำดับ เพื่อเทสต์เนื้อหาโดยไม่ผูกกับโครง box
function collect(node, found = []) {
  if (Array.isArray(node)) {
    node.forEach((child) => collect(child, found));
  } else if (node && typeof node === 'object') {
    if (node.type === 'text') found.push(node);
    collect(node.contents, found);
  }
  return found;
}

function texts(flex) {
  return collect(flex.contents.body).map((node) => node.text);
}

describe('buildSavedFlex', () => {
  it('returns a bubble with the plain saved text as altText and the buttons in the footer', () => {
    const flex = buildSavedFlex([FOOD], { buttons: UNDO });

    expect(flex.type).toBe('flex');
    expect(flex.contents.type).toBe('bubble');
    expect(flex.altText).toBe(formatSavedReply([FOOD]));
    expect(flex.quickReply).toBeUndefined();
    expect(flex.contents.footer.contents.map((button) => button.action)).toEqual(UNDO.map((item) => item.action));
  });

  it('omits the footer when no buttons are given', () => {
    expect(buildSavedFlex([FOOD]).contents.footer).toBeUndefined();
  });

  it('makes a single button secondary', () => {
    const [button] = buildSavedFlex([FOOD], { buttons: UNDO }).contents.footer.contents;

    expect(button.type).toBe('button');
    expect(button.style).toBe('secondary');
  });

  it('shows the category, a signed amount, then date and note on one small line', () => {
    const flex = buildSavedFlex([FOOD]);

    expect(texts(flex)).toEqual(['บันทึกแล้ว', 'อาหาร', '29/09 · กินข้าว', '-60 บาท']);
  });

  it('colors expenses red and incomes green and drops the separator when there is no note', () => {
    const flex = buildSavedFlex([FOOD, SALARY]);
    const amounts = collect(flex.contents.body).filter((node) => /บาท$/.test(node.text));

    expect(amounts.map((node) => node.text)).toEqual(['-60 บาท', '+25,000 บาท']);
    expect(amounts[0].color).not.toBe(amounts[1].color);
    expect(texts(flex)).toContain('01/09');
    expect(texts(flex).join('|')).not.toContain('01/09 ·');
  });

  it('lists one row per item in order', () => {
    const flex = buildSavedFlex([FOOD, SALARY]);

    expect(texts(flex).filter((text) => text === 'อาหาร' || text === 'เงินเดือน')).toEqual(['อาหาร', 'เงินเดือน']);
  });

  it('wraps long notes instead of cutting them', () => {
    const flex = buildSavedFlex([{ ...FOOD, note: 'ข้าวมันไก่ร้านเดิมหน้าปากซอย' }]);
    const sub = collect(flex.contents.body).find((node) => node.text.startsWith('29/09'));

    expect(sub.wrap).toBe(true);
  });

  it('adds a strip per budget alert with a short title and a detail line', () => {
    const alerts = [
      { level: 'warn', month: '2026-09', category: 'อาหาร', spent: 135, budget: 150 },
      { level: 'over', month: '2026-09', category: 'เดินทาง', spent: 1200, budget: 1000 },
    ];
    const flex = buildSavedFlex([FOOD], { alerts });

    expect(texts(flex)).toEqual(expect.arrayContaining([
      'ใกล้เต็มงบ อาหาร 90%',
      'ใช้ไป 135 จาก 150 บาท (เดือน 09/2026)',
      'เกินงบ เดินทาง 120%',
    ]));
    expect(flex.altText).toContain('ใกล้เต็มงบ อาหาร เดือน 09/2026: ใช้ไป 135 จาก 150 บาท (90%)');
  });

  it('uses a different strip color for warn and over', () => {
    const strips = (level) => {
      const flex = buildSavedFlex([FOOD], { alerts: [{ level, month: '2026-09', category: 'อาหาร', spent: 150, budget: 150 }] });
      return flex.contents.body.contents.filter((node) => node.backgroundColor).map((node) => node.backgroundColor);
    };

    expect(strips('warn')).toHaveLength(1);
    expect(strips('warn')[0]).not.toBe(strips('over')[0]);
  });

  it('shows a notice strip when the budget check failed', () => {
    const flex = buildSavedFlex([FOOD], { budgetCheckFailed: true });

    expect(texts(flex)).toContain('เช็กงบไม่สำเร็จ ดูสถานะงบได้ในหน้าเว็บ');
    expect(flex.altText.endsWith('\n\nเช็กงบไม่สำเร็จ ดูสถานะงบได้ในหน้าเว็บ')).toBe(true);
  });

  it('keeps altText within the LINE limit even for a long receipt', () => {
    const items = Array.from({ length: 20 }, (_, index) => ({ ...FOOD, note: `รายการสินค้าชื่อยาวมากลำดับที่ ${index}` }));
    const flex = buildSavedFlex(items);

    expect(flex.altText.length).toBeLessThanOrEqual(ALT_TEXT_MAX);
    expect(collect(flex.contents.body).filter((node) => node.text === 'อาหาร')).toHaveLength(20);
  });
});

describe('buildSavedFlex edit links', () => {
  const rowsOf = (flex) => flex.contents.body.contents.filter((node) => node.type === 'box' && node.layout === 'horizontal');

  it('makes each row open its link when links are given', () => {
    const flex = buildSavedFlex([FOOD, SALARY], { editUrls: ['https://liff.line.me/l?tx=a', 'https://liff.line.me/l?tx=b'] });

    expect(rowsOf(flex).map((row) => row.action)).toEqual([
      { type: 'uri', label: 'แก้ไข', uri: 'https://liff.line.me/l?tx=a' },
      { type: 'uri', label: 'แก้ไข', uri: 'https://liff.line.me/l?tx=b' },
    ]);
    expect(texts(flex)).toContain('แตะรายการเพื่อแก้ไขในเว็บ');
  });

  it('adds no action and no hint without links', () => {
    const flex = buildSavedFlex([FOOD]);

    expect(rowsOf(flex)[0].action).toBeUndefined();
    expect(texts(flex)).not.toContain('แตะรายการเพื่อแก้ไขในเว็บ');
  });

  it('adds the hint only when at least one row has a link', () => {
    const none = buildSavedFlex([FOOD], { editUrls: [undefined] });
    const some = buildSavedFlex([FOOD, SALARY], { editUrls: ['https://liff.line.me/l?tx=a', undefined] });

    expect(texts(none)).not.toContain('แตะรายการเพื่อแก้ไขในเว็บ');
    expect(texts(some)).toContain('แตะรายการเพื่อแก้ไขในเว็บ');
    expect(rowsOf(some).map((row) => Boolean(row.action))).toEqual([true, false]);
  });

  it('ignores links that do not match the items one to one', () => {
    const flex = buildSavedFlex([FOOD, SALARY], { editUrls: ['https://liff.line.me/l?tx=a'] });

    expect(rowsOf(flex).every((row) => row.action === undefined)).toBe(true);
    expect(texts(flex)).not.toContain('แตะรายการเพื่อแก้ไขในเว็บ');
  });
});

describe('buildSlipConfirmFlex', () => {
  const MILK = { type: 'expense', category: 'อาหาร', amount: 120, date: '2026-09-28', note: 'นม' };
  const TOOTHPASTE = { type: 'expense', category: 'สุขภาพ', amount: 59, date: '2026-09-28', note: 'ยาสีฟัน' };
  const SLIP_BUTTONS = [{ type: 'action', action: { type: 'postback', label: 'บันทึก', data: 'action=slip_save&slip=s1' } }];

  it('returns a bubble whose altText is the plain confirm text and carries the buttons in the footer', () => {
    const flex = buildSlipConfirmFlex([MILK], { buttons: SLIP_BUTTONS });

    expect(flex.type).toBe('flex');
    expect(flex.altText).toBe(formatSlipConfirmReply([MILK]));
    expect(flex.quickReply).toBeUndefined();
    expect(flex.contents.footer.contents.map((button) => button.action)).toEqual(SLIP_BUTTONS.map((item) => item.action));
  });

  it('makes the first button primary and the rest secondary', () => {
    const buttons = [
      ...SLIP_BUTTONS,
      { type: 'action', action: { type: 'postback', label: 'ยกเลิก', data: 'action=slip_cancel&slip=s1' } },
    ];
    const styles = buildSlipConfirmFlex([MILK], { buttons }).contents.footer.contents.map((button) => button.style);

    expect(styles).toEqual(['primary', 'secondary']);
  });

  it('titles the card by how many items were read and ends with the confirm hint', () => {
    expect(texts(buildSlipConfirmFlex([MILK]))[0]).toBe('อ่านสลิปได้');
    const many = texts(buildSlipConfirmFlex([MILK, TOOTHPASTE]));

    expect(many[0]).toBe('อ่านสลิปได้ 2 รายการ');
    expect(many[many.length - 1]).toBe('กดบันทึกเพื่อยืนยัน (หมดเวลาใน 10 นาที)');
  });

  it('lists one row per item with the signed amount', () => {
    const found = texts(buildSlipConfirmFlex([MILK, TOOTHPASTE]));

    expect(found).toEqual(expect.arrayContaining(['อาหาร', '-120 บาท', 'สุขภาพ', '-59 บาท']));
  });

  it('shows the assumed date warning in a highlighted strip', () => {
    const flex = buildSlipConfirmFlex([MILK], { dateAssumed: true });
    const strips = flex.contents.body.contents.filter((node) => node.backgroundColor);

    expect(strips).toHaveLength(1);
    expect(texts(flex)).toContain('อ่านวันที่ไม่ได้ จึงใช้วันนี้');
  });

  it('has no warning strip when the date was read', () => {
    const flex = buildSlipConfirmFlex([MILK]);

    expect(flex.contents.body.contents.filter((node) => node.backgroundColor)).toHaveLength(0);
  });

  it('gives the rows no link action, even for the second row onward (array index must not leak in as a uri)', () => {
    const items = [MILK, TOOTHPASTE, { ...MILK, note: 'ขนม' }, { ...MILK, note: 'น้ำ' }];
    const flex = buildSlipConfirmFlex(items);
    const rows = flex.contents.body.contents.filter((node) => node.type === 'box' && node.layout === 'horizontal');

    expect(rows).toHaveLength(4);
    expect(rows.map((row) => row.action)).toEqual([undefined, undefined, undefined, undefined]);
  });

  it('adds no strip when nothing needs attention', () => {
    const flex = buildSlipConfirmFlex([MILK]);

    expect(flex.contents.body.contents.filter((node) => node.backgroundColor)).toHaveLength(0);
  });

  it('keeps altText within the LINE limit for a long receipt', () => {
    const items = Array.from({ length: 20 }, (_, index) => ({ ...MILK, note: `สินค้าชื่อยาวมากลำดับที่ ${index}` }));

    expect(buildSlipConfirmFlex(items).altText.length).toBeLessThanOrEqual(ALT_TEXT_MAX);
  });
});

import { describe, it, expect } from 'vitest';
import { buildSavedFlex, buildSlipConfirmFlex, ALT_TEXT_MAX } from './saved-flex.js';
import { formatSavedReply, formatSlipConfirmReply } from './format-reply.js';
import { COLORS } from '../utils/flex-style.js';

const FOOD = { type: 'expense', category: 'อาหาร', amount: 60, date: '2026-09-29', note: 'กินข้าว' };
const SALARY = { type: 'income', category: 'เงินเดือน', amount: 25000, date: '2026-09-01', note: '' };
const UNDO = [{ type: 'action', action: { type: 'postback', label: 'ลบ', data: 'action=undo&event=ev1', displayText: 'ลบ' } }];

// เก็บ text node ทุกอันตามลำดับ เพื่อเทสต์เนื้อหาโดยไม่ผูกกับโครง box
function collect(node, found = []) {
  if (Array.isArray(node)) {
    node.forEach((child) => collect(child, found));
  } else if (node && typeof node === 'object') {
    if (node.type === 'text') found.push(node);
    collect(node.contents, found);
  }
  return found;
}

const texts = (node) => collect(node).map((item) => item.text);
const rowsOf = (flex) => flex.contents.body.contents.filter((node) => node.type === 'box' && node.layout === 'horizontal');
const footerActions = (flex) => flex.contents.footer.contents.map((node) => node.action);

describe('buildSavedFlex', () => {
  it('keeps the plain saved text as altText', () => {
    expect(buildSavedFlex([FOOD]).altText).toBe(formatSavedReply([FOOD]));
  });

  it('puts the signed amount in the brand header', () => {
    const flex = buildSavedFlex([FOOD]);

    expect(flex.contents.header.backgroundColor).toBe(COLORS.brand);
    expect(texts(flex.contents.header)).toEqual(['เฮียบันทึกแล้ว', '-60 บาท']);
  });

  it('sums several items with their signs and counts them in the header', () => {
    expect(texts(buildSavedFlex([FOOD, SALARY]).contents.header)).toEqual(['เฮียบันทึกแล้ว 2 รายการ', '+24,940 บาท']);
  });

  it('titles a row by the note and moves the category to the sub line', () => {
    expect(texts(buildSavedFlex([{ ...FOOD, wallet: 'บัตรเครดิต' }]).contents.body)).toEqual(['กินข้าว', 'อาหาร · 29/09 · บัตรเครดิต']);
  });

  it('titles a row by the category when there is no note', () => {
    expect(texts(buildSavedFlex([SALARY]).contents.body)).toEqual(['เงินเดือน', '01/09']);
  });

  it('shows signed colored amounts on each row only when there are several items', () => {
    const amounts = collect(buildSavedFlex([FOOD, SALARY]).contents.body).filter((node) => /^[+-]\d/.test(node.text));

    expect(amounts.map((node) => node.text)).toEqual(['-60', '+25,000']);
    expect(amounts.map((node) => node.color)).toEqual([COLORS.expense, COLORS.income]);
    expect(texts(buildSavedFlex([FOOD]).contents.body)).not.toContain('-60');
  });

  it('puts a soft cancel button in the footer and relabels it by item count', () => {
    const one = buildSavedFlex([FOOD], { buttons: UNDO });
    const many = buildSavedFlex([FOOD, SALARY], { buttons: UNDO });

    expect(footerActions(one)).toEqual([{ ...UNDO[0].action, label: 'ลบรายการนี้' }]);
    expect(footerActions(many)[0].label).toBe('ลบทั้งหมด');
    expect(footerActions(many)[0].data).toBe('action=undo&event=ev1');
    expect(one.contents.footer.contents[0].backgroundColor).toBe(COLORS.brandSoft);
  });

  it('omits the footer when no buttons are given', () => {
    expect(buildSavedFlex([FOOD]).contents.footer).toBeUndefined();
  });

  it('draws a gauge per budget alert after a separator', () => {
    const alerts = [
      { level: 'warn', month: '2026-09', category: 'อาหาร', spent: 135, budget: 150 },
      { level: 'over', month: '2026-09', category: 'เดินทาง', spent: 1200, budget: 1000 },
    ];
    const flex = buildSavedFlex([FOOD], { alerts });
    const body = flex.contents.body.contents;

    expect(body.some((node) => node.type === 'separator')).toBe(true);
    expect(texts(flex.contents.body)).toEqual(expect.arrayContaining([
      'งบอาหาร · ใกล้เต็มงบ',
      '90% · เหลือ 15',
      'ใช้ไป 135 จาก 150 บาท (เดือน 09/2026)',
      'งบเดินทาง · เกินงบ',
      '120% · เกิน 200',
    ]));
    expect(flex.altText).toContain('ใกล้เต็มงบ อาหาร เดือน 09/2026: ใช้ไป 135 จาก 150 บาท (90%)');
  });

  it('colors the warn gauge orange and the over gauge red', () => {
    const fills = (level) => {
      const flex = buildSavedFlex([FOOD], { alerts: [{ level, month: '2026-09', category: 'อาหาร', spent: 140, budget: 150 }] });
      return JSON.stringify(flex.contents.body);
    };

    expect(fills('warn')).toContain(COLORS.warnBar);
    expect(fills('over')).toContain(COLORS.expense);
    expect(fills('over')).not.toContain(COLORS.warnBar);
  });

  it('shows the budget check and wallet notices in notice strips', () => {
    const flex = buildSavedFlex([FOOD], { budgetCheckFailed: true, walletReadFailed: true });
    const strips = flex.contents.body.contents.filter((node) => node.backgroundColor === COLORS.noticeBg);

    expect(strips).toHaveLength(2);
    expect(texts(flex.contents.body)).toEqual(expect.arrayContaining([
      'เฮียเช็กงบไม่สำเร็จ ดูสถานะงบได้ในหน้าเว็บ',
      'เฮียอ่านกระเป๋าไม่ได้ รายการนี้อยู่ในเงินสด แก้ได้ในเว็บ',
    ]));
    expect(flex.altText.endsWith('\n\nเฮียอ่านกระเป๋าไม่ได้ รายการนี้อยู่ในเงินสด แก้ได้ในเว็บ')).toBe(true);
  });

  it('keeps altText within the LINE limit even for a long receipt', () => {
    const items = Array.from({ length: 20 }, (_, index) => ({ ...FOOD, note: `รายการสินค้าชื่อยาวมากลำดับที่ ${index}` }));
    const flex = buildSavedFlex(items);

    expect(flex.altText.length).toBeLessThanOrEqual(ALT_TEXT_MAX);
    expect(rowsOf(flex)).toHaveLength(20);
  });
});

describe('buildSavedFlex edit links', () => {
  it('makes each row open its link and adds the hint when there are several items', () => {
    const flex = buildSavedFlex([FOOD, SALARY], { editUrls: ['https://liff.line.me/l?tx=a', 'https://liff.line.me/l?tx=b'] });

    expect(rowsOf(flex).map((row) => row.action)).toEqual([
      { type: 'uri', label: 'แก้ไข', uri: 'https://liff.line.me/l?tx=a' },
      { type: 'uri', label: 'แก้ไข', uri: 'https://liff.line.me/l?tx=b' },
    ]);
    expect(texts(flex.contents.body)).toContain('แตะรายการเพื่อแก้ไขในเว็บ');
  });

  it('shows an edit label on a single linked row instead of the hint', () => {
    const flex = buildSavedFlex([FOOD], { editUrls: ['https://liff.line.me/l?tx=a'] });
    const editLabel = collect(rowsOf(flex)[0]).find((node) => node.text === 'แก้ไข');

    expect(editLabel.color).toBe(COLORS.brand);
    expect(texts(flex.contents.body)).not.toContain('แตะรายการเพื่อแก้ไขในเว็บ');
  });

  it('adds no action, label or hint without links', () => {
    const flex = buildSavedFlex([FOOD]);

    expect(rowsOf(flex)[0].action).toBeUndefined();
    expect(texts(flex.contents.body)).not.toContain('แก้ไข');
  });

  it('ignores links that do not match the items one to one', () => {
    const flex = buildSavedFlex([FOOD, SALARY], { editUrls: ['https://liff.line.me/l?tx=a'] });

    expect(rowsOf(flex).every((row) => row.action === undefined)).toBe(true);
    expect(texts(flex.contents.body)).not.toContain('แตะรายการเพื่อแก้ไขในเว็บ');
  });
});

describe('buildSlipConfirmFlex', () => {
  const MILK = { type: 'expense', category: 'อาหาร', amount: 120, date: '2026-09-28', note: 'นม' };
  const TOOTHPASTE = { type: 'expense', category: 'สุขภาพ', amount: 59, date: '2026-09-28', note: 'ยาสีฟัน' };
  const SAVE = { type: 'action', action: { type: 'postback', label: 'บันทึก', data: 'action=slip_save&slip=s1', displayText: 'บันทึก' } };
  const CANCEL = { type: 'action', action: { type: 'postback', label: 'ยกเลิก', data: 'action=slip_cancel&slip=s1', displayText: 'ยกเลิก' } };

  it('keeps the plain confirm text as altText', () => {
    expect(buildSlipConfirmFlex([MILK], { dateAssumed: true }).altText).toBe(formatSlipConfirmReply([MILK], { dateAssumed: true }));
  });

  it('says it is not saved yet in the header with the total', () => {
    expect(texts(buildSlipConfirmFlex([MILK]).contents.header)).toEqual(['เฮียอ่านสลิปได้ · ยังไม่บันทึก', '-120 บาท']);
    expect(texts(buildSlipConfirmFlex([MILK, TOOTHPASTE]).contents.header)).toEqual(['เฮียอ่านสลิปได้ 2 รายการ · ยังไม่บันทึก', '-179 บาท']);
  });

  it('puts cancel on the left and the yellow save on the right', () => {
    const flex = buildSlipConfirmFlex([MILK], { buttons: [SAVE, CANCEL] });

    expect(footerActions(flex)).toEqual([CANCEL.action, SAVE.action]);
    expect(flex.contents.footer.contents.map((node) => node.backgroundColor)).toEqual([COLORS.secondary, COLORS.cta]);
  });

  it('relabels save for several items but keeps its postback', () => {
    const [, save] = footerActions(buildSlipConfirmFlex([MILK, TOOTHPASTE], { buttons: [SAVE, CANCEL] }));

    expect(save).toEqual({ ...SAVE.action, label: 'บันทึกทั้งหมด' });
  });

  it('ends with the time limit hint and shows the assumed date notice', () => {
    const flex = buildSlipConfirmFlex([MILK], { dateAssumed: true });
    const found = texts(flex.contents.body);

    expect(found[found.length - 1]).toBe('กดบันทึกภายใน 10 นาที');
    expect(found).toContain('อ่านวันที่ไม่ได้ จึงใช้วันนี้');
    expect(texts(buildSlipConfirmFlex([MILK]).contents.body)).not.toContain('อ่านวันที่ไม่ได้ จึงใช้วันนี้');
  });

  it('gives the rows no link action (array index must not leak in as a uri)', () => {
    const items = [MILK, TOOTHPASTE, { ...MILK, note: 'ขนม' }, { ...MILK, note: 'น้ำ' }];

    expect(rowsOf(buildSlipConfirmFlex(items)).map((row) => row.action)).toEqual([undefined, undefined, undefined, undefined]);
  });

  it('keeps altText within the LINE limit for a long receipt', () => {
    const items = Array.from({ length: 20 }, (_, index) => ({ ...MILK, note: `สินค้าชื่อยาวมากลำดับที่ ${index}` }));

    expect(buildSlipConfirmFlex(items).altText.length).toBeLessThanOrEqual(ALT_TEXT_MAX);
  });
});

describe('cards in English', () => {
  const UNDO_EN = [{ type: 'action', action: { type: 'postback', label: 'Delete', data: 'action=undo&event=ev1', displayText: 'Delete' } }];
  const ALERTS = [
    { level: 'warn', month: '2026-09', category: 'อาหาร', spent: 135, budget: 150 },
    { level: 'over', month: '2026-09', category: 'เดินทาง', spent: 1200, budget: 1000 },
  ];
  const actionLabels = (flex) => JSON.stringify(flex).match(/"label":"[^"]*"/g) ?? [];

  it('writes the saved card in English with default names translated', () => {
    const flex = buildSavedFlex([{ ...FOOD, wallet: 'เงินสด' }], { buttons: UNDO_EN, lang: 'en' });

    expect(texts(flex.contents.header)).toEqual(['Saved it', '-฿60']);
    expect(texts(flex.contents.body)).toEqual(['กินข้าว', 'Food · 29/09 · Cash']);
    expect(footerActions(flex)).toEqual([{ ...UNDO_EN[0].action, label: 'Delete this' }]);
    expect(flex.altText).toBe('Saved it\n- Expense | Food | ฿60 | 29/09 | กินข้าว');
  });

  it('writes several saved items, edit links and the delete all button in English', () => {
    const flex = buildSavedFlex([FOOD, SALARY], {
      buttons: UNDO_EN,
      editUrls: ['https://liff.line.me/l?tx=a', 'https://liff.line.me/l?tx=b'],
      lang: 'en',
    });

    expect(texts(flex.contents.header)).toEqual(['Saved 2 entries', '+฿24,940']);
    expect(texts(flex.contents.body)).toEqual(['กินข้าว', 'Food · 29/09', '-60', 'Salary', '01/09', '+25,000', 'Tap an entry to edit it on the web']);
    expect(rowsOf(flex)[0].action.label).toBe('Edit');
    expect(footerActions(flex)[0].label).toBe('Delete all');
  });

  it('shows an English edit label on a single linked row', () => {
    const flex = buildSavedFlex([FOOD], { editUrls: ['https://liff.line.me/l?tx=a'], lang: 'en' });

    expect(texts(rowsOf(flex)[0])).toContain('Edit');
  });

  it('writes the budget gauges and notices in English', () => {
    const flex = buildSavedFlex([FOOD], { alerts: ALERTS, budgetCheckFailed: true, walletReadFailed: true, lang: 'en' });

    expect(texts(flex.contents.body).slice(2)).toEqual([
      'Food budget · Almost at budget',
      '90% · ฿15 left',
      'Spent ฿135 of ฿150 (09/2026)',
      'Travel budget · Over budget',
      '120% · ฿200 over',
      'Spent ฿1,200 of ฿1,000 (09/2026)',
      "I couldn't check your budget. See your budget status on the web.",
      "I couldn't read your wallets, so this entry went into Cash. You can change it on the web.",
    ]);
    expect(flex.altText).toBe(
      [
        'Saved it\n- Expense | Food | ฿60 | 29/09 | กินข้าว',
        'Almost at budget: Food for 09/2026, spent ฿135 of ฿150 (90%)\nOver budget: Travel for 09/2026, spent ฿1,200 of ฿1,000 (120%)',
        "I couldn't check your budget. See your budget status on the web.",
        "I couldn't read your wallets, so this entry went into Cash. You can change it on the web.",
      ].join('\n\n')
    );
  });

  it('writes the slip card in English', () => {
    const MILK = { type: 'expense', category: 'อาหาร', amount: 120, date: '2026-09-28', note: 'milk' };
    const SAVE = { type: 'action', action: { type: 'postback', label: 'Save', data: 'action=slip_save&slip=s1', displayText: 'Save' } };
    const CANCEL = { type: 'action', action: { type: 'postback', label: 'Cancel', data: 'action=slip_cancel&slip=s1', displayText: 'Cancel' } };
    const one = buildSlipConfirmFlex([MILK], { dateAssumed: true, buttons: [SAVE, CANCEL], lang: 'en' });
    const many = buildSlipConfirmFlex([MILK, { ...MILK, note: 'bread', amount: 59 }], { buttons: [SAVE, CANCEL], lang: 'en' });

    expect(texts(one.contents.header)).toEqual(['I read the slip · not saved yet', '-฿120']);
    expect(texts(one.contents.body)).toEqual(['milk', 'Food · 28/09', "Couldn't read the date, so I used today", 'Tap save within 10 minutes']);
    expect(one.altText).toBe(
      "Here is what I read from the slip\n- Expense | Food | ฿120 | 28/09 | milk\nCouldn't read the date, so I used today\nTap save to confirm (expires in 10 minutes)"
    );
    expect(one.altText).toBe(formatSlipConfirmReply([MILK], { dateAssumed: true, lang: 'en' }));
    expect(texts(many.contents.header)).toEqual(['I read 2 entries from the slip · not saved yet', '-฿179']);
    expect(footerActions(many)).toEqual([CANCEL.action, { ...SAVE.action, label: 'Save all' }]);
  });

  // LINE ตัดป้ายปุ่มที่ยาวเกิน 20 ตัวอักษร
  it('keeps English button labels within 20 characters', () => {
    const saved = buildSavedFlex([FOOD, SALARY], { buttons: UNDO_EN, editUrls: ['a', 'b'], lang: 'en' });
    const labels = [...actionLabels(saved), ...actionLabels(buildSavedFlex([FOOD], { buttons: UNDO_EN, lang: 'en' }))];

    expect(labels.length).toBeGreaterThan(0);
    for (const label of labels) expect(label.length - '"label":""'.length).toBeLessThanOrEqual(20);
  });

  it.each(['th', 'en'])('keeps the longest saved and slip altText within the LINE limit in %s', (lang) => {
    const items = Array.from({ length: 20 }, (_, index) => ({ ...FOOD, wallet: 'เงินสด', note: `long product name number ${index} ยาวมาก` }));
    const saved = buildSavedFlex(items, { alerts: ALERTS, budgetCheckFailed: true, walletReadFailed: true, lang });
    const slip = buildSlipConfirmFlex(items, { dateAssumed: true, lang });

    expect(saved.altText.length).toBeLessThanOrEqual(ALT_TEXT_MAX);
    expect(slip.altText.length).toBeLessThanOrEqual(ALT_TEXT_MAX);
  });
});

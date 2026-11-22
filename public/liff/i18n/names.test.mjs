import { describe, it, expect } from 'vitest';
import {
  DEFAULT_CATEGORY_IDS,
  DEFAULT_WALLET_IDS,
  displayCategoryName,
  displayWalletName,
  categoryNameFromDisplay,
  isDefaultDisplayName,
} from './names.mjs';

const EN_EXPENSE = {
  อาหาร: 'Food',
  เดินทาง: 'Travel',
  ช้อปปิ้ง: 'Shopping',
  'บิล/ค่าบริการ': 'Bills & services',
  สุขภาพ: 'Health',
  บันเทิง: 'Entertainment',
  'ใบเสร็จ/สลิปโอนเงิน': 'Receipts & transfer slips',
  อื่นๆ: 'Other',
};
const EN_INCOME = { เงินเดือน: 'Salary', รายได้เสริม: 'Side income', อื่นๆ: 'Other' };

describe('displayCategoryName', () => {
  it('translates every default name to English and keeps Thai for th', () => {
    for (const [type, map] of [['expense', EN_EXPENSE], ['income', EN_INCOME]]) {
      for (const [thai, english] of Object.entries(map)) {
        expect(displayCategoryName('en', type, thai)).toBe(english);
        expect(displayCategoryName('th', type, thai)).toBe(thai);
      }
    }
  });

  it('leaves renamed or custom categories untouched', () => {
    expect(displayCategoryName('en', 'expense', 'กาแฟ')).toBe('กาแฟ');
    expect(displayCategoryName('en', 'income', 'อาหาร')).toBe('อาหาร');
    expect(displayCategoryName('en', 'expense', 'constructor')).toBe('constructor');
  });
});

describe('displayWalletName', () => {
  it('translates only the default wallet', () => {
    expect(displayWalletName('en', 'เงินสด')).toBe('Cash');
    expect(displayWalletName('th', 'เงินสด')).toBe('เงินสด');
    expect(displayWalletName('en', 'ธนาคาร')).toBe('ธนาคาร');
  });
});

describe('categoryNameFromDisplay', () => {
  const categories = [
    { type: 'expense', name: 'อาหาร' },
    { type: 'expense', name: 'อื่นๆ' },
    { type: 'income', name: 'อื่นๆ' },
  ];

  it('round-trips every default name', () => {
    for (const [type, map] of [['expense', EN_EXPENSE], ['income', EN_INCOME]]) {
      for (const thai of Object.keys(map)) {
        for (const lang of ['th', 'en']) {
          expect(categoryNameFromDisplay(lang, type, displayCategoryName(lang, type, thai))).toBe(thai);
        }
      }
    }
  });

  it('matches case-insensitively and ignores surrounding spaces', () => {
    expect(categoryNameFromDisplay('en', 'expense', ' food ', categories)).toBe('อาหาร');
  });

  it('does not translate a renamed default category', () => {
    const renamed = [{ type: 'expense', name: 'Lunch' }];
    expect(categoryNameFromDisplay('en', 'expense', 'Food', renamed)).toBe('Food');
    expect(categoryNameFromDisplay('en', 'expense', 'Lunch', renamed)).toBe('Lunch');
  });

  it('does not translate Other for a type that has no อื่นๆ', () => {
    const expenseOnly = [{ type: 'expense', name: 'อื่นๆ' }];
    expect(categoryNameFromDisplay('en', 'income', 'Other', expenseOnly)).toBe('Other');
    expect(categoryNameFromDisplay('en', 'expense', 'Other', expenseOnly)).toBe('อื่นๆ');
  });

  it('maps อื่นๆ in both types when categories are passed', () => {
    const both = [{ type: 'expense', name: 'อื่นๆ' }, { type: 'income', name: 'อื่นๆ' }];
    expect(categoryNameFromDisplay('en', 'expense', 'Other', both)).toBe('อื่นๆ');
    expect(categoryNameFromDisplay('en', 'income', 'Other', both)).toBe('อื่นๆ');
  });

  it('never rewrites a user-made exact name, and maps case variants to the default', () => {
    const withUser = [{ type: 'expense', name: 'อาหาร' }, { type: 'expense', name: 'food' }];
    expect(categoryNameFromDisplay('en', 'expense', 'food', withUser)).toBe('food');
    // ไม่มีชื่อ food ตรงตัวเลยตีความเป็นชื่อแสดงของ อาหาร
    expect(categoryNameFromDisplay('en', 'expense', 'Food', withUser)).toBe('อาหาร');
  });

  it('returns unknown names as given', () => {
    expect(categoryNameFromDisplay('en', 'expense', 'Coffee', categories)).toBe('Coffee');
  });
});

describe('isDefaultDisplayName', () => {
  it('detects default display names in any language, case-insensitively', () => {
    for (const name of ['Other', 'other', ' CASH ', 'Food', 'อาหาร', 'Side income', 'เงินสด']) {
      expect(isDefaultDisplayName(name), name).toBe(true);
    }
    expect(isDefaultDisplayName('Coffee')).toBe(false);
  });

  it('can be limited to some languages', () => {
    expect(isDefaultDisplayName('อาหาร', ['en'])).toBe(false);
    expect(isDefaultDisplayName('food', ['en'])).toBe(true);
  });
});

describe('id tables', () => {
  it('cover the expected default names', () => {
    expect(Object.keys(DEFAULT_CATEGORY_IDS.expense)).toEqual(Object.keys(EN_EXPENSE));
    expect(Object.keys(DEFAULT_CATEGORY_IDS.income)).toEqual(Object.keys(EN_INCOME));
    expect(Object.keys(DEFAULT_WALLET_IDS)).toEqual(['เงินสด']);
  });
});

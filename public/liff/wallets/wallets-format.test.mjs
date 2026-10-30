import { describe, it, expect } from 'vitest';
import { describeWalletError, walletRowView, sortWallets, walletOptions, hasSeveralWallets } from './wallets-format.mjs';
import { LOGIN_REQUIRED_MESSAGE } from '../format.mjs';

const CASH = { id: 'w-cash', name: 'เงินสด', hidden: false, isDefault: true, income: 25000, expense: 400, balance: 24600, entryCount: 2 };
const CARD = { id: 'w-card', name: 'บัตรเครดิต', hidden: false, isDefault: false, income: 0, expense: 300, balance: -300, entryCount: 1 };
const OLD = { id: 'w-old', name: 'บัญชีเก่า', hidden: true, isDefault: false, income: 0, expense: 0, balance: 0, entryCount: 0 };

describe('describeWalletError', () => {
  it.each([
    [409, 'Duplicate name', 'มีกระเป๋าชื่อนี้อยู่แล้ว'],
    [409, 'Too many wallets', 'มีกระเป๋าที่ใช้อยู่ได้ไม่เกิน 10 ใบ และรวมที่ซ่อนไม่เกิน 20 ใบ ซ่อนกระเป๋าที่ไม่ใช้ก่อน'],
    [400, 'Invalid name', 'ชื่อกระเป๋าต้องยาว 1-30 ตัวอักษร และห้ามมีเครื่องหมายจุลภาค (,)'],
    [400, 'Reserved name', 'ชื่อนี้ใช้กับกระเป๋าตั้งต้นแล้ว ลองชื่ออื่น'],
    [400, 'Default wallet', 'กระเป๋าตั้งต้นแก้ไม่ได้'],
    [404, undefined, 'ไม่พบกระเป๋านี้แล้ว ลองเปิดหน้าใหม่'],
    [401, undefined, LOGIN_REQUIRED_MESSAGE],
    [500, 'Internal error', 'บันทึกกระเป๋าไม่สำเร็จ ลองใหม่อีกครั้ง'],
  ])('describes %s %s', (status, error, expected) => {
    expect(describeWalletError(status, error)).toBe(expected);
  });
});

describe('walletRowView', () => {
  it('labels the default wallet and does not let it be edited', () => {
    expect(walletRowView(CASH)).toEqual({
      name: 'เงินสด',
      label: 'ตั้งต้น',
      balanceText: '24,600 บาท',
      negative: false,
      detailText: 'รายรับ 25,000 บาท · รายจ่าย 400 บาท · 2 รายการ',
      canEdit: false,
      hideLabel: 'ซ่อน',
    });
  });

  it('marks a negative balance and offers unhide for a hidden wallet', () => {
    expect(walletRowView(CARD)).toMatchObject({ label: '', balanceText: '-300 บาท', negative: true, canEdit: true, hideLabel: 'ซ่อน' });
    expect(walletRowView(OLD)).toMatchObject({ label: 'ซ่อนอยู่', hideLabel: 'เลิกซ่อน' });
  });
});

describe('wallet options', () => {
  it('puts the default wallet first', () => {
    expect(sortWallets([CARD, OLD, CASH]).map((wallet) => wallet.id)).toEqual(['w-cash', 'w-card', 'w-old']);
  });

  it('drops hidden wallets except the one an entry already uses', () => {
    expect(walletOptions([CARD, OLD, CASH]).map((wallet) => wallet.id)).toEqual(['w-cash', 'w-card']);
    expect(walletOptions([CARD, OLD, CASH], 'w-old').map((wallet) => wallet.id)).toEqual(['w-cash', 'w-card', 'w-old']);
  });

  it('knows whether the user has more than one wallet', () => {
    expect(hasSeveralWallets([CASH])).toBe(false);
    expect(hasSeveralWallets([CASH, OLD])).toBe(true);
  });
});

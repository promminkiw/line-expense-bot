import { LOGIN_REQUIRED_MESSAGE, formatBaht } from './format.mjs';

const MESSAGES = new Map([
  ['409:Duplicate name', 'มีกระเป๋าชื่อนี้อยู่แล้ว'],
  ['409:Too many wallets', 'มีกระเป๋าที่ใช้อยู่ได้ไม่เกิน 10 ใบ และรวมที่ซ่อนไม่เกิน 20 ใบ ซ่อนกระเป๋าที่ไม่ใช้ก่อน'],
  ['400:Invalid name', 'ชื่อกระเป๋าต้องยาว 1-30 ตัวอักษร และห้ามมีเครื่องหมายจุลภาค (,)'],
  ['400:Reserved name', 'ชื่อนี้ใช้กับกระเป๋าตั้งต้นแล้ว ลองชื่ออื่น'],
  ['400:Default wallet', 'กระเป๋าตั้งต้นแก้ไม่ได้'],
]);

export function describeWalletError(status, error) {
  if (status === 401) return LOGIN_REQUIRED_MESSAGE;
  if (status === 404) return 'ไม่พบกระเป๋านี้แล้ว ลองเปิดหน้าใหม่';
  return MESSAGES.get(`${status}:${error}`) ?? 'บันทึกกระเป๋าไม่สำเร็จ ลองใหม่อีกครั้ง';
}

export function walletRowView(wallet) {
  return {
    name: wallet.name,
    label: wallet.isDefault ? 'ตั้งต้น' : wallet.hidden ? 'ซ่อนอยู่' : '',
    balanceText: formatBaht(wallet.balance),
    negative: wallet.balance < 0,
    detailText: `รายรับ ${formatBaht(wallet.income)} · รายจ่าย ${formatBaht(wallet.expense)} · ${wallet.entryCount.toLocaleString('en-US')} รายการ`,
    canEdit: !wallet.isDefault,
    hideLabel: wallet.hidden ? 'เลิกซ่อน' : 'ซ่อน',
  };
}

export function sortWallets(wallets) {
  return [...wallets.filter((wallet) => wallet.isDefault), ...wallets.filter((wallet) => !wallet.isDefault)];
}

// รายการเก่าอาจอยู่ในกระเป๋าที่ซ่อนแล้ว ต้องใส่กลับเข้าตัวเลือก ไม่งั้นบันทึกแล้วย้ายกระเป๋าโดยไม่ตั้งใจ
export function walletOptions(wallets, keepId = null) {
  return sortWallets(wallets).filter((wallet) => !wallet.hidden || wallet.id === keepId);
}

// ผู้ใช้กระเป๋าเดียวไม่ต้องเลือกหรือกรอง หน้าจอจึงเหมือนก่อนมีกระเป๋า
export function hasSeveralWallets(wallets) {
  return wallets.length > 1;
}

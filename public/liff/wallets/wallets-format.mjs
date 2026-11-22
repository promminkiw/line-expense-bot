import { displayWalletName } from '../i18n/names.mjs';
import { loginRequiredMessage, formatBaht } from '../format.mjs';
import { t } from '../i18n/translate.mjs';
import { getLang } from '../i18n/current.mjs';

// Reserved name ยิงทั้งชื่อ เงินสด และชื่อแสดงภาษาอื่น เช่น Cash ข้อความอังกฤษจึงบอกว่าห้ามทั้งสองภาษา
const MESSAGE_KEYS = new Map([
  ['409:Duplicate name', 'web.wallets.error.duplicate'],
  ['409:Too many wallets', 'web.wallets.error.tooMany'],
  ['400:Invalid name', 'web.wallets.error.invalidName'],
  ['400:Reserved name', 'web.wallets.error.reserved'],
  ['400:Default wallet', 'web.wallets.error.defaultWallet'],
]);

export function describeWalletError(status, error, lang = getLang()) {
  if (status === 401) return loginRequiredMessage(lang);
  if (status === 404) return t(lang, 'web.wallets.error.notFound');
  return t(lang, MESSAGE_KEYS.get(`${status}:${error}`) ?? 'web.wallets.error.saveFailed');
}

export function walletRowView(wallet, lang = getLang()) {
  const count = wallet.entryCount;
  return {
    name: walletDisplayName(lang, wallet),
    label: wallet.isDefault ? t(lang, 'web.wallets.label.default') : wallet.hidden ? t(lang, 'web.wallets.label.hidden') : '',
    balanceText: formatBaht(wallet.balance, lang),
    negative: wallet.balance < 0,
    detailText: t(lang, `web.wallets.detail.${count === 1 ? 'one' : 'other'}`, {
      income: formatBaht(wallet.income, lang),
      expense: formatBaht(wallet.expense, lang),
      count: count.toLocaleString('en-US'),
    }),
    canEdit: !wallet.isDefault,
    hideLabel: t(lang, wallet.hidden ? 'web.wallets.unhide' : 'web.wallets.hide'),
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

// แปลเฉพาะกระเป๋าตั้งต้น ชื่อที่ผู้ใช้ตั้งเองแสดงตามเดิม
export function walletDisplayName(lang, wallet) {
  return displayWalletName(lang, wallet.name);
}

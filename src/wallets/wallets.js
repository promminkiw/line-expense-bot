// รายการที่ wallet_id เป็น null อยู่ในกระเป๋านี้ ต้องตรงกับชื่อใน supabase/024_wallets.sql
const DEFAULT_WALLET_NAME = 'เงินสด';
const MAX_WALLET_NAME_LENGTH = 30;
// กระเป๋าที่ไม่ซ่อนถูกส่งให้ Claude ทุกข้อความ จึงจำกัดจำนวนเพื่อคุมความยาว prompt
const MAX_VISIBLE_WALLETS = 10;
// กระเป๋าที่ซ่อนก็ยังถูกอ่านทุกครั้งที่ถามยอด
const MAX_TOTAL_WALLETS = 20;

// ขึ้นบนการ์ดบันทึกเมื่ออ่านกระเป๋าไม่ได้และรายการไปอยู่ในกระเป๋าตั้งต้น
const WALLETS_UNREADABLE_NOTICE = 'เฮียอ่านกระเป๋าไม่ได้ รายการนี้อยู่ในเงินสด แก้ได้ในเว็บ';

function isDefaultWallet(name) {
  return name === DEFAULT_WALLET_NAME;
}

// ผู้ใช้กระเป๋าเดียวไม่ต้องเลือก จึงไม่ส่งรายชื่อให้ Claude เพื่อประหยัด token
function walletChoices(wallets) {
  const names = wallets.filter((wallet) => !wallet.hidden).map((wallet) => wallet.name);
  if (names.length < 2) return [];
  return [DEFAULT_WALLET_NAME, ...names.filter((name) => !isDefaultWallet(name))];
}

// ถามถึงรายการเก่าได้ จึงรวมกระเป๋าที่ซ่อนด้วย
function walletQuestionNames(wallets) {
  const names = [...new Set(wallets.map((wallet) => wallet.name))];
  return names.length < 2 ? [] : names;
}

// กระเป๋าตั้งต้นเก็บเป็น null จึงไม่อยู่ใน map และกระเป๋าที่ซ่อนไม่ถูกใช้ตอนบันทึก
function walletIdsByName(wallets) {
  return new Map(
    wallets.filter((wallet) => !wallet.hidden && !isDefaultWallet(wallet.name)).map((wallet) => [wallet.name, wallet.id])
  );
}

module.exports = {
  DEFAULT_WALLET_NAME,
  MAX_WALLET_NAME_LENGTH,
  MAX_VISIBLE_WALLETS,
  MAX_TOTAL_WALLETS,
  WALLETS_UNREADABLE_NOTICE,
  isDefaultWallet,
  walletChoices,
  walletQuestionNames,
  walletIdsByName,
};

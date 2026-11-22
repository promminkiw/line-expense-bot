import { displayCategoryName } from '../i18n/names.mjs';
import { loginRequiredMessage } from '../format.mjs';
import { t } from '../i18n/translate.mjs';
import { getLang } from '../i18n/current.mjs';

// Reserved name ยิงทั้งชื่อไทยใน DB และชื่อแสดงภาษาอื่น เช่น Food หรือ Other ข้อความอังกฤษจึงบอกว่าห้ามทั้งสองภาษา
const MESSAGE_KEYS = new Map([
  ['409:Duplicate name', 'web.categories.error.duplicate'],
  ['409:Too many categories', 'web.categories.error.tooMany'],
  ['400:Invalid name', 'web.categories.error.invalidName'],
  ['400:Reserved name', 'web.categories.error.reserved'],
  ['400:System category', 'web.categories.error.system'],
  ['400:Invalid icon', 'web.categories.error.invalidIcon'],
]);

export function describeCategoryError(status, error, lang = getLang()) {
  if (status === 401) return loginRequiredMessage(lang);
  if (status === 404) return t(lang, 'web.categories.error.notFound');
  return t(lang, MESSAGE_KEYS.get(`${status}:${error}`) ?? 'web.categories.error.saveFailed');
}

const plural = (count) => (count === 1 ? 'one' : 'other');

// บอกก่อนยืนยันว่าอะไรจะย้ายไป อื่นๆ ผู้ใช้จะได้ไม่ตกใจว่ารายการหาย
export function describeCategoryUsage(category, usage, lang = getLang()) {
  const parts = ['transactions', 'recurring', 'bills']
    .filter((kind) => usage[kind] > 0)
    .map((kind) => t(lang, `web.categories.usage.${kind}.${plural(usage[kind])}`, { count: usage[kind] }));
  let moved = t(lang, 'web.categories.usage.empty');
  if (parts.length > 0) {
    const items = parts.length === 1
      ? parts[0]
      : t(lang, 'web.categories.usage.join', { items: parts.slice(0, -1).join(', '), last: parts[parts.length - 1] });
    // หมวดปลายทางคือ อื่นๆ ของประเภทเดียวกัน แสดงด้วยชื่อตามภาษาของหน้า
    moved = t(lang, 'web.categories.usage.moved', { items, other: displayCategoryName(lang, category.type, 'อื่นๆ') });
  }
  const key = category.type === 'expense' ? 'web.categories.usage.confirmBudget' : 'web.categories.usage.confirm';
  return t(lang, key, { name: categoryDisplayName(lang, category), moved });
}

// แปลเฉพาะชื่อตั้งต้น ชื่อที่ผู้ใช้ตั้งเองแสดงตามเดิม
export function categoryDisplayName(lang, category) {
  return displayCategoryName(lang, category.type, category.name);
}

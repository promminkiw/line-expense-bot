import { t, normalizeLanguage } from './translate.mjs';

// รูปแบบ "aria-label:key;placeholder:key" ให้ element เดียวแปลได้หลาย attribute
function parseAttrSpec(spec) {
  return spec
    .split(';')
    .map((pair) => pair.split(':').map((part) => part.trim()))
    .filter(([attr, key]) => attr && key);
}

function withRoot(root, selector) {
  const found = [...root.querySelectorAll(selector)];
  return root.matches?.(selector) ? [root, ...found] : found;
}

// data-i18n แทน textContent ทั้งก้อน จึงใช้กับ element ที่มีแต่ข้อความเท่านั้น
export function applyTranslations(root, lang) {
  const language = normalizeLanguage(lang);
  const doc = root.ownerDocument ?? root;
  doc.documentElement.lang = language;
  for (const el of withRoot(root, '[data-i18n]')) {
    el.textContent = t(language, el.dataset.i18n);
  }
  for (const el of withRoot(root, '[data-i18n-attr]')) {
    for (const [attr, key] of parseAttrSpec(el.dataset.i18nAttr)) {
      el.setAttribute(attr, t(language, key));
    }
  }
  return language;
}

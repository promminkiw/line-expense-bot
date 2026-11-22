import { DEFAULT_LANGUAGE, normalizeLanguage } from './translate.mjs';

// ภาษาของหน้าที่เปิดอยู่ เก็บไว้ที่เดียวให้ทุก module อ่านตอน render แทนการส่ง lang ต่อกันหลายชั้น
let lang = DEFAULT_LANGUAGE;

export function getLang() {
  return lang;
}

export function setLang(next) {
  lang = normalizeLanguage(next);
  return lang;
}

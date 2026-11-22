import { createSvgIcon } from './icons.mjs';
import { t } from '../i18n/translate.mjs';
import { getLang } from '../i18n/current.mjs';

// ข้อความอยู่ใน catalog ที่ web.empty.<kind>.title / .hint
const EMPTY_SYMBOLS = {
  list: 'empty-list',
  search: 'empty-search',
  summary: 'empty-chart',
  recurring: 'empty-recurring',
};

export function createEmptyState(doc, kind, tag = 'div') {
  const symbol = Object.hasOwn(EMPTY_SYMBOLS, kind) ? EMPTY_SYMBOLS[kind] : null;
  if (!symbol) throw new Error(`Unknown empty state: ${kind}`);
  const lang = getLang();
  const state = { symbol, title: t(lang, `web.empty.${kind}.title`), hint: t(lang, `web.empty.${kind}.hint`) };
  const el = doc.createElement(tag);
  el.className = 'empty-state';
  const title = doc.createElement('p');
  title.className = 'empty-title';
  title.textContent = state.title;
  const hint = doc.createElement('p');
  hint.className = 'empty-hint';
  hint.textContent = state.hint;
  el.append(createSvgIcon(doc, state.symbol, 'icon empty-art'), title, hint);
  return el;
}

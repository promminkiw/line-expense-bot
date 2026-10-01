import { createSvgIcon } from './icons.mjs';

const EMPTY_STATES = {
  list: {
    symbol: 'empty-list',
    title: 'ยังไม่มีรายการในเดือนนี้',
    hint: 'พิมพ์ในแชตได้เลย เช่น "กินข้าว 60" บอทจะบันทึกให้',
  },
  search: {
    symbol: 'empty-search',
    title: 'ไม่พบรายการที่ค้นหา',
    hint: 'ลองเปลี่ยนคำค้นหรือล้างตัวกรอง',
  },
  summary: {
    symbol: 'empty-chart',
    title: 'ยังไม่มีข้อมูลสรุปในเดือนนี้',
    hint: 'เมื่อมีรายการแล้ว กราฟตามหมวดจะแสดงที่นี่',
  },
  recurring: {
    symbol: 'empty-recurring',
    title: 'ยังไม่มีรายการประจำ',
    hint: 'เพิ่มค่าใช้จ่ายที่เกิดทุกเดือน เช่น ค่าเน็ต แล้วบอทจะบันทึกให้เอง',
  },
};

export function createEmptyState(doc, kind, tag = 'div') {
  const state = EMPTY_STATES[kind];
  if (!state) throw new Error(`Unknown empty state: ${kind}`);
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

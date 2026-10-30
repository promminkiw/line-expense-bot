const SVG_NS = 'http://www.w3.org/2000/svg';

// ไอคอนทั้งหมดอยู่ใน sprite ใน index.html อ้างด้วย <use> จึงไม่ต้องโหลดไฟล์เพิ่ม
export function createSvgIcon(doc, symbolId, className = 'icon') {
  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', className);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const use = doc.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', `#${symbolId}`);
  svg.append(use);
  return svg;
}

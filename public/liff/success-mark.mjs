const SVG_NS = 'http://www.w3.org/2000/svg';

// svg ไม่มีข้อความ el.textContent จึงยังเท่ากับ text ตามเดิม
export function setSuccessStatus(el, text) {
  el.replaceChildren();
  if (!text) return;
  const doc = el.ownerDocument;
  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'success-mark');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const circle = doc.createElementNS(SVG_NS, 'circle');
  circle.setAttribute('cx', '12');
  circle.setAttribute('cy', '12');
  circle.setAttribute('r', '11');
  const check = doc.createElementNS(SVG_NS, 'path');
  check.setAttribute('d', 'M6.5 12.5l3.6 3.6 7.4-8');
  // pathLength=1 ทำให้ stroke-dasharray ใน CSS ใช้ได้โดยไม่ต้องวัดความยาวเส้น
  check.setAttribute('pathLength', '1');
  svg.append(circle, check);
  el.append(svg, doc.createTextNode(text));
}

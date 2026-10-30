import { prefersReducedMotion } from './motion.mjs';

// ตรงกับปุ่มหลักสีเหลือง (--cta) ใน style.css
export const RIPPLE_SELECTOR = '.actions .primary, .bill-new, #friend-add-submit, #friend-share, .bill-actions .bill-confirm, #bill-form-submit';
const RIPPLE_MS = 650;

// ผูกที่ document ครั้งเดียว เพราะปุ่มถูกสร้างและแทนที่บ่อย
export function installRipple(doc) {
  doc.addEventListener('pointerdown', (event) => {
    const button = event.target.closest?.(RIPPLE_SELECTOR);
    if (!button || button.disabled || prefersReducedMotion(doc.defaultView)) return;
    const rect = button.getBoundingClientRect();
    // วงใหญ่กว่าปุ่มสองเท่าเพื่อให้คลุมปุ่มทั้งปุ่มแม้แตะที่มุม
    const size = Math.max(rect.width, rect.height) * 2;
    const ripple = doc.createElement('span');
    ripple.className = 'ripple';
    ripple.style.width = `${size}px`;
    ripple.style.height = `${size}px`;
    ripple.style.left = `${event.clientX - rect.left - size / 2}px`;
    ripple.style.top = `${event.clientY - rect.top - size / 2}px`;
    button.append(ripple);
    // ลบด้วย timer เพราะผู้ใช้ที่ลดการเคลื่อนไหวจะไม่มี animationend
    setTimeout(() => ripple.remove(), RIPPLE_MS + 50);
  });
}

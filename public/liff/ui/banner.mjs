export function createBannerSetter(el) {
  return (text) => {
    // เขียนเฉพาะเมื่อข้อความเปลี่ยน ไม่งั้น screen reader อ่านซ้ำทุกครั้งที่สลับแท็บ
    if (el.textContent !== text) el.textContent = text;
    el.hidden = !text;
  };
}

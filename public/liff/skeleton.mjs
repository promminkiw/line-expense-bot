export function createSkeletonRows(doc, count, variant = 'row') {
  const fragment = doc.createDocumentFragment();
  for (let index = 0; index < count; index += 1) {
    const item = doc.createElement('li');
    item.className = `skeleton skeleton-${variant}`;
    item.setAttribute('aria-hidden', 'true');
    fragment.append(item);
  }
  return fragment;
}

// ข้อความโหลดเดิมยังคงอยู่ให้ screen reader อ่าน ส่วน skeleton เป็นภาพประกอบอย่างเดียว
export function createLoadingIndicator({ doc, textEl, skeletonEl, count, variant = 'bar' }) {
  skeletonEl.replaceChildren(createSkeletonRows(doc, count, variant));
  return {
    set(visible) {
      textEl.hidden = !visible;
      skeletonEl.hidden = !visible;
    },
  };
}

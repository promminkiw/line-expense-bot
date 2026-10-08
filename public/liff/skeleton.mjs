export function createSkeletonBlocks(doc, variants) {
  const fragment = doc.createDocumentFragment();
  for (const variant of variants) {
    const item = doc.createElement('li');
    item.className = `skeleton skeleton-${variant}`;
    item.setAttribute('aria-hidden', 'true');
    fragment.append(item);
  }
  return fragment;
}

export function createSkeletonRows(doc, count, variant = 'row') {
  return createSkeletonBlocks(doc, Array.from({ length: count }, () => variant));
}

// ข้อความโหลดเดิมยังคงอยู่ให้ screen reader อ่าน ส่วน skeleton เป็นภาพประกอบอย่างเดียว
export function createLoadingIndicator({ doc, textEl, skeletonEl, count, variant = 'bar', variants }) {
  skeletonEl.replaceChildren(variants ? createSkeletonBlocks(doc, variants) : createSkeletonRows(doc, count, variant));
  return {
    set(visible) {
      textEl.hidden = !visible;
      skeletonEl.hidden = !visible;
    },
  };
}

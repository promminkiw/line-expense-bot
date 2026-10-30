// dialog เลื่อนได้เอง ข้อความ error อยู่ล่างสุดจึงอาจตกจอตอนคีย์บอร์ดเปิด
export function revealError(element) {
  if (typeof element.scrollIntoView === 'function') element.scrollIntoView({ block: 'nearest' });
}

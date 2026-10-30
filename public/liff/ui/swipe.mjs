// ตัวจับท่าปัดแถวไปทางซ้ายเพื่อเผยปุ่มลบ ไม่แตะ DOM เพื่อให้เทสต์ได้โดยไม่ต้องจำลองนิ้ว
// state: idle (ยังไม่แตะ) -> undecided (ยังไม่รู้ทิศ) -> horizontal (ปัดอยู่) หรือ vertical (ปล่อยให้หน้าเลื่อน)
export function createSwipeTracker({ revealWidth = 88, lockPx = 8 } = {}) {
  let mode = 'idle';
  let startX = 0;
  let startY = 0;
  let startOffset = 0;
  let offset = 0;

  function start(x, y, initialOffset = 0) {
    mode = 'undecided';
    startX = x;
    startY = y;
    startOffset = initialOffset;
    offset = initialOffset;
  }

  function move(x, y) {
    if (mode === 'idle' || mode === 'vertical') {
      return { dragging: false, offset };
    }
    const dx = x - startX;
    const dy = y - startY;
    if (mode === 'undecided') {
      if (Math.abs(dy) > lockPx && Math.abs(dy) > Math.abs(dx)) {
        mode = 'vertical';
        return { dragging: false, offset };
      }
      if (Math.abs(dx) <= lockPx) {
        return { dragging: false, offset };
      }
      mode = 'horizontal';
    }
    // ปัดซ้าย (dx ติดลบ) เพิ่ม offset ปัดขวากลับไปปิด
    offset = Math.min(revealWidth, Math.max(0, startOffset - dx));
    return { dragging: true, offset };
  }

  function end() {
    const dragged = mode === 'horizontal';
    // แตะเฉยๆ ไม่เปลี่ยนสถานะเปิด/ปิดเดิมของแถว
    const open = dragged ? offset >= revealWidth / 2 : startOffset > 0;
    mode = 'idle';
    return { open, dragged };
  }

  return { start, move, end };
}

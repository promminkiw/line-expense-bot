export function createUndoBar({ el, textEl, liveEl, button, durationMs }) {
  let timer = null;
  let pendingUndo = null;
  // นับทุกครั้งที่ bar เปลี่ยนสถานะ เพื่อให้ done() ของรอบเก่ารู้ว่ามีรอบใหม่มาแทนแล้ว
  let generation = 0;

  function hide() {
    generation += 1;
    clearTimeout(timer);
    pendingUndo = null;
    el.hidden = true;
    // ล้างข้อความเพื่อให้ข้อความเดิมถูกอ่านซ้ำได้ครั้งหน้า
    liveEl.textContent = '';
  }

  button.addEventListener('click', () => {
    const undo = pendingUndo;
    hide();
    if (undo) undo();
  });

  return {
    show(text, onUndo) {
      generation += 1;
      clearTimeout(timer);
      pendingUndo = onUndo;
      textEl.textContent = text;
      button.hidden = false;
      el.hidden = false;
      liveEl.textContent = text;
      timer = setTimeout(hide, durationMs);
    },
    // แสดงสถานะรอโดยไม่มีปุ่มและไม่มีตัวนับเวลา ปิดด้วย done() ที่คืนให้
    showBusy(text) {
      generation += 1;
      const mine = generation;
      clearTimeout(timer);
      pendingUndo = null;
      textEl.textContent = text;
      button.hidden = true;
      el.hidden = false;
      liveEl.textContent = text;
      return () => {
        if (generation === mine) hide();
      };
    },
    hide,
    get visible() {
      return !el.hidden;
    },
  };
}

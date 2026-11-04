export function createUndoBar({ el, textEl, liveEl, button, durationMs }) {
  let timer = null;
  let pendingUndo = null;

  function hide() {
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
      clearTimeout(timer);
      pendingUndo = onUndo;
      textEl.textContent = text;
      el.hidden = false;
      liveEl.textContent = text;
      timer = setTimeout(hide, durationMs);
    },
    hide,
    get visible() {
      return !el.hidden;
    },
  };
}

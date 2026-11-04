export function createUndoBar({ el, textEl, button, durationMs }) {
  let timer = null;
  let pendingUndo = null;

  function hide() {
    clearTimeout(timer);
    pendingUndo = null;
    el.hidden = true;
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
      timer = setTimeout(hide, durationMs);
    },
    hide,
  };
}

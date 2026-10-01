export function easeOutCubic(t) {
  return 1 - (1 - t) ** 3;
}

export function interpolate(from, to, progress) {
  const clamped = Math.min(Math.max(progress, 0), 1);
  return from + (to - from) * easeOutCubic(clamped);
}

export function prefersReducedMotion(win) {
  return Boolean(win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

export function animateNumber({ win, from, to, durationMs = 600, onFrame }) {
  if (prefersReducedMotion(win) || from === to) {
    onFrame(to);
    return () => {};
  }
  const start = win.performance.now();
  let frameId;
  function step(now) {
    const progress = (now - start) / durationMs;
    // เฟรมสุดท้ายส่งค่าเป้าหมายตรงๆ ไม่ให้ทศนิยมจากการ interpolate ค้าง
    onFrame(progress >= 1 ? to : interpolate(from, to, progress));
    if (progress < 1) frameId = win.requestAnimationFrame(step);
  }
  frameId = win.requestAnimationFrame(step);
  return () => win.cancelAnimationFrame(frameId);
}

// ต้องเริ่มที่ 0 แล้วเปลี่ยนในเฟรมถัดไป CSS transition ถึงจะเล่น (ซ้อน rAF สองชั้นเพราะ element เพิ่งถูกต่อเข้า DOM)
export function growBar(win, el, percent, property = 'width') {
  if (prefersReducedMotion(win)) {
    el.style[property] = `${percent}%`;
    return;
  }
  el.style[property] = '0%';
  win.requestAnimationFrame(() => {
    win.requestAnimationFrame(() => {
      el.style[property] = `${percent}%`;
    });
  });
}

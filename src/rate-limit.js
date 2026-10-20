// ลบ key ที่ไม่มีการเรียกมาเต็มหนึ่ง window เพื่อไม่ให้ Map โตไม่จำกัด
function createPurger(hits, windowMs, now) {
  let lastPurge = now();
  return function purgeIfDue() {
    const current = now();
    if (current - lastPurge < windowMs) return;
    lastPurge = current;
    for (const [key, times] of hits) {
      if (times.every((time) => current - time >= windowMs)) hits.delete(key);
    }
  };
}

function createRateLimiter({ limit, windowMs, now = () => Date.now() }) {
  const hits = new Map();
  const purgeIfDue = createPurger(hits, windowMs, now);

  function allowRequest(key) {
    purgeIfDue();
    const current = now();
    const recent = (hits.get(key) || []).filter((time) => current - time < windowMs);
    if (recent.length >= limit) {
      hits.set(key, recent);
      return false;
    }
    recent.push(current);
    hits.set(key, recent);
    return true;
  }
  allowRequest.size = () => hits.size;
  return allowRequest;
}

// นับเฉพาะครั้งที่ล้มเหลว เพื่อกันคนยิง token มั่วโดยไม่กระทบผู้ใช้ที่ยืนยันตัวตนผ่าน
function createFailureLimiter({ limit, windowMs, now = () => Date.now() }) {
  const hits = new Map();
  const purgeIfDue = createPurger(hits, windowMs, now);

  function recentFailures(key) {
    const current = now();
    return (hits.get(key) || []).filter((time) => current - time < windowMs);
  }

  return {
    isBlocked(key) {
      purgeIfDue();
      return recentFailures(key).length >= limit;
    },
    recordFailure(key) {
      purgeIfDue();
      hits.set(key, [...recentFailures(key), now()]);
    },
    size: () => hits.size,
  };
}

module.exports = { createRateLimiter, createFailureLimiter };

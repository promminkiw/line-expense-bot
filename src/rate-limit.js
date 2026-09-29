function createRateLimiter({ limit, windowMs, now = () => Date.now() }) {
  const hits = new Map();

  return function allowRequest(key) {
    const current = now();
    const recent = (hits.get(key) || []).filter((time) => current - time < windowMs);
    if (recent.length >= limit) {
      hits.set(key, recent);
      return false;
    }
    recent.push(current);
    hits.set(key, recent);
    return true;
  };
}

module.exports = { createRateLimiter };

function createConcurrencyLimit(max) {
  let running = 0;
  const waiting = [];

  function release() {
    const next = waiting.shift();
    if (next) {
      // ส่งช่องต่อให้คิวถัดไปโดยตรง คนมาใหม่จึงแซงคิวไม่ได้และจำนวนไม่เกิน max
      next();
    } else {
      running -= 1;
    }
  }

  return async function run(task) {
    if (running < max) {
      running += 1;
    } else {
      await new Promise((resolve) => waiting.push(resolve));
    }
    try {
      return await task();
    } finally {
      release();
    }
  };
}

module.exports = { createConcurrencyLimit };

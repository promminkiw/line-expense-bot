const crypto = require('node:crypto');

// เทียบ hash เพื่อให้ timingSafeEqual ได้ความยาวเท่ากันเสมอ และไม่เปิดเผยความยาวของ secret
function safeEqual(a, b) {
  const left = crypto.createHash('sha256').update(a).digest();
  const right = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(left, right);
}

// throw ตอนสร้าง router เพื่อไม่ให้ endpoint cron เปิดโล่งเมื่อลืมตั้ง secret
function requireCronSecret(cronSecret, owner) {
  if (typeof cronSecret !== 'string' || cronSecret.length === 0) {
    throw new TypeError(`${owner} requires cronSecret`);
  }
}

function hasCronSecret(req, cronSecret) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
  return token !== '' && safeEqual(token, cronSecret);
}

module.exports = { safeEqual, requireCronSecret, hasCronSecret };

const crypto = require('node:crypto');

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const EXPORT_LINK_TTL_MS = 5 * 60 * 1000;

// เก็บแค่ hash ใน database ถ้าข้อมูลในตารางรั่วก็เอาไปดาวน์โหลดไม่ได้
function hashLinkToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function createLinkToken() {
  const token = crypto.randomBytes(32).toString('base64url');
  return { token, tokenHash: hashLinkToken(token) };
}

function isLinkToken(value) {
  return typeof value === 'string' && TOKEN_PATTERN.test(value);
}

module.exports = { createLinkToken, hashLinkToken, isLinkToken, EXPORT_LINK_TTL_MS };

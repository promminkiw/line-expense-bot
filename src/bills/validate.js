const { isValidCalendarDate } = require('../utils/date');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BILL_MEMBERS = 20;
const MAX_BILL_TITLE = 60;
// เพดานเดียวกับ check constraint ของยอดเงินใน supabase
const MAX_SATANG = 10000000 * 100;

// คิดเป็นสตางค์เพื่อเทียบผลรวมได้แม่น ไม่ให้ทศนิยมลอยตัวทำให้ยอดไม่ลงตัว
function toSatang(amount) {
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) {
    return null;
  }
  const satang = Math.round(amount * 100);
  return Math.abs(satang - amount * 100) < 1e-6 ? satang : null;
}

function splitEvenly(totalSatang, count) {
  const base = Math.floor(totalSatang / count);
  return { base, remainder: totalSatang - base * count };
}

function fail(error) {
  return { ok: false, error };
}

function validateBillInput(body, ownerId) {
  const input = body && typeof body === 'object' ? body : {};
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  const titleLength = Array.from(title).length;
  if (titleLength < 1 || titleLength > MAX_BILL_TITLE) return fail('Invalid title');
  const totalSatang = toSatang(input.total);
  if (!totalSatang || totalSatang > MAX_SATANG) return fail('Invalid total');
  if (typeof input.occurredOn !== 'string' || !isValidCalendarDate(input.occurredOn)) return fail('Invalid date');
  if (typeof input.categoryId !== 'string' || !UUID_PATTERN.test(input.categoryId)) return fail('Invalid category');
  const members = Array.isArray(input.members) ? input.members : [];
  const ids = members.map((member) => (member && typeof member.userId === 'string' ? member.userId : ''));
  if (
    members.length < 1 ||
    members.length > MAX_BILL_MEMBERS ||
    ids.some((id) => !UUID_PATTERN.test(id) || id === ownerId) ||
    new Set(ids).size !== ids.length
  ) {
    return fail('Invalid members');
  }
  const shareSatang = members.map((member) => toSatang(member.share));
  const ownerSatang = toSatang(input.ownerShare);
  if (ownerSatang === null || shareSatang.some((satang) => !satang || satang > MAX_SATANG)) return fail('Invalid share');
  if (ownerSatang + shareSatang.reduce((sum, satang) => sum + satang, 0) !== totalSatang) return fail('Shares do not add up');
  return {
    ok: true,
    value: {
      title,
      total: totalSatang / 100,
      occurredOn: input.occurredOn,
      categoryId: input.categoryId,
      ownerShare: ownerSatang / 100,
      members: members.map((member, index) => ({ userId: member.userId, share: shareSatang[index] / 100 })),
    },
  };
}

module.exports = { toSatang, splitEvenly, validateBillInput, MAX_BILL_MEMBERS, MAX_BILL_TITLE };

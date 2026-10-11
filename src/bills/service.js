const { validateBillInput } = require('./validate');
const { buildBillRequestFlex } = require('./flex');
const { FALLBACK_DISPLAY_NAME } = require('../friends/service');
const { FALLBACK_CATEGORY } = require('../parser/categories');
const { categoryKey } = require('../db/transaction-rows');
const { formatAmount } = require('../parser/format-reply');

// ข้อความที่ส่งเข้าแชตเมื่อตอบบิลในเว็บ เพราะการ์ดบิลเดิมในแชตแก้ไม่ได้
function buildWebAnswerText(result) {
  if (result.status === 'confirmed') {
    return `ยืนยันบิล ${result.title} ในเว็บแล้ว บันทึกส่วนของคุณ ${formatAmount(result.share)} บาท ในหมวด ${result.categoryName} แล้ว ไม่ต้องกดปุ่มในการ์ดบิลอีก`;
  }
  if (result.status === 'declined') {
    return `ปฏิเสธบิล ${result.title} ในเว็บแล้ว ไม่ต้องกดปุ่มในการ์ดบิลอีก`;
  }
  return null;
}

function createBillService({ repository, users, pushFlex, pushText, liffUrl, logger = console }) {
  // บิลถูกบันทึกแล้วก่อน push ถ้า push ไม่ถึงเพื่อนยังเข้ามายืนยันในเว็บได้
  async function notifyMembers(billId, ownerId, bill) {
    let ownerName;
    let lineIds;
    try {
      [ownerName, lineIds] = await Promise.all([
        repository.getDisplayName(ownerId),
        repository.getLineUserIds(bill.members.map((member) => member.userId)),
      ]);
    } catch (err) {
      // ห้าม throw หลังบันทึกบิลแล้ว ไม่งั้นเจ้าของลองใหม่แล้วได้บิลซ้ำ
      logger.error('Failed to prepare bill request', { billId }, err);
      return bill.members.map((member) => member.userId);
    }
    // ส่งให้ทุกคนพร้อมกัน บิลที่มีเพื่อนเยอะจะได้ไม่ต้องรอทีละคนก่อนตอบเว็บ
    const notified = await Promise.all(
      bill.members.map(async (member) => {
        try {
          const flex = buildBillRequestFlex({
            billId,
            title: bill.title,
            ownerName: ownerName || FALLBACK_DISPLAY_NAME,
            share: member.share,
            occurredOn: bill.occurredOn,
            liffUrl,
          });
          await pushFlex(lineIds.get(member.userId), flex);
        } catch (err) {
          logger.error('Failed to push bill request', { billId, memberId: member.userId }, err);
          return false;
        }
        // เพื่อนได้การ์ดแล้ว การ mark ไม่สำเร็จจึงไม่นับเป็นแจ้งไม่ถึง
        try {
          if (!(await repository.markBillMemberNotified(billId, member.userId))) {
            logger.error('Bill member to mark notified not found', { billId, memberId: member.userId });
          }
        } catch (err) {
          logger.error('Failed to mark bill member notified', { billId, memberId: member.userId }, err);
        }
        return true;
      })
    );
    return bill.members.filter((member, index) => !notified[index]).map((member) => member.userId);
  }

  // นับ limit หลังตรวจผ่านแล้วเท่านั้น บิลที่กรอกผิดจึงไม่ทำให้ผู้ใช้โดนล็อก
  async function create(ownerId, body, { allowCreate = () => true } = {}) {
    const checked = validateBillInput(body, ownerId);
    if (!checked.ok) {
      return { status: 'invalid', error: checked.error };
    }
    const bill = checked.value;
    const [categories, friends] = await Promise.all([repository.listCategories(ownerId), repository.listFriends(ownerId)]);
    if (!categories.some((category) => category.id === bill.categoryId && category.type === 'expense')) {
      return { status: 'invalid', error: 'Invalid category' };
    }
    const friendIds = new Set(friends.map((friend) => friend.id));
    if (!bill.members.every((member) => friendIds.has(member.userId))) {
      return { status: 'invalid', error: 'Not friends' };
    }
    if (!allowCreate()) {
      return { status: 'limited' };
    }
    const id = await repository.createBill({ ownerId, ...bill });
    return { status: 'ok', id, notNotified: await notifyMembers(id, ownerId, bill) };
  }

  async function list(userId) {
    const [owned, incoming] = await Promise.all([repository.listOwnedBills(userId), repository.listIncomingBills(userId)]);
    return {
      owned: owned.map((bill) => ({
        ...bill,
        // ฐานข้อมูลไม่รับประกันลำดับของสมาชิกที่ embed มา จึงเรียงเองให้การ์ดไม่สลับที่ทุกครั้งที่โหลด
        members: bill.members
          .map((member) => ({ ...member, displayName: member.displayName || FALLBACK_DISPLAY_NAME }))
          .sort((a, b) => a.displayName.localeCompare(b.displayName, 'th')),
      })),
      incoming: incoming.map((bill) => ({ ...bill, ownerName: bill.ownerName || FALLBACK_DISPLAY_NAME })),
    };
  }

  function cancel(ownerId, billId) {
    return repository.cancelBill(billId, ownerId);
  }

  async function setPaid(ownerId, billId, memberId, paid) {
    if (!(await repository.isBillOwner(billId, ownerId))) {
      return false;
    }
    return repository.setBillMemberPaid(billId, memberId, paid);
  }

  async function respond(userId, billId, answer) {
    const share = await repository.getBillShare(billId, userId);
    if (!share) {
      return { status: 'not_found' };
    }
    const answered = { title: share.title, share: share.share };
    if (answer === 'decline') {
      return { status: await repository.declineBillShare(billId, userId), ...answered };
    }
    // หมวดของเพื่อนเป็นคนละแถวกับของเจ้าของ จึงจับคู่ด้วยชื่อ ไม่มีชื่อนั้นใช้ อื่นๆ
    const categoryIds = await users.loadCategoryIds(userId);
    const sameName = categoryIds.get(categoryKey('expense', share.categoryName));
    const categoryId = sameName || categoryIds.get(categoryKey('expense', FALLBACK_CATEGORY));
    const categoryName = sameName ? share.categoryName : FALLBACK_CATEGORY;
    const status = await repository.confirmBillShare(billId, userId, categoryId);
    return status === 'confirmed' ? { status, ...answered, categoryName } : { status, ...answered };
  }

  async function respondFromWeb(userId, billId, answer) {
    const result = await respond(userId, billId, answer);
    const text = buildWebAnswerText(result);
    if (!text) return result;
    // บันทึกคำตอบแล้ว ส่งข้อความไม่ถึงต้องไม่ทำให้เว็บขึ้นว่าไม่สำเร็จ
    try {
      const lineId = (await repository.getLineUserIds([userId])).get(userId);
      if (lineId) await pushText(lineId, text);
    } catch (err) {
      logger.error('Failed to push bill answer', { billId, userId }, err);
    }
    return result;
  }

  return { create, list, cancel, setPaid, respond, respondFromWeb };
}

module.exports = { createBillService };

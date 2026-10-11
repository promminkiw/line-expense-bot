const { validateBillInput } = require('./validate');
const { buildBillRequestFlex } = require('./flex');
const { FALLBACK_DISPLAY_NAME } = require('../friends/service');
const { FALLBACK_CATEGORY } = require('../parser/categories');
const { categoryKey } = require('../db/transaction-rows');

function createBillService({ repository, users, pushFlex, liffUrl, logger = console }) {
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
    const notNotified = [];
    for (const member of bill.members) {
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
        notNotified.push(member.userId);
        continue;
      }
      // เพื่อนได้การ์ดแล้ว การ mark ไม่สำเร็จจึงไม่นับเป็นแจ้งไม่ถึง
      try {
        await repository.markBillMemberNotified(billId, member.userId);
      } catch (err) {
        logger.error('Failed to mark bill member notified', { billId, memberId: member.userId }, err);
      }
    }
    return notNotified;
  }

  async function create(ownerId, body) {
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
    const id = await repository.createBill({ ownerId, ...bill });
    return { status: 'ok', id, notNotified: await notifyMembers(id, ownerId, bill) };
  }

  async function list(userId) {
    const [owned, incoming] = await Promise.all([repository.listOwnedBills(userId), repository.listIncomingBills(userId)]);
    return {
      owned: owned.map((bill) => ({
        ...bill,
        members: bill.members.map((member) => ({ ...member, displayName: member.displayName || FALLBACK_DISPLAY_NAME })),
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
    if (answer === 'decline') {
      return { status: await repository.declineBillShare(billId, userId) };
    }
    const share = await repository.getBillShare(billId, userId);
    if (!share) {
      return { status: 'not_found' };
    }
    // หมวดของเพื่อนเป็นคนละแถวกับของเจ้าของ จึงจับคู่ด้วยชื่อ ไม่มีชื่อนั้นใช้ อื่นๆ
    const categoryIds = await users.loadCategoryIds(userId);
    const sameName = categoryIds.get(categoryKey('expense', share.categoryName));
    const categoryId = sameName || categoryIds.get(categoryKey('expense', FALLBACK_CATEGORY));
    const categoryName = sameName ? share.categoryName : FALLBACK_CATEGORY;
    const status = await repository.confirmBillShare(billId, userId, categoryId);
    return status === 'confirmed' ? { status, share: share.share, categoryName } : { status };
  }

  return { create, list, cancel, setPaid, respond };
}

module.exports = { createBillService };

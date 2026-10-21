import { describe, it, expect, vi } from 'vitest';
import { createBillService } from './service.js';

const OWNER = '11111111-1111-1111-1111-111111111111';
const F1 = '22222222-2222-2222-2222-222222222222';
const F2 = '33333333-3333-3333-3333-333333333333';
const FOOD = '44444444-4444-4444-4444-444444444444';
const BILL = '55555555-5555-5555-5555-555555555555';
const SALARY = '77777777-7777-7777-7777-777777777777';

function body(overrides = {}) {
  return {
    title: 'เนื้อย่าง',
    total: 900,
    occurredOn: '2026-10-08',
    categoryId: FOOD,
    ownerShare: 300,
    members: [
      { userId: F1, share: 300 },
      { userId: F2, share: 300 },
    ],
    ...overrides,
  };
}

function setup(overrides = {}) {
  const repository = {
    listCategories: vi.fn().mockResolvedValue([
      { id: FOOD, name: 'อาหาร', type: 'expense' },
      { id: SALARY, name: 'เงินเดือน', type: 'income' },
    ]),
    listFriends: vi.fn().mockResolvedValue([
      { id: F1, displayName: 'บี' },
      { id: F2, displayName: 'ซี' },
    ]),
    getDisplayName: vi.fn().mockResolvedValue('เอ'),
    createBill: vi.fn().mockResolvedValue(BILL),
    getLineUserIds: vi.fn().mockResolvedValue(new Map([[F1, 'U-F1'], [F2, 'U-F2']])),
    markBillMemberNotified: vi.fn().mockResolvedValue(true),
    listOwnedBills: vi.fn().mockResolvedValue([]),
    listIncomingBills: vi.fn().mockResolvedValue([]),
    cancelBill: vi.fn().mockResolvedValue(true),
    isBillOwner: vi.fn().mockResolvedValue(true),
    setBillMemberPaid: vi.fn().mockResolvedValue(true),
    getBillShare: vi.fn().mockResolvedValue({ share: 300, title: 'เนื้อย่าง', categoryName: 'อาหาร' }),
    confirmBillShare: vi.fn().mockResolvedValue('confirmed'),
    declineBillShare: vi.fn().mockResolvedValue('declined'),
    ...overrides,
  };
  const users = { loadCategoryIds: vi.fn().mockResolvedValue(new Map([['expense:อาหาร', 'f1-food'], ['expense:อื่นๆ', 'f1-other']])) };
  const pushFlex = vi.fn().mockResolvedValue();
  const pushText = vi.fn().mockResolvedValue();
  const logger = { error: vi.fn() };
  const service = createBillService({ repository, users, pushFlex, pushText, liffUrl: 'https://liff.line.me/liff-1', logger });
  return { repository, users, pushFlex, pushText, logger, service };
}

describe('billService.create', () => {
  it('counts only a valid bill against the create limit, right before saving it', async () => {
    const invalid = setup();
    const notFriends = setup({ listFriends: vi.fn().mockResolvedValue([]) });
    const valid = setup();
    const allowCreate = vi.fn().mockReturnValue(true);

    await invalid.service.create(OWNER, body({ title: '' }), { allowCreate });
    await notFriends.service.create(OWNER, body(), { allowCreate });
    expect(allowCreate).not.toHaveBeenCalled();

    expect((await valid.service.create(OWNER, body(), { allowCreate })).status).toBe('ok');
    expect(allowCreate).toHaveBeenCalledTimes(1);
  });

  // push ทีละคนทำให้บิลที่มีคนเยอะรอนานก่อนตอบเว็บ
  it('pushes the cards to all members at once and keeps the not-notified order', async () => {
    const { service, pushFlex } = setup();
    const releases = [];
    pushFlex.mockImplementation((to) => new Promise((resolve, reject) => releases.push(to === 'U-F1' ? () => reject(new Error('blocked')) : resolve)));

    const created = service.create(OWNER, body());
    await vi.waitFor(() => expect(pushFlex).toHaveBeenCalledTimes(2));
    releases.forEach((release) => release());

    expect(await created).toEqual({ status: 'ok', id: BILL, notNotified: [F1] });
  });

  it('saves and pushes nothing when the limit is reached', async () => {
    const { service, repository, pushFlex } = setup();

    expect(await service.create(OWNER, body(), { allowCreate: () => false })).toEqual({ status: 'limited' });
    expect(repository.createBill).not.toHaveBeenCalled();
    expect(pushFlex).not.toHaveBeenCalled();
  });

  it('creates the bill, pushes a card to every member and marks them notified', async () => {
    const { service, repository, pushFlex } = setup();

    expect(await service.create(OWNER, body())).toEqual({ status: 'ok', id: BILL, notNotified: [] });
    expect(repository.createBill).toHaveBeenCalledWith({ ownerId: OWNER, ...body() });
    expect(repository.listCategories).toHaveBeenCalledWith(OWNER);
    expect(repository.listFriends).toHaveBeenCalledWith(OWNER);
    expect(repository.getDisplayName).toHaveBeenCalledWith(OWNER);
    expect(pushFlex.mock.calls.map(([to]) => to)).toEqual(['U-F1', 'U-F2']);
    expect(pushFlex.mock.calls[0][1].altText).toBe('เอ ขอให้ยืนยันส่วนแบ่งบิล เนื้อย่าง 300 บาท');
    expect(JSON.stringify(pushFlex.mock.calls[0][1])).toContain('08/10/2569 · อาหาร');
    expect(repository.markBillMemberNotified.mock.calls).toEqual([
      [BILL, F1],
      [BILL, F2],
    ]);
  });

  it('keeps the bill and reports members the push could not reach, logging only ids', async () => {
    const { service, repository, pushFlex, logger } = setup();
    const pushError = new Error('not a friend of the bot');
    pushFlex.mockRejectedValueOnce(pushError);

    expect(await service.create(OWNER, body())).toEqual({ status: 'ok', id: BILL, notNotified: [F1] });
    expect(repository.markBillMemberNotified.mock.calls).toEqual([[BILL, F2]]);
    expect(logger.error).toHaveBeenCalledWith('Failed to push bill request', { billId: BILL, memberId: F1 }, pushError);
  });

  it('rejects invalid input, a category that is not the owner expense category, and strangers', async () => {
    const { service, repository } = setup();

    expect(await service.create(OWNER, body({ title: '' }))).toEqual({ status: 'invalid', error: 'Invalid title' });
    expect(await service.create(OWNER, body({ categoryId: '66666666-6666-6666-6666-666666666666' }))).toEqual({
      status: 'invalid',
      error: 'Invalid category',
    });
    repository.listFriends.mockResolvedValueOnce([{ id: F1, displayName: 'บี' }]);
    expect(await service.create(OWNER, body())).toEqual({ status: 'invalid', error: 'Not friends' });
    expect(repository.createBill).not.toHaveBeenCalled();
  });

  it('keeps the bill and reports every member as not notified when the line id lookup fails', async () => {
    const lookupError = new Error('db down');
    const { service, pushFlex, logger } = setup({ getLineUserIds: vi.fn().mockRejectedValue(lookupError) });

    expect(await service.create(OWNER, body())).toEqual({ status: 'ok', id: BILL, notNotified: [F1, F2] });
    expect(pushFlex).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith('Failed to prepare bill request', { billId: BILL }, lookupError);
  });

  it('keeps the bill and reports every member as not notified when the owner name lookup fails', async () => {
    const { service, pushFlex } = setup({ getDisplayName: vi.fn().mockRejectedValue(new Error('db down')) });

    expect(await service.create(OWNER, body())).toEqual({ status: 'ok', id: BILL, notNotified: [F1, F2] });
    expect(pushFlex).not.toHaveBeenCalled();
  });

  it('counts a member as notified when the push succeeds but marking notified fails', async () => {
    const markError = new Error('db down');
    const { service, logger } = setup({ markBillMemberNotified: vi.fn().mockRejectedValueOnce(markError).mockResolvedValue(true) });

    expect(await service.create(OWNER, body())).toEqual({ status: 'ok', id: BILL, notNotified: [] });
    expect(logger.error).toHaveBeenCalledWith('Failed to mark bill member notified', { billId: BILL, memberId: F1 }, markError);
  });

  it('logs a member row that was gone when marking notified, but still counts the card as sent', async () => {
    const { service, logger } = setup({ markBillMemberNotified: vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true) });

    expect(await service.create(OWNER, body())).toEqual({ status: 'ok', id: BILL, notNotified: [] });
    expect(logger.error).toHaveBeenCalledWith('Bill member to mark notified not found', { billId: BILL, memberId: F1 });
  });

  it('rejects an income category the owner does own', async () => {
    const { service, repository } = setup();

    expect(await service.create(OWNER, body({ categoryId: SALARY }))).toEqual({ status: 'invalid', error: 'Invalid category' });
    expect(repository.createBill).not.toHaveBeenCalled();
  });

  // หมวดที่เจ้าของตั้งชื่อเองอาจเป็นเรื่องส่วนตัว เพื่อนจึงเห็นแค่ชื่อหมวดมาตรฐาน
  it('leaves a category name the owner made up off the card', async () => {
    const { service, pushFlex } = setup({
      listCategories: vi.fn().mockResolvedValue([{ id: FOOD, name: 'ค่าแฟน', type: 'expense' }]),
    });

    await service.create(OWNER, body());

    const card = JSON.stringify(pushFlex.mock.calls[0][1]);
    expect(card).not.toContain('ค่าแฟน');
    expect(card).toContain('08/10/2569');
  });

  it('uses the fallback name on the card when the owner has no name', async () => {
    const { service, pushFlex } = setup({ getDisplayName: vi.fn().mockResolvedValue(null) });

    await service.create(OWNER, body());

    expect(pushFlex.mock.calls[0][1].altText).toContain('ผู้ใช้ LINE ขอให้ยืนยัน');
  });
});

describe('billService.list', () => {
  // ฐานข้อมูลไม่รับประกันลำดับของสมาชิกที่ embed มา จึงเรียงตามชื่อแบบไทยให้การ์ดไม่สลับที่ทุกครั้งที่โหลด
  it('lists the members of each owned bill by Thai name', async () => {
    const { service, repository } = setup({
      listOwnedBills: vi.fn().mockResolvedValue([
        {
          id: BILL,
          members: [
            { userId: F2, displayName: 'ค่อม' },
            { userId: F1, displayName: null },
            { userId: 'f3', displayName: 'กบ' },
          ],
        },
      ]),
    });

    const { owned } = await service.list(OWNER);

    expect(owned[0].members.map((member) => member.displayName)).toEqual(['กบ', 'ค่อม', 'ผู้ใช้ LINE']);
    expect(repository.listOwnedBills).toHaveBeenCalledWith(OWNER);
    expect(repository.listIncomingBills).toHaveBeenCalledWith(OWNER);
  });

  it('fills missing names with the fallback', async () => {
    const { service } = setup({
      listOwnedBills: vi.fn().mockResolvedValue([{ id: BILL, members: [{ userId: F1, displayName: null }] }]),
      listIncomingBills: vi.fn().mockResolvedValue([{ id: 'b2', ownerName: null }]),
    });

    expect(await service.list(OWNER)).toEqual({
      owned: [{ id: BILL, members: [{ userId: F1, displayName: 'ผู้ใช้ LINE' }] }],
      incoming: [{ id: 'b2', ownerName: 'ผู้ใช้ LINE', categoryName: '' }],
    });
  });

  it('shows friends only the standard category names of incoming bills', async () => {
    const { service } = setup({
      listIncomingBills: vi.fn().mockResolvedValue([
        { id: 'b1', ownerName: 'เอ', categoryName: 'อาหาร' },
        { id: 'b2', ownerName: 'เอ', categoryName: 'ค่าแฟน' },
      ]),
    });

    const { incoming } = await service.list(F1);

    expect(incoming.map((bill) => bill.categoryName)).toEqual(['อาหาร', '']);
  });
});

describe('billService.cancel and setPaid', () => {
  it('cancels through the repository', async () => {
    const { service, repository } = setup({ cancelBill: vi.fn().mockResolvedValue(false) });

    expect(await service.cancel(OWNER, BILL)).toBe(false);
    expect(repository.cancelBill).toHaveBeenCalledWith(BILL, OWNER);
  });

  it('sets paid only on a bill the user owns', async () => {
    const owned = setup();
    const notOwned = setup({ isBillOwner: vi.fn().mockResolvedValue(false) });

    expect(await owned.service.setPaid(OWNER, BILL, F1, true)).toBe(true);
    expect(owned.repository.isBillOwner).toHaveBeenCalledWith(BILL, OWNER);
    expect(owned.repository.setBillMemberPaid).toHaveBeenCalledWith(BILL, F1, true);
    expect(await notOwned.service.setPaid(F2, BILL, F1, true)).toBe(false);
    expect(notOwned.repository.setBillMemberPaid).not.toHaveBeenCalled();
  });
});

describe('billService.respond', () => {
  it('confirms into the friend category with the same name and returns the share', async () => {
    const { service, repository } = setup();

    expect(await service.respond(F1, BILL, 'confirm')).toEqual({ status: 'confirmed', title: 'เนื้อย่าง', share: 300, categoryName: 'อาหาร' });
    expect(repository.getBillShare).toHaveBeenCalledWith(BILL, F1);
    expect(repository.confirmBillShare).toHaveBeenCalledWith(BILL, F1, 'f1-food');
  });

  it('passes a bill cancelled before the confirm through without a category', async () => {
    const { service } = setup({ confirmBillShare: vi.fn().mockResolvedValue('cancelled') });

    expect(await service.respond(F1, BILL, 'confirm')).toEqual({ status: 'cancelled', title: 'เนื้อย่าง', share: 300 });
  });

  it('falls back to the other category when the friend has no category with that name', async () => {
    const { service, repository } = setup({ getBillShare: vi.fn().mockResolvedValue({ share: 300, title: 'เนื้อย่าง', categoryName: 'ปาร์ตี้' }) });

    expect(await service.respond(F1, BILL, 'confirm')).toEqual({ status: 'confirmed', title: 'เนื้อย่าง', share: 300, categoryName: 'อื่นๆ' });
    expect(repository.confirmBillShare).toHaveBeenCalledWith(BILL, F1, 'f1-other');
  });

  it('reports a bill the user is not part of as not found without writing', async () => {
    const { service, repository } = setup({ getBillShare: vi.fn().mockResolvedValue(null) });

    expect(await service.respond(F1, BILL, 'confirm')).toEqual({ status: 'not_found' });
    expect(await service.respond(F1, BILL, 'decline')).toEqual({ status: 'not_found' });
    expect(repository.confirmBillShare).not.toHaveBeenCalled();
    expect(repository.declineBillShare).not.toHaveBeenCalled();
  });

  // การ์ดเก่าแก้ไม่ได้ จึงส่งชื่อบิลและยอดไปให้คำตอบบอกได้ว่าตอบบิลไหนไปแล้ว
  it('passes an earlier answer through with the bill title and share but no category', async () => {
    const confirmedBefore = setup({ confirmBillShare: vi.fn().mockResolvedValue('already_confirmed') });
    const declinedBefore = setup({ declineBillShare: vi.fn().mockResolvedValue('already_declined') });

    expect(await confirmedBefore.service.respond(F1, BILL, 'confirm')).toEqual({ status: 'already_confirmed', title: 'เนื้อย่าง', share: 300 });
    expect(await declinedBefore.service.respond(F1, BILL, 'decline')).toEqual({ status: 'already_declined', title: 'เนื้อย่าง', share: 300 });
  });

  it('declines through the repository and passes other statuses through', async () => {
    const { service, repository } = setup({ declineBillShare: vi.fn().mockResolvedValue('cancelled') });

    expect(await service.respond(F1, BILL, 'decline')).toEqual({ status: 'cancelled', title: 'เนื้อย่าง', share: 300 });
    expect(repository.declineBillShare).toHaveBeenCalledWith(BILL, F1);
  });
});

describe('billService.respondFromWeb', () => {
  it('tells the chat that the bill was confirmed on the web, since the old card cannot change', async () => {
    const { service, repository, pushText } = setup();

    expect(await service.respondFromWeb(F1, BILL, 'confirm')).toEqual({ status: 'confirmed', title: 'เนื้อย่าง', share: 300, categoryName: 'อาหาร' });
    expect(repository.getLineUserIds).toHaveBeenCalledWith([F1]);
    expect(pushText).toHaveBeenCalledWith(
      'U-F1',
      'ยืนยันบิล เนื้อย่าง ในเว็บแล้ว เฮียบันทึกส่วนของคุณ 300 บาท ในหมวด อาหาร แล้ว ไม่ต้องกดปุ่มในการ์ดบิลอีก'
    );
  });

  it('tells the chat that the bill was declined on the web', async () => {
    const { service, pushText } = setup();

    expect((await service.respondFromWeb(F1, BILL, 'decline')).status).toBe('declined');
    expect(pushText).toHaveBeenCalledWith('U-F1', 'ปฏิเสธบิล เนื้อย่าง ในเว็บแล้ว ไม่ต้องกดปุ่มในการ์ดบิลอีก');
  });

  it('pushes nothing when nothing changed', async () => {
    for (const overrides of [
      { confirmBillShare: vi.fn().mockResolvedValue('already_confirmed') },
      { confirmBillShare: vi.fn().mockResolvedValue('cancelled') },
      { getBillShare: vi.fn().mockResolvedValue(null) },
    ]) {
      const { service, pushText } = setup(overrides);

      await service.respondFromWeb(F1, BILL, 'confirm');

      expect(pushText).not.toHaveBeenCalled();
    }
  });

  it('still returns the answer when the chat message cannot be sent', async () => {
    const failedPush = setup();
    failedPush.pushText.mockRejectedValue(new Error('quota'));
    const failedLookup = setup({ getLineUserIds: vi.fn().mockRejectedValue(new Error('db down')) });
    const noLineId = setup({ getLineUserIds: vi.fn().mockResolvedValue(new Map()) });

    for (const { service, logger } of [failedPush, failedLookup]) {
      expect((await service.respondFromWeb(F1, BILL, 'confirm')).status).toBe('confirmed');
      expect(logger.error).toHaveBeenCalledWith('Failed to push bill answer', { billId: BILL, userId: F1 }, expect.any(Error));
    }
    expect((await noLineId.service.respondFromWeb(F1, BILL, 'confirm')).status).toBe('confirmed');
    expect(noLineId.pushText).not.toHaveBeenCalled();
  });
});

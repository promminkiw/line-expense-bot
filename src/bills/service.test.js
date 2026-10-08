import { describe, it, expect, vi } from 'vitest';
import { createBillService } from './service.js';

const OWNER = '11111111-1111-1111-1111-111111111111';
const F1 = '22222222-2222-2222-2222-222222222222';
const F2 = '33333333-3333-3333-3333-333333333333';
const FOOD = '44444444-4444-4444-4444-444444444444';
const BILL = '55555555-5555-5555-5555-555555555555';

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
      { id: 'salary', name: 'เงินเดือน', type: 'income' },
    ]),
    listFriends: vi.fn().mockResolvedValue([
      { id: F1, displayName: 'บี' },
      { id: F2, displayName: 'ซี' },
    ]),
    getDisplayName: vi.fn().mockResolvedValue('เอ'),
    createBill: vi.fn().mockResolvedValue(BILL),
    getLineUserIds: vi.fn().mockResolvedValue(new Map([[F1, 'U-F1'], [F2, 'U-F2']])),
    markBillMemberNotified: vi.fn().mockResolvedValue(),
    listOwnedBills: vi.fn().mockResolvedValue([]),
    listIncomingBills: vi.fn().mockResolvedValue([]),
    cancelBill: vi.fn().mockResolvedValue(true),
    isBillOwner: vi.fn().mockResolvedValue(true),
    setBillMemberPaid: vi.fn().mockResolvedValue(true),
    getBillShare: vi.fn().mockResolvedValue({ share: 300, categoryName: 'อาหาร' }),
    confirmBillShare: vi.fn().mockResolvedValue('confirmed'),
    declineBillShare: vi.fn().mockResolvedValue('declined'),
    ...overrides,
  };
  const users = { loadCategoryIds: vi.fn().mockResolvedValue(new Map([['expense:อาหาร', 'f1-food'], ['expense:อื่นๆ', 'f1-other']])) };
  const pushFlex = vi.fn().mockResolvedValue();
  const logger = { error: vi.fn() };
  const service = createBillService({ repository, users, pushFlex, liffUrl: 'https://liff.line.me/liff-1', logger });
  return { repository, users, pushFlex, logger, service };
}

describe('billService.create', () => {
  it('creates the bill, pushes a card to every member and marks them notified', async () => {
    const { service, repository, pushFlex } = setup();

    expect(await service.create(OWNER, body())).toEqual({ status: 'ok', id: BILL, notNotified: [] });
    expect(repository.createBill).toHaveBeenCalledWith({ ownerId: OWNER, ...body() });
    expect(pushFlex.mock.calls.map(([to]) => to)).toEqual(['U-F1', 'U-F2']);
    expect(pushFlex.mock.calls[0][1].altText).toBe('เอ ขอให้ยืนยันส่วนแบ่งบิล เนื้อย่าง 300 บาท');
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
    const { service, logger } = setup({ markBillMemberNotified: vi.fn().mockRejectedValueOnce(markError).mockResolvedValue() });

    expect(await service.create(OWNER, body())).toEqual({ status: 'ok', id: BILL, notNotified: [] });
    expect(logger.error).toHaveBeenCalledWith('Failed to mark bill member notified', { billId: BILL, memberId: F1 }, markError);
  });

  it('rejects an income category the owner does own', async () => {
    const { service, repository } = setup();

    expect(await service.create(OWNER, body({ categoryId: 'salary' }))).toEqual({ status: 'invalid', error: 'Invalid category' });
    expect(repository.createBill).not.toHaveBeenCalled();
  });

  it('uses the fallback name on the card when the owner has no name', async () => {
    const { service, pushFlex } = setup({ getDisplayName: vi.fn().mockResolvedValue(null) });

    await service.create(OWNER, body());

    expect(pushFlex.mock.calls[0][1].altText).toContain('ผู้ใช้ LINE ขอให้ยืนยัน');
  });
});

describe('billService.list', () => {
  it('fills missing names with the fallback', async () => {
    const { service } = setup({
      listOwnedBills: vi.fn().mockResolvedValue([{ id: BILL, members: [{ userId: F1, displayName: null }] }]),
      listIncomingBills: vi.fn().mockResolvedValue([{ id: 'b2', ownerName: null }]),
    });

    expect(await service.list(OWNER)).toEqual({
      owned: [{ id: BILL, members: [{ userId: F1, displayName: 'ผู้ใช้ LINE' }] }],
      incoming: [{ id: 'b2', ownerName: 'ผู้ใช้ LINE' }],
    });
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
    expect(owned.repository.setBillMemberPaid).toHaveBeenCalledWith(BILL, F1, true);
    expect(await notOwned.service.setPaid(F2, BILL, F1, true)).toBe(false);
    expect(notOwned.repository.setBillMemberPaid).not.toHaveBeenCalled();
  });
});

describe('billService.respond', () => {
  it('confirms into the friend category with the same name and returns the share', async () => {
    const { service, repository } = setup();

    expect(await service.respond(F1, BILL, 'confirm')).toEqual({ status: 'confirmed', share: 300, categoryName: 'อาหาร' });
    expect(repository.confirmBillShare).toHaveBeenCalledWith(BILL, F1, 'f1-food');
  });

  it('falls back to the other category when the friend has no category with that name', async () => {
    const { service, repository } = setup({ getBillShare: vi.fn().mockResolvedValue({ share: 300, categoryName: 'ปาร์ตี้' }) });

    expect(await service.respond(F1, BILL, 'confirm')).toEqual({ status: 'confirmed', share: 300, categoryName: 'อื่นๆ' });
    expect(repository.confirmBillShare).toHaveBeenCalledWith(BILL, F1, 'f1-other');
  });

  it('reports a bill the user is not part of as not found without writing', async () => {
    const { service, repository } = setup({ getBillShare: vi.fn().mockResolvedValue(null) });

    expect(await service.respond(F1, BILL, 'confirm')).toEqual({ status: 'not_found' });
    expect(repository.confirmBillShare).not.toHaveBeenCalled();
  });

  it('declines through the repository and passes other statuses through', async () => {
    const { service, repository } = setup({ declineBillShare: vi.fn().mockResolvedValue('cancelled') });

    expect(await service.respond(F1, BILL, 'decline')).toEqual({ status: 'cancelled' });
    expect(repository.declineBillShare).toHaveBeenCalledWith(BILL, F1);
  });
});

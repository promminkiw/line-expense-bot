import { describe, it, expect, vi, afterEach } from 'vitest';
import { createUserService } from './users.js';
import { DEFAULT_CATEGORIES, SYSTEM_CATEGORIES } from './parser/categories.js';

// ผู้ใช้ที่มีหมวดเริ่มต้นครบ อาหาร = c1 ให้เทสต์อ้างได้
const ALL_DEFAULT_IDS = new Map([
  ['expense:อาหาร', 'c1'],
  ...Object.entries(DEFAULT_CATEGORIES).flatMap(([type, names]) =>
    names.filter((name) => `${type}:${name}` !== 'expense:อาหาร').map((name) => [`${type}:${name}`, `${type}-${name}`]),
  ),
]);

function setup(repositoryOverrides = {}, getDisplayName = vi.fn().mockResolvedValue('Aom')) {
  const repository = {
    findUserIdByLineId: vi.fn().mockResolvedValue(null),
    createUser: vi.fn().mockResolvedValue('user-1'),
    fillMissingDisplayName: vi.fn().mockResolvedValue(),
    seedDefaultCategories: vi.fn().mockResolvedValue(),
    getCategoryIds: vi.fn().mockResolvedValue(ALL_DEFAULT_IDS),
    listCategories: vi.fn().mockResolvedValue([]),
    seedDefaultWallet: vi.fn().mockResolvedValue(),
    listWallets: vi.fn().mockResolvedValue([{ id: 'w-cash', name: 'เงินสด', hidden: false, isDefault: true }]),
    ...repositoryOverrides,
  };
  const logger = { error: vi.fn() };
  const service = createUserService({ repository, getDisplayName, logger });
  return { repository, getDisplayName, logger, service };
}

describe('userService.ensureUser', () => {
  it('returns the existing id without calling LINE or creating anything', async () => {
    const { repository, getDisplayName, service } = setup({
      findUserIdByLineId: vi.fn().mockResolvedValue('user-9'),
    });

    expect(await service.ensureUser('U1')).toBe('user-9');
    expect(getDisplayName).not.toHaveBeenCalled();
    expect(repository.createUser).not.toHaveBeenCalled();
  });

  it('creates a new user with LINE display name and default categories', async () => {
    const { repository, service } = setup();

    expect(await service.ensureUser('U1')).toBe('user-1');
    expect(repository.createUser).toHaveBeenCalledWith({ lineUserId: 'U1', displayName: 'Aom' });
    expect(repository.seedDefaultCategories).toHaveBeenCalledWith('user-1');
  });

  it('gives a new user the cash wallet after the default categories', async () => {
    const { repository, service } = setup();

    await service.ensureUser('U1');

    expect(repository.seedDefaultWallet).toHaveBeenCalledWith('user-1');
    expect(repository.seedDefaultWallet.mock.invocationCallOrder[0]).toBeGreaterThan(
      repository.seedDefaultCategories.mock.invocationCallOrder[0]
    );
  });

  it('does not seed a wallet for an existing user', async () => {
    const { repository, service } = setup({ findUserIdByLineId: vi.fn().mockResolvedValue('user-9') });

    await service.ensureUser('U1');

    expect(repository.seedDefaultWallet).not.toHaveBeenCalled();
  });

  // กระเป๋าตั้งต้นซ่อมทีหลังได้ใน loadWallets ถ้าให้ล้ม event แรกของผู้ใช้ใหม่จะได้ข้อความระบบมีปัญหา
  it('still returns the new user when the cash wallet cannot be created', async () => {
    const { repository, logger, service } = setup({ seedDefaultWallet: vi.fn().mockRejectedValue(new Error('db down')) });

    expect(await service.ensureUser('U1')).toBe('user-1');
    expect(logger.error).toHaveBeenCalledWith('Failed to seed default wallet', { userId: 'user-1' }, expect.any(Error));
    expect(repository.seedDefaultCategories).toHaveBeenCalledWith('user-1');
  });

  it('still creates the user with null name when LINE profile fails', async () => {
    const { repository, logger, service } = setup({}, vi.fn().mockRejectedValue(new Error('404')));

    expect(await service.ensureUser('U1')).toBe('user-1');
    expect(repository.createUser).toHaveBeenCalledWith({ lineUserId: 'U1', displayName: null });
    expect(logger.error).toHaveBeenCalledWith(
      'Failed to fetch LINE profile',
      { lineUserId: 'U1' },
      expect.any(Error)
    );
  });

  it('rejects when findUserIdByLineId fails and does not call LINE', async () => {
    const { getDisplayName, service } = setup({
      findUserIdByLineId: vi.fn().mockRejectedValue(new Error('db down')),
    });

    await expect(service.ensureUser('U1')).rejects.toThrow('db down');
    expect(getDisplayName).not.toHaveBeenCalled();
  });

  it('rejects and does not seed when createUser fails', async () => {
    const { repository, service } = setup({
      createUser: vi.fn().mockRejectedValue(new Error('db down')),
    });

    await expect(service.ensureUser('U1')).rejects.toThrow('db down');
    expect(repository.seedDefaultCategories).not.toHaveBeenCalled();
  });

  it('rejects when seedDefaultCategories fails after createUser succeeded', async () => {
    const { repository, service } = setup({
      seedDefaultCategories: vi.fn().mockRejectedValue(new Error('db down')),
    });

    await expect(service.ensureUser('U1')).rejects.toThrow('db down');
    expect(repository.createUser).toHaveBeenCalledWith({ lineUserId: 'U1', displayName: 'Aom' });
  });

  describe('profile timeout', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('creates the user with a null name when LINE profile takes too long', async () => {
      vi.useFakeTimers();
      const { repository, logger, service } = setup({}, vi.fn(() => new Promise(() => {})));
      const pending = service.ensureUser('U1');

      await vi.advanceTimersByTimeAsync(3000);

      expect(await pending).toBe('user-1');
      expect(repository.createUser).toHaveBeenCalledWith({ lineUserId: 'U1', displayName: null });
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to fetch LINE profile',
        { lineUserId: 'U1' },
        expect.objectContaining({ message: 'LINE profile request timed out' })
      );
      expect(vi.getTimerCount()).toBe(0);
    });

    it('waits up to 3 seconds by default', async () => {
      vi.useFakeTimers();
      const { repository, service } = setup({}, vi.fn(() => new Promise(() => {})));
      service.ensureUser('U1');

      await vi.advanceTimersByTimeAsync(2999);
      expect(repository.createUser).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(repository.createUser).toHaveBeenCalled();
    });

    it('clears the timer when LINE profile answers in time', async () => {
      vi.useFakeTimers();
      const { service } = setup();

      await service.ensureUser('U1');

      expect(vi.getTimerCount()).toBe(0);
    });
  });
});

describe('userService.ensureUser with a token name', () => {
  const existing = () => ({ findUserIdByLineId: vi.fn().mockResolvedValue('user-9') });

  it('fills a missing display name for an existing user', async () => {
    const { repository, service } = setup(existing());

    expect(await service.ensureUser('U1', { tokenName: 'Aom' })).toBe('user-9');
    expect(repository.fillMissingDisplayName).toHaveBeenCalledWith('user-9', 'Aom');
  });

  it('checks each user only once per process', async () => {
    const { repository, service } = setup(existing());

    await service.ensureUser('U1', { tokenName: 'Aom' });
    await service.ensureUser('U1', { tokenName: 'Aom' });

    expect(repository.fillMissingDisplayName).toHaveBeenCalledTimes(1);
  });

  it('does not write when no token name is given', async () => {
    const { repository, service } = setup(existing());

    await service.ensureUser('U1');
    await service.ensureUser('U1', { tokenName: null });

    expect(repository.fillMissingDisplayName).not.toHaveBeenCalled();
  });

  it('fills the name of a new user when the LINE profile could not be fetched', async () => {
    const { repository, service } = setup({}, vi.fn().mockRejectedValue(new Error('404')));

    await service.ensureUser('U1', { tokenName: 'Aom' });

    expect(repository.fillMissingDisplayName).toHaveBeenCalledWith('user-1', 'Aom');
  });

  it('skips the fill when the new user already got a name from the profile', async () => {
    const { repository, service } = setup();

    await service.ensureUser('U1', { tokenName: 'Aom' });

    expect(repository.fillMissingDisplayName).not.toHaveBeenCalled();
  });

  it('ignores a failed fill, logs without the name and retries next time', async () => {
    const fillMissingDisplayName = vi.fn().mockRejectedValueOnce(new Error('db down')).mockResolvedValue();
    const { logger, service } = setup({ ...existing(), fillMissingDisplayName });

    expect(await service.ensureUser('U1', { tokenName: 'Aom' })).toBe('user-9');
    expect(logger.error).toHaveBeenCalledWith('Failed to fill display name', { userId: 'user-9' }, expect.any(Error));
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain('Aom');

    await service.ensureUser('U1', { tokenName: 'Aom' });
    expect(fillMissingDisplayName).toHaveBeenCalledTimes(2);
  });
});

describe('userService.loadCategoryIds', () => {
  it('returns categories when the user already has them', async () => {
    const { repository, service } = setup();

    const ids = await service.loadCategoryIds('user-1');

    expect(ids.get('expense:อาหาร')).toBe('c1');
    expect(repository.seedDefaultCategories).not.toHaveBeenCalled();
  });

  it('seeds default categories and reloads when the user has none', async () => {
    const getCategoryIds = vi
      .fn()
      .mockResolvedValueOnce(new Map())
      .mockResolvedValueOnce(new Map([['expense:อาหาร', 'c1']]));
    const { repository, service } = setup({ getCategoryIds });

    const ids = await service.loadCategoryIds('user-1');

    expect(repository.seedDefaultCategories).toHaveBeenCalledWith('user-1', DEFAULT_CATEGORIES);
    expect(ids.get('expense:อาหาร')).toBe('c1');
  });

  // ผู้ใช้ที่สมัครก่อนมีหมวดใหม่ (เช่นหมวดสลิป) ต้องได้หมวดนั้นก่อนบันทึก ไม่งั้นรายการตกไปอยู่ อื่นๆ
  it('seeds the missing system categories and reloads', async () => {
    const all = Object.entries(DEFAULT_CATEGORIES).flatMap(([type, names]) => names.map((name) => `${type}:${name}`));
    const withoutSlip = new Map(all.filter((key) => key !== 'expense:ใบเสร็จ/สลิปโอนเงิน').map((key, index) => [key, `c${index}`]));
    const full = new Map(all.map((key, index) => [key, `c${index}`]));
    const getCategoryIds = vi.fn().mockResolvedValueOnce(withoutSlip).mockResolvedValueOnce(full);
    const { repository, service } = setup({ getCategoryIds });

    const ids = await service.loadCategoryIds('user-1');

    expect(repository.seedDefaultCategories).toHaveBeenCalledWith('user-1', SYSTEM_CATEGORIES);
    expect(ids.has('expense:ใบเสร็จ/สลิปโอนเงิน')).toBe(true);
  });

  // ผู้ใช้เปลี่ยนชื่อหมวดเริ่มต้นได้ ถ้าเติมกลับจะมีหมวดชื่อเดิมงอกขึ้นมาซ้ำ
  it('does not seed when only a renamed default category is missing', async () => {
    const withoutFood = new Map([...ALL_DEFAULT_IDS].filter(([key]) => key !== 'expense:อาหาร'));
    const { repository, service } = setup({ getCategoryIds: vi.fn().mockResolvedValue(withoutFood) });

    const ids = await service.loadCategoryIds('user-1');

    expect(repository.seedDefaultCategories).not.toHaveBeenCalled();
    expect(ids).toBe(withoutFood);
  });

  it('passes visibleOnly to every category id lookup', async () => {
    const getCategoryIds = vi
      .fn()
      .mockResolvedValueOnce(new Map())
      .mockResolvedValueOnce(new Map([['expense:อาหาร', 'c1']]));
    const { service } = setup({ getCategoryIds });

    await service.loadCategoryIds('user-1', { visibleOnly: true });

    expect(getCategoryIds).toHaveBeenNthCalledWith(1, 'user-1', { visibleOnly: true });
    expect(getCategoryIds).toHaveBeenNthCalledWith(2, 'user-1', { visibleOnly: true });
  });

  it('rejects when seeding fails', async () => {
    const { service } = setup({
      getCategoryIds: vi.fn().mockResolvedValue(new Map()),
      seedDefaultCategories: vi.fn().mockRejectedValue(new Error('db down')),
    });

    await expect(service.loadCategoryIds('user-1')).rejects.toThrow('db down');
  });
});

describe('userService.loadTextCategories', () => {
  it('returns the visible category names by type for Claude', async () => {
    const { repository, service } = setup({
      listCategories: vi.fn().mockResolvedValue([
        { id: 'c1', name: 'ค่าแมว', type: 'expense', hidden: false },
        { id: 'c2', name: 'บันเทิง', type: 'expense', hidden: true },
        { id: 'c3', name: 'อื่นๆ', type: 'expense', hidden: false },
        { id: 'c4', name: 'อื่นๆ', type: 'income', hidden: false },
      ]),
    });

    expect(await service.loadTextCategories('user-1')).toEqual({ expense: ['ค่าแมว', 'อื่นๆ'], income: ['อื่นๆ'] });
    expect(repository.listCategories).toHaveBeenCalledWith('user-1');
  });

  it('rejects when the categories cannot be read', async () => {
    const { service } = setup({ listCategories: vi.fn().mockRejectedValue(new Error('db down')) });

    await expect(service.loadTextCategories('user-1')).rejects.toThrow('db down');
  });
});

describe('userService.loadWallets', () => {
  const card = { id: 'w-card', name: 'บัตรเครดิต', hidden: false, isDefault: false };

  it('returns the wallets when the cash wallet exists', async () => {
    const { repository, service } = setup();

    expect(await service.loadWallets('user-1')).toEqual([{ id: 'w-cash', name: 'เงินสด', hidden: false, isDefault: true }]);
    expect(repository.listWallets).toHaveBeenCalledWith('user-1');
    expect(repository.seedDefaultWallet).not.toHaveBeenCalled();
  });

  // ผู้ใช้ที่สมัครก่อนมีกระเป๋า หรือสร้างกระเป๋าตอนสมัครไม่สำเร็จ ต้องได้เงินสดก่อนใช้
  it('seeds the cash wallet and reloads when it is missing', async () => {
    const listWallets = vi
      .fn()
      .mockResolvedValueOnce([card])
      .mockResolvedValueOnce([{ id: 'w-cash', name: 'เงินสด', hidden: false, isDefault: true }, card]);
    const { repository, service } = setup({ listWallets });

    const wallets = await service.loadWallets('user-1');

    expect(repository.seedDefaultWallet).toHaveBeenCalledWith('user-1');
    expect(wallets.map((wallet) => wallet.name)).toEqual(['เงินสด', 'บัตรเครดิต']);
  });

  it('rejects when the wallets cannot be read', async () => {
    const { service } = setup({ listWallets: vi.fn().mockRejectedValue(new Error('db down')) });

    await expect(service.loadWallets('user-1')).rejects.toThrow('db down');
  });
});

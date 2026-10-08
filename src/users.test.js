import { describe, it, expect, vi, afterEach } from 'vitest';
import { createUserService } from './users.js';

function setup(repositoryOverrides = {}, getDisplayName = vi.fn().mockResolvedValue('Aom')) {
  const repository = {
    findUserIdByLineId: vi.fn().mockResolvedValue(null),
    createUser: vi.fn().mockResolvedValue('user-1'),
    seedDefaultCategories: vi.fn().mockResolvedValue(),
    getCategoryIds: vi.fn().mockResolvedValue(new Map([['expense:อาหาร', 'c1']])),
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

    expect(repository.seedDefaultCategories).toHaveBeenCalledWith('user-1');
    expect(ids.get('expense:อาหาร')).toBe('c1');
  });

  it('rejects when seeding fails', async () => {
    const { service } = setup({
      getCategoryIds: vi.fn().mockResolvedValue(new Map()),
      seedDefaultCategories: vi.fn().mockRejectedValue(new Error('db down')),
    });

    await expect(service.loadCategoryIds('user-1')).rejects.toThrow('db down');
  });
});

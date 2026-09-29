import { describe, it, expect, vi } from 'vitest';
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
});

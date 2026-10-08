import { describe, it, expect, vi } from 'vitest';
import { createFriendService, FALLBACK_DISPLAY_NAME } from './service.js';

function setup(overrides = {}) {
  const repository = {
    getFriendCode: vi.fn().mockResolvedValue('ABCD2345'),
    setFriendCode: vi.fn().mockResolvedValue(true),
    findUserByFriendCode: vi.fn().mockResolvedValue({ id: 'user-2', displayName: 'บี' }),
    listFriends: vi.fn().mockResolvedValue([]),
    addFriendship: vi.fn().mockResolvedValue(),
    removeFriendship: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
  const generateCode = vi.fn().mockReturnValueOnce('NEWC2345').mockReturnValueOnce('NEWD2345').mockReturnValue('NEWE2345');
  return { repository, generateCode, service: createFriendService({ repository, generateCode }) };
}

describe('friendService.getOverview', () => {
  it('returns the existing code and the friends sorted by Thai name, with a fallback name', async () => {
    const { service, repository } = setup({
      listFriends: vi.fn().mockResolvedValue([
        { id: 'user-3', displayName: 'ค่อม' },
        { id: 'user-2', displayName: 'กบ' },
        { id: 'user-4', displayName: null },
      ]),
    });

    expect(await service.getOverview('user-1')).toEqual({
      code: 'ABCD2345',
      friends: [
        { id: 'user-2', displayName: 'กบ' },
        { id: 'user-3', displayName: 'ค่อม' },
        { id: 'user-4', displayName: FALLBACK_DISPLAY_NAME },
      ],
    });
    expect(repository.setFriendCode).not.toHaveBeenCalled();
  });

  it('assigns a code the first time, retrying when a code clashes', async () => {
    const { service, repository } = setup({
      getFriendCode: vi.fn().mockResolvedValue(null),
      setFriendCode: vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true),
    });

    expect((await service.getOverview('user-1')).code).toBe('NEWD2345');
    expect(repository.setFriendCode.mock.calls).toEqual([
      ['user-1', 'NEWC2345'],
      ['user-1', 'NEWD2345'],
    ]);
  });

  it('gives up after five clashes', async () => {
    const { service, repository } = setup({
      getFriendCode: vi.fn().mockResolvedValue(null),
      setFriendCode: vi.fn().mockResolvedValue(false),
    });

    await expect(service.getOverview('user-1')).rejects.toThrow('Could not assign a unique friend code');
    expect(repository.setFriendCode).toHaveBeenCalledTimes(5);
  });
});

describe('friendService.lookup and addByCode', () => {
  it('normalizes the code and returns the owner', async () => {
    const { service, repository } = setup();

    expect(await service.lookup('user-1', 'abcd-wxyz')).toEqual({ status: 'ok', friend: { id: 'user-2', displayName: 'บี' } });
    expect(repository.findUserByFriendCode).toHaveBeenCalledWith('ABCDWXYZ');
  });

  it('reports an invalid code without asking the database', async () => {
    const { service, repository } = setup();

    expect(await service.lookup('user-1', 'nope')).toEqual({ status: 'invalid' });
    expect(repository.findUserByFriendCode).not.toHaveBeenCalled();
  });

  it('reports an unknown code and the user own code', async () => {
    const unknown = setup({ findUserByFriendCode: vi.fn().mockResolvedValue(null) });
    const self = setup({ findUserByFriendCode: vi.fn().mockResolvedValue({ id: 'user-1', displayName: 'เอ' }) });

    expect(await unknown.service.lookup('user-1', 'ABCD2345')).toEqual({ status: 'not_found' });
    expect(await self.service.lookup('user-1', 'ABCD2345')).toEqual({ status: 'self' });
  });

  it('adds the friendship only when the lookup succeeds', async () => {
    const ok = setup();
    const self = setup({ findUserByFriendCode: vi.fn().mockResolvedValue({ id: 'user-1', displayName: 'เอ' }) });

    expect(await ok.service.addByCode('user-1', 'ABCD2345')).toEqual({ status: 'ok', friend: { id: 'user-2', displayName: 'บี' } });
    expect(ok.repository.addFriendship).toHaveBeenCalledWith('user-1', 'user-2');
    expect(await self.service.addByCode('user-1', 'ABCD2345')).toEqual({ status: 'self' });
    expect(self.repository.addFriendship).not.toHaveBeenCalled();
  });
});

describe('friendService.remove and regenerateCode', () => {
  it('removes through the repository', async () => {
    const { service, repository } = setup({ removeFriendship: vi.fn().mockResolvedValue(false) });

    expect(await service.remove('user-1', 'user-2')).toBe(false);
    expect(repository.removeFriendship).toHaveBeenCalledWith('user-1', 'user-2');
  });

  it('stores and returns a fresh code', async () => {
    const { service, repository } = setup();

    expect(await service.regenerateCode('user-1')).toBe('NEWC2345');
    expect(repository.setFriendCode).toHaveBeenCalledWith('user-1', 'NEWC2345');
  });
});

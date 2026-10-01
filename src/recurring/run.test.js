import { describe, it, expect, vi } from 'vitest';
import { createRecurringRunner } from './run.js';

const NOW = new Date('2026-10-05T03:00:00Z');

function rule(overrides = {}) {
  return {
    id: 'r1',
    userId: 'user-1',
    lineUserId: 'U1',
    type: 'expense',
    categoryId: 'c1',
    categoryName: 'ค่าสาธารณูปโภค',
    amount: 590,
    note: 'ค่าเน็ต',
    dayOfMonth: 5,
    active: true,
    lastRunOn: null,
    ...overrides,
  };
}

function setup(rules = [rule()]) {
  const repository = {
    listDueRecurringRules: vi.fn().mockResolvedValue(rules),
    applyRecurringRule: vi.fn().mockResolvedValue(true),
  };
  const pushText = vi.fn().mockResolvedValue();
  const logger = { error: vi.fn() };
  const run = createRecurringRunner({ repository, pushText, now: () => NOW, logger });
  return { repository, pushText, logger, run };
}

describe('createRecurringRunner', () => {
  it('asks for the rules due today in Bangkok time', async () => {
    const { repository, run } = setup([]);

    await run();

    expect(repository.listDueRecurringRules).toHaveBeenCalledWith('2026-10-05');
  });

  it('applies a due rule with a per month event id and pushes a notice with an undo button', async () => {
    const { repository, pushText, run } = setup();

    const result = await run();

    expect(repository.applyRecurringRule).toHaveBeenCalledWith({
      ruleId: 'r1',
      dueOn: '2026-10-05',
      eventId: 'recurring:r1:2026-10',
    });
    expect(pushText).toHaveBeenCalledWith(
      'U1',
      'บันทึกรายการประจำให้อัตโนมัติ\n- รายจ่าย | ค่าสาธารณูปโภค | 590 บาท | 05/10 | ค่าเน็ต',
      [
        {
          type: 'action',
          action: {
            type: 'postback',
            label: 'ยกเลิก',
            data: 'action=undo&event=recurring%3Ar1%3A2026-10',
            displayText: 'ยกเลิก',
          },
        },
      ]
    );
    expect(result).toEqual({ due: 1, created: 1, skipped: 0, failed: 0, pushFailed: 0 });
  });

  it('skips a rule the database says was already applied and sends nothing', async () => {
    const { repository, pushText, run } = setup();
    repository.applyRecurringRule.mockResolvedValue(false);

    expect(await run()).toEqual({ due: 1, created: 0, skipped: 1, failed: 0, pushFailed: 0 });
    expect(pushText).not.toHaveBeenCalled();
  });

  it('ignores rules that are not due according to the schedule', async () => {
    const { repository, run } = setup([rule({ dayOfMonth: 20 }), rule({ id: 'r2', lastRunOn: '2026-10-01' })]);

    expect(await run()).toEqual({ due: 0, created: 0, skipped: 0, failed: 0, pushFailed: 0 });
    expect(repository.applyRecurringRule).not.toHaveBeenCalled();
  });

  it('uses the last day of a short month as the date', async () => {
    const { repository } = setup([rule({ dayOfMonth: 31 })]);
    const feb = createRecurringRunner({
      repository,
      pushText: vi.fn().mockResolvedValue(),
      now: () => new Date('2026-02-28T03:00:00Z'),
      logger: { error: vi.fn() },
    });

    await feb();

    expect(repository.applyRecurringRule).toHaveBeenCalledWith({
      ruleId: 'r1',
      dueOn: '2026-02-28',
      eventId: 'recurring:r1:2026-02',
    });
  });

  it('keeps going and counts a failure when one rule throws, without logging amounts', async () => {
    const { repository, pushText, logger, run } = setup([rule(), rule({ id: 'r2', amount: 100 })]);
    repository.applyRecurringRule.mockRejectedValueOnce(new Error('db down'));

    const result = await run();

    expect(result).toEqual({ due: 2, created: 1, skipped: 0, failed: 1, pushFailed: 0 });
    expect(pushText).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith('Failed to apply recurring rule', { ruleId: 'r1', reason: 'db down' });
  });

  it('still counts the rule as created when the push fails', async () => {
    const { pushText, logger, run } = setup();
    pushText.mockRejectedValue(new Error('push failed'));

    expect(await run()).toEqual({ due: 1, created: 1, skipped: 0, failed: 0, pushFailed: 1 });
    expect(logger.error).toHaveBeenCalledWith('Failed to push recurring notice', { ruleId: 'r1', reason: 'push failed' });
  });

  it('counts a failed push in pushFailed', async () => {
    const { pushText, run } = setup();
    pushText.mockRejectedValue(new Error('push failed'));

    expect((await run()).pushFailed).toBe(1);
  });

  it('pushes each notice to the owner of the rule', async () => {
    const { pushText, run } = setup([rule(), rule({ id: 'r2', lineUserId: 'U2' })]);

    await run();

    expect(pushText).toHaveBeenCalledTimes(2);
    expect(pushText.mock.calls[0][0]).toBe('U1');
    expect(pushText.mock.calls[0][2][0].action.data).toContain('recurring%3Ar1%3A');
    expect(pushText.mock.calls[1][0]).toBe('U2');
    expect(pushText.mock.calls[1][2][0].action.data).toContain('recurring%3Ar2%3A');
  });

  it('keeps pushing the next rules after one push fails', async () => {
    const { pushText, run } = setup([rule(), rule({ id: 'r2', lineUserId: 'U2' })]);
    pushText.mockRejectedValueOnce(new Error('push failed'));

    const result = await run();

    expect(pushText).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ due: 2, created: 2, skipped: 0, failed: 0, pushFailed: 1 });
  });

  it('counts a throw while building the notice as a failed push and keeps going', async () => {
    const { repository, pushText, logger } = setup();
    const badRule = rule({ id: 'r1' });
    Object.defineProperty(badRule, 'categoryName', {
      get() {
        throw new Error('build failed');
      },
    });
    repository.listDueRecurringRules.mockResolvedValue([badRule, rule({ id: 'r2', lineUserId: 'U2' })]);
    const runner = createRecurringRunner({ repository, pushText, now: () => NOW, logger });

    const result = await runner();

    expect(result).toEqual({ due: 2, created: 2, skipped: 0, failed: 0, pushFailed: 1 });
    expect(pushText).toHaveBeenCalledTimes(1);
    expect(pushText.mock.calls[0][0]).toBe('U2');
    expect(logger.error).toHaveBeenCalledWith('Failed to push recurring notice', { ruleId: 'r1', reason: 'build failed' });
  });

  it('does not put row details from a database error into the logs', async () => {
    const { repository, logger, run } = setup();
    const dbError = Object.assign(new Error('insert failed'), {
      cause: { details: 'Failing row contains (r1, 590, ค่าเน็ตลับ)' },
    });
    repository.applyRecurringRule.mockRejectedValue(dbError);

    await run();

    const logged = JSON.stringify(logger.error.mock.calls);
    expect(logged).not.toContain('590');
    expect(logged).not.toContain('ค่าเน็ตลับ');
    expect(logger.error.mock.calls[0]).toEqual(['Failed to apply recurring rule', { ruleId: 'r1', reason: 'insert failed' }]);
  });

  it('lets a failure to list rules propagate so the endpoint answers 500', async () => {
    const { repository, run } = setup();
    repository.listDueRecurringRules.mockRejectedValue(new Error('db down'));

    await expect(run()).rejects.toThrow('db down');
  });
});

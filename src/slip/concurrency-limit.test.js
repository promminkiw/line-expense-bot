import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const { createConcurrencyLimit } = createRequire(import.meta.url)('./concurrency-limit.js');

const tick = () => new Promise((resolve) => setImmediate(resolve));

describe('createConcurrencyLimit', () => {
  it('never runs more than max tasks at once and drains the queue', async () => {
    const run = createConcurrencyLimit(2);
    let inFlight = 0;
    let maxInFlight = 0;
    let finished = 0;
    const task = async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await tick();
      inFlight -= 1;
      finished += 1;
    };

    await Promise.all(Array.from({ length: 7 }, () => run(task)));

    expect(maxInFlight).toBe(2);
    expect(finished).toBe(7);
  });

  it('returns each task result to its own caller', async () => {
    const run = createConcurrencyLimit(2);
    const results = await Promise.all([1, 2, 3, 4].map((n) => run(async () => n * 10)));

    expect(results).toEqual([10, 20, 30, 40]);
  });

  it('starts queued tasks in the order they were submitted', async () => {
    const run = createConcurrencyLimit(1);
    const started = [];

    await Promise.all(
      ['a', 'b', 'c'].map((name) =>
        run(async () => {
          started.push(name);
          await tick();
        })
      )
    );

    expect(started).toEqual(['a', 'b', 'c']);
  });

  it('frees the slot and rethrows when a task rejects', async () => {
    const run = createConcurrencyLimit(1);
    const error = new Error('boom');

    const failing = run(async () => {
      throw error;
    });
    const next = run(async () => 'ok');

    await expect(failing).rejects.toBe(error);
    await expect(next).resolves.toBe('ok');
  });

  it('frees the slot when a task throws synchronously', async () => {
    const run = createConcurrencyLimit(1);
    const error = new Error('sync boom');

    await expect(
      run(() => {
        throw error;
      })
    ).rejects.toBe(error);
    await expect(run(async () => 'after')).resolves.toBe('after');
  });
});

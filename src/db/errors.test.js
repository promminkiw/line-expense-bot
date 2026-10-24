import { inspect } from 'node:util';
import { describe, it, expect } from 'vitest';
import { DatabaseError } from './errors.js';

describe('DatabaseError', () => {
  const postgrestError = { message: 'insert failed', code: '23502', hint: 'check the column', details: 'Failing row contains (590, ค่าเน็ต)' };

  it('keeps the message format and only the safe fields of the cause', () => {
    const err = new DatabaseError('createTransaction', postgrestError);

    expect(err.message).toBe('Database createTransaction failed: insert failed');
    expect(err.cause).toEqual({ message: 'insert failed', code: '23502', hint: 'check the column' });
  });

  it('never exposes details through JSON or util.inspect', () => {
    const err = new DatabaseError('createTransaction', postgrestError);

    expect(JSON.stringify(err.cause)).not.toContain('details');
    expect(JSON.stringify(err.cause)).not.toContain('590');
    expect(inspect(err, { depth: 5 })).not.toContain('details');
    expect(inspect(err, { depth: 5 })).not.toContain('ค่าเน็ต');
  });

  it('omits safe fields that the original error does not have', () => {
    expect(new DatabaseError('x', { message: 'boom' }).cause).toEqual({ message: 'boom' });
  });
});

import { describe, it, expect } from 'vitest';
import { parseEditLink } from './deep-link.mjs';

const ID = '7b1c9d5e-3f2a-4c8b-9a6d-1e2f3a4b5c6d';

describe('parseEditLink', () => {
  it('reads the transaction id and date from the query string', () => {
    expect(parseEditLink(`?tx=${ID}&d=2026-09-29`)).toEqual({ id: ID, date: '2026-09-29' });
  });

  it('reads them from the liff.state wrapper LINE adds after login', () => {
    const state = encodeURIComponent(`?tx=${ID}&d=2026-09-29`);

    expect(parseEditLink(`?liff.state=${state}`)).toEqual({ id: ID, date: '2026-09-29' });
  });

  it('returns null when there is no transaction id', () => {
    expect(parseEditLink('')).toBeNull();
    expect(parseEditLink('?d=2026-09-29')).toBeNull();
    expect(parseEditLink('?tx=')).toBeNull();
  });

  it('returns null for an id with unexpected characters', () => {
    expect(parseEditLink('?tx=%3Cscript%3E')).toBeNull();
    expect(parseEditLink(`?tx=${'a'.repeat(65)}`)).toBeNull();
  });

  it('keeps the id but drops a date that is not a real calendar date', () => {
    expect(parseEditLink(`?tx=${ID}&d=2026-13-40`)).toEqual({ id: ID, date: null });
    expect(parseEditLink(`?tx=${ID}&d=hello`)).toEqual({ id: ID, date: null });
    expect(parseEditLink(`?tx=${ID}`)).toEqual({ id: ID, date: null });
  });
});

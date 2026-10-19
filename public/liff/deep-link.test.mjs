import { describe, it, expect } from 'vitest';
import { parseEditLink, parseFriendLink, parseBillLink, parseTabLink, parseListLink, isBillsPageLink } from './deep-link.mjs';

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

describe('parseFriendLink', () => {
  it('reads the friend code from the query or from liff.state after login', () => {
    expect(parseFriendLink('?friend=abcd-2345')).toBe('ABCD2345');
    expect(parseFriendLink(`?liff.state=${encodeURIComponent('?friend=ABCD2345')}`)).toBe('ABCD2345');
  });

  it('ignores a missing or malformed code', () => {
    expect(parseFriendLink('')).toBeNull();
    expect(parseFriendLink('?tx=abc')).toBeNull();
    expect(parseFriendLink('?friend=<script>')).toBeNull();
  });
});

describe('parseBillLink', () => {
  const BILL = '55555555-5555-5555-5555-555555555555';

  it('reads a bill id from the query or from liff.state', () => {
    expect(parseBillLink(`?bill=${BILL}`)).toBe(BILL);
    expect(parseBillLink(`?liff.state=${encodeURIComponent(`?bill=${BILL}`)}`)).toBe(BILL);
  });

  it('ignores anything that is not a UUID', () => {
    expect(parseBillLink('?bill=abc')).toBeNull();
    expect(parseBillLink('')).toBeNull();
  });
});

describe('parseTabLink', () => {
  const TAB_IDS = ['list', 'bills'];

  it('reads a known tab id from the query or from liff.state', () => {
    expect(parseTabLink('?tab=bills', TAB_IDS)).toBe('bills');
    expect(parseTabLink(`?liff.state=${encodeURIComponent('?tab=bills')}`, TAB_IDS)).toBe('bills');
  });

  it('ignores unknown or missing tabs', () => {
    expect(parseTabLink('?tab=admin', TAB_IDS)).toBeNull();
    expect(parseTabLink('?tab=', TAB_IDS)).toBeNull();
    expect(parseTabLink('', TAB_IDS)).toBeNull();
  });
});

describe('isBillsPageLink', () => {
  const BILL = '55555555-5555-5555-5555-555555555555';

  it('is true for the rich menu link and for a bill link, also inside liff.state', () => {
    expect(isBillsPageLink('?tab=bills')).toBe(true);
    expect(isBillsPageLink(`?bill=${BILL}`)).toBe(true);
    expect(isBillsPageLink(`?liff.state=${encodeURIComponent('?tab=bills')}`)).toBe(true);
  });

  it('is false for the main web and for a friend invite even with a bill', () => {
    expect(isBillsPageLink('')).toBe(false);
    expect(isBillsPageLink('?tab=profile')).toBe(false);
    expect(isBillsPageLink('?bill=abc')).toBe(false);
    expect(isBillsPageLink(`?friend=ABCD2345&bill=${BILL}`)).toBe(false);
  });
});

describe('parseListLink', () => {
  it('reads month, query and type from the query string', () => {
    const search = `?tab=list&m=2026-10&q=${encodeURIComponent('กาแฟ')}&type=expense`;

    expect(parseListLink(search)).toEqual({ month: '2026-10', query: 'กาแฟ', category: '', type: 'expense' });
  });

  it('reads them from the liff.state wrapper LINE adds after login', () => {
    const state = encodeURIComponent(`?tab=list&m=2026-10&q=${encodeURIComponent('กาแฟ')}&type=income`);

    expect(parseListLink(`?liff.state=${state}`)).toEqual({ month: '2026-10', query: 'กาแฟ', category: '', type: 'income' });
  });

  it('fills the parts that are missing or invalid with empty values', () => {
    expect(parseListLink('?m=2026-10')).toEqual({ month: '2026-10', query: '', category: '', type: '' });
    expect(parseListLink('?m=2026-13&q=a&type=all')).toEqual({ month: '', query: 'a', category: '', type: '' });
    expect(parseListLink('?m=abc&type=income')).toEqual({ month: '', query: '', category: '', type: 'income' });
  });

  it('trims the query and cuts it to the 50 characters the search box accepts', () => {
    expect(parseListLink('?q=%20%20abc%20%20').query).toBe('abc');
    expect(parseListLink(`?q=${'x'.repeat(80)}`).query).toBe('x'.repeat(50));
  });

  it('reads the category name, trims it and cuts it to 30 characters', () => {
    expect(parseListLink(`?c=${encodeURIComponent(' อาหาร ')}`)).toEqual({ month: '', query: '', category: 'อาหาร', type: '' });
    expect(parseListLink(`?c=${'ก'.repeat(50)}`).category).toBe('ก'.repeat(30));
  });

  it('returns null when the link carries no list filter', () => {
    expect(parseListLink('')).toBeNull();
    expect(parseListLink('?tab=list')).toBeNull();
    expect(parseListLink('?m=2026-13&type=all&q=%20')).toBeNull();
  });
});

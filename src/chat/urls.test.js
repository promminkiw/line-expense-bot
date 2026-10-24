import { describe, expect, it } from 'vitest';
import { createUrlBuilders } from './urls';

const LIFF_URL = 'https://liff.line.me/liff-1';

describe('createUrlBuilders buildEditUrl', () => {
  it('links the transaction and its date', () => {
    const { buildEditUrl } = createUrlBuilders({ liffUrl: LIFF_URL });

    expect(buildEditUrl('tx-1', '2026-09-29')).toBe(`${LIFF_URL}?tx=tx-1&d=2026-09-29`);
  });

  it('leaves the date out when it is not a plain YYYY-MM-DD date', () => {
    const { buildEditUrl } = createUrlBuilders({ liffUrl: LIFF_URL });

    expect(buildEditUrl('tx-1', '2026-09-29 \n')).toBe(`${LIFF_URL}?tx=tx-1`);
  });

  it('encodes the id and rejects a url that is not https', () => {
    const { buildEditUrl } = createUrlBuilders({ liffUrl: LIFF_URL });
    const noScheme = createUrlBuilders({ liffUrl: 'liff.line.me/no-scheme' });

    expect(buildEditUrl('a b[1]')).toBe('https://liff.line.me/liff-1?tx=a+b%5B1%5D');
    expect(noScheme.buildEditUrl('tx-1')).toBeUndefined();
  });
});

describe('createUrlBuilders buildEditUrls', () => {
  it('links every row to its own transaction', () => {
    const { buildEditUrls } = createUrlBuilders({ liffUrl: LIFF_URL });
    const rows = [{ occurred_on: '2026-09-28' }, { occurred_on: '2026-09-28' }];

    expect(buildEditUrls(rows, ['tx-a', 'tx-b'])).toEqual([
      `${LIFF_URL}?tx=tx-a&d=2026-09-28`,
      `${LIFF_URL}?tx=tx-b&d=2026-09-28`,
    ]);
  });

  it('adds no links without ids or without a web page', () => {
    const rows = [{ occurred_on: '2026-09-29' }];

    expect(createUrlBuilders({ liffUrl: LIFF_URL }).buildEditUrls(rows, undefined)).toBeUndefined();
    expect(createUrlBuilders({}).buildEditUrls(rows, ['tx-1'])).toBeUndefined();
  });
});

describe('createUrlBuilders buildGoalsUrl', () => {
  it('opens the goals tab', () => {
    const { buildGoalsUrl } = createUrlBuilders({ liffUrl: LIFF_URL });

    expect(buildGoalsUrl()).toBe(`${LIFF_URL}?tab=goals`);
  });

  it('has no link without a web page', () => {
    expect(createUrlBuilders({}).buildGoalsUrl()).toBeUndefined();
  });
});

describe('createUrlBuilders buildTotalsListUrl', () => {
  const question = { keyword: 'กาแฟ', category: undefined, wallet: undefined, type: 'expense', to: '2026-10-25' };
  const paramsOf = (url) => Object.fromEntries(new URL(url).searchParams);

  it('opens the list of the end month filtered by keyword and type', () => {
    const { buildTotalsListUrl } = createUrlBuilders({ liffUrl: LIFF_URL });
    const url = new URL(buildTotalsListUrl(question));

    expect(url.origin + url.pathname).toBe(LIFF_URL);
    expect(paramsOf(url.toString())).toEqual({ tab: 'list', m: '2026-10', q: 'กาแฟ', type: 'expense' });
  });

  it('sends category and wallet and leaves the type out for both', () => {
    const { buildTotalsListUrl } = createUrlBuilders({ liffUrl: LIFF_URL });
    const url = buildTotalsListUrl({ ...question, keyword: '', category: 'อาหาร', wallet: 'บัตรเครดิต', type: 'both', to: '2026-09-30' });

    expect(paramsOf(url)).toEqual({ tab: 'list', m: '2026-09', c: 'อาหาร', w: 'บัตรเครดิต' });
  });

  it('has no link without a web page, for http, or past the URI limit', () => {
    expect(createUrlBuilders({}).buildTotalsListUrl(question)).toBeUndefined();
    expect(createUrlBuilders({ liffUrl: 'http://liff.line.me/liff-1' }).buildTotalsListUrl(question)).toBeUndefined();
    expect(createUrlBuilders({ liffUrl: LIFF_URL }).buildTotalsListUrl({ ...question, keyword: 'ก'.repeat(200) })).toBeUndefined();
  });
});

import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  DEFAULT_WALLET_NAME,
  MAX_VISIBLE_WALLETS,
  MAX_TOTAL_WALLETS,
  isDefaultWallet,
  walletChoices,
  walletQuestionNames,
  walletIdsByName,
} = require('./wallets.js');

const CASH = { id: 'w-cash', name: 'เงินสด', hidden: false, isDefault: true };
const CARD = { id: 'w-card', name: 'บัตรเครดิต', hidden: false, isDefault: false };
const OLD = { id: 'w-old', name: 'บัญชีเก่า', hidden: true, isDefault: false };

describe('wallet constants', () => {
  it('names the default wallet cash and caps the wallet counts', () => {
    expect(DEFAULT_WALLET_NAME).toBe('เงินสด');
    expect(MAX_VISIBLE_WALLETS).toBe(10);
    expect(MAX_TOTAL_WALLETS).toBe(20);
    expect(isDefaultWallet('เงินสด')).toBe(true);
    expect(isDefaultWallet('บัตรเครดิต')).toBe(false);
  });
});

describe('walletChoices', () => {
  it('offers nothing to a user with one visible wallet', () => {
    expect(walletChoices([CASH])).toEqual([]);
    expect(walletChoices([CASH, OLD])).toEqual([]);
    expect(walletChoices([])).toEqual([]);
  });

  it('offers the visible wallets with cash first', () => {
    expect(walletChoices([CARD, OLD, CASH])).toEqual(['เงินสด', 'บัตรเครดิต']);
  });
});

describe('walletQuestionNames', () => {
  it('includes hidden wallets because old entries can be asked about', () => {
    expect(walletQuestionNames([CASH, OLD])).toEqual(['เงินสด', 'บัญชีเก่า']);
  });

  it('returns nothing for a single wallet', () => {
    expect(walletQuestionNames([CASH])).toEqual([]);
  });
});

describe('walletIdsByName', () => {
  it('maps only visible wallets that are not the default one', () => {
    expect(walletIdsByName([CASH, CARD, OLD])).toEqual(new Map([['บัตรเครดิต', 'w-card']]));
  });
});

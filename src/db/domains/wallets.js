const { throwIfError, UNIQUE_VIOLATION } = require('../errors');
const { DEFAULT_WALLET_NAME } = require('../../wallets/wallets');

const WALLET_COLUMNS = 'id, name, hidden';

function toWallet(row) {
  return { id: row.id, name: row.name, hidden: row.hidden, isDefault: row.name === DEFAULT_WALLET_NAME };
}

function createWalletsRepository(supabase) {
  async function listWallets(userId) {
    const { data, error } = await supabase
      .from('wallets')
      .select(WALLET_COLUMNS)
      .eq('user_id', userId)
      .order('created_at')
      .order('name');
    throwIfError('listWallets', error);
    return data.map(toWallet);
  }

  // ignoreDuplicates กันสมัครพร้อมกันหลาย event แล้วชน unique (user_id, name)
  async function seedDefaultWallet(userId) {
    const { error } = await supabase
      .from('wallets')
      .upsert({ user_id: userId, name: DEFAULT_WALLET_NAME }, { onConflict: 'user_id,name', ignoreDuplicates: true });
    throwIfError('seedDefaultWallet', error);
  }

  // ชื่อซ้ำชน unique (user_id, name) จึงคืน duplicate ให้ API ตอบ 409
  async function createWallet(userId, { name }) {
    const { data, error } = await supabase
      .from('wallets')
      .insert({ user_id: userId, name })
      .select(WALLET_COLUMNS)
      .single();
    if (error && error.code === UNIQUE_VIOLATION) {
      return { status: 'duplicate' };
    }
    throwIfError('createWallet', error);
    return { status: 'ok', wallet: toWallet(data) };
  }

  async function updateWallet(userId, id, fields) {
    const changes = {};
    if (fields.name !== undefined) changes.name = fields.name;
    if (fields.hidden !== undefined) changes.hidden = fields.hidden;
    const { data, error } = await supabase
      .from('wallets')
      .update(changes)
      .eq('user_id', userId)
      .eq('id', id)
      .select(WALLET_COLUMNS);
    if (error && error.code === UNIQUE_VIOLATION) {
      return { status: 'duplicate' };
    }
    throwIfError('updateWallet', error);
    return data.length > 0 ? { status: 'ok', wallet: toWallet(data[0]) } : { status: 'not_found' };
  }

  async function getWalletTotals(userId) {
    const { data, error } = await supabase.rpc('wallet_totals', { p_user_id: userId });
    throwIfError('getWalletTotals', error);
    return data.map((row) => ({
      ...toWallet({ id: row.wallet_id, name: row.name, hidden: row.hidden }),
      income: Number(row.income),
      expense: Number(row.expense),
      entryCount: Number(row.entry_count),
    }));
  }

  return {
    listWallets,
    seedDefaultWallet,
    createWallet,
    updateWallet,
    getWalletTotals,
  };
}

module.exports = { createWalletsRepository };

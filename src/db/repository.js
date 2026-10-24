const { DatabaseError } = require('./errors');
const { createNotificationsRepository } = require('./domains/notifications');
const { createWalletsRepository } = require('./domains/wallets');
const { createCategoriesRepository } = require('./domains/categories');
const { createExportsRepository } = require('./domains/exports');
const { createPendingRepository } = require('./domains/pending');
const { createUsersRepository } = require('./domains/users');
const { createStatsRepository } = require('./domains/stats');
const { createTransactionsRepository } = require('./domains/transactions');
const { createRecurringRepository } = require('./domains/recurring');
const { createBudgetsRepository } = require('./domains/budgets');
const { createGoalsRepository } = require('./domains/goals');
const { createFriendsRepository } = require('./domains/friends');
const { createBillsRepository } = require('./domains/bills');

function createRepository(supabase) {
  return {
    ...createNotificationsRepository(supabase),
    ...createUsersRepository(supabase),
    ...createExportsRepository(supabase),
    ...createPendingRepository(supabase),
    ...createWalletsRepository(supabase),
    ...createCategoriesRepository(supabase),
    ...createStatsRepository(supabase),
    ...createTransactionsRepository(supabase),
    ...createRecurringRepository(supabase),
    ...createBudgetsRepository(supabase),
    ...createGoalsRepository(supabase),
    ...createFriendsRepository(supabase),
    ...createBillsRepository(supabase),
  };
}

module.exports = { createRepository, DatabaseError };

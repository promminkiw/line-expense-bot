import { describe, it, expect } from 'vitest';
import { createRepository } from './repository.js';

const EXPECTED_METHODS = [
  'addFriendship', 'addGoalContribution', 'applyRecurringRule', 'cancelBill', 'claimEvent',
  'claimExportLink', 'claimPendingSlip', 'clearPendingClarification', 'confirmBillShare',
  'countCategoryUsage', 'createBill', 'createCategory', 'createExportLink', 'createGoal',
  'createRecurringRule', 'createUser', 'createWallet', 'declineBillShare', 'deleteAllExpiredPendingSlips',
  'deleteCategory', 'deleteExpiredExportLinks', 'deleteExpiredPendingSlips', 'deleteGoalContribution',
  'deleteGoalContributionsByEvent', 'deleteRecurringRule', 'deleteTransaction', 'deleteTransactionsByEvent',
  'disableNotifications', 'fillMissingDisplayName', 'findUserByFriendCode', 'findUserIdByLineId',
  'getBillShare', 'getBudgetStatus', 'getCategoryIds', 'getDisplayName', 'getFriendCode',
  'getLifetimeTotals', 'getLineUserIds', 'getMonthlyTotals', 'getNotificationSettings',
  'getPendingClarification', 'getWalletTotals', 'insertTransactions', 'isBillOwner', 'listAllTransactions',
  'listDueRecurringRules', 'listFriends', 'listGoalContributions', 'listGoals', 'listIncomingBills',
  'listOwnedBills', 'listCategories', 'listRecurringRules', 'listTransactions', 'listUsersToRemind',
  'listWallets', 'listWeeklySummaryUsers', 'markBillMemberNotified', 'queryTotals', 'removeFriendship',
  'reserveNotification', 'savePendingClarification', 'savePendingSlip', 'seedDefaultCategories',
  'seedDefaultWallet', 'setBillMemberPaid', 'setBudget', 'setFriendCode', 'summarizeTransactions',
  'updateCategory', 'updateGoal', 'updateNotificationSettings', 'updateRecurringRule', 'updateTransaction',
  'updateWallet', 'listMonthlySummaryUsers', 'resumeMonthlySummary',
];

describe('createRepository surface', () => {
  it('exposes exactly the methods that callers depend on', () => {
    const methods = Object.keys(createRepository({})).sort();
    expect(methods).toEqual([...EXPECTED_METHODS].sort());
    expect(methods).toHaveLength(77);
  });

  it('exposes only functions', () => {
    for (const [name, value] of Object.entries(createRepository({}))) {
      expect(typeof value, name).toBe('function');
    }
  });
});

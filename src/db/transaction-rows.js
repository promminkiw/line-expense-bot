const { FALLBACK_CATEGORY } = require('../parser/categories');

function categoryKey(type, name) {
  return `${type}:${name}`;
}

function findCategoryId(categoryIds, item) {
  const categoryId =
    categoryIds.get(categoryKey(item.type, item.category)) ||
    categoryIds.get(categoryKey(item.type, FALLBACK_CATEGORY));
  if (!categoryId) {
    throw new Error(`No category for ${categoryKey(item.type, item.category)}`);
  }
  return categoryId;
}

function toTransactionRows({ items, categoryIds, userId, webhookEventId }) {
  return items.map((item) => ({
    user_id: userId,
    type: item.type,
    category_id: findCategoryId(categoryIds, item),
    amount: item.amount,
    note: item.note,
    occurred_on: item.date,
    source: 'text',
    line_event_id: webhookEventId,
  }));
}

module.exports = { categoryKey, toTransactionRows };

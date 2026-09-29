const { formatAmount } = require('../parser/format-reply');

// คำอธิบายเป็นส่วนเสริม ให้เวลาสั้นกว่าตอนแยกรายการเพื่อให้การ์ดยังตอบทันเวลา
const COMMENT_TIMEOUT_MS = 15000;

const SYSTEM_PROMPT = [
  'You write a short, friendly comment in Thai about a personal spending summary.',
  'Write at most two short sentences.',
  'Do not calculate anything and do not state any number that is not given.',
  'Do not use emoji.',
].join('\n');

function describeSummary(summary) {
  const lines = [
    `ช่วงเวลา: ${summary.label}`,
    `รายรับ: ${formatAmount(summary.incomeTotal)} บาท`,
    `รายจ่าย: ${formatAmount(summary.expenseTotal)} บาท`,
    `คงเหลือ: ${formatAmount(summary.net)} บาท`,
    'รายจ่ายตามหมวด:',
    ...summary.topExpenses.map((entry) => `- ${entry.category}: ${formatAmount(entry.total)} บาท`),
  ];
  if (summary.otherExpenseTotal > 0) {
    lines.push(`- หมวดอื่น: ${formatAmount(summary.otherExpenseTotal)} บาท`);
  }
  return lines.join('\n');
}

function createSummaryCommenter({ client, model }) {
  return async function commentSummary(summary) {
    const response = await client.messages.create(
      {
        model,
        max_tokens: 200,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: describeSummary(summary) }],
      },
      {
        timeout: COMMENT_TIMEOUT_MS,
        maxRetries: 1,
        signal: AbortSignal.timeout(COMMENT_TIMEOUT_MS),
      }
    );
    const textBlock = response.content.find((block) => block.type === 'text');
    const comment = textBlock ? textBlock.text.trim() : '';
    if (!comment) {
      throw new Error('Claude returned no comment');
    }
    return comment;
  };
}

module.exports = { createSummaryCommenter };

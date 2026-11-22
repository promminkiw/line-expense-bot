const { formatAmount } = require('../parser/format-reply');
const { displayCategoryName } = require('../parser/categories');
const { withLowEffort } = require('../utils/claude-effort');
const { PERSONA_PROMPT, personaPrompt } = require('../persona');

// คำอธิบายเป็นส่วนเสริม ให้เวลาสั้นกว่าตอนแยกรายการเพื่อให้การ์ดยังตอบทันเวลา
const COMMENT_TIMEOUT_MS = 15000;

const SYSTEM_PROMPT = [
  'You write a short, friendly comment in Thai about a personal spending summary.',
  PERSONA_PROMPT,
  'Write at most two short sentences.',
  'Do not calculate anything and do not state any number that is not given.',
  'Do not use emoji.',
].join('\n');

// prompt ต่อภาษาสร้างครั้งเดียว ไม่เปลี่ยนตามข้อความ
const ENGLISH_SYSTEM_PROMPT = [
  'You write a short, friendly comment in English about a personal spending summary.',
  personaPrompt('en'),
  'Write at most two short sentences.',
  'Do not calculate anything and do not state any number that is not given.',
  'Do not use emoji.',
].join('\n');

// ป้ายกำกับของสรุปที่ส่งให้ Claude ไม่ใช่ข้อความที่ผู้ใช้เห็น จึงไม่อยู่ในชุดแปล ค่า th ต้องคงเดิม
const SUMMARY_LABELS = {
  th: {
    period: 'ช่วงเวลา',
    income: 'รายรับ',
    expense: 'รายจ่าย',
    net: 'คงเหลือ',
    byCategory: 'รายจ่ายตามหมวด:',
    otherCategories: 'หมวดอื่น',
    currency: 'บาท',
  },
  en: {
    period: 'Period',
    income: 'Income',
    expense: 'Expenses',
    net: 'Balance',
    byCategory: 'Expenses by category:',
    otherCategories: 'Other categories',
    currency: 'baht',
  },
};

function describeSummary(summary, lang) {
  const labels = lang === 'en' ? SUMMARY_LABELS.en : SUMMARY_LABELS.th;
  const money = (amount) => `${formatAmount(amount)} ${labels.currency}`;
  const lines = [
    `${labels.period}: ${summary.label}`,
    `${labels.income}: ${money(summary.incomeTotal)}`,
    `${labels.expense}: ${money(summary.expenseTotal)}`,
    `${labels.net}: ${money(summary.net)}`,
  ];
  if (summary.topExpenses.length > 0) {
    lines.push(
      labels.byCategory,
      ...summary.topExpenses.map(
        (entry) => `- ${lang === 'en' ? displayCategoryName(lang, 'expense', entry.category) : entry.category}: ${money(entry.total)}`
      )
    );
  }
  if (summary.otherExpenseTotal > 0) {
    lines.push(`- ${labels.otherCategories}: ${money(summary.otherExpenseTotal)}`);
  }
  return lines.join('\n');
}

function createSummaryCommenter({ client, model }) {
  const effortConfig = withLowEffort(model);
  return async function commentSummary(summary, lang = 'th') {
    const response = await client.messages.create(
      {
        model,
        // การคิดนับรวมใน max_tokens เพดาน 200 แบบเดิมจะถูกตัดก่อนได้ข้อความ
        max_tokens: 1024,
        system: lang === 'en' ? ENGLISH_SYSTEM_PROMPT : SYSTEM_PROMPT,
        messages: [{ role: 'user', content: describeSummary(summary, lang) }],
        ...(effortConfig ? { output_config: effortConfig } : {}),
      },
      {
        timeout: COMMENT_TIMEOUT_MS,
        maxRetries: 1,
        signal: AbortSignal.timeout(COMMENT_TIMEOUT_MS),
      }
    );
    if (response.stop_reason === 'max_tokens') {
      throw new Error('Claude comment was truncated');
    }
    if (response.stop_reason === 'refusal') {
      throw new Error('Claude refused to comment');
    }
    const textBlock = response.content.find((block) => block.type === 'text');
    const comment = textBlock ? textBlock.text.trim() : '';
    if (!comment) {
      throw new Error('Claude returned no comment');
    }
    return comment;
  };
}

module.exports = { createSummaryCommenter };

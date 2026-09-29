import { describe, it, expect, vi } from 'vitest';
import { createSummaryCommenter } from './comment.js';

const SUMMARY = {
  label: 'วันนี้ (29/09)',
  incomeTotal: 0,
  expenseTotal: 1250.5,
  net: -1250.5,
  topExpenses: [{ category: 'อาหาร', total: 1250.5 }],
  otherExpenseTotal: 0,
  entryCount: 2,
};

function fakeClient(content) {
  return { messages: { create: vi.fn().mockResolvedValue({ content }) } };
}

describe('createSummaryCommenter', () => {
  it('sends formatted numbers and forbids Claude from calculating', async () => {
    const client = fakeClient([{ type: 'text', text: 'ok' }]);

    await createSummaryCommenter({ client, model: 'm' })(SUMMARY);

    const [params, options] = client.messages.create.mock.calls[0];
    expect(params.model).toBe('m');
    expect(params.system).toContain('Do not calculate');
    expect(params.messages[0].content).toContain('รายจ่าย: 1,250.5 บาท');
    expect(params.messages[0].content).toContain('- อาหาร: 1,250.5 บาท');
    expect(options).toEqual({ timeout: 15000, maxRetries: 1, signal: expect.any(AbortSignal) });
  });

  it('returns the trimmed comment text', async () => {
    const client = fakeClient([{ type: 'text', text: '  วันนี้ใช้กับอาหารเป็นหลัก  ' }]);

    expect(await createSummaryCommenter({ client, model: 'm' })(SUMMARY)).toBe(
      'วันนี้ใช้กับอาหารเป็นหลัก'
    );
  });

  it('mentions the other categories total when there is one', async () => {
    const client = fakeClient([{ type: 'text', text: 'ok' }]);

    await createSummaryCommenter({ client, model: 'm' })({ ...SUMMARY, otherExpenseTotal: 75 });

    expect(client.messages.create.mock.calls[0][0].messages[0].content).toContain('- หมวดอื่น: 75 บาท');
  });

  it('throws when Claude returns no text', async () => {
    const client = fakeClient([]);

    await expect(createSummaryCommenter({ client, model: 'm' })(SUMMARY)).rejects.toThrow(
      'Claude returned no comment'
    );
  });
});

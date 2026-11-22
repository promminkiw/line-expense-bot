import { describe, it, expect, vi } from 'vitest';
import { createHash } from 'node:crypto';
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

function fakeClient(content, stopReason = 'end_turn') {
  return {
    messages: { create: vi.fn().mockResolvedValue({ content, stop_reason: stopReason }) },
  };
}

describe('createSummaryCommenter', () => {
  it('sends formatted numbers and forbids Claude from calculating', async () => {
    const client = fakeClient([{ type: 'text', text: 'ok' }]);

    await createSummaryCommenter({ client, model: 'm' })(SUMMARY);

    const [params, options] = client.messages.create.mock.calls[0];
    expect(params.model).toBe('m');
    expect(params.system).toContain('Do not calculate');
    expect(params.system).toContain('"เฮีย"');
    expect(params.messages[0].content).toContain('รายจ่าย: 1,250.5 บาท');
    expect(params.messages[0].content).toContain('- อาหาร: 1,250.5 บาท');
    expect(options).toEqual({ timeout: 15000, maxRetries: 1, signal: expect.any(AbortSignal) });
    // คอมเมนต์สั้นแต่การคิดนับรวมใน max_tokens ตั้ง 200 แบบเดิมจะถูกตัดก่อนได้ข้อความ
    expect(params.output_config).toEqual({ effort: 'low' });
    expect(params.max_tokens).toBe(1024);
  });

  it('sends no output config to Haiku 4.5, which rejects effort', async () => {
    const client = fakeClient([{ type: 'text', text: 'ok' }]);

    await createSummaryCommenter({ client, model: 'claude-haiku-4-5' })(SUMMARY);

    expect(client.messages.create.mock.calls[0][0]).not.toHaveProperty('output_config');
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

  it('throws when the comment is truncated', async () => {
    const client = fakeClient([{ type: 'text', text: 'วันนี้ใช้' }], 'max_tokens');

    await expect(createSummaryCommenter({ client, model: 'm' })(SUMMARY)).rejects.toThrow(
      'Claude comment was truncated'
    );
  });

  it('throws when Claude refuses', async () => {
    const client = fakeClient([{ type: 'text', text: 'x' }], 'refusal');

    await expect(createSummaryCommenter({ client, model: 'm' })(SUMMARY)).rejects.toThrow(
      'Claude refused to comment'
    );
  });

  it('omits the category heading when there are no expenses', async () => {
    const client = fakeClient([{ type: 'text', text: 'ok' }]);

    await createSummaryCommenter({ client, model: 'm' })({
      ...SUMMARY,
      expenseTotal: 0,
      topExpenses: [],
    });

    expect(client.messages.create.mock.calls[0][0].messages[0].content).not.toContain(
      'รายจ่ายตามหมวด'
    );
  });

  it('throws when Claude returns no text', async () => {
    const client = fakeClient([]);

    await expect(createSummaryCommenter({ client, model: 'm' })(SUMMARY)).rejects.toThrow(
      'Claude returned no comment'
    );
  });
});

describe('createSummaryCommenter prompts per language', () => {
  const sha256 = (text) => createHash('sha256').update(text).digest('hex');
  const SMALL = {
    label: 'L',
    incomeTotal: 0,
    expenseTotal: 1,
    net: -1,
    topExpenses: [{ category: 'อาหาร', total: 1 }],
    otherExpenseTotal: 2,
    entryCount: 1,
  };

  // hash ของ prompt และข้อความไทยก่อนเพิ่มภาษาอังกฤษ ต้องเหมือนเดิมทุกตัวอักษร
  it('keeps the Thai prompt and summary text byte-identical', async () => {
    const client = fakeClient([{ type: 'text', text: 'ok' }]);
    const comment = createSummaryCommenter({ client, model: 'm' });

    await comment(SMALL);
    await comment(SMALL, 'th');

    for (const [params] of client.messages.create.mock.calls) {
      expect(sha256(params.system)).toBe('ff69642801f006d7a6a87ad056e2ea01218fcd769b218fc091ec0b4595c58a43');
      expect(sha256(params.messages[0].content)).toBe('d66f74f4a351b06909fb440f495ca5800b1a366c682dd3c516ecb8d1070c60c6');
    }
  });

  it('asks an English comment with the English persona and English category names', async () => {
    const client = fakeClient([{ type: 'text', text: 'ok' }]);

    await createSummaryCommenter({ client, model: 'm' })(
      { ...SUMMARY, label: 'Today (29/09)', topExpenses: [{ category: 'อาหาร', total: 1250.5 }, { category: 'ค่าแมว', total: 20 }] },
      'en'
    );

    const [params] = client.messages.create.mock.calls[0];
    expect(params.system).toContain('in English');
    expect(params.system).toContain('refers to himself as "I"');
    expect(params.system).toContain('Do not calculate');
    expect(params.system).not.toContain('เฮีย');
    expect(params.messages[0].content).toBe(
      [
        'Period: Today (29/09)',
        'Income: 0 baht',
        'Expenses: 1,250.5 baht',
        'Balance: -1,250.5 baht',
        'Expenses by category:',
        '- Food: 1,250.5 baht',
        '- ค่าแมว: 20 baht',
      ].join('\n')
    );
  });
});
